export type ToolCategory = 'UI Component' | 'Functional' | 'Automation';

export interface ToolParameter {
  name: string;
  type: 'string' | 'number' | 'boolean' | 'object' | 'array';
  description: string;
  required: boolean;
}

export interface LLMTool {
  id: string;
  name:string;
  description: string;
  category: ToolCategory;
  version: number;
  parameters: ToolParameter[];
  // For 'UI Component' tools, this is a string of JSX.
  // For other tools, it's the body of a function.
  implementationCode: string;
}

export type NewToolPayload = Omit<LLMTool, 'id' | 'version'>;

export interface AIToolCall {
    name: string;
    arguments: Record<string, any>;
}

export interface AIResponse {
  toolCall: AIToolCall | null;
}

// This type includes the original AI response plus the results of client-side execution.
export interface EnrichedAIResponse {
  toolCall: AIToolCall | null;
  tool?: LLMTool;
  executionResult?: any; // The result after running the code.
  executionError?: string; // Any error that occurred during execution.
}

export interface ServiceOutput {
  data: AIResponse;
}

// NEW DebugInfo structure for multi-stage debugging
export interface MissionPlanningInfo {
    systemInstruction: string;
    response: {
        mission: string;
        toolNames: string[];
    }
}

export interface FinalAgentCallInfo {
    systemInstruction: string;
    userPrompt: string;
    toolsProvided: LLMTool[];
    rawResponse: string;
    processedResponse: EnrichedAIResponse | null;
}

export interface DebugInfo {
    userInput: string;
    modelId: string;
    temperature: number;
    
    // Each step can be null until it completes, or contain an error.
    missionPlanning?: MissionPlanningInfo | { error: string };
    finalAgentCall?: FinalAgentCallInfo | { error: string };

    // This will be the overall error if one occurs outside a specific step
    processError?: string; 
}


// Model Selection Types
export enum ModelProvider {
  GoogleAI = 'GoogleAI',
  OpenAI_API = 'OpenAI_API',
  Ollama = 'Ollama',
  HuggingFace = 'HuggingFace',
}

export interface AIModel {
  id: string;
  name: string;
  provider: ModelProvider;
}

export type HuggingFaceDevice = 'wasm' | 'webgpu';

// API Configuration for non-Google models
export interface APIConfig {
  googleAIAPIKey: string;
  openAIBaseUrl: string;
  openAIAPIKey: string;
  openAIModelId: string;
  ollamaHost: string;
  huggingFaceDevice: HuggingFaceDevice;
}

// Props passed to UI tools. All properties are optional.
export type UIToolRunnerProps = Record<string, any>;