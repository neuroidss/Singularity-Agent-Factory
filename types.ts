export type ToolCategory = 'UI Component' | 'Functional' | 'Automation' | 'Server';

export type AgentStatus = 'idle' | 'working' | 'succeeded' | 'failed' | 'terminated' | 'paused';

export interface AgentWorker {
  id: string;
  status: AgentStatus;
  lastAction: string | null;
  error: string | null;
  result: any | null;
}

export interface AgentPersonality {
  id: string;
  startX: number;
  startY: number;
  behaviorType: 'resource_collector' | 'patroller' | 'seek_target';
  targetId?: string;
  asset_glb?: string;
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

// Represents the arguments needed to create a new tool, used for bootstrapping.
export interface ToolCreatorPayload {
  name: string;
  description: string;
  category: ToolCategory;
  executionEnvironment: 'Client' | 'Server';
  parameters: ToolParameter[];
  implementationCode: string;
  purpose: string;
}

export interface AIToolCall {
    name: string;
    arguments: Record<string, any>;
}

export interface AIResponse {
  toolCalls: AIToolCall[] | null;
}

export interface EnrichedAIResponse {
  toolCall: AIToolCall | null;
  tool?: LLMTool;
  executionResult?: any;
  executionError?: string;
}

export type MainView = 'KICAD' | 'ROBOTICS' | 'KNOWLEDGE_GRAPH';

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
  type: 'wall' | 'resource' | 'collection_point' | 'tree' | 'target';
  id?: string;
  asset_glb?: string;
}

export interface AssetTransform {
  rotation?: [number, number, number]; // Euler angles in degrees [x, y, z]
  offset?: [number, number, number];   // Offset in model units [x, y, z]
  scale?: number | [number, number, number]; // Uniform or non-uniform scale factor
}

export interface KnowledgeGraphNode {
  id: string;
  label: string;
  shape?: 'rectangle' | 'circle';
  assetTransforms?: {
    glb?: AssetTransform;
    svg?: AssetTransform;
  };
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
  board_outline?: {
    x: number;
    y: number;
    width: number;
    height: number;
    shape?: 'rectangle' | 'circle';
  };
  rules?: any[];
  layoutStrategy?: string;
}

export type KicadSchematic = [string, string[], string][];

export type KicadPlacement = [string, number, number, number, string, string, string][];

export interface ExecuteActionFunction {
    (toolCall: AIToolCall, agentId: string): Promise<EnrichedAIResponse>;
    getRuntimeApiForAgent: (agentId: string) => { tools: { list: () => LLMTool[] } };
}

export interface ScoredTool {
  tool: LLMTool;
  score: number;
}