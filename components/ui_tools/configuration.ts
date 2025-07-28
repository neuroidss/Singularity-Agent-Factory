import type { LLMTool } from '../../types';

export const configurationTools: LLMTool[] = [
  {
    id: 'api_endpoint_configuration',
    name: 'API Endpoint Configuration',
    description: 'Configure endpoints and API keys for different model providers. Settings are saved automatically.',
    category: 'UI Component',
    version: 3,
    parameters: [
      { name: 'apiConfig', type: 'string', description: 'The current API configuration object', required: true },
      { name: 'setApiConfig', type: 'string', description: 'Function to update the API configuration', required: true },
      { name: 'selectedModelProvider', type: 'string', description: 'The provider of the currently selected model', required: true },
      { name: 'selectedModelId', type: 'string', description: 'The ID of the currently selected model', required: true },
    ],
    implementationCode: `
      const { openAIBaseUrl, openAIAPIKey, ollamaHost, googleAIAPIKey, openAIModelId } = apiConfig;
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
      
      const handleOpenAIModelChange = (e) => {
        setApiConfig({ ...apiConfig, openAIModelId: e.target.value });
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
                  placeholder="e.g., https://api.openai.com/v1"
                />
                <InputField 
                  label="API Key (optional)"
                  id="openai-key"
                  type="password"
                  value={openAIAPIKey}
                  onChange={handleOpenAIKeyChange}
                  placeholder="Enter your API key if required"
                />
                {selectedModelId === 'custom-openai' && (
                   <InputField 
                    label="Custom Model Name"
                    id="openai-model"
                    value={openAIModelId}
                    onChange={handleOpenAIModelChange}
                    placeholder="e.g., meta-llama/Llama-3-8b-chat-hf"
                  />
                )}
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
    version: 3,
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
        <div className="w-full max-w-2xl mx-auto">
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
    id: 'tool_retrieval_strategy_selector',
    name: 'Tool Retrieval Strategy Selector',
    description: 'Allows the user to select the strategy for how the agent retrieves relevant tools.',
    category: 'UI Component',
    version: 1,
    parameters: [
      { name: 'toolRetrievalStrategy', type: 'string', description: 'The current strategy being used.', required: true },
      { name: 'setToolRetrievalStrategy', type: 'string', description: 'Function to update the strategy.', required: true },
      { name: 'isLoading', type: 'boolean', description: 'Whether the app is currently processing.', required: true },
    ],
    implementationCode: `
      // Enums are not available in this scope, so we define a plain object.
      const ToolRetrievalStrategy = {
        Direct: 'DIRECT',
        LLM: 'LLM',
        Embedding: 'EMBEDDING',
      };
      
      const strategies = [
        { id: ToolRetrievalStrategy.LLM, name: 'LLM Filter', description: 'AI filters tools. Balanced but costs 1 extra API call.' },
        { id: ToolRetrievalStrategy.Embedding, name: 'Embedding Filter', description: 'Fast keyword search. Efficient but less nuanced.' },
        { id: ToolRetrievalStrategy.Direct, name: 'Direct', description: 'All tools are sent to AI. Fastest but uses large context.' },
      ];

      return (
        <div className="w-full max-w-2xl mx-auto mt-4">
            <label className="block text-sm font-medium text-gray-400 mb-1">Tool Retrieval Strategy</label>
             <fieldset className="flex flex-col sm:flex-row gap-2 rounded-lg bg-gray-800 border border-gray-600 p-2">
                <legend className="sr-only">Tool Retrieval Strategy</legend>
                {strategies.map(strategy => (
                    <div key={strategy.id} className="flex-1">
                        <input 
                            type="radio" 
                            name="retrieval-strategy" 
                            id={strategy.id} 
                            value={strategy.id}
                            checked={toolRetrievalStrategy === strategy.id}
                            onChange={(e) => setToolRetrievalStrategy(e.target.value)}
                            disabled={isLoading}
                            className="sr-only peer"
                        />
                        <label 
                            htmlFor={strategy.id}
                            className="block w-full p-2 text-center rounded-md cursor-pointer peer-disabled:cursor-not-allowed peer-disabled:bg-gray-700 peer-disabled:text-gray-500 peer-checked:bg-indigo-600 peer-checked:text-white bg-gray-700/60 hover:bg-gray-600/80"
                        >
                            <span className="text-sm font-semibold">{strategy.name}</span>
                             <p className="text-xs text-gray-300 peer-checked:text-indigo-200">{strategy.description}</p>
                        </label>
                    </div>
                ))}
             </fieldset>
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
];
