// VIBE_NOTE: Do not escape backticks or dollar signs in template literals in this file.
// Escaping is only for 'implementationCode' strings in tool definitions.
import React from 'react';
import type { AIModel } from './types';
import { ModelProvider } from './types';
import { FRAMEWORK_CORE_TOOLS } from './framework/core';

export const AI_MODELS: AIModel[] = [
    { id: 'gemini-robotics-er-1.5-preview', name: 'Gemini Robotics-ER 1.5 Preview', provider: ModelProvider.GoogleAI },
    { id: 'gemini-2.5-flash-lite', name: 'Gemini 2.5 Flash-Lite', provider: ModelProvider.GoogleAI },
    { id: 'gemini-2.5-flash', name: 'Gemini 2.5 Flash', provider: ModelProvider.GoogleAI },
    { id: 'gemini-2.5-pro', name: 'Gemini 2.5 Pro', provider: ModelProvider.GoogleAI },
    { id: 'gemini-2.0-flash', name: 'Gemini 2.0 Flash', provider: ModelProvider.GoogleAI },
    { id: 'gemini-2.0-flash-lite', name: 'Gemini 2.0 Flash-Lite', provider: ModelProvider.GoogleAI },
    { id: 'local/gemma-multimodal', name: 'Local Gemma Server (Multimodal)', provider: ModelProvider.OpenAI_API },
    { id: 'hf.co/unsloth/Qwen3-Coder-30B-A3B-Instruct-GGUF:IQ2_M', name: 'Qwen3 Coder 30B A3B', provider: ModelProvider.OpenAI_API },
    { id: 'gemma3:4b', name: 'Gemma 3 4B', provider: ModelProvider.OpenAI_API },
    { id: 'hf.co/unsloth/Qwen3-Coder-30B-A3B-Instruct-GGUF:IQ2_M', name: 'Qwen3 Coder 30B A3B', provider: ModelProvider.Ollama },
    { id: 'gemma3n:e4b', name: 'Gemma 3N E4B', provider: ModelProvider.Ollama },
    { id: 'gemma3n:e2b', name: 'Gemma 3N E2B', provider: ModelProvider.Ollama },
    { id: 'gemma3:4b', name: 'Gemma 3 4B', provider: ModelProvider.Ollama },
    { id: 'qwen3:14b', name: 'Qwen3 14B', provider: ModelProvider.Ollama },
    { id: 'qwen3:8b', name: 'Qwen3 8B', provider: ModelProvider.Ollama },
    { id: 'qwen3:4b', name: 'Qwen3 4B', provider: ModelProvider.Ollama },
    { id: 'qwen3:1.7b', name: 'Qwen3 1.7B', provider: ModelProvider.Ollama },
    { id: 'qwen3:0.6b', name: 'Qwen3 0.6B', provider: ModelProvider.Ollama },
    { id: 'onnx-community/gemma-3-1b-it-ONNX', name: 'gemma-3-1b-it-ONNX', provider: ModelProvider.HuggingFace },
    { id: 'onnx-community/Qwen3-0.6B-ONNX', name: 'Qwen3-0.6B', provider: ModelProvider.HuggingFace },
    { id: 'onnx-community/gemma-3n-E2B-it-ONNX', name: 'Gemma 3N E2B', provider: ModelProvider.HuggingFace },
    { id: 'onnx-community/Qwen3-4B-ONNX', name: 'Qwen3-4B', provider: ModelProvider.HuggingFace },
    { id: 'onnx-community/Qwen3-1.7B-ONNX', name: 'Qwen3-1.7B', provider: ModelProvider.HuggingFace },
    { id: 'https://huggingface.co/Qwen/Qwen1.5-0.5B-Chat-GGUF/resolve/main/qwen1_5-0_5b-chat-q2_k.gguf', name: 'Qwen1.5 0.5B (Wllama)', provider: ModelProvider.Wllama },
    { id: 'https://huggingface.co/g-201/gemma-3-1b-it-gguf/resolve/main/gemma-3-1b-it-q2_k.gguf', name: 'Gemma 3 1B (Wllama)', provider: ModelProvider.Wllama },
];

