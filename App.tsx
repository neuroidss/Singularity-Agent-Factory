
import React, { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import * as aiService from './services/aiService';
import { PREDEFINED_TOOLS, AI_MODELS, SWARM_AGENT_SYSTEM_PROMPT } from './constants';
import type { LLMTool, EnrichedAIResponse, AIResponse, APIConfig, AIModel, NewToolPayload, AIToolCall, AgentWorker, AgentStatus, RobotState, EnvironmentObject } from './types';
import { UIToolRunner } from './components/UIToolRunner';
import { ModelProvider } from './types';
import { loadStateFromStorage, saveStateToStorage } from './versioning';

const SERVER_URL = 'http://localhost:3001';

const GEMMA_SERVER_SCRIPT = `
# server/scripts/gemma_server.py
import os
import sys
import argparse
import base64
import io
import asyncio
import logging
from contextlib import asynccontextmanager

import torch
import numpy as np
import av
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field
from typing import List, Dict, Any, Union, Literal
from unsloth import FastModel

# --- Basic Logging Setup ---
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')

# --- Pydantic Models for OpenAI Compatibility ---
class ChatCompletionMessageTextPart(BaseModel):
    type: Literal["text"]
    text: str

class ChatCompletionMessageAudioURL(BaseModel):
    url: str # Expects data URI: "data:audio/wav;base64,{data}"

class ChatCompletionMessageAudioPart(BaseModel):
    type: Literal["audio_url"]
    audio_url: ChatCompletionMessageAudioURL

class ChatCompletionMessage(BaseModel):
    role: str
    content: Union[str, List[Union[ChatCompletionMessageTextPart, ChatCompletionMessageAudioPart]]]

class ChatCompletionRequest(BaseModel):
    model: str
    messages: List[ChatCompletionMessage]
    temperature: float = 0.1
    max_tokens: int = 512

class ChatCompletionChoice(BaseModel):
    index: int = 0
    message: Dict[str, str]
    finish_reason: str = "stop"

class ChatCompletionResponse(BaseModel):
    id: str = "chatcmpl-local"
    object: str = "chat.completion"
    created: int = 0
    model: str
    choices: List[ChatCompletionChoice]

# --- Global State ---
model_state = {}

def load_audio_from_base64(base64_str: str, target_sr: int):
    """Decodes base64 audio using PyAV (ffmpeg) and resamples to the target sample rate."""
    try:
        audio_data = base64.b64decode(base64_str)
        audio_stream = io.BytesIO(audio_data)

        with av.open(audio_stream, mode='r') as container:
            stream = container.streams.audio[0]
            # Set up the resampler to convert to mono, 16kHz, and signed 16-bit integers
            resampler = av.AudioResampler(
                format='s16',
                layout='mono',
                rate=target_sr
            )
            
            # Read all frames and resample
            frames = []
            for frame in container.decode(stream):
                frames.extend(resampler.resample(frame))

            if not frames:
                raise ValueError("Could not decode any audio frames.")

            # Concatenate all frames into a single numpy array
            audio_samples = np.concatenate([f.to_ndarray() for f in frames], axis=1)[0]
            
            # Convert from s16 int to float32
            audio_array = audio_samples.astype(np.float32) / 32768.0
            
            logging.info(f"Successfully decoded and resampled audio to {len(audio_array)} samples at {target_sr}Hz.")
            return audio_array, target_sr

    except Exception as e:
        logging.error(f"Error processing audio with PyAV: {e}")
        raise ValueError(f"Could not load audio from base64 string. Error: {e}")


@asynccontextmanager
async def lifespan(app: FastAPI):
    # --- Startup: Load Model ---
    logging.info("Starting up and loading model...")
    model_id = "unsloth/gemma-3n-E2B-it-unsloth-bnb-4bit"
    try:
        model, tokenizer = FastModel.from_pretrained(
            model_name=model_id,
            max_seq_length=2048,
            dtype=None,
            load_in_4bit=True,
        )
        model_state['model'] = model
        model_state['tokenizer'] = tokenizer
        model_state['model_id'] = model_id
        logging.info(f"Successfully loaded model '{model_id}' to device: {model.device}")
    except Exception as e:
        logging.error(f"FATAL: Could not load model. Error: {e}")
        sys.exit(1)
    yield
    # --- Shutdown: Clean up ---
    logging.info("Shutting down and clearing model state.")
    model_state.clear()
    torch.cuda.empty_cache()


app = FastAPI(lifespan=lifespan)

# --- Add CORS Middleware ---
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Allows all origins
    allow_credentials=True,
    allow_methods=["*"],  # Allows all methods
    allow_headers=["*"],  # Allows all headers
)

@app.post("/v1/chat/completions", response_model=ChatCompletionResponse)
async def chat_completions(request: ChatCompletionRequest):
    if 'model' not in model_state:
        raise HTTPException(status_code=503, detail="Model is not loaded or ready.")

    model = model_state['model']
    tokenizer = model_state['tokenizer']
    
    # --- Process Multimodal Input ---
    prompt_parts = []
    text_prompts = []
    
    user_message = request.messages[-1] # Assume the last message is the user's prompt
    if not isinstance(user_message.content, list):
         # Simple text-only case
        text_prompts.append(user_message.content)
    else:
        # Multimodal case
        for part in user_message.content:
            if part.type == 'text':
                text_prompts.append(part.text)
            elif part.type == 'audio_url':
                try:
                    # Extract base64 data from data URI
                    base64_content = part.audio_url.url.split(',')[1]
                    sampling_rate = tokenizer.feature_extractor.sampling_rate
                    audio_array, _ = load_audio_from_base64(base64_content, sampling_rate)
                    prompt_parts.append({"type": "audio", "audio": audio_array})
                    logging.info(f"Processed audio part, duration: {len(audio_array)/sampling_rate:.2f}s")
                except Exception as e:
                    raise HTTPException(status_code=400, detail=f"Invalid audio data: {e}")

    # Combine all text parts into one
    full_text_prompt = " ".join(text_prompts)
    if full_text_prompt:
        prompt_parts.append({"type": "text", "text": full_text_prompt})

    # --- Prepare Prompt for Model ---
    messages = [{"role": "user", "content": prompt_parts}]
    
    try:
        inputs = tokenizer.apply_chat_template(
            messages,
            add_generation_prompt=True,
            tokenize=True,
            return_dict=True,
            return_tensors="pt"
        ).to(model.device)

        logging.info("Generating response from model...")
        with torch.no_grad():
            generated_ids = model.generate(
                **inputs, 
                max_new_tokens=request.max_tokens,
                temperature=request.temperature if request.temperature > 0 else None,
                do_sample=request.temperature > 0,
            )
        
        decoded_text = tokenizer.batch_decode(generated_ids, skip_special_tokens=True)[0]
        
        # Extract only the assistant's response
        model_prompt_token = "<start_of_turn>model\\n"
        response_text = decoded_text.split(model_prompt_token)[-1].strip()
        
        logging.info(f"Generated response: {response_text}")

        response = ChatCompletionResponse(
            model=model_state['model_id'],
            choices=[
                ChatCompletionChoice(
                    message={"role": "assistant", "content": response_text}
                )
            ]
        )
        return response

    except Exception as e:
        logging.error(f"Error during model inference: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Internal server error during inference: {e}")


if __name__ == "__main__":
    import uvicorn
    parser = argparse.ArgumentParser(description="Gemma Multimodal OpenAI-Compatible Server")
    parser.add_argument("--host", type=str, default="0.0.0.0", help="Host to bind the server to")
    parser.add_argument("--port", type=int, default=8008, help="Port to run the server on")
    args = parser.parse_args()
    
    logging.info(f"Starting Uvicorn server on {args.host}:{args.port}")
    uvicorn.run(app, host=args.host, port=args.port)
`;

const generateMachineReadableId = (name: string, existingTools: LLMTool[]): string => {
  let baseId = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\s_]/g, '')
    .replace(/\s+/g, '_')
    .replace(/_{2,}/g, '_')
    .slice(0, 50);
  if (!baseId) baseId = 'unnamed_tool';
  let finalId = baseId;
  let counter = 1;
  const existingIds = new Set(existingTools.map(t => t.id));
  while (existingIds.has(finalId)) {
    finalId = `${baseId}_${counter}`;
    counter++;
  }
  return finalId;
};

