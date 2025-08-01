
import type { LLMTool } from '../../types';

export const configurationTools: LLMTool[] = [
  {
    id: 'configuration_panel',
    name: 'Configuration Panel',
    description: 'A UI panel for selecting the AI model and configuring API keys and service endpoints.',
    category: 'UI Component',
    version: 2,
    parameters: [
      { name: 'apiConfig', type: 'object', description: 'The current API configuration.', required: true },
      { name: 'setApiConfig', type: 'string', description: 'Function to update the API config.', required: true },
      { name: 'availableModels', type: 'array', description: 'List of available AI models.', required: true },
      { name: 'selectedModel', type: 'object', description: 'The currently selected AI model.', required: true },
      { name: 'setSelectedModel', type: 'string', description: 'Function to update the selected model.', required: true },
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
          case 'OpenAI_API':
            return <p className="text-xs text-gray-400 mt-1">Works with any OpenAI-compatible API (e.g., a local Ollama server).</p>;
          default:
            return <p className="text-xs text-gray-400 mt-1">Uses Google's Generative AI services via API key.</p>;
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

          {provider === 'GoogleAI' && (
            <div>
              <label htmlFor="googleAIAPIKey" className="block text-sm font-medium text-gray-300 mb-1">Google AI API Key</label>
              <input
                type="password"
                id="googleAIAPIKey"
                name="googleAIAPIKey"
                value={apiConfig.googleAIAPIKey}
                onChange={handleConfigChange}
                placeholder="Enter your Google AI API Key"
                className="w-full bg-gray-700 border border-gray-600 rounded-lg p-2 focus:ring-2 focus:ring-indigo-500"
              />
            </div>
          )}

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
];
