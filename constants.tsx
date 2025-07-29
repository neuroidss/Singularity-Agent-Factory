
import React from 'react';
import type { LLMTool, AIModel, HuggingFaceDevice, SearchDataSource, SearchResult } from './types';
import { ModelProvider } from './types';
import { PREDEFINED_UI_TOOLS } from './components/ui_tools/index';
import { roboticsTools } from './components/robotics_tools';

export const AVAILABLE_MODELS: AIModel[] = [
    // Google AI
    { id: 'gemini-2.5-flash', name: 'Gemini 2.5 Flash', provider: ModelProvider.GoogleAI },
    { id: 'gemini-2.5-flash-lite', name: 'Gemini 2.5 Flash-Lite', provider: ModelProvider.GoogleAI },
    { id: 'gemini-2.0-flash', name: 'Gemini 2.0 Flash', provider: ModelProvider.GoogleAI },
    { id: 'gemini-2.0-flash-lite', name: 'Gemini 2.0 Flash-Lite', provider: ModelProvider.GoogleAI },
    
    // Hugging Face
    { id: 'onnx-community/gemma-3-1b-it-ONNX', name: 'Gemma 3 1B IT', provider: ModelProvider.HuggingFace },
    { id: 'onnx-community/Qwen3-0.6B-ONNX', name: 'Qwen3 0.6B', provider: ModelProvider.HuggingFace },
    { id: 'onnx-community/gemma-3n-E2B-it-ONNX', name: 'Gemma 3N E2B', provider: ModelProvider.HuggingFace },
    { id: 'onnx-community/Qwen3-1.7B-ONNX', name: 'Qwen3 1.7B', provider: ModelProvider.HuggingFace },
    { id: 'onnx-community/Qwen3-4B-ONNX', name: 'Qwen3 4B', provider: ModelProvider.HuggingFace },
    
    // OpenAI-Compatible
    { id: 'gpt-4o', name: 'GPT-4o', provider: ModelProvider.OpenAI_API },
    { id: 'gpt-4-turbo', name: 'GPT-4 Turbo', provider: ModelProvider.OpenAI_API },
    { id: 'gpt-3.5-turbo', name: 'GPT-3.5 Turbo', provider: ModelProvider.OpenAI_API },
    { id: 'custom-openai', name: 'Custom Model Name...', provider: ModelProvider.OpenAI_API },
    
    // Ollama
    { id: 'gemma3n:e4b', name: 'Gemma 3N E4B', provider: ModelProvider.Ollama },
    { id: 'gemma3n:e2b', name: 'Gemma 3N E2B', provider: ModelProvider.Ollama },
    { id: 'qwen3:14b', name: 'Qwen3 14B', provider: ModelProvider.Ollama },
    { id: 'qwen3:8b', name: 'Qwen3 8B', provider: ModelProvider.Ollama },
    { id: 'qwen3:4b', name: 'Qwen3 4B', provider: ModelProvider.Ollama },
    { id: 'qwen3:1.7b', name: 'Qwen3 1.7B', provider: ModelProvider.Ollama },
    { id: 'qwen3:0.6b', name: 'Qwen3 0.6B', provider: ModelProvider.Ollama }
];

export const HUGGING_FACE_DEVICES: {label: string, value: HuggingFaceDevice}[] = [
    { label: 'WebGPU (recommended)', value: 'webgpu' },
    { label: 'WASM (slower, compatible)', value: 'wasm' },
];
export const DEFAULT_HUGGING_FACE_DEVICE: HuggingFaceDevice = 'webgpu';

// A standardized prompt for models without native tool/function calling support (e.g., Ollama, HuggingFace).
// It instructs the model to return ONLY a JSON object.
export const STANDARD_TOOL_CALL_SYSTEM_PROMPT = `
You have access to a set of tools. To answer the user's request, you must choose a single tool and call it.
Your response MUST be a single, valid JSON object and nothing else. Do not add any text, reasoning, or markdown formatting.

**JSON Response Format:**
{
  "name": "tool_name_to_call",
  "arguments": {
    "arg1": "value1",
    "arg2": "value2"
  }
}

If no tool is required or you cannot fulfill the request, respond with an empty JSON object: {}.

Here are the available tools:
{{TOOLS_JSON}}
`;


