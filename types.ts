export type ToolCategory = 'UI Component' | 'Functional' | 'Automation';

export enum OperatingMode {
  Command = 'COMMAND',
  Assist = 'ASSIST',
  Autonomous = 'AUTONOMOUS',
  Task = 'TASK',
  Swarm = 'SWARM',
}

export type AgentStatus = 'idle' | 'working' | 'succeeded' | 'failed' | 'terminated';

export interface AgentWorker {
  id: string;
  status: AgentStatus;
  lastAction: string | null;
  error: string | null;
  result: any | null;
}

export enum ToolRetrievalStrategy {
  Direct = 'DIRECT',
  LLM = 'LLM',
  Embedding = 'EMBEDDING',
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
  cost?: number; // The amount of resources this tool costs to use.
  // A new field to store the AI's reasoning for creating the tool,
  // aligning with Viktor Frankl's "Will to Meaning".
  purpose?: string;
  // For 'UI Component' tools, this is a string of JSX.
  // For other tools, it's the body of a function.
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

// This type includes the original AI response plus the results of client-side execution.
export interface EnrichedAIResponse {
  toolCall: AIToolCall | null;
  tool?: LLMTool;
  executionResult?: any; // The result after running the code.
  executionError?: string; // Any error that occurred during execution.
}

// Debug info for the first AI call (Tool Selection)
export interface ToolSelectionCallInfo {
    strategy: ToolRetrievalStrategy;
    systemInstruction?: string;
    userPrompt: string;
    availableTools?: { name: string; description: string; }[];
    rawResponse?: string;
    selectedToolNames?: string[];
    error?: string;
}

// Debug info for the second AI call (Agent Execution)
export interface AgentExecutionCallInfo {
    systemInstruction: string;
    userPrompt: string;
    toolsProvided: LLMTool[];
    rawResponse: string;
    processedResponse: EnrichedAIResponse | null;
    error?: string;
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

// Types for the robotics simulation
export interface RobotState {
  x: number;
  y: number;
  rotation: number; // 0: up, 90: right, 180: down, 270: left
  hasResource: boolean;
}

export interface EnvironmentObject {
  x: number;
  y: number;
  type: 'wall' | 'resource' | 'collection_point';
}

// --- Knowledge Graph Types ---
export type KnowledgeGraphNodeType = ToolCategory | 'Topic' | 'Gene' | 'Protein' | 'Compound' | 'Pathway' | 'Disease' | 'Hypothesis' | 'KnowledgeGap' | 'Method' | 'Result' | 'Observation' | 'Biomarker' | 'Tool';


export interface KnowledgeGraphNode {
  id: string;
  label: string;
  type: KnowledgeGraphNodeType;
  zone?: 'emerging' | 'fading' | 'connecting';
  [key: string]: any; // Allow other properties
}

export interface KnowledgeEdge {
  source: string;
  target: string;
  type?: string;
  [key: string]: any;
}

export interface KnowledgeGraph {
  nodes: KnowledgeGraphNode[];
  edges: KnowledgeEdge[];
}

export interface TrendAnalysis {
    emergingTopics: string[];
    fadingTopics: string[];
    connectingTopics: string[];
}


// --- Game Tapes & Learning Types ---

export type EpisodeStatus = 'Completed' | 'Failed' | 'Terminated by User' | 'In Progress';

export interface Episode {
    id: string;
    startTime: string;
    endTime: string;
    status: EpisodeStatus;
    goal: string;
    actions: EnrichedAIResponse[];
}
