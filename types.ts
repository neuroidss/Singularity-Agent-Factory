export type ToolCategory = 'UI Component' | 'Functional' | 'Automation' | 'Server';

export type AgentStatus = 'idle' | 'working' | 'succeeded' | 'failed' | 'terminated';

export interface AgentWorker {
  id: string;
  status: AgentStatus;
  lastAction: string | null;
  error: string | null;
  result: any | null;
}

export interface ToolParameter {
  name: string;
  type: 'string' | 'number' | 'boolean' | 'object' | 'array';
  description: string;
  required: boolean;
}

export interface WorkflowStep {
  toolName: string;
  arguments: Record<string, any>;
}

export interface LLMTool {
  id:string;
  name:string;
  description: string;
  category: ToolCategory;
  version: number;
  parameters: ToolParameter[];
  cost?: number;
  purpose?: string;
  implementationCode: string;
  createdAt?: string;
  updatedAt?: string;
}

export type NewToolPayload = Omit<LLMTool, 'id' | 'version' | 'createdAt' | 'updatedAt'>;

export interface AIToolCall {
    name: string;
    arguments: Record<string, any>;
}

export interface AIResponse {
  toolCall: AIToolCall | null;
}

export interface EnrichedAIResponse {
  toolCall: AIToolCall | null;
  tool?: LLMTool;
  executionResult?: any;
  executionError?: string;
}

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

export interface APIConfig {
  googleAIAPIKey: string;
  openAIAPIKey:string;
  openAIBaseUrl: string;
  ollamaHost: string;
}

export type UIToolRunnerProps = Record<string, any>;

export interface RobotState {
  id: string;
  x: number;
  y: number;
  rotation: number; // 0: up, 90: right, 180: down, 270: left
  hasResource: boolean;
}

export interface EnvironmentObject {
  x: number;
  y: number;
  type: 'wall' | 'resource' | 'collection_point' | 'tree';
}

export interface KnowledgeGraphNode {
  id: string;
  label: string;
  [key: string]: any;
}

export interface KnowledgeGraphEdge {
  source: string;
  target: string;
  [key: string]: any;
}

export interface KnowledgeGraph {
  nodes: KnowledgeGraphNode[];
  edges: KnowledgeGraphEdge[];
}