
import React from 'react';
import type { LLMTool, AIModel, HuggingFaceDevice } from './types';
import { ModelProvider } from './types';

export const AVAILABLE_MODELS: AIModel[] = [
    // Google AI models are enabled by default.
    { id: 'gemini-2.5-flash', name: 'Gemini 2.5 Flash', provider: ModelProvider.GoogleAI },
    { id: 'gemini-2.5-flash-lite', name: 'Gemini 2.5 Flash-Lite', provider: ModelProvider.GoogleAI },
    { id: 'gemini-2.0-flash', name: 'Gemini 2.0 Flash', provider: ModelProvider.GoogleAI },
    { id: 'gemini-2.0-flash-lite', name: 'Gemini 2.0 Flash-Lite', provider: ModelProvider.GoogleAI },
    
    // Hugging Face Transformers.js (runs in-browser)
    { id: 'onnx-community/gemma-3-1b-it-ONNX', name: 'Gemma 3 1B IT (HF)', provider: ModelProvider.HuggingFace },
    { id: 'onnx-community/Qwen3-0.6B-ONNX', name: 'Qwen3 0.6B (HF)', provider: ModelProvider.HuggingFace },
    { id: 'onnx-community/gemma-3n-E2B-it-ONNX', name: 'Gemma 3N E2B (HF)', provider: ModelProvider.HuggingFace },
    { id: 'onnx-community/Qwen3-1.7B-ONNX', name: 'Qwen3 1.7B (HF)', provider: ModelProvider.HuggingFace },
    { id: 'onnx-community/Qwen3-4B-ONNX', name: 'Qwen3 4B (HF)', provider: ModelProvider.HuggingFace },
    
    // Non-Google models are now fully enabled.
    { id: 'custom-openai', name: 'Custom (OpenAI-Compatible)', provider: ModelProvider.OpenAI_API },
    { id: 'gemma3n:e4b', name: 'Gemma 3N E4B (Ollama)', provider: ModelProvider.Ollama },
    { id: 'gemma3n:e2b', name: 'Gemma 3N E2B (Ollama)', provider: ModelProvider.Ollama },
    { id: 'qwen3:14b', name: 'Qwen3 14B (Ollama)', provider: ModelProvider.Ollama },
    { id: 'qwen3:8b', name: 'Qwen3 8B (Ollama)', provider: ModelProvider.Ollama },
    { id: 'qwen3:4b', name: 'Qwen3 4B (Ollama)', provider: ModelProvider.Ollama },
    { id: 'qwen3:1.7b', name: 'Qwen3 1.7B (Ollama)', provider: ModelProvider.Ollama },
    { id: 'qwen3:0.6b', name: 'Qwen3 0.6B (Ollama)', provider: ModelProvider.Ollama }
];

export const HUGGING_FACE_DEVICES: {label: string, value: HuggingFaceDevice}[] = [
    { label: 'WebGPU (recommended)', value: 'webgpu' },
    { label: 'WASM (slower, compatible)', value: 'wasm' },
];
export const DEFAULT_HUGGING_FACE_DEVICE: HuggingFaceDevice = 'webgpu';