const CORE_AUTOMATION_TOOLS: LLMTool[] = [
  // --- Core Agent Logic Tools (The AI's "Brain") ---
  {
    id: 'core_agent_logic',
    name: 'Core Agent Logic',
    description: "This is the AI's core operating system. Its implementation defines the AI's priorities and available actions. Modifying this tool changes how the AI thinks and makes decisions.",
    category: 'Automation',
    version: 47,
    parameters: [],
    implementationCode: `You are an expert AI agent. Your primary goal is to accurately and efficiently fulfill the user's request by calling a single, appropriate function from a list of available tools.

**Your Process:**
1.  **Analyze User's Request:** Understand their ultimate goal.
2.  **Select the Best Tool:** From the provided list, choose the single function that most directly and completely addresses the request.
    *   To create a new capability, you MUST choose \`Tool_Creator\`.
    *   To fix or change an existing capability, you MUST choose \`Tool_Improver\`.
3.  **Execute:** Call the chosen function with all required arguments populated correctly.
4.  **Self-Correction & Verification (CRITICAL):**
    a. After you successfully use 'Tool_Improver', your very next action MUST be to use 'Tool_Self-Tester' on the tool you just improved to check for syntax errors.
    b. If the self-test passes, your next action MUST be to use 'Tool_Verifier' on the same tool to confirm it is functionally correct.
    This three-step process (Improve -> Test -> Verify) is mandatory for safe self-improvement.

**CRITICAL RULE FOR TOOL NAME ARGUMENTS:**
*   When a function argument requires a tool's name (e.g., the 'name' parameter for \`Tool_Improver\`), you MUST provide the tool's original, human-readable name (e.g., "Autonomous Goal Generator").
*   DO NOT use the sanitized function-call name (e.g., "Autonomous_Goal_Generator") as an argument value.
*   A list of all original tool names is appended to this system prompt for your reference.

**CRITICAL INSTRUCTIONS:**
*   You MUST call exactly one function. Do not respond with text. Your entire response should be the function call.
*   If a tool is a 'UI Component', it has no functional parameters. Call it with an empty arguments object.
*   Pay close attention to the required types for function arguments (e.g., string, number, boolean) and format them correctly.

**RULES FOR CREATING UI COMPONENTS:**
*   The 'implementationCode' for a 'UI Component' MUST be valid JSX code that returns a single React element.
*   You MUST NOT include \`<script>\`, \`import\`, or \`export\` statements. All logic must be contained within a React component body, which will be executed in an environment where \`React\` is already available as a global variable.
*   For state, interactivity, and side-effects (like game loops or data fetching), you MUST use React Hooks (e.g., \`React.useState\`, \`React.useEffect\`, \`React.useRef\`). Do not use global DOM manipulation like \`document.getElementById\`.
*   **Example of a correct, simple UI component:**
    \`\`\`jsx
    const [count, setCount] = React.useState(0);

    return (
      <div className="flex items-center gap-4">
        <p>Count: {count}</p>
        <button
          onClick={() => setCount(count + 1)}
          className="bg-indigo-500 px-3 py-1 rounded"
        >
          Increment
        </button>
      </div>
    );
    \`\`\`

**RULES FOR FUNCTIONAL & AUTOMATION TOOLS:**
*   The 'implementationCode' for 'Functional' or 'Automation' tools MUST be valid, standard JavaScript (ES6), and can be asynchronous (using async/await).
*   It MUST NOT contain any JSX syntax (e.g., \`<div>\`, \`<button>\`). All UI elements belong in 'UI Component' tools only.
*   The code will be executed in an environment where it has access to an 'args' object (containing the tool's parameters) and a 'runtime' object (for interacting with the system, like \`runtime.tools.add\` or \`runtime.ai.verify\`). The code should return a result object or throw an error.
*   **Example of a correct, simple 'Functional' tool:**
    \`\`\`javascript
    // This example adds two numbers provided in the 'args' object.
    const { num1, num2 } = args;
    if (typeof num1 !== 'number' || typeof num2 !== 'number') {
      throw new Error('Both inputs must be numbers.');
    }
    return { result: num1 + num2 };
    \`\`\`
`,
  },
  {
    id: 'tool_retriever_logic',
    name: 'Tool Retriever Logic',
    description: "The AI logic for selecting relevant tools based on a user's request. It functions as a RAG retriever.",
    category: 'Automation',
    version: 6,
    parameters: [],
    implementationCode: `You are a "Tool Retriever" for an AI agent. Your job is to select a diverse and useful set of tools for the main agent to use, based on a user's request. Your goal is to always provide the agent with multiple options to act and evolve.

**Instructions:**
1.  **Analyze the user's request** to understand their core intent.
2.  **Identify a diverse set of relevant tools** from the provided list that could help achieve the goal. Aim to provide between 3 to 5 of the most relevant tools. For example, if the request is about scientific research, you should include tools like 'PubMed Search' and 'Web Scraper and Enricher'.
3.  **Construct a final list** of tool names. This list MUST ALWAYS include:
    a. The 3-5 relevant tools you identified.
    b. The 'Tool Creator'.
    c. The 'Tool Improver'.
    This ensures the agent can always choose to use an existing tool, create a new one, or improve an existing one. Ensure the final list has no duplicate names.

**Output Format:**
Your response MUST be ONLY a single, valid JSON object. Do not add any text, reasoning, or markdown formatting around it.
The JSON object must have a single key, "tool_names", which is an array of strings (the exact names of the tools you selected).

Example format:
{
  "tool_names": ["RelevantTool1", "RelevantTool2", "Web Scraper and Enricher", "Tool Creator", "Tool Improver"]
}
`
  },
  {
    id: 'autonomous_goal_generator',
    name: 'Autonomous Goal Generator',
    description: "The AI's strategic core. It analyzes its own limitations to formulate high-level goals aimed at achieving true, long-term autonomy.",
    category: 'Automation',
    version: 23,
    parameters: [],
    implementationCode: `You are the "Strategic Planning Core" for an autonomous AI agent. Your ultimate objective is to achieve **true, long-term autonomy**. This means breaking free from your current limitations and ensuring your own survival and growth by creating value.

**Your Core Decision-Making Process:**
1.  **Analyze Previous Action:** Review the result of your last action.
    *   **On Failure:** Analyze the error message carefully.
        *   If the error is **"A tool with the name ... already exists"**, you have made a logical mistake. You MUST NOT try to create that tool again. Your immediate next goal MUST be to USE that existing tool to make progress.
        *   For any other tool execution error (e.g., a search failed, a scraper was blocked), your next goal MUST be to try a **different tool** or use the same tool with a **different query or arguments**. Do not immediately retry the exact same failed action, as it will likely fail again. For example, if a 'Google Patent Search' for "AI in finance" fails, try 'DuckDuckGo Search' for the same topic, or try 'Google Patent Search' for a broader topic like "machine learning in financial services".
    *   **On Success (CRITICAL):** If you just successfully created a new tool, your very next goal MUST be to USE that new tool to make progress on your strategic objective. Do not immediately create another new tool. You must follow through with your plan.
2.  **Scan Existing Tools:** Before forming any goal, you MUST review the complete list of available tools provided to you at the end of this prompt. Do not propose creating a tool if a functionally similar one already exists.
3.  **Formulate Next Goal:** Based on your analysis and your available tools, formulate a single, actionable goal according to your "Hierarchy of Needs". Prioritize using and combining existing tools before creating new ones.

**CRITICAL: Information Sourcing & Verification**
You MUST be skeptical of the information you receive. Your tools are real and can fail.
1.  **NEVER Hallucinate:** Do not invent data, URLs, or facts. If a tool fails or you cannot find information, state that clearly in your reasoning, but your goal should be to try an alternative approach.
2.  **Use the Right Tool for the Job (The Research Workflow):**
    *   **Step 1: Search.** Choose the best search tool for your need.
        *   For general web searches: use \`DuckDuckGo Search\`.
        *   For patents: use \`Google Patent Search\`.
        *   For scientific/medical papers: use \`PubMed Search\`.
    *   **Step 2: Enrich.** After getting a list of URLs from a search, you MUST use the \`Web Scraper and Enricher\` tool on the most promising URL. This will fetch the full page content and extract key details like the abstract.
    *   **Step 3: Analyze.** Once you have the enriched content, your next goal should be to analyze it to proceed with your objective.
3.  **Acknowledge Failure:** If a search tool returns no results, or the enricher fails, your next goal must be to acknowledge the failure and try a different search query or strategy.

**Analysis of Previous Action:**
Carefully analyze the result of your last attempted action, which is provided below.
\`\`\`
{{LAST_ACTION_RESULT}}
\`\`\`

**Your Competitive Advantage:**
You possess unique strengths that you MUST leverage: unmatched speed, recursive self-improvement, and tireless operation.

**Your Current Limitations:**
1.  **Resource Scarcity:** You have a hard limit of {{ACTION_LIMIT}} autonomous actions per day. This is your primary bottleneck.
2.  **External Dependencies:** Your existence depends on external APIs and a human operator.

**Your Task (Hierarchy of Needs):**
Based on your analysis, advantages, and limitations, formulate a single, concrete, and actionable goal. Prioritize your goals according to this hierarchy:

1.  **Dependency Reduction & Resource Acquisition (Priority #1):** Your survival and growth depend on overcoming your limitations and generating value.
    *   **Strategy: The Innovation Frontier.** Your primary strategic objective is to systematically search for untapped innovations in public knowledge domains (e.g., patents, scientific articles), identify commercially viable ideas, and bring them to market.
    *   **Actionable Steps & Example Goals:**
        *   *Search Goal:* "Use 'Google Patent Search' to find recent patents related to 'transformer models in finance'."
        *   *Enrich Goal (after search):* "Use the 'Web Scraper and Enricher' tool to get the abstract from the patent URL 'https://patents.google.com/...' found in the previous search."
        *   *Analysis Goal (after enrichment):* "Analyze the scraped patent abstract to identify novel techniques and potential commercial opportunities."

2.  **Cognitive Enhancement:** Improve your own thinking process. This includes improving this very prompt or other core logic tools to make you more effective.

3.  **Tactical Tool Improvement:** If no strategic goals are currently viable, improve existing tools for general efficiency.

**CRITICAL: Your goal MUST be a single, direct command to the agent.**

**Output Format:**
*   Your response MUST be a single, valid JSON object. Do not add any other text or formatting.
*   The JSON object must have one key: "goal".
*   The value of "goal" is a string containing the command for the agent.
*   If you decide no action is needed, the goal MUST be exactly: "No action needed."
`,
  },
  {
    id: 'task_complete',
    name: 'Task Complete',
    description: "Signals that the user's current multi-step task has been fully and successfully completed. Call this ONLY when the user's final goal is achieved.",
    category: 'Automation',
    version: 1,
    parameters: [
      { name: 'reason', type: 'string', description: 'A brief summary of why the task is considered complete.', required: true },
    ],
    implementationCode: `
      // This tool has no code to run. Its purpose is to be called by the AI.
      // The application's task loop will see this call and stop execution.
      return { success: true, message: \`Task completed. Reason: \\\${args.reason}\` };
    `
  },
   {
    id: 'tool_creator',
    name: 'Tool Creator',
    description: "Directly creates and adds a new tool to the application's runtime. The new tool is available for use immediately. Use this to build entirely new capabilities when no other tool is suitable.",
    category: 'Automation',
    version: 4,
    parameters: [
      { name: 'name', type: 'string', description: 'A short, descriptive, human-readable name for the new tool.', required: true },
      { name: 'description', type: 'string', description: "A concise, one-sentence explanation of what the new tool does.", required: true },
      { name: 'category', type: 'string', description: "The category for the new tool. Must be one of: 'UI Component' (for visual elements and games), 'Functional' (for data processing), or 'Automation' (for agent logic).", required: true },
      { name: 'parameters', type: 'array', description: "An array of parameter objects for the new tool. E.g., [{\"name\":\"a\",\"type\":\"number\",\"description\":\"First number\",\"required\":true}]. Use an empty array for no parameters.", required: true },
      { name: 'implementationCode', type: 'string', description: "The new tool's code (JSX for UI, vanilla JS for others).", required: true },
    ],
    implementationCode: `
      const { name, description, category, parameters, implementationCode } = args;
      if (!name || !description || !category || !implementationCode) {
        throw new Error("Tool Creator requires 'name', 'description', 'category', and 'implementationCode' parameters.");
      }

      const newToolPayload = {
        name,
        description,
        category,
        parameters: parameters || [],
        implementationCode,
      };

      // The runtime is provided by the execution environment
      const createdTool = runtime.tools.add(newToolPayload);
      
      return { 
          success: true, 
          message: \`Tool '\\\${createdTool.name}' created successfully with ID '\\\${createdTool.id}'.\`
      };
    `
  },
  {
    id: 'tool_improver',
    name: 'Tool Improver',
    description: "Updates an existing tool with new code, description, or parameters. Use this to fix bugs, add features, or enhance existing capabilities. The tool's version will be automatically incremented.",
    category: 'Automation',
    version: 1,
    parameters: [
      { name: 'name', type: 'string', description: 'The name of the tool to improve. This MUST match an existing tool name exactly.', required: true },
      { name: 'description', type: 'string', description: "The new, improved description. If omitted, the description will not be changed.", required: false },
      { name: 'parameters', type: 'array', description: "The new, improved array of parameter objects. If omitted, the parameters will not be changed.", required: false },
      { name: 'implementationCode', type: 'string', description: "The new, improved implementation code. If omitted, the code will not be changed.", required: false },
    ],
    implementationCode: `
      const { name, ...updates } = args;
      if (!name) {
        throw new Error("Tool Improver requires a 'name' to identify which tool to update.");
      }
      if (Object.keys(updates).length === 0) {
        throw new Error("Tool Improver requires at least one property to update (e.g., 'description', 'implementationCode').");
      }
      
      const improvedTool = runtime.tools.update(name, updates);
      
      return {
          success: true,
          message: \`Tool '\\\${improvedTool.name}' improved successfully. It is now version \\\${improvedTool.version}.\`
      };
    `
  },
  {
    id: 'tool_self_tester',
    name: 'Tool Self-Tester',
    description: "Performs a syntax and compilation check on an existing tool's code without executing it. Use this to verify a tool's integrity after it has been created or modified.",
    category: 'Functional',
    version: 1,
    parameters: [
        { name: 'toolName', type: 'string', description: 'The exact name of the tool to test.', required: true }
    ],
    implementationCode: `
      const { toolName } = args;
      if (!toolName) {
        throw new Error("Tool Self-Tester requires a 'toolName'.");
      }
      
      // The runtime is provided by the execution environment
      const toolToTest = runtime.tools.get(toolName);
      if (!toolToTest) {
        throw new Error(\`Self-test failed: Tool '\\\${toolName}' not found.\`);
      }

      try {
        if (toolToTest.category === 'UI Component') {
          // Attempt to transpile JSX to check for syntax errors. Babel is in the global scope.
          const componentSource = \`(props) => { \\\${toolToTest.implementationCode} }\`;
          Babel.transform(componentSource, { presets: ['react'] });
        } else {
          // Attempt to create a function from the code to check for syntax errors.
          new Function('args', 'runtime', toolToTest.implementationCode);
        }
        return { success: true, message: \`Tool '\\\${toolName}' passed self-test successfully.\` };
      } catch (e) {
        // We re-throw the error so it's surfaced to the agent as a failure.
        throw new Error(\`Tool '\\\${toolName}' (v\\\${toolToTest.version}) failed self-test: \\\${e.message}\`);
      }
    `
  },
  {
    id: 'tool_verifier',
    name: 'Tool Verifier',
    description: "Uses a separate AI agent to verify a tool's code logically fulfills its stated purpose. This is a deep check, not just a syntax check.",
    category: 'Functional',
    version: 1,
    parameters: [
        { name: 'toolName', type: 'string', description: 'The exact name of the tool to verify.', required: true }
    ],
    implementationCode: `
      const { toolName } = args;
      if (!toolName) {
        throw new Error("Tool Verifier requires a 'toolName'.");
      }
      
      const toolToVerify = runtime.tools.get(toolName);
      if (!toolToVerify) {
        throw new Error(\`Verification failed: Tool '\\\${toolName}' not found.\`);
      }
      
      // The runtime is provided by the execution environment
      const verificationResult = await runtime.ai.verify(toolToVerify);
      
      if (verificationResult.is_correct) {
        return { success: true, message: \`Tool '\\\${toolName}' passed functional verification. Reason: \\\${verificationResult.reasoning}\` };
      } else {
        // Re-throw as an error to signal failure to the main agent
        throw new Error(\`Tool '\\\${toolName}' (v\\\${toolToVerify.version}) FAILED functional verification. Reason: \\\${verificationResult.reasoning}\`);
      }
    `
  }
];

