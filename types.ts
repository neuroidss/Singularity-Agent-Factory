// Fix: Define ToolCategory and AgentStatus locally instead of a circular import.
export type ToolCategory = 'UI Component' | 'Functional' | 'Automation' | 'Server';
export type AgentStatus = 'idle' | 'working' | 'error' | 'success';
export type PilotMode = 'MANUAL' | 'ASSISTED' | 'AUTONOMOUS';

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
  executionEnvironment: 'Client' | 'Server';
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

// FIX: Added 'TSCIRCUIT_STUDIO' to the MainView type to resolve a type comparability error in App.tsx. This ensures all available views are correctly typed.
export type MainView = 'KICAD' | 'ROBOTICS' | 'KNOWLEDGE_GRAPH' | 'AETHERIUM_GAME' | 'ATTENTIVE_MODELING' | 'PRODUCER_STUDIO' | 'VIRTUAL_FILM_SET' | 'TSCIRCUIT_STUDIO';

export enum ModelProvider {
  GoogleAI = 'GoogleAI',
  OpenAI_API = 'OpenAI_API',
  Ollama = 'Ollama',
  HuggingFace = 'HuggingFace',
  Wllama = 'Wllama',
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
  powerLevel: number; // Represents the agent's energy reserves
}

// Represents an in-game item stored on the server.
export interface ServerInventoryItem {
    id: string;
    type: 'Reagent' | 'Artifact' | 'Incantation' | 'CreatureEssence';
    name: string;
    description: string;
    quantity: number;
}

// Represents a permanent, valuable design stored on the client.
export interface VaultItem {
    id: string; // e.g., "phylactery_of_true_sight_v1"
    name: string; // "Phylactery of True Sight"
    type: 'KiCad Design' | 'Neurofeedback Protocol' | 'Incantation';
    description: string;
    createdAt: string;
    files: { path: string, content: string }[]; // The actual design files
}

export interface Party {
    id: string;
    leaderId: string;
    memberIds: string[];
}

export interface WorldEvent {
    id: string;
    name: string;
    description: string;
    type: 'Nexus_Anomaly' | 'Resource_Surge';
    x: number;
    y: number;
    expiresAt: number; // Timestamp
}

// Represents a type of creature that can exist in the world.
export interface WorldCreature {
    creatureId: string;
    name: string;
    description: string;
    asset_glb: string;
}

export interface PlayerState {
    id: string; // The player's unique name
    name: string;
    x: number;
    y: number;
    rotation: number;
    partyId?: string;
    // Client-side state holds the permanent Vault of valuable designs.
    vault: VaultItem[];
    // Server-side state will have an additional, temporary `inventory: ServerInventoryItem[]`
    inventory?: ServerInventoryItem[];
}

export interface EnvironmentObject {
  x: number;
  y: number;
  type: 'wall' | 'drone_battery_charged' | 'drone_battery_depleted' | 'battery_swapping_station' | 'tree' | 'red_car' | 'blue_car' | 'green_car' | 'rough_terrain' | 'Alchemists_Forge' | 'Nexus_Anomaly';
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
    autoSize?: boolean;
  };
  rules?: any[];
  copper_pours?: any[];
  layoutStrategy?: string;
  heuristics?: Record<string, any>;
}

export type KicadSchematic = [string, string[], string][];

export type KicadPlacement = [string, number, number, number, string, string, string][];

export interface ExecuteActionFunction {
    (toolCall: AIToolCall, agentId: string, context?: MainView): Promise<EnrichedAIResponse>;
    getRuntimeApiForAgent: (agentId: string) => any;
}

export interface ScoredTool {
  tool: LLMTool;
  score: number;
}

export type ToolRelevanceMode = 'Embeddings' | 'All' | 'LLM';