
import type { ToolCreatorPayload } from '../types';

// This is the Python server script that the installer tool will write to the backend.
export const GEMMA_SERVER_SCRIPT = `
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

export const LOCAL_AI_PANEL_TOOL_PAYLOAD: ToolCreatorPayload = {
    name: 'Local AI Server Panel',
    description: 'A self-contained control panel for managing the local multimodal AI server. It handles its own state and uses provided functions to interact with server tools.',
    category: 'UI Component',
    executionEnvironment: 'Client',
    purpose: 'To provide a user-friendly interface for managing the local AI server, which grants the agent advanced multimodal capabilities.',
    parameters: [
      { name: 'isServerConnected', type: 'boolean', description: 'Whether the main Node.js backend is connected.', required: true },
      { name: 'logEvent', type: 'object', description: 'Function to log events to the main debug log.', required: true },
      { name: 'onStartServer', type: 'object', description: 'Async function to call the "Start Local AI Server" tool.', required: true },
      { name: 'onStopServer', type: 'object', description: 'Async function to call the "Stop Local AI Server" tool.', required: true },
      { name: 'onGetStatus', type: 'object', description: 'Async function to call the "Get Local AI Server Status" tool.', required: true },
    ],
    implementationCode: `
      const [status, setStatus] = React.useState({ isRunning: false, logs: [] });
      const [actionInProgress, setActionInProgress] = React.useState(false);
      const [isRecording, setIsRecording] = React.useState(false);
      const [isTesting, setIsTesting] = React.useState(false);
      const [recordedAudioBlob, setRecordedAudioBlob] = React.useState(null);
      const [testResult, setTestResult] = React.useState('');
      const mediaRecorderRef = React.useRef(null);
      const audioChunksRef = React.useRef([]);
      const logsContainerRef = React.useRef(null);

      React.useEffect(() => {
        if (logsContainerRef.current) {
            logsContainerRef.current.scrollTop = logsContainerRef.current.scrollHeight;
        }
      }, [status.logs]);

      const pollStatus = React.useCallback(async () => {
        if (!isServerConnected) {
            setStatus({ isRunning: false, logs: ['Node.js server is offline.'] });
            return;
        }
        try {
            const result = await onGetStatus();
            if (result) setStatus(result);
        } catch (e) {
            // Don't spam the main log, just update local status
            setStatus(prev => ({...prev, logs: [...prev.logs.slice(-99), '[ERROR] Status poll failed: ' + e.message]}));
        }
      }, [isServerConnected, onGetStatus]);

      React.useEffect(() => {
        pollStatus();
        const interval = setInterval(pollStatus, 5000);
        return () => clearInterval(interval);
      }, [pollStatus]);

      const handleServerAction = async (actionCallback) => {
        setActionInProgress(true);
        try {
          await actionCallback();
          await pollStatus(); // Immediately refresh status
        } catch (e) {
          logEvent('[ERROR] ' + e.message);
        }
        setActionInProgress(false);
      };

      const handleStartRecording = async () => {
        setTestResult('');
        setRecordedAudioBlob(null);
        audioChunksRef.current = [];
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false } });
            const mimeType = 'audio/webm';
            if (!MediaRecorder.isTypeSupported(mimeType)) throw new Error('MimeType ' + mimeType + ' is not supported.');
            mediaRecorderRef.current = new MediaRecorder(stream, { mimeType });
            mediaRecorderRef.current.ondataavailable = (event) => event.data.size > 0 && audioChunksRef.current.push(event.data);
            mediaRecorderRef.current.onstop = () => {
                setRecordedAudioBlob(new Blob(audioChunksRef.current, { type: mimeType }));
                mediaRecorderRef.current.stream.getTracks().forEach(track => track.stop());
                setIsRecording(false);
            };
            mediaRecorderRef.current.start();
            setIsRecording(true);
        } catch (err) { logEvent('[ERROR] Audio recording failed: ' + err.message); }
      };

      const handleStopRecording = () => mediaRecorderRef.current?.stop();

      const handleAudioTest = async () => {
        if (!recordedAudioBlob) return;
        setIsTesting(true);
        setTestResult('');
        try {
            const reader = new FileReader();
            reader.readAsDataURL(recordedAudioBlob);
            reader.onloadend = async () => {
                const body = {
                    model: 'local/gemma-multimodal',
                    messages: [{ role: 'user', content: [{ type: 'text', text: 'Transcribe this audio.' }, { type: 'audio_url', audio_url: { url: reader.result } }]}]
                };
                const response = await fetch('http://localhost:8008/v1/chat/completions', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
                const result = await response.json();
                if (!response.ok) throw new Error(result.detail || 'Test request failed');
                setTestResult(result.choices[0]?.message?.content || 'No transcription found.');
                logEvent('[SUCCESS] Local AI server test completed.');
            };
        } catch (e) {
            const errorMsg = 'Local AI server test failed: ' + e.message + '. Is it running on port 8008?';
            logEvent('[ERROR] ' + errorMsg);
            setTestResult(errorMsg);
        } finally { setIsTesting(false); }
      };

      return (
        <div className="bg-gray-800/60 border border-gray-700 rounded-xl p-4 space-y-4">
          <div className="flex justify-between items-start">
            <h3 className="text-lg font-bold text-indigo-300">Local AI Server</h3>
            <div className="flex items-center gap-2 mt-1">
              <div className={'w-3 h-3 rounded-full ' + (status.isRunning ? 'bg-green-500 animate-pulse' : 'bg-red-500')}></div>
              <p className="text-sm text-gray-300">
                {status.isRunning ? 'Running' : 'Stopped'}
              </p>
            </div>
          </div>
          
          <div className="flex flex-wrap gap-2">
            <button onClick={() => handleServerAction(onStartServer)} disabled={!isServerConnected || status.isRunning || actionInProgress} className="flex-1 bg-green-600 text-white font-semibold py-2 px-4 rounded-lg hover:bg-green-700 disabled:bg-gray-600 disabled:cursor-not-allowed">Start</button>
            <button onClick={() => handleServerAction(onStopServer)} disabled={!isServerConnected || !status.isRunning || actionInProgress} className="flex-1 bg-red-600 text-white font-semibold py-2 px-4 rounded-lg hover:bg-red-700 disabled:bg-gray-600 disabled:cursor-not-allowed">Stop</button>
          </div>

          <div>
              <h4 className="font-semibold text-gray-300 text-sm mb-1">Server Logs</h4>
              <div ref={logsContainerRef} className="h-24 bg-black/30 p-2 rounded text-xs font-mono overflow-y-auto scroll-smooth">
                  {status.logs.length > 0 ? status.logs.map((log, i) => <div key={i} className="text-slate-400 break-words">{log}</div>) : <p className="text-slate-500">No logs yet.</p>}
              </div>
          </div>

          <div>
              <h4 className="font-semibold text-gray-300 text-sm mb-2">Multimodal Test</h4>
              <div className="flex items-center justify-center gap-2 flex-wrap">
                  <button onClick={isRecording ? handleStopRecording : handleStartRecording} disabled={!status.isRunning || actionInProgress} className={'px-4 py-2 font-bold text-white rounded-lg flex items-center gap-2 transition-all duration-200 disabled:opacity-50 ' + (isRecording ? 'bg-red-600 hover:bg-red-700 animate-pulse' : 'bg-cyan-600 hover:bg-cyan-700')}>
                    {isRecording ? 'Stop Recording' : 'Record Audio'}
                  </button>
                  <button onClick={handleAudioTest} disabled={!recordedAudioBlob || isTesting || isRecording} className="px-4 py-2 font-bold text-white rounded-lg flex items-center gap-2 transition-all duration-200 bg-blue-600 hover:bg-blue-700 disabled:opacity-50">
                    {isTesting ? <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div> : '🧪'}
                    {isTesting ? 'Testing...' : 'Test'}
                  </button>
              </div>
              {recordedAudioBlob && !isRecording && <div className="mt-2 text-center"><audio controls src={URL.createObjectURL(recordedAudioBlob)} className="w-full h-10" /></div>}
              {testResult && <div className="mt-2"><h5 className="font-semibold text-gray-400 text-xs">Test Result:</h5><pre className="mt-1 text-sm text-cyan-200 bg-black/30 p-2 rounded-md whitespace-pre-wrap">{testResult}</pre></div>}
          </div>
        </div>
      );
    `
};