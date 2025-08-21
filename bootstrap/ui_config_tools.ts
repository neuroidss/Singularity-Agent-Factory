import type { ToolCreatorPayload } from '../types';
import { LOCAL_AI_PANEL_TOOL_PAYLOAD } from './local_ai_tools';

export const UI_CONFIG_TOOLS: ToolCreatorPayload[] = [
    {
        name: 'Configuration Panel',
        description: 'A UI panel for selecting the AI model and configuring API keys and service endpoints.',
        category: 'UI Component',
        executionEnvironment: 'Client',
        purpose: 'To allow the user to configure the AI model and necessary API credentials, enabling flexibility in choosing the "brain" of the agent.',
        parameters: [
          { name: 'apiConfig', type: 'object', description: 'The current API configuration.', required: true },
          { name: 'setApiConfig', type: 'object', description: 'Function to update the API config.', required: true },
          { name: 'availableModels', type: 'array', description: 'List of available AI models.', required: true },
          { name: 'selectedModel', type: 'object', description: 'The currently selected AI model.', required: true },
          { name: 'setSelectedModel', type: 'object', description: 'Function to update the selected model.', required: true },
        ],
        implementationCode: `
          const handleModelChange = (e) => {
            const modelId = e.target.value;
            const model = availableModels.find(m => m.id === modelId);
            if (model) {
              setSelectedModel(model);
            }
          };
    
          const handleConfigChange = (e) => {
            setApiConfig(prev => ({ ...prev, [e.target.name]: e.target.value }));
          };
          
          const provider = selectedModel?.provider;
    
          const groupedModels = React.useMemo(() => {
            const groups = {
                GoogleAI: [],
                OpenAI_API: [],
                Ollama: [],
                HuggingFace: [],
                Wllama: [],
            };
            availableModels.forEach(model => {
                if (groups[model.provider]) {
                    groups[model.provider].push(model);
                }
            });
            return groups;
          }, [availableModels]);
    
          const renderProviderHelpText = () => {
            switch (provider) {
              case 'Ollama':
                return <p className="text-xs text-gray-400 mt-1">Ensure the Ollama server is running and the model ('{selectedModel.id}') is pulled.</p>;
              case 'HuggingFace':
                return <p className="text-xs text-gray-400 mt-1">Model will be downloaded and run directly in your browser. Requires a modern browser and may be slow on first load.</p>;
              case 'Wllama':
                return <p className="text-xs text-gray-400 mt-1">Model (GGUF) will be downloaded and run in-browser via WebAssembly. Can be slow on first load and requires a powerful device.</p>;
              case 'OpenAI_API':
                return <p className="text-xs text-gray-400 mt-1">Works with any OpenAI-compatible API (e.g., a local Ollama server).</p>;
              default:
                return <p className="text-xs text-gray-400 mt-1">Google AI API key is read from the 'process.env.API_KEY' environment variable.</p>;
            }
          }
    
          return (
            <div className="w-full bg-gray-800/60 border border-gray-700 rounded-xl p-4 space-y-4">
              <div>
                <label htmlFor="model-select" className="block text-sm font-medium text-indigo-300 mb-1">AI Model</label>
                <select
                  id="model-select"
                  value={selectedModel?.id || ''}
                  onChange={handleModelChange}
                  className="w-full bg-gray-900 border border-gray-600 rounded-lg p-2 focus:ring-2 focus:ring-indigo-500"
                >
                  {Object.entries(groupedModels).map(([providerName, models]) => (
                    models.length > 0 && (
                      <optgroup key={providerName} label={providerName.replace('_API', ' API')}>
                        {models.map(model => (
                          <option key={model.id} value={model.id}>
                            {model.name}
                          </option>
                        ))}
                      </optgroup>
                    )
                  ))}
                </select>
                {renderProviderHelpText()}
              </div>
    
              {provider === 'OpenAI_API' && (
                <div className="space-y-3">
                  <div>
                    <label htmlFor="openAIBaseUrl" className="block text-sm font-medium text-gray-300 mb-1">API Base URL</label>
                    <input
                      type="text"
                      id="openAIBaseUrl"
                      name="openAIBaseUrl"
                      value={apiConfig.openAIBaseUrl}
                      onChange={handleConfigChange}
                      placeholder="e.g., http://localhost:11434/v1"
                      className="w-full bg-gray-700 border border-gray-600 rounded-lg p-2 focus:ring-2 focus:ring-indigo-500"
                    />
                  </div>
                  <div>
                    <label htmlFor="openAIAPIKey" className="block text-sm font-medium text-gray-300 mb-1">API Key</label>
                    <input
                      type="password"
                      id="openAIAPIKey"
                      name="openAIAPIKey"
                      value={apiConfig.openAIAPIKey}
                      onChange={handleConfigChange}
                      placeholder="Often 'ollama' or your API key"
                      className="w-full bg-gray-700 border border-gray-600 rounded-lg p-2 focus:ring-2 focus:ring-indigo-500"
                    />
                  </div>
                </div>
              )}
              
              {provider === 'Ollama' && (
                <div>
                  <label htmlFor="ollamaHost" className="block text-sm font-medium text-gray-300 mb-1">Ollama Host URL</label>
                  <input
                    type="text"
                    id="ollamaHost"
                    name="ollamaHost"
                    value={apiConfig.ollamaHost}
                    onChange={handleConfigChange}
                    placeholder="e.g., http://localhost:11434"
                    className="w-full bg-gray-700 border border-gray-600 rounded-lg p-2 focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
              )}
    
            </div>
          );
        `
    },
    {
        name: 'Tool Relevance Configuration',
        description: 'A panel for configuring the tool relevance filter used by the agent swarm. Adjust how many tools are selected for a task.',
        category: 'UI Component',
        executionEnvironment: 'Client',
        purpose: 'To give the user fine-grained control over the tool context provided to the agent, allowing for tuning between performance and capability.',
        parameters: [
          { name: 'topK', type: 'number', description: 'The maximum number of tools to select.', required: true },
          { name: 'setTopK', type: 'object', description: 'Function to update the top K value.', required: true },
          { name: 'threshold', type: 'number', description: 'The minimum similarity score for a tool to be considered.', required: true },
          { name: 'setThreshold', type: 'object', description: 'Function to update the threshold value.', required: true },
          { name: 'isSwarmRunning', type: 'boolean', description: 'Whether the swarm is currently active, to disable controls.', required: true },
        ],
        implementationCode: `
          return (
            <div className="bg-gray-800/60 border border-gray-700 rounded-xl p-4 space-y-4">
              <h3 className="text-lg font-bold text-indigo-300">Tool Context Filter</h3>
              <div className="space-y-3">
                <div>
                  <label htmlFor="topK-slider" className="block text-sm font-medium text-gray-300 mb-1">Max Tools (Top K): <span className="font-bold text-white">{topK}</span></label>
                  <input
                    id="topK-slider"
                    type="range"
                    min="1"
                    max="100"
                    value={topK}
                    onChange={(e) => setTopK(Number(e.target.value))}
                    disabled={isSwarmRunning}
                    className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer disabled:opacity-50"
                  />
                </div>
                <div>
                  <label htmlFor="threshold-slider" className="block text-sm font-medium text-gray-300 mb-1">Similarity Threshold: <span className="font-bold text-white">{threshold.toFixed(2)}</span></label>
                  <input
                    id="threshold-slider"
                    type="range"
                    min="0.0"
                    max="1.0"
                    step="0.01"
                    value={threshold}
                    onChange={(e) => setThreshold(Number(e.target.value))}
                    disabled={isSwarmRunning}
                    className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer disabled:opacity-50"
                  />
                  <p className="text-xs text-gray-400 mt-1">Filters tools by relevance score before picking the Top K.</p>
                </div>
              </div>
            </div>
          );
        `
    },
    LOCAL_AI_PANEL_TOOL_PAYLOAD
];