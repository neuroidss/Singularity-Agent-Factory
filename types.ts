export type ToolCategory = 'Text Generation' | 'Image Generation' | 'Data Analysis' | 'Automation' | 'Audio Processing' | 'Mathematics' | 'UI Component';

export interface ToolParameter {
  name: string;
  type: 'string' | 'number' | 'boolean';
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

export type AIAction = 'EXECUTE_EXISTING' | 'CREATE' | 'IMPROVE_EXISTING' | 'CLARIFY';

export type AINewToolDefinition = Omit<LLMTool, 'id'>;

export interface AIResponse {
  action: AIAction;
  reason: string;
  // For EXECUTE_EXISTING
  selectedToolName?: string;
  executionParameters?: Record<string, any>; 
  // For CREATE
  newToolDefinition?: AINewToolDefinition;
  // For IMPROVE_EXISTING
  toolNameToModify?: string;
  newImplementationCode?: string;
  // For CLARIFY
  clarificationRequest?: string;
}

// This type includes the original AI response plus the results of client-side execution.
export interface EnrichedAIResponse extends AIResponse {
  tool?: LLMTool;
  executionResult?: any; // The result after running the code.
  executionError?: string; // Any error that occurred during execution.
}

export interface ServiceOutput {
  data: AIResponse;
}

export interface DebugInfo {
    userInput: string;
    selectedTools?: LLMTool[] | null;
    augmentedUserInput: string;
    systemInstruction: string;
    rawAIResponse: string;
    processedResponse: EnrichedAIResponse | null;
}

// Model Selection Types
export enum ModelProvider {
  GoogleAI = 'GoogleAI',
  OpenAI_API = 'OpenAI_API',
  Ollama = 'Ollama',
}

export interface AIModel {
  id: string;
  name: string;
  provider: ModelProvider;
}

// API Configuration for non-Google models
export interface APIConfig {
  openAIBaseUrl: string;
  openAIAPIKey: string;
  ollamaHost: string;
}

// Props passed to UI tools. All properties are optional.
export type UIToolRunnerProps = Record<string, any>;