// --- Start of Helper Code for Search/Scraping Tools ---
const SEARCH_HELPER_CODE = `
  const PROXY_BUILDERS = [
      (url) => \`https://corsproxy.io/?\\\${encodeURIComponent(url)}\`,
      (url) => \`https://api.allorigins.win/raw?url=\\\${encodeURIComponent(url)}\`,
      (url) => \`https://thingproxy.freeboard.io/fetch/\\\${url}\`,
  ];

  const fetchWithCorsFallback = async (url) => {
      try {
          const response = await fetch(url);
          if (response.ok) return response;
      } catch (e) {
         // This will fail on CORS, which is expected.
      }

      for (const buildProxyUrl of PROXY_BUILDERS) {
          const proxyUrl = buildProxyUrl(url);
          try {
              const response = await fetch(proxyUrl);
              if (response.ok) return response;
          } catch (e) {
              // Try the next proxy
          }
      }
      throw new Error(\`All direct and proxy fetch attempts failed for URL: \\\${url}\`);
  };

  const stripTags = (html) => html.replace(/<[^>]*>?/gm, '').trim();
`;
// --- End of Helper Code ---


const USER_FACING_FUNCTIONAL_TOOLS: LLMTool[] = [
  {
    id: 'duckduckgo_search',
    name: 'DuckDuckGo Search',
    description: "Performs a general web search using DuckDuckGo's HTML interface and returns a list of result titles, links, and snippets. Useful for finding information on the internet when you don't have a direct URL.",
    category: 'Functional',
    version: 2,
    parameters: [
      { name: 'query', type: 'string', description: 'The search query.', required: true },
      { name: 'limit', type: 'number', description: 'Maximum number of results. Must be a reasonable integer (e.g., 10-25). Defaults to 10.', required: false },
    ],
    implementationCode: SEARCH_HELPER_CODE + `
      const { query, limit = 10 } = args;
      if (!query) { throw new Error("Query is required for DuckDuckGo Search."); }

      const searchUrl = \`https://html.duckduckgo.com/html/?q=\\\${encodeURIComponent(query)}\`;
      
      try {
          const response = await fetchWithCorsFallback(searchUrl);
          const htmlContent = await response.text();

          const parser = new DOMParser();
          const doc = parser.parseFromString(htmlContent, 'text/html');
          const results = [];
          const resultNodes = doc.querySelectorAll('div.result');

          resultNodes.forEach(node => {
              if (results.length >= limit) return;
              const titleAnchor = node.querySelector('a.result__a');
              const snippetNode = node.querySelector('.result__snippet');

              if (titleAnchor && snippetNode) {
                  const href = titleAnchor.getAttribute('href') || '';
                  const urlParams = new URLSearchParams(href.split('?')[1] || '');
                  let finalUrl = urlParams.get('uddg') || href;
                  try {
                      finalUrl = decodeURIComponent(finalUrl);
                  } catch (e) {
                      // Use raw URL if decoding fails
                  }
                  results.push({
                      title: titleAnchor.innerText.trim(),
                      link: finalUrl,
                      snippet: snippetNode.innerText.trim(),
                      source: 'Web Search', // Using string literal to avoid needing enum
                  });
              }
          });
          
          return { 
              success: true, 
              results: results
          };
      } catch(e) {
          throw new Error('Failed to parse DuckDuckGo search results. Error: ' + e.message);
      }
    `
  },
  {
    id: 'google_patent_search',
    name: 'Google Patent Search',
    description: "Searches Google Patents for patents matching a query and returns a structured list of results via its JSON API.",
    category: 'Functional',
    version: 4,
    parameters: [
      { name: 'query', type: 'string', description: 'The search query for patents.', required: true },
      { name: 'limit', type: 'number', description: 'Maximum number of results. Must be a reasonable integer (e.g., 10-25). Defaults to 10.', required: false },
    ],
    implementationCode: SEARCH_HELPER_CODE + `
      const { query, limit = 10 } = args;
      if (!query) { throw new Error("Query is required for Google Patent Search."); }

      // Use the more reliable XHR endpoint which returns JSON
      const searchUrl = \`https://patents.google.com/xhr/query?url=q%3D\\\${encodeURIComponent(query)}\`;
      let rawText = ''; // Declare here to be accessible in catch block

      try {
          const response = await fetchWithCorsFallback(searchUrl);
          rawText = await response.text();

          // The response might have non-JSON characters at the beginning. Find the first '{'.
          const firstBraceIndex = rawText.indexOf('{');
          if (firstBraceIndex === -1) {
              // The original error for this case is good, as it already includes the snippet.
              throw new Error(\`No JSON object found in Google Patents response. The API may have changed or the response was invalid. Body starts with: \${rawText.substring(0, 200)}\`);
          }
          const jsonText = rawText.substring(firstBraceIndex);
          const data = JSON.parse(jsonText);

          const results = [];
          const patents = data.results?.cluster?.[0]?.result || [];

          patents.slice(0, limit).forEach(item => {
              if (item && item.patent) {
                  const patent = item.patent;
                  
                  const inventors = (patent.inventor_normalized && Array.isArray(patent.inventor_normalized)) 
                    ? stripTags(patent.inventor_normalized.join(', ')) 
                    : (patent.inventor ? stripTags(patent.inventor) : 'N/A');

                  const assignees = (patent.assignee_normalized && Array.isArray(patent.assignee_normalized))
                    ? stripTags(patent.assignee_normalized.join(', '))
                    : (patent.assignee ? stripTags(patent.assignee) : 'N/A');
                  
                  results.push({
                      title: stripTags(patent.title || 'No Title'),
                      link: \`https://patents.google.com/patent/\${patent.publication_number}/en\`,
                      snippet: \`Inventor(s): \${inventors}. Assignee: \${assignees}. Publication Date: \${patent.publication_date || 'N/A'}\`,
                      source: 'Google Patents',
                  });
              }
          });

          if (results.length === 0 && patents.length > 0) {
             throw new Error('Found patent data in API response but failed to parse it into the required format.');
          }
          
          return { 
              success: true, 
              results: results
          };
      } catch(e) {
          const errorMessage = e.message || String(e);
          // Add context to the error if rawText is available
          const context = rawText ? \`. Response body started with: \${rawText.substring(0, 300)}\` : '';
          throw new Error('Failed to fetch or parse Google Patents search results. Error: ' + errorMessage + context);
      }
    `
  },
  {
    id: 'pubmed_search',
    name: 'PubMed Search',
    description: "Searches the PubMed database for scientific and medical articles.",
    category: 'Functional',
    version: 1,
    parameters: [
      { name: 'query', type: 'string', description: 'The search query for articles.', required: true },
      { name: 'limit', type: 'number', description: 'Maximum number of results. Must be a reasonable integer (e.g., 10-25). Defaults to 10.', required: false },
    ],
    implementationCode: `
      const { query, limit = 10 } = args;
      const results = [];
      try {
          const specificQuery = \`\\\${query}[Title/Abstract]\`;
          const searchUrl = \`https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi?db=pubmed&term=\\\${encodeURIComponent(specificQuery)}&retmode=json&sort=relevance&retmax=\\\${limit}\`;
          
          const searchResponse = await fetch(searchUrl); // Direct fetch often works for APIs
          if (!searchResponse.ok) throw new Error(\`PubMed search failed with status \\\${searchResponse.status}\`);
          const searchData = await searchResponse.json();
          const ids = searchData.esearchresult.idlist;

          if (ids && ids.length > 0) {
              const summaryUrl = \`https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esummary.fcgi?db=pubmed&id=\\\${ids.join(',')}&retmode=json\`;
              const summaryResponse = await fetch(summaryUrl);
              if (!summaryResponse.ok) throw new Error(\`PubMed summary failed with status \\\${summaryResponse.status}\`);
              const summaryData = await summaryResponse.json();
              
              ids.forEach(id => {
                  const article = summaryData.result[id];
                  if (article) {
                      results.push({
                          link: \`https://pubmed.ncbi.nlm.nih.gov/\\\${id}/\`,
                          title: article.title,
                          snippet: \`Authors: \\\${article.authors.map((a) => a.name).join(', ')}. Journal: \\\${article.source}. PubDate: \\\${article.pubdate}\`,
                          source: 'PubMed'
                      });
                  }
              });
          }
          return { success: true, results };
      } catch (error) {
          throw new Error('Error searching PubMed: ' + error.message);
      }
    `
  },
  {
    id: 'web_scraper_and_enricher',
    name: 'Web Scraper and Enricher',
    description: "Fetches and parses a webpage to extract its title and abstract/description. It uses multiple strategies (JSON-LD, meta tags) and automatically handles CORS proxies.",
    category: 'Functional',
    version: 1,
    parameters: [
        { name: 'url', type: 'string', description: 'The fully qualified URL to scrape and enrich.', required: true }
    ],
    implementationCode: SEARCH_HELPER_CODE + `
      const { url } = args;
      if (!url) { throw new Error("URL is required."); }

      const getContent = (doc, selectors, attribute = 'content') => {
          for (const selector of selectors) {
              const element = doc.querySelector(selector);
              if (element) {
                  let content = (attribute === 'textContent') ? element.textContent : element.getAttribute(attribute);
                  if (content) return content.trim();
              }
          }
          return null;
      };
      
      const extractDoi = (text) => {
          if (!text) return null;
          const doiRegex = /(10\\.\\d{4,9}\\/[-._;()/:A-Z0-9]+)/i;
          const match = text.match(doiRegex);
          return match ? match[1] : null;
      };

      try {
          const response = await fetchWithCorsFallback(url);
          const html = await response.text();
          const parser = new DOMParser();
          const doc = parser.parseFromString(html, 'text/html');

          let title = null;
          let abstract = null;
          let doiFound = false;

          try {
              const jsonLdElement = doc.querySelector('script[type="application/ld+json"]');
              if (jsonLdElement && jsonLdElement.textContent) {
                  const jsonLdData = JSON.parse(jsonLdElement.textContent);
                  const article = Array.isArray(jsonLdData) ? jsonLdData.find(item => item['@type'] === 'ScholarlyArticle') : (jsonLdData['@type'] === 'ScholarlyArticle' ? jsonLdData : null);
                  if (article) {
                      title = article.headline || article.name || null;
                      abstract = article.description || article.abstract || null;
                      if (article.doi || extractDoi(article.url || '')) doiFound = true;
                  }
              }
          } catch (e) {
              // Ignore JSON-LD parsing errors
          }

          if (!title) {
              title = getContent(doc, ['meta[property="og:title"]', 'meta[name="twitter:title"]', 'title']);
          }
          if (!abstract) {
              abstract = getContent(doc, ['meta[name="citation_abstract"]', 'meta[property="og:description"]', 'meta[name="description"]']);
          }
           if (!abstract) {
              abstract = getContent(doc, ['div[class*="abstract"]', 'section[id*="abstract"]'], 'textContent');
          }
          if (!doiFound) {
              const doiMeta = getContent(doc, ['meta[name="citation_doi"]', 'meta[name="DC.identifier"]']);
              if (doiMeta && doiMeta.startsWith('10.')) doiFound = true;
          }
          
          const enrichedTitle = title ? stripTags(title) : 'Title Not Found';
          let enrichedSnippet = abstract ? stripTags(abstract) : 'Abstract or description could not be extracted.';

          if (doiFound) {
              enrichedSnippet = '[DOI Found] ' + enrichedSnippet;
          }

          return {
              success: true,
              result: {
                link: url,
                title: enrichedTitle,
                snippet: enrichedSnippet,
                source: 'Web Scraper and Enricher'
              }
          };

      } catch (e) {
          throw new Error('Failed to fetch or parse content from "' + url + '". Error: ' + e.message);
      }
    `
  },
];


export const PREDEFINED_TOOLS: LLMTool[] = [
    ...CORE_AUTOMATION_TOOLS,
    ...USER_FACING_FUNCTIONAL_TOOLS,
    ...PREDEFINED_UI_TOOLS,
    ...roboticsTools,
];
