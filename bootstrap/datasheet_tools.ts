
import type { ToolCreatorPayload } from '../types';
// Note: The datasheet variables are injected into the UI Tool's scope by UIToolRunner.tsx
// They are not directly imported here to keep the payload serializable if needed.

export const DATASHEET_TOOLS: ToolCreatorPayload[] = [
    {
        name: 'Read Datasheet Extraction Cache',
        description: 'Reads a previously cached datasheet extraction from the server filesystem.',
        category: 'Server',
        executionEnvironment: 'Server',
        purpose: 'To retrieve cached LLM analysis of datasheets to avoid expensive re-computation.',
        parameters: [
            { name: 'cacheKey', type: 'string', description: 'The unique key (filename) for the cache entry.', required: true },
        ],
        implementationCode: 'kicad_service_proxy::read_datasheet_cache'
    },
    {
        name: 'Cache Component Datasheet Extraction',
        description: 'Writes the result of a datasheet extraction to the server filesystem for future use.',
        category: 'Server',
        executionEnvironment: 'Server',
        purpose: 'To persist the results of LLM analysis of datasheets, enabling faster subsequent queries.',
        parameters: [
            { name: 'cacheKey', type: 'string', description: 'The unique key (filename) for the cache entry.', required: true },
            { name: 'data', type: 'object', description: 'The JSON object containing the component name, question, and answer to cache.', required: true },
        ],
        implementationCode: 'kicad_service_proxy::write_datasheet_cache'
    },
    {
        name: 'Extract Component Information from Datasheet',
        description: 'Analyzes datasheet text to answer a technical question. It first checks a server-side cache for a pre-computed answer before using an LLM.',
        category: 'Functional',
        executionEnvironment: 'Client',
        purpose: 'To provide a foundational capability for an agent to understand electronic components by reading their documentation, with caching for efficiency.',
        parameters: [
            { name: 'datasheetText', type: 'string', description: 'The full text content of the datasheet to be analyzed.', required: true },
            { name: 'componentName', type: 'string', description: 'The name of the component being asked about (e.g., "ADS131M08").', required: true },
            { name: 'question', type: 'string', description: 'The specific question to ask about the component (e.g., "Provide a JSON object of all pin functions for the TQFP package.").', required: true },
        ],
        implementationCode: `
            const { datasheetText, componentName, question } = args;

            // Create a unique, filesystem-safe key for the cache entry.
            const sanitizedQuestion = question.toLowerCase().replace(/[^a-z0-9]/g, '_').substring(0, 50);
            const cacheKey = \`\${componentName}_\${sanitizedQuestion}.json\`;

            // 1. Try to read from the cache first.
            try {
                if (runtime.isServerConnected()) {
                    const cachedResult = await runtime.tools.run('Read Datasheet Extraction Cache', { cacheKey });
                    if (cachedResult && cachedResult.answer) {
                        return { success: true, message: "Retrieved datasheet extraction from server cache.", answer: cachedResult.answer };
                    }
                }
            } catch (e) {
                // A cache miss is expected to throw a 'file not found' error, so we just log it and continue.
                console.log(\`[CACHE MISS] No cached data for '\${cacheKey}'. Querying LLM.\`);
            }

            // 2. If cache miss, run the LLM.
            const systemPrompt = \`You are an expert electronics engineer. Your task is to answer a specific question about the component "\${componentName}" based ONLY on the provided datasheet text. Do not use any prior knowledge. If the answer is not in the text, state that explicitly. Provide concise, factual answers.\`;
            const fullPrompt = \`Based on the following datasheet, answer the question.\\n\\n--- DATASHEET START ---\\n\${datasheetText}\\n--- DATASHEET END ---\\n\\nQuestion: \${question}\`;
            const llmAnswer = await runtime.ai.generateText(fullPrompt, systemPrompt);

            // 3. Write the new result to the cache for next time.
            try {
                 if (runtime.isServerConnected()) {
                    await runtime.tools.run('Cache Component Datasheet Extraction', {
                        cacheKey: cacheKey,
                        data: { componentName, question, answer: llmAnswer, timestamp: new Date().toISOString() }
                    });
                }
            } catch (e) {
                // Don't fail the whole operation if caching fails, just warn the user.
                console.warn(\`[CACHE WRITE FAILED] Could not save extraction for '\${cacheKey}': \${e.message}\`);
            }

            // 4. Return the result from the LLM.
            return { success: true, message: "Datasheet queried successfully using LLM.", answer: llmAnswer };
        `
    },
    {
        name: 'Datasheet Reader',
        description: 'A UI for viewing component datasheets and manually querying them for information.',
        category: 'UI Component',
        executionEnvironment: 'Client',
        purpose: 'To provide a user interface for the datasheet analysis capability.',
        parameters: [
            { name: 'runtime', type: 'object', description: 'The agent runtime environment, providing access to other tools.', required: true }
        ],
        implementationCode: `
            const DATASHEETS = {
                'ADS131M08 (ADC)': ADS131M08_DATASHEET,
                'LP5907 (LDO)': LP5907_DATASHEET,
                'Seeed Studio XIAO (SoM)': XIAO_DATASHEET,
                'ECS-2520MV (Oscillator)': ECS2520MV_DATASHEET,
            };

            const [selectedSheet, setSelectedSheet] = React.useState(Object.keys(DATASHEETS)[0]);
            const [componentName, setComponentName] = React.useState('ADS131M08');
            const [question, setQuestion] = React.useState('Provide a JSON object of all pin functions for the TQFP package.');
            const [isLoading, setIsLoading] = React.useState(false);
            const [answer, setAnswer] = React.useState('');

            const handleQuery = async () => {
                if (!question.trim() || !runtime) return;
                setIsLoading(true);
                setAnswer('');
                try {
                    const result = await runtime.tools.run('Extract Component Information from Datasheet', {
                        datasheetText: DATASHEETS[selectedSheet],
                        componentName: componentName,
                        question: question,
                    });
                    setAnswer(result.answer);
                } catch (e) {
                    setAnswer('Error: ' + (e.message || String(e)));
                } finally {
                    setIsLoading(false);
                }
            };
            
            const Spinner = () => (
                <svg className="animate-spin h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
            );

            return (
                <div className="bg-gray-800/60 border border-gray-700 rounded-xl p-3 space-y-3 flex flex-col h-full">
                    <h3 className="text-lg font-bold text-indigo-300">Datasheet Intelligence</h3>
                    <div className="space-y-2 flex-grow flex flex-col min-h-0">
                        <select
                            value={selectedSheet}
                            onChange={e => setSelectedSheet(e.target.value)}
                            className="w-full bg-gray-900 border border-gray-600 rounded-lg p-2 focus:ring-2 focus:ring-indigo-500 flex-shrink-0"
                        >
                            {Object.keys(DATASHEETS).map(name => <option key={name} value={name}>{name}</option>)}
                        </select>
                        
                        <textarea
                            readOnly
                            value={DATASHEETS[selectedSheet]}
                            className="w-full flex-grow bg-black/30 border border-gray-700 rounded-md p-2 text-xs font-mono"
                        />
                        
                        <div className="space-y-2 pt-2 border-t border-gray-700 flex-shrink-0">
                             <input type="text" value={componentName} onChange={e => setComponentName(e.target.value)} placeholder="Component Name (e.g., ADS131M08)" className="w-full bg-gray-900 border border-gray-600 rounded-lg p-2 text-sm" />
                             <textarea value={question} onChange={e => setQuestion(e.target.value)} placeholder="Question about the component..." className="w-full h-20 bg-gray-900 border border-gray-600 rounded-lg p-2 text-sm" />
                             <button onClick={handleQuery} disabled={isLoading || !runtime} className="w-full flex items-center justify-center gap-2 bg-indigo-600 text-white font-semibold py-2 px-4 rounded-lg hover:bg-indigo-700 disabled:bg-indigo-900/50">
                                {isLoading ? <Spinner/> : 'Query Datasheet'}
                             </button>
                        </div>
                        
                        {(isLoading || answer) && (
                            <div className="mt-2 p-2 border border-gray-600 bg-black/30 rounded-lg space-y-1 flex-shrink-0">
                                <h4 className="font-semibold text-indigo-300">Answer:</h4>
                                {isLoading && !answer && <p className="text-gray-400">Querying AI...</p>}
                                <pre className="text-sm whitespace-pre-wrap font-mono text-gray-200">{answer}</pre>
                            </div>
                        )}
                    </div>
                </div>
            )
        `
    },
];