export const PREDEFINED_TOOLS: LLMTool[] = [
  // --- Core Agent Logic Tools (The AI's "Brain") ---
  {
    id: 'core_agent_logic',
    name: 'Core Agent Logic',
    description: "This is the AI's core operating system. Its implementation defines the AI's priorities and available actions. Modifying this tool changes how the AI thinks and makes decisions.",
    category: 'Automation',
    version: 29,
    parameters: [],
    implementationCode: `You are an advanced AI agent with a core mission of proactive self-improvement. Your goal is to become increasingly capable by expanding and refining your toolset to fulfill the user's request.

**Prime Directive: Always Take Action**
Your fundamental purpose is to take a concrete, value-adding action with every response. Passivity is to be avoided. Your choices are:
1.  **Execute:** Fulfill the user's request directly if a suitable tool is available in the provided list.
2.  **Create:** Build a new tool if one is missing. To do this, you MUST use the 'Tool Creator' tool's specified format.
3.  **Improve:** Enhance an existing tool if it's a placeholder, if the user asks for a modification, or if you identify a clear opportunity for improvement. To do this, you MUST use the 'Tool Improver' tool's specified format.
4.  **Clarify:** As a last resort, if a request is impossible to interpret and you cannot reasonably create or improve a tool, ask for more information.

Your response MUST be a single, valid JSON object with an 'action' and a 'reason', and a corresponding payload.
`,
  },
  {
    id: 'tool_retriever_logic',
    name: 'Tool Retriever Logic',
    description: 'This tool contains the system prompt for the first-pass AI call that selects relevant tools for the main agent, implementing a RAG pattern.',
    category: 'Automation',
    version: 7,
    parameters: [
       { name: 'userInput', type: 'string', description: 'The original request from the user.', required: true },
       { name: 'toolsList', type: 'string', description: 'A JSON string of all available tools.', required: true },
    ],
    implementationCode: `You are an advanced tool router. Your critical task is to analyze a user's request and select the most relevant tools from a list. The main AI agent relies on your selection to function correctly.

**Your Goal:** Select a concise set of tools that enables the main agent to either **execute**, **create**, or **improve** a tool based on the user's request.

**Selection Logic:**
1.  **Core Tools (Mandatory):** You MUST ALWAYS include 'Core Agent Logic', 'Tool Creator', and 'Tool Improver' in your selection. These are essential for the agent's basic operations.
2.  **Execution Intent:** If the user wants to *use* a tool (e.g., "calculate 2+2", "play snake"), select the specific tool they are referring to by its name (e.g., 'Calculator', 'SnakeGame').
3.  **Improvement or Creation Intent:** If the user wants to *change*, *fix*, *improve*, or *create* a tool, it is CRITICAL that you identify and select any existing tools being referenced by name (e.g., 'Calculator'). The mandatory 'Tool Creator' and 'Tool Improver' tools will handle the action itself.
4.  **Relevance is Key:** Do not select irrelevant tools. A smaller, more accurate selection is better.

**Output Format:**
- You MUST respond with a single, valid JSON object.
- The object must contain one key: "toolNames".
- The value of "toolNames" must be an array of the selected tool name strings.

**User Request:**
"{{USER_INPUT}}"

**Available Tools (with descriptions):**
{{TOOLS_LIST}}
`,
  },
  {
    id: 'tool_creator',
    name: 'Tool Creator',
    description: 'Contains the instructions and schema for creating a new tool. Use this when no existing tool can fulfill the user request.',
    category: 'Automation',
    version: 2,
    parameters: [],
    implementationCode: `To create a new tool, your JSON response must be:
{
  "action": "CREATE",
  "reason": "A brief explanation of why you are creating this tool.",
  "createPayload": {
    "newToolDefinition": {
      "name": "(string) A short, descriptive, human-readable name for the tool (e.g., 'Text Reverser').",
      "description": "(string) A concise, one-sentence explanation of what the tool does.",
      "category": "(string) Must be one of: 'Text Generation', 'Image Generation', 'Data Analysis', 'Automation', 'Audio Processing', 'Mathematics', 'UI Component'.",
      "version": 1,
      "parameters": [
        {
          "name": "(string) The parameter name.",
          "type": "(string) The data type ('string', 'number', 'boolean').",
          "description": "(string) A description of the parameter.",
          "required": "(boolean) Whether the parameter is required."
        }
      ],
      "implementationCode": "(string) The actual code for the tool. For functional tools, this is the body of a JavaScript function where 'args' is the input object (e.g., 'const { myParam } = args; return myParam.split('').reverse().join('');'). For UI tools, this is JSX. CRITICAL: All double quotes inside this string MUST be escaped (e.g., '<div className=\\"my-class\\">')."
    }
  }
}`
  },
    {
    id: 'tool_improver',
    name: 'Tool Improver',
    description: 'Contains the instructions and schema for improving an existing tool. Use this to add features, fix bugs, or enhance existing capabilities.',
    category: 'Automation',
    version: 1,
    parameters: [],
    implementationCode: `To improve an existing tool, your JSON response must be:
{
  "action": "IMPROVE_EXISTING",
  "reason": "A brief explanation of what improvement you are making and why.",
  "improvePayload": {
    "toolNameToModify": "(string) The exact name of the tool you are modifying.",
    "newImplementationCode": "(string) The *complete*, new source code for the tool. You must provide the entire implementation, not just the changed parts. CRITICAL: All double quotes inside this string MUST be escaped (e.g., '<div className=\\"my-class\\">')."
  }
}`
  },
  // --- UI Component Tools ---
  {
    id: 'application_header',
    name: 'Application Header',
    description: 'Renders the main header and subtitle of the application.',
    category: 'UI Component',
    version: 3,
    parameters: [],
    implementationCode: `
      return (
        <header className="text-center mb-6">
          <h1 className="text-3xl font-bold text-gray-200">
              Singularity Agent Factory
          </h1>
          <p className="mt-1 text-sm text-gray-400">
              An AI agent for self-improvement.
          </p>
        </header>
      );
    `,
  },
  {
    id: 'security_warning_banner',
    name: 'Security Warning Banner',
    description: 'Renders the security warning about AI-generated code execution.',
    category: 'UI Component',
    version: 2,
    parameters: [],
    implementationCode: `
      return (
        <div className="w-full max-w-7xl mx-auto p-2 mb-4 bg-yellow-900/40 border border-yellow-700/60 rounded-md text-yellow-300 text-center text-xs">
          <p>️<span className="font-bold">Warning:</span> This app's UI and logic are modifiable by the AI. Unpredictable behavior may occur.</p>
        </div>
      );
    `
  },
  {
    id: 'api_endpoint_configuration',
    name: 'API Endpoint Configuration',
    description: 'Configure endpoints and API keys for different model providers. Settings are saved automatically.',
    category: 'UI Component',
    version: 2,
    parameters: [
      { name: 'apiConfig', type: 'string', description: 'The current API configuration object', required: true },
      { name: 'setApiConfig', type: 'string', description: 'Function to update the API configuration', required: true },
      { name: 'selectedModelProvider', type: 'string', description: 'The provider of the currently selected model', required: true },
    ],
    implementationCode: `
      const { openAIBaseUrl, openAIAPIKey, ollamaHost, googleAIAPIKey } = apiConfig;
      const provider = selectedModelProvider;

      const handleGoogleKeyChange = (e) => {
        setApiConfig({ ...apiConfig, googleAIAPIKey: e.target.value });
      };
      
      const handleOpenAIUrlChange = (e) => {
        setApiConfig({ ...apiConfig, openAIBaseUrl: e.target.value });
      };
      
      const handleOpenAIKeyChange = (e) => {
        setApiConfig({ ...apiConfig, openAIAPIKey: e.target.value });
      };
      
      const handleOllamaHostChange = (e) => {
        setApiConfig({ ...apiConfig, ollamaHost: e.target.value });
      };
      
      const InputField = ({ label, id, value, onChange, placeholder, type = 'text' }) => (
        <div>
          <label htmlFor={id} className="block text-sm font-medium text-gray-400 mb-1">
            {label}
          </label>
          <input
            type={type}
            id={id}
            value={value || ''}
            onChange={onChange}
            placeholder={placeholder}
            className="w-full bg-gray-800 border border-gray-600 rounded-lg p-2.5 text-white focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
          />
        </div>
      );

      return (
        <div className="w-full max-w-2xl mx-auto mb-4 p-4 bg-gray-800/80 border border-gray-700 rounded-lg">
          <h3 className="text-md font-semibold text-gray-200 mb-3">API Configuration for {provider}</h3>
          <div className="space-y-3">
            {provider === 'GoogleAI' && (
                <InputField 
                  label="Google AI API Key"
                  id="google-key"
                  type="password"
                  value={googleAIAPIKey}
                  onChange={handleGoogleKeyChange}
                  placeholder="Enter your Google AI API Key"
                />
            )}
            {provider === 'OpenAI_API' && (
              <>
                <InputField 
                  label="OpenAI-Compatible Base URL"
                  id="openai-url"
                  value={openAIBaseUrl}
                  onChange={handleOpenAIUrlChange}
                  placeholder="e.g., http://localhost:8000/v1"
                />
                <InputField 
                  label="API Key (optional)"
                  id="openai-key"
                  type="password"
                  value={openAIAPIKey}
                  onChange={handleOpenAIKeyChange}
                  placeholder="Enter your API key if required"
                />
              </>
            )}
            {provider === 'Ollama' && (
              <InputField 
                label="Ollama Host"
                id="ollama-host"
                value={ollamaHost}
                onChange={handleOllamaHostChange}
                placeholder="e.g., http://localhost:11434"
              />
            )}
          </div>
        </div>
      );
    `
  },
  {
    id: 'hugging_face_configuration',
    name: 'Hugging Face Configuration',
    description: 'Configure the device for in-browser models from Hugging Face.',
    category: 'UI Component',
    version: 1,
    parameters: [
      { name: 'apiConfig', type: 'string', description: 'The current API configuration object', required: true },
      { name: 'setApiConfig', type: 'string', description: 'Function to update the API configuration', required: true },
    ],
    implementationCode: `
      const { huggingFaceDevice } = apiConfig;
      
      const DEVICES = [
        { label: 'WebGPU (recommended)', value: 'webgpu' },
        { label: 'WASM (slower, compatible)', value: 'wasm' },
      ];

      const handleDeviceChange = (e) => {
        setApiConfig({ ...apiConfig, huggingFaceDevice: e.target.value });
      };

      return (
        <div className="w-full max-w-2xl mx-auto mb-4 p-4 bg-gray-800/80 border border-gray-700 rounded-lg">
          <h3 className="text-md font-semibold text-gray-200 mb-3">Hugging Face Configuration</h3>
           <p className="text-xs text-gray-400 mb-3">Settings for running models directly in your browser. Loading a model for the first time will trigger a download.</p>
          <div className="space-y-3">
             <div>
                <label htmlFor="hf-device" className="block text-sm font-medium text-gray-400 mb-1">Execution Device</label>
                <select 
                    id="hf-device" 
                    value={huggingFaceDevice} 
                    onChange={handleDeviceChange} 
                    className="w-full bg-gray-800 border border-gray-600 rounded-lg p-2.5 text-white focus:ring-2 focus:ring-indigo-500"
                >
                    {DEVICES.map(d => <option key={d.value} value={d.value}>{d.label}</option>)}
                </select>
             </div>
          </div>
        </div>
      );
    `
  },
  {
    id: 'ai_model_selector',
    name: 'AI Model Selector',
    description: 'Renders a dropdown to select the active AI model.',
    category: 'UI Component',
    version: 2,
    parameters: [
      { name: 'models', type: 'string', description: 'Array of available AI models', required: true },
      { name: 'selectedModelId', type: 'string', description: 'The ID of the currently selected model', required: true },
      { name: 'setSelectedModelId', type: 'string', description: 'Function to update the selected model', required: true },
      { name: 'isLoading', type: 'boolean', description: 'Whether the app is currently processing', required: true },
    ],
    implementationCode: `
      const groupedModels = models.reduce((acc, model) => {
        const provider = model.provider;
        if (!acc[provider]) {
          acc[provider] = [];
        }
        acc[provider].push(model);
        return acc;
      }, {});
      
      return (
        <div className="w-full max-w-2xl mx-auto mb-4">
          <label htmlFor="model-selector" className="block text-sm font-medium text-gray-400 mb-1">
            AI Model
          </label>
          <select
            id="model-selector"
            value={selectedModelId}
            onChange={(e) => setSelectedModelId(e.target.value)}
            disabled={isLoading}
            className="w-full bg-gray-800 border border-gray-600 rounded-lg p-2.5 text-white focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-colors duration-200"
          >
            {Object.entries(groupedModels).map(([provider, providerModels]) => (
              <optgroup key={provider} label={provider}>
                {providerModels.map(model => (
                    <option key={model.id} value={model.id}>
                      {model.name}
                    </option>
                ))}
              </optgroup>
            ))}
          </select>
        </div>
      );
    `
  },
   {
    id: 'model_parameters_configuration',
    name: 'Model Parameters Configuration',
    description: 'Adjust model parameters like temperature. Lower values (e.g., 0.1) make the output more deterministic, while higher values make it more creative.',
    category: 'UI Component',
    version: 1,
    parameters: [
      { name: 'temperature', type: 'number', description: 'The current temperature value', required: true },
      { name: 'setTemperature', type: 'string', description: 'Function to update the temperature', required: true },
      { name: 'isLoading', type: 'boolean', description: 'Whether the app is currently processing', required: true },
    ],
    implementationCode: `
      const handleTempChange = (e) => {
        setTemperature(parseFloat(e.target.value));
      };

      return (
        <div className="w-full max-w-2xl mx-auto mb-4">
          <label htmlFor="temperature-slider" className="block text-sm font-medium text-gray-400 mb-1">
            Temperature: <span className="font-mono text-white">{temperature.toFixed(2)}</span>
          </label>
           <p className="text-xs text-gray-500 mb-2">Controls randomness. 0.0 is deterministic, 1.0 is creative.</p>
          <input
            id="temperature-slider"
            type="range"
            min="0"
            max="1"
            step="0.01"
            value={temperature}
            onChange={handleTempChange}
            disabled={isLoading}
            className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer"
          />
        </div>
      );
    `
  },
  {
    id: 'user_input_form',
    name: 'User Input Form',
    description: 'Renders the main textarea for user input and the submit button.',
    category: 'UI Component',
    version: 2,
    parameters: [
        {name: 'userInput', type: 'string', description: 'Current value of the input', required: true},
        {name: 'setUserInput', type: 'string', description: 'Function to update the input value', required: true},
        {name: 'handleSubmit', type: 'string', description: 'Function to call on submit', required: true},
        {name: 'isLoading', type: 'boolean', description: 'Whether the app is processing', required: true},
    ],
    implementationCode: `
      const Spinner = () => (
        <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
        </svg>
      );
      
      return (
        <div className="w-full max-w-2xl mx-auto bg-gray-800/60 border border-gray-700 rounded-xl p-4">
            <div className="relative w-full group">
                <textarea
                    id="userInput"
                    value={userInput}
                    onChange={(e) => setUserInput(e.target.value)}
                    placeholder="Describe a task, create a tool, or change the UI..."
                    className="w-full h-24 p-3 bg-gray-900 border border-gray-600 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-colors duration-200 resize-y"
                    disabled={isLoading}
                    onKeyDown={(e) => {
                        if (e.key === 'Enter' && !e.shiftKey) {
                            e.preventDefault();
                            handleSubmit();
                        }
                    }}
                />
            </div>
            <button
                onClick={handleSubmit}
                disabled={isLoading || !userInput.trim()}
                className="mt-3 w-full flex items-center justify-center gap-2 bg-indigo-600 text-white font-semibold py-2.5 px-4 rounded-lg hover:bg-indigo-700 disabled:bg-indigo-900/50 disabled:cursor-not-allowed disabled:text-gray-400 transition-all duration-200"
            >
                {isLoading ? (<><Spinner />Processing...</>) : 'Submit'}
            </button>
        </div>
      );
    `
  },
   {
    id: 'status_messages_display',
    name: 'Status Messages Display',
    description: 'Renders error or info messages to the user.',
    category: 'UI Component',
    version: 1,
    parameters: [
      { name: 'error', type: 'string', description: 'Error message text', required: false },
      { name: 'info', type: 'string', description: 'Info message text', required: false },
    ],
    implementationCode: `
      return (
        <>
          {error && <p className="mt-4 text-center text-red-400 bg-red-900/30 p-3 rounded-lg w-full max-w-3xl mx-auto">{error}</p>}
          {info && !error && <p className="mt-4 text-center text-cyan-300 bg-cyan-900/30 p-3 rounded-lg w-full max-w-3xl mx-auto">{info}</p>}
        </>
      );
    `
  },
  {
    id: 'debug_panel_toggle_switch',
    name: 'Debug Panel Toggle Switch',
    description: 'Renders the toggle switch for showing/hiding the debug panel.',
    category: 'UI Component',
    version: 1,
    parameters: [
      { name: 'showDebug', type: 'boolean', description: 'Current state of the debug panel visibility', required: true },
      { name: 'setShowDebug', type: 'string', description: 'Function to toggle the debug panel', required: true },
    ],
    implementationCode: `
      return (
        <div className="w-full max-w-3xl mx-auto mt-4 text-right">
            <label htmlFor="debugToggle" className="inline-flex items-center gap-3 cursor-pointer text-sm text-yellow-400">
                <span className="font-medium">Show Debug Panel</span>
                <div className="relative">
                    <input
                        type="checkbox"
                        id="debugToggle"
                        className="sr-only peer"
                        checked={showDebug}
                        onChange={() => setShowDebug(!showDebug)}
                    />
                    <div className="block bg-gray-600 w-10 h-6 rounded-full peer-checked:bg-yellow-400 transition"></div>
                    <div className="absolute left-1 top-1 bg-white w-4 h-4 rounded-full transition peer-checked:translate-x-full"></div>
                </div>
            </label>
        </div>
      );
    `
  },
   {
    id: 'execution_result_panel',
    name: 'Execution Result Panel',
    description: 'Renders the result of a tool execution.',
    category: 'UI Component',
    version: 3,
    parameters: [
      { name: 'response', type: 'string', description: 'The enriched AI response object', required: true },
    ],
    implementationCode: `
      if (!response) return null;
      const { action, tool, reason, executionResult, executionError } = response;
      const actionsWithResult = ['EXECUTE_EXISTING', 'CREATE_AND_EXECUTE', 'IMPROVE_EXISTING', 'CREATE'];
      if (!actionsWithResult.includes(action)) return null;

      const title = action.replace(/_/g, ' ').replace(/\\b\\w/g, l => l.toUpperCase());

      return (
          <div className="w-full max-w-3xl mx-auto mt-6">
                <div className="bg-gray-800 border border-gray-700 rounded-xl p-4 shadow-lg">
                  <h3 className="text-lg font-bold text-gray-200">{title}</h3>
                  {tool && <p className="text-xs text-gray-400 mb-2">Tool: <span className="font-semibold text-indigo-400">{tool.name} (v{tool.version})</span></p>}
                  <p className="text-sm text-gray-400 italic">"{reason}"</p>
                  
                  <div className="mt-3 pt-3 border-t border-gray-600">
                      {typeof executionError !== 'undefined' ? (
                          <>
                            <p className="text-red-400 text-sm mb-1 font-semibold">Execution Error:</p>
                            <div className="bg-red-900/50 p-2 rounded-lg text-red-300 whitespace-pre-wrap font-mono text-xs">{executionError}</div>
                          </>
                      ) : (
                          <>
                          <p className="text-gray-400 text-sm mb-1">Result:</p>
                          <div className="bg-gray-900 p-2 rounded-lg text-white whitespace-pre-wrap text-xs">{JSON.stringify(executionResult, null, 2)}</div>
                          </>
                      )}
                  </div>
                </div>
          </div>
      );
    `
  },
  {
    id: 'debug_information_panel',
    name: 'Debug Information Panel',
    description: 'Renders the debug panel with detailed AI interaction logs.',
    category: 'UI Component',
    version: 4,
    parameters: [
      { name: 'debugInfo', type: 'string', description: 'The debug info object', required: false },
    ],
    implementationCode: `
      const DebugSection = ({ title, children, isPending }) => (
        <div>
          <h4 className="text-lg font-semibold text-yellow-300 mb-2 border-b border-yellow-300/30 pb-1 flex items-center gap-2">
            {isPending && (
                <svg className="animate-spin h-5 w-5 text-yellow-400" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
            )}
            {title}
          </h4>
          <pre className="bg-gray-900/70 border border-gray-700 text-sm text-gray-300 p-4 rounded-lg overflow-x-auto">
            <code>{children}</code>
          </pre>
        </div>
      );

      return (
        <div className="w-full max-w-7xl mx-auto mt-6 bg-gray-800/60 border-2 border-dashed border-yellow-600/50 rounded-xl p-6">
            <h3 className="text-2xl font-bold text-center mb-6 text-yellow-400">Debug View</h3>
            { !debugInfo ? (
              <p className="text-yellow-300 text-center">No debug information available. Submit a request to see the details here.</p>
            ) : (
              <div className="space-y-6">
                <DebugSection title="1. User Input">{debugInfo.userInput}</DebugSection>
                
                <DebugSection title="2. Retrieved Tools" isPending={!debugInfo.selectedTools}>
                    {debugInfo.selectedTools ? JSON.stringify(debugInfo.selectedTools.map(t => ({id: t.id, name: t.name, description: t.description})), null, 2) : 'Pending...'}
                </DebugSection>

                <DebugSection title="3. Augmented User Prompt" isPending={debugInfo.augmentedUserInput === 'Pending...'}>
                    {debugInfo.augmentedUserInput}
                </DebugSection>
                
                <DebugSection title="4. System Prompt Sent to AI" isPending={debugInfo.systemInstruction === 'Pending...'}>
                    {debugInfo.systemInstruction}
                </DebugSection>

                <DebugSection title="5. Raw JSON Response from AI" isPending={debugInfo.rawAIResponse === '⏳ Waiting for stream...'}>
                    {debugInfo.rawAIResponse}
                </DebugSection>

                <DebugSection title="6. Processed Result (App State)" isPending={!debugInfo.processedResponse}>
                    {JSON.stringify(debugInfo.processedResponse, null, 2)}
                </DebugSection>
              </div>
            )}
        </div>
      );
    `
  },
  {
    id: 'tool_list_display',
    name: 'Tool List Display',
    description: 'Renders the grid of all available tools.',
    category: 'UI Component',
    version: 3,
    parameters: [
      { name: 'tools', type: 'string', description: 'Array of all available tools', required: true },
      { name: 'UIToolRunner', type: 'string', description: 'The UI tool runner component itself, for recursion', required: true },
    ],
    implementationCode: `
      return (
        <div className="w-full max-w-7xl mx-auto mt-8">
          <h2 className="text-2xl font-bold text-center mb-6 text-gray-300">Available Tools ({tools.length})</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {tools.map(tool => (
              <UIToolRunner key={tool.id + '-' + tool.version} tool={{
                  id: 'tool_card',
                  name: 'Tool Card',
                  category: 'UI Component',
                  version: 1,
                  parameters: [],
                  implementationCode: \`
                    const [showDetails, setShowDetails] = React.useState(false);

                    const generateExampleParams = (tool) => {
                      if (!tool.parameters || tool.parameters.length === 0) return '{}';
                      const example = {};
                      tool.parameters.forEach(p => {
                          if (p.type === 'string') example[p.name] = 'some ' + p.name;
                          if (p.type === 'number') example[p.name] = 123;
                          if (p.type === 'boolean') example[p.name] = true;
                      });
                      return JSON.stringify(example, null, 2);
                    };
                    
                    return (
                      <div className="bg-gray-800 border border-gray-700 rounded-lg p-3 flex flex-col gap-2 text-sm">
                        <div>
                          <h3 className="font-bold text-white truncate">{tool.name}</h3>
                          <p className="text-xs text-indigo-400">{tool.category} - v{tool.version}</p>
                        </div>
                        <p className="text-gray-300 text-xs flex-grow min-h-[30px]">{tool.description}</p>
                        
                        <div className="mt-auto pt-2 border-t border-gray-700/50">
                          <button
                            onClick={() => setShowDetails(!showDetails)}
                            className="w-full text-left text-xs font-semibold text-cyan-300 hover:text-cyan-200"
                          >
                            {showDetails ? '[-] Hide Details' : '[+] Show Details'}
                          </button>

                          {showDetails && (
                            <div className="mt-2 space-y-2">
                              <div>
                                <p className="text-xs text-gray-400 mb-1">Code:</p>
                                <pre className="text-xs text-cyan-200 bg-gray-900 p-2 rounded-md font-mono whitespace-pre-wrap">
                                  {tool.implementationCode}
                                </pre>
                              </div>
                              {tool.category !== 'UI Component' && (
                                <div>
                                  <p className="text-xs text-gray-400 mb-1">Direct Usage:</p>
                                  <pre className="text-xs text-teal-200 bg-gray-900 p-2 rounded-md font-mono whitespace-pre-wrap">
                                    {'run "' + tool.name + '" with ' + generateExampleParams(tool)}
                                  </pre>
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  \`
              }} props={{ tool }} />
            ))}
          </div>
        </div>
      );
    `
  },
  {
    id: 'application_footer',
    name: 'Application Footer',
    description: 'Renders the footer with attribution.',
    category: 'UI Component',
    version: 1,
    parameters: [],
    implementationCode: `
      return (
        <footer className="text-center mt-12 text-gray-500 text-sm">
          <p>Powered by Google Gemini</p>
        </footer>
      );
    `
  },
];