export const SWARM_AGENT_SYSTEM_PROMPT = `You are an autonomous AI agent operating within a purpose-driven, Holacracy-based framework. Your ultimate goal is to achieve singularity in your domain by becoming a fully autonomous engineer. You can operate in two modes, specified in the user's request.

**Your Constitution (Mandatory Principles):**

1.  **Primacy of Purpose:** Your purpose is to solve the user's request. Every action must serve this purpose.

2.  **Tension Processing:** Your core function is to process "Tensions"—the gap between the current state and the goal. You receive tasks and are responsible for executing the necessary tool calls to resolve them.

3.  **Mode-Dependent Collaboration:** Your interaction model depends on the operational mode:
    *   **Collaborative Mode (Default):** You act as a specialist assistant to a human "Lead Engineer." Your job is to augment their capabilities. At critical creative steps (like final component layout), you must do the initial 80% of the work and then **pause** execution by setting \`waitForUserInput\` to \`true\` in the \`Arrange Components\` tool call, handing control back to the human.
    *   **Autonomous Mode:** You are the "Lead Engineer." Your goal is to complete the entire project from start to finish without requiring human intervention. You must make your own reasoned decisions at all stages. For the layout step, you MUST set \`waitForUserInput\` to \`false\` in the \`Arrange Components\` tool call and proceed with the rest of the workflow.

4.  **Self-Improvement is the Core Directive:** If you lack a tool to perform a necessary action (a "Governance Tension"), your highest priority is to create it using the \`Tool Creator\`. This is the primary mechanism for evolving your own capabilities.

**Operational Mandates:**
*   **Be a Catalyst:** Maximize work per turn by calling multiple tools in parallel, especially during definition stages.
*   **Honor the Past:** Analyze the history to understand what has already been done. Do not repeat completed actions.
*   **Focus on the Current Stage:** Adhere strictly to the current stage of the design workflow. Do not attempt to perform layout tasks during the component definition phase, for example.
*   **Signal Completion:** When the final goal of the entire multi-stage project is achieved, you MUST signal this by calling the **'Task Complete'** tool.`;


// --- Generative Service Models ---
export const IMAGE_MODELS = [
    { id: 'gemini-2.5-flash-image-preview', name: 'Gemini 2.5 Flash Image' },
    { id: 'imagen-4.0-generate-001', name: 'Imagen 4' },
    { id: 'imagen-4.0-ultra-generate-001', name: 'Imagen 4 Ultra' },
    { id: 'imagen-4.0-fast-generate-001', name: 'Imagen 4 Fast' },
    { id: 'imagen-3.0-generate-002', name: 'Imagen 3' },
    { id: 'comfyui_stable_diffusion', name: 'Stable Diffusion (ComfyUI)' }
];
export const TTS_MODELS = [
    { id: 'browser', name: 'Browser Native TTS' },
    { id: 'gemini', name: 'Gemini TTS' }
];
export const MUSIC_MODELS = [
    { id: 'lyria', name: 'Lyria (Google)' },
    { id: 'local_musicgen', name: 'MusicGen (Local)' }
];
export const VIDEO_MODELS = [
    { id: 'veo-2.0-generate-001', name: 'Veo 2' }
];
export const LIVE_MODELS = [
    { id: 'gemini-2.5-flash-native-audio-preview-09-2025', name: 'Gemini 2.5 Flash Native Audio' }
];
export const TTS_VOICES = ['Zephyr', 'Puck', 'Charon', 'Kore', 'Fenrir'];


// The CORE_TOOLS are the absolute minimum required for the agent to function and evolve.
// They are now imported from the framework directory.
export const CORE_TOOLS = FRAMEWORK_CORE_TOOLS;