import type { ToolCreatorPayload } from '../types';
import { LOCAL_AI_PANEL_TOOL_PAYLOAD } from './local_ai_tools';
import { IMAGE_MODELS, TTS_MODELS, MUSIC_MODELS, VIDEO_MODELS, LIVE_MODELS, TTS_VOICES } from '../constants';

export const UI_CONFIG_TOOLS: ToolCreatorPayload[] = [
    {
        name: 'Visibility',
        description: 'Controls visibility of different layers in the PCB simulation view.',
        category: 'UI Component',
        executionEnvironment: 'Client',
        purpose: 'To allow users to toggle display layers for better inspection of the PCB layout.',
        parameters: [
            { name: 'visibility', type: 'object', description: 'An object with boolean flags for different layers.', required: true },
            { name: 'setVisibility', type: 'object', description: 'Function to update the visibility state.', required: true },
        ],
        implementationCode: `
            return (
                <div className="bg-gray-800/60 border border-gray-700 rounded-xl p-3 text-white">
                    <h3 className="text-lg font-bold text-indigo-300 mb-2">Visibility</h3>
                    <div className="space-y-1 text-sm p-1">
                        {Object.keys(visibility).map(key => (
                            <div key={key} className="flex items-center">
                                <input
                                    type="checkbox"
                                    id={\`vis-\${key}\`}
                                    checked={visibility[key]}
                                    onChange={() => setVisibility(v => ({...v, [key]: !v[key]}))}
                                    className="h-4 w-4 rounded border-gray-500 bg-gray-700 text-indigo-500 focus:ring-indigo-600"
                                />
                                <label htmlFor={\`vis-\${key}\`} className="ml-2 text-gray-300">
                                    Show {key.charAt(0).toUpperCase() + key.slice(1)}
                                </label>
                            </div>
                        ))}
                    </div>
                </div>
            );
        `
    },
    {
        name: 'AI Model',
        description: 'A UI panel for selecting the AI model.',
        category: 'UI Component',
        executionEnvironment: 'Client',
        purpose: 'To allow the user to configure the AI model, enabling flexibility in choosing the "brain" of the agent.',
        parameters: [
          { name: 'apiConfig', type: 'object', description: 'The current API configuration.', required: true },
          { name: 'setApiConfig', type: 'object', description: 'Function to update the API config.', required: true },
          { name: 'availableModels', type: 'array', description: 'List of available AI models.', required: true },
          { name: 'selectedModel', type: 'object', description: 'The currently selected AI model.', required: true },
          { name: 'setSelectedModel', type: 'object', description: 'Function to update the selected model.', required: true },
        ],
        implementationCode: `
          const handleModelChange = (e) => {
            const uniqueId = e.target.value;
            const [provider, modelId] = uniqueId.split('::');
            const model = availableModels.find(m => m.id === modelId && m.provider === provider);
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
            <div className="w-full bg-gray-800/60 border border-gray-700 rounded-xl p-3 space-y-3">
              <h3 className="text-lg font-bold text-indigo-300">AI Model</h3>
              <div>
                <select
                  id="model-select"
                  value={selectedModel ? \`\${selectedModel.provider}::\${selectedModel.id}\` : ''}
                  onChange={handleModelChange}
                  className="w-full bg-gray-900 border border-gray-600 rounded-lg p-2 focus:ring-2 focus:ring-indigo-500"
                >
                  {Object.entries(groupedModels).map(([providerName, models]) => (
                    models.length > 0 && (
                      <optgroup key={providerName} label={providerName.replace('_API', ' API')}>
                        {models.map(model => (
                          <option key={\`\${model.provider}::\${model.id}\`} value={\`\${model.provider}::\${model.id}\`}>
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
                <div className="space-y-3 pt-2 border-t border-gray-700">
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
                <div className="pt-2 border-t border-gray-700">
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
        name: 'Generative Services Panel',
        description: 'A UI panel for configuring models and voices for generative services like image, speech, and music.',
        category: 'UI Component',
        executionEnvironment: 'Client',
        purpose: 'To provide user control over which models and voices are used for multimodal generation, enabling local model usage.',
        parameters: [
            { name: 'config', type: 'object', description: 'The current generative services configuration object.', required: true },
            { name: 'setConfig', type: 'object', description: 'Function to update the configuration object.', required: true },
        ],
        implementationCode: `
            const imageModels = ${JSON.stringify(IMAGE_MODELS)};
            const ttsModels = ${JSON.stringify(TTS_MODELS)};
            const musicModels = ${JSON.stringify(MUSIC_MODELS)};
            const videoModels = ${JSON.stringify(VIDEO_MODELS)};
            const liveModels = ${JSON.stringify(LIVE_MODELS)};
            const ttsVoices = ${JSON.stringify(TTS_VOICES)};

            const handleChange = (e) => {
                setConfig(prev => ({ ...prev, [e.target.name]: e.target.value }));
            };

            return (
                <div className="bg-gray-800/60 border border-gray-700 rounded-xl p-3 space-y-3">
                    <h3 className="text-lg font-bold text-indigo-300">Generative Services</h3>
                    
                    <div>
                        <label htmlFor="imageModel" className="block text-sm font-medium text-gray-300 mb-1">Image Generation</label>
                        <select name="imageModel" id="imageModel" value={config.imageModel} onChange={handleChange} className="w-full bg-gray-900 border border-gray-600 rounded-lg p-2 focus:ring-2 focus:ring-indigo-500">
                            {imageModels.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
                        </select>
                        {config.imageModel === 'comfyui_stable_diffusion' && <p className="text-xs text-gray-400 mt-1">Note: ComfyUI integration is not yet implemented.</p>}
                    </div>

                    <div>
                        <label htmlFor="videoModel" className="block text-sm font-medium text-gray-300 mb-1">Video Generation</label>
                        <select name="videoModel" id="videoModel" value={config.videoModel} onChange={handleChange} className="w-full bg-gray-900 border border-gray-600 rounded-lg p-2 focus:ring-2 focus:ring-indigo-500">
                            {videoModels.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
                        </select>
                    </div>

                    <div>
                        <label htmlFor="ttsModel" className="block text-sm font-medium text-gray-300 mb-1">Text-to-Speech</label>
                        <select name="ttsModel" id="ttsModel" value={config.ttsModel} onChange={handleChange} className="w-full bg-gray-900 border border-gray-600 rounded-lg p-2 focus:ring-2 focus:ring-indigo-500">
                           {ttsModels.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
                        </select>
                    </div>

                    {config.ttsModel === 'gemini' && (
                        <div>
                            <label htmlFor="ttsVoice" className="block text-sm font-medium text-gray-300 mb-1">Gemini Voice</label>
                            <select name="ttsVoice" id="ttsVoice" value={config.ttsVoice} onChange={handleChange} className="w-full bg-gray-900 border border-gray-600 rounded-lg p-2 focus:ring-2 focus:ring-indigo-500">
                                {ttsVoices.map(v => <option key={v} value={v}>{v}</option>)}
                            </select>
                        </div>
                    )}
                    
                     <div>
                        <label htmlFor="musicModel" className="block text-sm font-medium text-gray-300 mb-1">Music Generation</label>
                        <select name="musicModel" id="musicModel" value={config.musicModel} onChange={handleChange} className="w-full bg-gray-900 border border-gray-600 rounded-lg p-2 focus:ring-2 focus:ring-indigo-500">
                            {musicModels.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
                        </select>
                        {config.musicModel === 'local_musicgen' && <p className="text-xs text-gray-400 mt-1">Note: MusicGen integration is not yet implemented.</p>}
                     </div>

                     <div>
                        <label htmlFor="liveModel" className="block text-sm font-medium text-gray-300 mb-1">Live Conversation</label>
                        <select name="liveModel" id="liveModel" value={config.liveModel} onChange={handleChange} className="w-full bg-gray-900 border border-gray-600 rounded-lg p-2 focus:ring-2 focus:ring-indigo-500">
                            {liveModels.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
                        </select>
                     </div>
                </div>
            );
        `
    },
    {
        name: 'Tool Selection Mode',
        description: 'Selects the method for filtering tools provided to the agent.',
        category: 'UI Component',
        executionEnvironment: 'Client',
        purpose: 'To control the strategy for tool context selection, balancing between performance, cost, and agent capability.',
        parameters: [
          { name: 'relevanceMode', type: 'string', description: 'The current relevance mode (Embeddings, All, LLM).', required: true },
          { name: 'setRelevanceMode', type: 'object', description: 'Function to update the relevance mode.', required: true },
          { name: 'isSwarmRunning', type: 'boolean', description: 'Whether the swarm is currently active, to disable controls.', required: true },
        ],
        implementationCode: `
            const modes = [
                { id: 'Embeddings', label: 'Embeddings', description: 'Fast, local semantic search to find relevant tools.' },
                { id: 'All', label: 'All Tools', description: 'Provides all tools to the agent. Slower, but most capable.' },
                { id: 'LLM', label: 'LLM Filter', description: 'Uses an extra LLM call to intelligently select tools.' },
            ];
            
            return (
                <div className="bg-gray-800/60 border border-gray-700 rounded-xl p-3 space-y-3">
                    <h3 className="text-lg font-bold text-indigo-300">Tool Selection Mode</h3>
                    <fieldset className="space-y-2">
                        <legend className="sr-only">Tool Selection Mode</legend>
                        {modes.map(mode => (
                            <div key={mode.id} className="relative flex items-start">
                                <div className="flex items-center h-5">
                                    <input
                                        id={mode.id}
                                        name="relevance-mode"
                                        type="radio"
                                        checked={relevanceMode === mode.id}
                                        onChange={() => setRelevanceMode(mode.id)}
                                        disabled={isSwarmRunning}
                                        className="focus:ring-indigo-500 h-4 w-4 text-indigo-600 border-gray-500 bg-gray-700 rounded disabled:opacity-50"
                                    />
                                </div>
                                <div className="ml-3 text-sm">
                                    <label htmlFor={mode.id} className={"font-medium " + (isSwarmRunning ? 'text-gray-500' : 'text-gray-200')}>
                                        {mode.label}
                                    </label>
                                    <p className="text-gray-400 text-xs">{mode.description}</p>
                                </div>
                            </div>
                        ))}
                    </fieldset>
                </div>
            );
        `
    },
    {
        name: 'Embedding Filter',
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
            <div className="bg-gray-800/60 border border-gray-700 rounded-xl p-3 space-y-4">
              <h3 className="text-lg font-bold text-indigo-300">Embedding Filter</h3>
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