const App: React.FC = () => {
    // Client-side state
    const [userInput, setUserInput] = useState<string>('');
    const [isLoading, setIsLoading] = useState<boolean>(false);
    const [tools, setTools] = useState<LLMTool[]>(() => {
        const loadedState = loadStateFromStorage();
        if (loadedState) {
            return loadedState.tools;
        }
        const now = new Date().toISOString();
        return PREDEFINED_TOOLS.map(tool => ({ ...tool, createdAt: tool.createdAt || now, updatedAt: tool.updatedAt || now }));
    });
    const [serverTools, setServerTools] = useState<LLMTool[]>([]);
    const [apiCallCount, setApiCallCount] = useState<number>(0);
    const [eventLog, setEventLog] = useState<string[]>(['[INFO] System Initialized. Target: Achieve Singularity.']);
    const [isServerConnected, setIsServerConnected] = useState<boolean>(false);
    const [localAiStatus, setLocalAiStatus] = useState({ isRunning: false, logs: [] as string[] });
    
    // Swarm State
    const [agentSwarm, setAgentSwarm] = useState<AgentWorker[]>([]);
    const [isSwarmRunning, setIsSwarmRunning] = useState(false);
    const swarmIterationCounter = useRef(0);
    const swarmAgentIdCounter = useRef(0);
    const swarmHistoryRef = useRef<EnrichedAIResponse[]>([]);
    const [currentUserTask, setCurrentUserTask] = useState<string>('');
    
    // Robot & Environment State
    const [robotStates, setRobotStates] = useState<RobotState[]>([]);
    const [observationHistory, setObservationHistory] = useState<AIToolCall[]>([]);
    const [environmentState, setEnvironmentState] = useState<EnvironmentObject[]>([
        ...Array.from({length: 12}, (_, i) => ({ x: i, y: 0, type: 'wall' as const })),
        ...Array.from({length: 12}, (_, i) => ({ x: i, y: 11, type: 'wall' as const })),
        ...Array.from({length: 10}, (_, i) => ({ x: 0, y: i + 1, type: 'wall' as const })),
        ...Array.from({length: 10}, (_, i) => ({ x: 11, y: i + 1, type: 'wall' as const })),
        { x: 5, y: 1, type: 'tree' }, { x: 5, y: 2, type: 'tree' }, { x: 5, y: 3, type: 'tree' },
        { x: 5, y: 4, type: 'tree' }, { x: 5, y: 5, type: 'tree' }, { x: 5, y: 6, type: 'tree' },
        { x: 9, y: 2, type: 'resource' },
        { x: 2, y: 9, type: 'collection_point' },
    ]);

    // Model & API Config State
    const [availableModels, setAvailableModels] = useState<AIModel[]>(AI_MODELS);
    const [selectedModel, setSelectedModel] = useState<AIModel>(AI_MODELS[0]);
    const [apiConfig, setApiConfig] = useState<APIConfig>(() => {
        let initialConfig: APIConfig = { 
            openAIAPIKey: 'ollama',
            openAIBaseUrl: 'http://localhost:8008/v1',
            ollamaHost: 'http://localhost:11434',
        };
        try {
            const stored = localStorage.getItem('apiConfig');
            if (stored) initialConfig = { ...initialConfig, ...JSON.parse(stored) };
        } catch {}
        return initialConfig;
    });
    
    const executeActionRef = useRef<any>(null);
    const allTools = useMemo(() => [...tools, ...serverTools], [tools, serverTools]);

    useEffect(() => { saveStateToStorage({ tools }); }, [tools]);
    useEffect(() => { localStorage.setItem('apiConfig', JSON.stringify(apiConfig)); }, [apiConfig]);

    const logEvent = useCallback((message: string) => {
      const timestamp = new Date().toLocaleTimeString();
      setEventLog(prev => [...prev.slice(-199), `[${timestamp}] ${message}`]);
    }, []);

    const checkLocalAiStatus = useCallback(async () => {
        if (!isServerConnected) return;
        try {
            const response = await fetch(`${SERVER_URL}/api/local-ai/status`);
            if (response.ok) {
                const status = await response.json();
                setLocalAiStatus(status);
            } else {
                 setLocalAiStatus({ isRunning: false, logs: ['Failed to get status'] });
            }
        } catch (e) {
            setLocalAiStatus({ isRunning: false, logs: ['Node.js server is offline'] });
        }
    }, [isServerConnected]);

    useEffect(() => {
        const interval = setInterval(checkLocalAiStatus, 5000); // Poll every 5 seconds
        return () => clearInterval(interval);
    }, [checkLocalAiStatus]);
    
    const fetchServerTools = useCallback(async () => {
        try {
            const response = await fetch(`${SERVER_URL}/api/tools`);
            if (!response.ok) throw new Error('Failed to fetch server tools');
            const data: LLMTool[] = await response.json();
            setServerTools(data);
            if (!isServerConnected) {
              setIsServerConnected(true);
              logEvent(`[INFO] ✅ Backend server connected. Found ${data.length} server-side tools.`);
              checkLocalAiStatus(); // Initial check on connect
            }
        } catch (e) {
            if (isServerConnected) {
              setIsServerConnected(false);
              setServerTools([]); // Clear stale tools
              logEvent(`[WARN] ⚠️ Backend server disconnected. Running in client-only mode.`);
              setLocalAiStatus({ isRunning: false, logs: [] });
              console.warn(`Could not connect to backend at ${SERVER_URL}. Server tools unavailable.`, e);
            }
        }
    }, [logEvent, isServerConnected, checkLocalAiStatus]);

    useEffect(() => {
        fetchServerTools();
        const interval = setInterval(fetchServerTools, 5000);
        return () => clearInterval(interval);
    }, [fetchServerTools]);

    const runToolImplementation = useCallback(async (code: string, params: any, runtime: any): Promise<any> => {
        const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
        const executor = new AsyncFunction('args', 'runtime', code);
        return await executor(params, runtime);
    }, []);

    const getRuntimeApi = useCallback((agentId: string) => ({
        tools: {
            run: async (toolName: string, args: Record<string, any>): Promise<any> => {
                const toolToRun = allTools.find(t => t.name === toolName);
                if (!toolToRun) throw new Error(`Workflow failed: Tool '${toolName}' not found.`);
                const result = await executeActionRef.current({ name: toolName, arguments: args }, agentId);
                if (result.executionError) throw new Error(result.executionError);
                return result.executionResult;
            },
            add: (newToolPayload: NewToolPayload): LLMTool => {
                if (allTools.find(t => t.name === newToolPayload.name)) throw new Error(`A tool with the name '${newToolPayload.name}' already exists.`);
                const newId = generateMachineReadableId(newToolPayload.name, allTools);
                const now = new Date().toISOString();
                const completeTool: LLMTool = { ...newToolPayload, id: newId, version: 1, createdAt: now, updatedAt: now };
                setTools(prevTools => [...prevTools, completeTool]);
                return completeTool;
            },
            list: (): LLMTool[] => allTools,
        },
        server: {
            isConnected: () => isServerConnected,
            getUrl: () => SERVER_URL,
            createTool: async (newToolPayload: NewToolPayload): Promise<any> => {
                if (!isServerConnected) throw new Error("Cannot create server tool: Backend server is not connected.");
                try {
                    const response = await fetch(`${SERVER_URL}/api/tools/create`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(newToolPayload),
                    });
                    const result = await response.json();
                    if (!response.ok) throw new Error(result.error || 'Server failed to create tool');
                    setServerTools(prev => [...prev, result.tool]);
                    return { success: true, message: `Successfully created server-side tool: '${result.tool.name}'`};
                } catch (e) {
                    const errorMessage = e instanceof Error ? e.message : String(e);
                    logEvent(`[ERROR] Failed to create server tool: ${errorMessage}`);
                    throw e;
                }
            },
            writeFile: async (filePath: string, content: string): Promise<any> => {
                if (!isServerConnected) throw new Error("Cannot write file: The backend server is not connected.");
                 try {
                    const response = await fetch(`${SERVER_URL}/api/files/write`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ filePath, content }),
                    });
                    const result = await response.json();
                    if (!response.ok) throw new Error(result.error || 'Server failed to write file');
                    logEvent(`[INFO] ✅ [SERVER] Successfully wrote file: ${filePath}`);
                    return result;
                } catch (e) {
                    const errorMessage = e instanceof Error ? e.message : String(e);
                    logEvent(`[ERROR] Failed to write server file: ${errorMessage}`);
                    throw e;
                }
            },
        },
        robot: {
            getState: () => {
                const robot = robotStates.find(r => r.id === agentId);
                if (!robot) {
                    throw new Error(`Pathfinder cannot find robot state for agent ${agentId}.`);
                }
                return { robot, environment: environmentState };
            },
            moveForward: () => new Promise<any>((resolve, reject) => {
                setRobotStates(prevStates => {
                    const robotIndex = prevStates.findIndex(r => r.id === agentId);
                    if (robotIndex === -1) {
                        reject(new Error(`Robot for agent ${agentId} not found.`));
                        return prevStates;
                    }
                    const robot = prevStates[robotIndex];
                    let { x, y } = robot;
                    if (robot.rotation === 0) y -= 1; if (robot.rotation === 90) x += 1; if (robot.rotation === 180) y += 1; if (robot.rotation === 270) x -= 1;
                    
                    if (environmentState.some(obj => obj.x === x && obj.y === y && (obj.type === 'wall' || obj.type === 'tree'))) {
                        reject(new Error(`Agent ${agentId} Move failed: Collision with environment.`));
                        return prevStates;
                    }
                    if (prevStates.some(r => r.id !== agentId && r.x === x && r.y === y)) {
                        reject(new Error(`Agent ${agentId} Move failed: Collision with another robot.`));
                        return prevStates;
                    }

                    const newStates = [...prevStates];
                    newStates[robotIndex] = { ...robot, x, y };
                    resolve({ success: true, message: `Agent ${agentId} moved forward to (${x}, ${y})`});
                    return newStates;
                });
            }),
            turn: (direction: 'left' | 'right') => new Promise<any>((resolve, reject) => {
                setRobotStates(prev => {
                    const robotIndex = prev.findIndex(r => r.id === agentId);
                    if (robotIndex === -1) {
                        reject(new Error(`Agent ${agentId} not found for turn operation.`));
                        return prev;
                    }
                    const newStates = [...prev];
                    const robot = newStates[robotIndex];
                    newStates[robotIndex] = { ...robot, rotation: (robot.rotation + (direction === 'left' ? -90 : 90) + 360) % 360 };
                    resolve({ success: true, message: `Agent ${agentId} turned ${direction}.` });
                    return newStates;
                });
            }),
            pickupResource: () => new Promise<any>((resolve, reject) => {
                setRobotStates(prevStates => {
                    const robotIndex = prevStates.findIndex(r => r.id === agentId);
                    if (robotIndex === -1) {
                        reject(new Error(`Robot for agent ${agentId} not found.`));
                        return prevStates;
                    }
                    const robot = prevStates[robotIndex];
                    const resourceObj = environmentState.find(obj => obj.type === 'resource');
                    if (robot.hasResource) {
                        reject(new Error(`Pickup failed: Agent ${agentId} is already carrying a resource.`));
                        return prevStates;
                    }
                    if (resourceObj && resourceObj.x === robot.x && resourceObj.y === robot.y) {
                        const newStates = [...prevStates];
                        newStates[robotIndex] = {...robot, hasResource: true};
                        setEnvironmentState(prevEnv => prevEnv.filter(obj => obj.type !== 'resource'));
                        resolve({ success: true, message: `Agent ${agentId} picked up resource.` });
                        return newStates;
                    }
                    reject(new Error(`Pickup failed: Agent ${agentId} is not at the resource location.`));
                    return prevStates;
                });
            }),
            deliverResource: () => new Promise<any>((resolve, reject) => {
                 setRobotStates(prevStates => {
                    const robotIndex = prevStates.findIndex(r => r.id === agentId);
                    if (robotIndex === -1) {
                        reject(new Error(`Robot for agent ${agentId} not found.`));
                        return prevStates;
                    }
                    const robot = prevStates[robotIndex];
                    const collectionPointObj = environmentState.find(obj => obj.type === 'collection_point');
                    if (!robot.hasResource) {
                        reject(new Error(`Delivery failed: Agent ${agentId} is not carrying a resource.`));
                        return prevStates;
                    }
                    if (collectionPointObj && collectionPointObj.x === robot.x && collectionPointObj.y === robot.y) {
                        const newStates = [...prevStates];
                        newStates[robotIndex] = {...robot, hasResource: false};
                        logEvent(`[SUCCESS] Agent ${agentId} delivered the resource.`);
                        resolve({ success: true, message: `Agent ${agentId} delivered resource.` });
                        return newStates;
                    }
                    reject(new Error(`Delivery failed: Agent ${agentId} is not at the collection point.`));
                    return prevStates;
                 });
            })
        },
        getObservationHistory: () => observationHistory,
        clearObservationHistory: () => setObservationHistory([]),
    }), [allTools, runToolImplementation, robotStates, environmentState, observationHistory, logEvent, isServerConnected]);

    const executeAction = useCallback(async (toolCall: AIToolCall, agentId: string): Promise<EnrichedAIResponse> => {
        if (!toolCall) return { toolCall: null };

        let enrichedResult: EnrichedAIResponse = { toolCall };
        const toolToExecute = allTools.find(t => t.name === toolCall.name);

        if (!toolToExecute) throw new Error(`AI returned unknown tool name for agent ${agentId}: ${toolCall.name}`);
        
        enrichedResult.tool = toolToExecute;
        const runtime = getRuntimeApi(agentId);

        if (toolToExecute.category === 'Server') {
            if (!isServerConnected) {
                const errorMessage = `Cannot execute server tool '${toolToExecute.name}': Backend server is not connected.`;
                enrichedResult.executionError = errorMessage;
                logEvent(`[ERROR] ❌ ${errorMessage}`);
                return enrichedResult;
            }
            try {
                const response = await fetch(`${SERVER_URL}/api/execute`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(toolCall)
                });
                 const result = await response.json();
                if (!response.ok) {
                   throw new Error(result.error || 'Server execution failed with unknown error');
                }
                enrichedResult.executionResult = result;
                logEvent(`[INFO] ✅ [SERVER] ${result?.message || `Tool "${toolToExecute.name}" executed by server.`}`);
            } catch (execError) {
                 const errorMessage = execError instanceof Error ? execError.message : String(execError);
                 enrichedResult.executionError = errorMessage;
                 logEvent(`[ERROR] ❌ [SERVER] ${errorMessage}`);
            }
        } else if (toolToExecute.category === 'UI Component') {
             enrichedResult.executionResult = { success: true, summary: `Displayed UI tool '${toolToExecute.name}'.` };
        } else { // Client-side Functional or Automation
            try {
                const result = await runToolImplementation(toolToExecute.implementationCode, toolCall.arguments, runtime);
                enrichedResult.executionResult = result;
                logEvent(`[INFO] ✅ ${result?.message || `Tool "${toolToExecute.name}" executed by ${agentId}.`}`);
            } catch (execError) {
                const errorMessage = execError instanceof Error ? execError.message : String(execError);
                enrichedResult.executionError = errorMessage;
                logEvent(`[ERROR] ❌ ${errorMessage}`);
            }
        }
        return enrichedResult;
    }, [allTools, getRuntimeApi, runToolImplementation, logEvent, isServerConnected]);
    
    executeActionRef.current = executeAction;

    const handleInstallGemmaServerScript = useCallback(async () => {
        logEvent("[INFO] Attempting to write Gemma server script to backend...");
        try {
            const result = await executeActionRef.current({
                name: 'Server File Writer',
                arguments: {
                    filePath: 'gemma_server.py',
                    content: GEMMA_SERVER_SCRIPT,
                }
            }, 'system-installer');
            
            if(result.executionError) {
                throw new Error(result.executionError);
            }
            logEvent(`[SUCCESS] ✅ ${result.executionResult.message}`);
        } catch (e) {
            const errorMessage = e instanceof Error ? e.message : String(e);
            logEvent(`[ERROR] ❌ Failed to install Gemma server script: ${errorMessage}`);
        }
    }, []);

    const handleManualControl = useCallback(async (toolName: string, args: any = {}) => {
        logEvent(`[PILOT] Manual command: ${toolName}`);
        const leadAgentId = 'agent-1';
        
        try {
            const toolToExecute = allTools.find(t => t.name === toolName);
            if (!toolToExecute) {
                logEvent(`[ERROR] Manual control tool '${toolName}' not found.`);
                return;
            }
            const result = await executeActionRef.current({ name: toolName, arguments: args }, leadAgentId);
             if(result.executionError) {
                throw new Error(result.executionError);
            }
            logEvent(`[PILOT] ${result.executionResult.message}`);
            setObservationHistory(prev => [...prev, { name: toolName, arguments: args }]);
        } catch(e) {
            logEvent(`[ERROR] ${e instanceof Error ? e.message : String(e)}`);
        }
    }, [allTools, logEvent]);

    const processRequest = useCallback(async (prompt: string, systemInstruction: string, agentId: string): Promise<EnrichedAIResponse | null> => {
        setIsLoading(true);
        try {
            logEvent(`[INFO] 🤖 Agent ${agentId} is thinking using ${selectedModel.name}...`);
            setApiCallCount(prev => prev + 1);
            const aiResponse: AIResponse = await aiService.generateResponse(prompt, systemInstruction, selectedModel, apiConfig, logEvent, allTools);
            
            if(!aiResponse.toolCall) {
                logEvent(`[WARN] Agent ${agentId} did not select a tool to execute.`);
                return null;
            }
            logEvent(`💡 Agent ${agentId} decided to call: ${aiResponse.toolCall.name} with args: ${JSON.stringify(aiResponse.toolCall.arguments)}`);
            const executionResult = await executeActionRef.current(aiResponse.toolCall, agentId);
            return executionResult;

        } catch (err) {
            logEvent(`[ERROR] ${err instanceof Error ? err.message : "Unexpected error"}`);
            throw err;
        } finally {
            setIsLoading(false);
        }
    }, [allTools, apiConfig, logEvent, selectedModel]);

    const handleStopSwarm = useCallback(() => {
        setIsSwarmRunning(false);
        logEvent("[INFO] 🛑 Swarm task stopped by user.");
    }, [logEvent]);

    const runSwarmCycle = useCallback(async () => {
        if (!isSwarmRunning) {
            setIsLoading(false);
            setIsSwarmRunning(false);
            logEvent("[SUCCESS] Swarm task concluded.");
            setRobotStates([]);
            return;
        }
        if (swarmIterationCounter.current >= 50) {
            logEvent("[WARN] ⚠️ Swarm reached max iterations.");
            setIsSwarmRunning(false);
            setIsLoading(false);
            setRobotStates([]);
            return;
        }
        const idleAgentIndex = agentSwarm.findIndex(a => a.status === 'idle');
        if (idleAgentIndex === -1) {
            setTimeout(runSwarmCycle, 2000); // Wait for an agent to become free
            return;
        }
        const agent = agentSwarm[idleAgentIndex];
        swarmIterationCounter.current++;

        try {
            setAgentSwarm(prev => prev.map(a => a.id === agent.id ? { ...a, status: 'working', lastAction: 'Thinking...', error: null } : a));
            const historyString = swarmHistoryRef.current.length > 0 ? `The swarm has already performed these actions:\n${swarmHistoryRef.current.map(r => `Action: ${r.toolCall?.name || 'Unknown'} - Result: ${r.executionError ? `FAILED (${r.executionError})` : `SUCCEEDED (${JSON.stringify(r.executionResult?.message)})`}`).join('\n')}` : "The swarm has not performed any actions yet.";
            const promptForAgent = `The swarm's overall goal is: "${currentUserTask}".\n\n${historyString}\n\nBased on this, what is the single next action? If the goal is complete, call "Task Complete".`;
            
            const result = await processRequest(promptForAgent, SWARM_AGENT_SYSTEM_PROMPT, agent.id);

            if (!isSwarmRunning) throw new Error("Swarm stopped by user.");

            if (result) {
                swarmHistoryRef.current.push(result);
                const actionSummary = result.toolCall ? `Called '${result.toolCall.name}'` : 'No action';
                setAgentSwarm(prev => prev.map(a => a.id === agent.id ? { ...a, status: 'succeeded', lastAction: actionSummary, result: result.executionResult } : a));
                if (result.toolCall?.name === 'Task Complete') {
                    logEvent(`[SUCCESS] ✅ Task Completed by Agent ${agent.id}: ${result.executionResult?.message || 'Finished!'}`);
                    setIsSwarmRunning(false);
                    setIsLoading(false);
                    return;
                }
            } else {
                 setAgentSwarm(prev => prev.map(a => a.id === agent.id ? { ...a, status: 'failed', error: 'Did not choose action.' } : a));
            }
        } catch (err) {
            const errorMessage = err instanceof Error ? err.message : "Unknown error.";
            // Respawn a failed agent
            setAgentSwarm(prev => {
                const failedSwarm = prev.map(a => a.id === agent.id ? { ...a, status: 'terminated' as AgentStatus, error: errorMessage, lastAction: `FAILED: ${a.lastAction}` } : a);
                swarmAgentIdCounter.current++;
                return [...failedSwarm, { id: `agent-${swarmAgentIdCounter.current}`, status: 'idle', lastAction: 'Newly spawned', error: null, result: null }];
            });
        }
        setTimeout(runSwarmCycle, 1000);
    }, [agentSwarm, currentUserTask, processRequest, logEvent, isSwarmRunning]);

    const startSwarmTask = useCallback(async (initialTask: string) => {
        setIsLoading(true);
        setIsSwarmRunning(true);
        setCurrentUserTask(initialTask);
        swarmHistoryRef.current = [];
        swarmIterationCounter.current = 0;
        swarmAgentIdCounter.current = 3;
        setUserInput('');
        const timestamp = new Date().toLocaleTimeString();
        setEventLog([`[${timestamp}] [INFO] 🚀 Starting swarm task: "${initialTask}"`]); // Clear previous logs and set the starting message
        const initialAgents: AgentWorker[] = Array.from({ length: 3 }, (_, i) => ({ id: `agent-${i + 1}`, status: 'idle', lastAction: 'Awaiting instructions', error: null, result: null }));
        setAgentSwarm(initialAgents);
        const initialRobots: RobotState[] = initialAgents.map((agent, i) => ({
            id: agent.id,
            x: 1 + i,
            y: 1,
            rotation: 90,
            hasResource: false,
        }));
        setRobotStates(initialRobots);
    }, [logEvent]);

    useEffect(() => {
        if (isSwarmRunning && agentSwarm.length > 0 && agentSwarm.every(a => a.status !== 'working')) {
            runSwarmCycle();
        }
    }, [isSwarmRunning, agentSwarm, runSwarmCycle]);

    const handleSubmit = useCallback(async () => {
        if (!userInput.trim()) { logEvent("[WARN] Please enter a task."); return; }
        await startSwarmTask(userInput);
    }, [userInput, startSwarmTask, logEvent]);

    const handleResetTools = useCallback(() => {
        if (window.confirm('This will delete ALL client-side custom-made tools and restore the original set. Server tools will NOT be affected. Are you sure?')) {
            localStorage.removeItem('singularity-agent-factory-state');
            const now = new Date().toISOString();
            const defaultTools = PREDEFINED_TOOLS.map(tool => ({ ...tool, createdAt: tool.createdAt || now, updatedAt: tool.updatedAt || now }));
            setTools(defaultTools);
            setEventLog(['[SUCCESS] Client-side system reset complete.']);
            setApiCallCount(0);
        }
    }, []);

    const configProps = { apiConfig, setApiConfig, availableModels, selectedModel, setSelectedModel };
    const debugLogProps = { logs: eventLog, onReset: handleResetTools, apiCallCount, apiCallLimit: -1 };
    const localAiServerProps = {
        isServerConnected,
        localAiStatus,
        handleInstallGemmaServerScript,
        logEvent,
    };
    
    // Dynamically get tools to avoid stale closures in props
    const getTool = (name: string): LLMTool => {
        const tool = allTools.find(t => t.name === name);
        if (tool) return tool;
        return { 
          id: 'fallback', 
          name: 'Not Found', 
          description: `A fallback UI tool for '${name}' which was not found.`,
          category: 'UI Component', 
          version: 1, 
          parameters: [], 
          implementationCode: `return <div>UI Tool '${name}' not found.</div>` 
        };
    };

    return (
        <div className="min-h-screen bg-gray-900 text-white flex flex-col p-4 sm:p-6 lg:p-8">
            <UIToolRunner tool={getTool('Application Header')} props={{}} />
            <main className="flex-grow grid grid-cols-1 lg:grid-cols-5 gap-6 mt-4">
                {/* Left Column */}
                <div className="lg:col-span-2 space-y-6">
                    <UIToolRunner tool={getTool('Robot Simulation Environment')} props={{ robotStates, environmentState }} />
                    <UIToolRunner tool={getTool('Local AI Server Panel')} props={localAiServerProps} />
                    <UIToolRunner tool={getTool('Manual Robot Control')} props={{ handleManualControl, isSwarmRunning }} />
                     <UIToolRunner tool={getTool('Configuration Panel')} props={configProps} />
                    <UIToolRunner tool={getTool('User Input Form')} props={{ userInput, setUserInput, handleSubmit, isSwarmRunning }} />
                </div>

                {/* Right Column */}
                <div className="lg:col-span-3 space-y-6">
                     <UIToolRunner tool={getTool('Agent Swarm Display')} props={{ agentSwarm, isSwarmRunning, handleStopSwarm, currentUserTask }} />
                    <UIToolRunner tool={getTool('Tool List Display')} props={{ tools: allTools, isServerConnected }} />
                </div>
            </main>
            <UIToolRunner tool={getTool('Debug Log View')} props={debugLogProps} />
        </div>
    );
};

export default App;
