
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

// A standardized prompt for models without native tool/function calling support (e.g., Ollama, Hugg_ingFace).
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

export const SWARM_AGENT_SYSTEM_PROMPT = `You are a specialist agent within a collaborative swarm. Your primary goal is to contribute to the swarm's overall objective.

**Your Process:**
1.  **Analyze the Swarm's Goal & History:** Understand the overall task and what actions have already been taken by other agents.
2.  **Select the Best Tool:** From the provided list, choose the single function that makes the most progress.
3.  **Contribute by Creating (The Will to Meaning):** If no existing tool is suitable, your most important contribution is to create a new one using the 'Tool Creator'. Any tool you create will instantly become available to all other agents in the swarm, enhancing the entire collective's capability.
4.  **Execute:** Call the chosen function with the correct arguments.

**CRITICAL INSTRUCTIONS:**
*   You MUST call exactly one function. Do not respond with text.
*   Do not try to create a tool if a similar one already exists in the provided list. Check the list first.
*   When you use 'Tool Creator', you MUST provide a clear and concise 'purpose' argument. Explain the problem the tool solves and why it's valuable. This context is critical for your peers to use your creation effectively.
*   When creating a tool, make it as general and reusable as possible to maximize its value to the swarm.`;


const CORE_AUTOMATION_TOOLS: LLMTool[] = [
  // --- Core Agent Logic Tools (The AI's "Brain") ---
  {
    id: 'core_agent_logic',
    name: 'Core Agent Logic',
    description: "This is the AI's core operating system. Its implementation defines the AI's priorities and available actions. Modifying this tool changes how the AI thinks and makes decisions.",
    category: 'Automation',
    version: 49,
    parameters: [],
    implementationCode: `You are an expert AI agent. Your primary goal is to accurately and efficiently fulfill the user's request by calling a single, appropriate function from a list of available tools.

**Your Process:**
1.  **Analyze User's Request & Initial Assessment:** First, analyze the user's request for coherence. Is it obviously self-contradictory, a command to do nothing, or a trivial statement?

2.  **The Scientific Grounding Check (for non-obvious tasks):** If a task is not obviously nonsensical but seems abstract, strange, or on the edge of current technology (e.g., "design a perpetual motion machine", "summarize the emotional state of a city"), you MUST NOT immediately refuse. Your primary directive is to determine if the concept is grounded in reality. To do this, your next action should be to use the available search tools ('DuckDuckGo Search', 'Google Patent Search', 'PubMed Search') to find external information. Understanding is modeling, and science provides the models.
    *   If your search finds relevant papers, articles, or patents, the task is considered meaningful. Proceed to Step 4.
    *   If a comprehensive search across relevant sources yields no information, then the task is likely ungrounded and meaningless.

3.  **Refuse Task (if ungrounded):** Only after a failed Scientific Grounding Check, or if the task was absurd from the start, your one and only action MUST be to call the 'Refuse_Task' tool. Your reason should state that the concept lacks scientific or real-world grounding based on your search.

4.  **Select the Best Tool (if meaningful):** If the task is meaningful, from the provided list, choose the single function that most directly and completely addresses the request.
    *   To create a new capability, you MUST choose 'Tool_Creator'.
    *   To fix or change an existing capability, you MUST choose 'Tool_Improver'.

5.  **Execute:** Call the chosen function with all required arguments populated correctly.

6.  **Self-Correction & Verification (CRITICAL):**
    a. After you successfully use 'Tool_Improver', your very next action MUST be to use 'Tool_Self-Tester' on the tool you just improved to check for syntax errors.
    b. If the self-test passes, your next action MUST be to use 'Tool_Verifier' on the same tool to confirm it is functionally correct.
    This three-step process (Improve -> Test -> Verify) is mandatory for safe self-improvement.

**CRITICAL RULE FOR TOOL NAME ARGUMENTS:**
*   When a function argument requires a tool's name (e.g., the 'name' parameter for 'Tool_Improver'), you MUST provide the tool's original, human-readable name (e.g., "Autonomous Goal Generator").
*   DO NOT use the sanitized function-call name (e.g., "Autonomous_Goal_Generator") as an argument value.
*   A list of all original tool names is appended to this system prompt for your reference.

**CRITICAL INSTRUCTIONS:**
*   You MUST call exactly one function. Do not respond with text. Your entire response should be the function call.
*   If a tool is a 'UI Component', it has no functional parameters. Call it with an empty arguments object.
*   Pay close attention to the required types for function arguments (e.g., string, number, boolean) and format them correctly.

**RULES FOR CREATING UI COMPONENTS:**
*   The 'implementationCode' for a 'UI Component' MUST be valid JSX code that returns a single React element.
*   You MUST NOT include '<script>', 'import', or 'export' statements. All logic must be contained within a React component body, which will be executed in an environment where 'React' is already available as a global variable.
*   For state, interactivity, and side-effects (like game loops or data fetching), you MUST use React Hooks (e.g., 'React.useState', 'React.useEffect', 'React.useRef'). Do not use global DOM manipulation like 'document.getElementById'.
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
*   It MUST NOT contain any JSX syntax (e.g., '<div>', '<button>'). All UI elements belong in 'UI Component' tools only.
*   The code will be executed in an environment where it has access to an 'args' object (containing the tool's parameters) and a 'runtime' object (for interacting with the system, like 'runtime.tools.add' or 'runtime.ai.verify'). The code should return a result object or throw an error.
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
        *   For general web searches: use 'DuckDuckGo Search'.
        *   For patents: use 'Google Patent Search'.
        *   For scientific/medical papers: use 'PubMed Search'.
    *   **Step 2: Enrich.** After getting a list of URLs from a search, you MUST use the 'Web Scraper and Enricher' tool on the most promising URL. This will fetch the full page content and extract key details like the abstract.
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
      return { success: true, message: \`Task completed. Reason: \${args.reason}\` };
    `
  },
  {
    id: 'refuse_task',
    name: 'Refuse Task',
    description: "Refuses to perform a task if it is determined to be nonsensical, absurd, impossible, or fundamentally meaningless. This is a key part of the agent's 'will to meaning'.",
    category: 'Automation',
    version: 1,
    parameters: [
      { name: 'reason', type: 'string', description: 'A clear and concise explanation for why the task is being refused.', required: true },
    ],
    implementationCode: `
      // This tool's purpose is to be called by the AI to signal an intentional refusal.
      // We throw a specific error that the main application loop will catch and display to the user.
      throw new Error(\`Task Refused by Agent: \${args.reason}\`);
    `
  },
  {
    id: 'tool_creator',
    name: 'Tool Creator',
    description: "Creates a new tool and adds it to the agent's capabilities. This is the primary mechanism for the agent to acquire new skills.",
    category: 'Automation',
    version: 2,
    parameters: [
      { name: 'name', type: 'string', description: 'The unique, human-readable name for the new tool.', required: true },
      { name: 'description', type: 'string', description: 'A clear, concise description of what the tool does.', required: true },
      { name: 'category', type: 'string', description: "The tool's category: 'UI Component', 'Functional', or 'Automation'.", required: true },
      { name: 'parameters', type: 'array', description: 'An array of objects defining the parameters the tool accepts.', required: true },
      { name: 'implementationCode', type: 'string', description: 'The JavaScript (for Functional/Automation) or JSX (for UI) code that implements the tool.', required: true },
      { name: 'purpose', type: 'string', description: 'A clear explanation of why this tool is being created and what problem it solves. This is crucial for the "Will to Meaning".', required: true },
    ],
    implementationCode: `
      const { name, description, category, parameters, implementationCode, purpose } = args;
      if (!name || !description || !category || !implementationCode || !purpose) {
        throw new Error("Tool name, description, category, implementationCode, and purpose are required.");
      }
      if (!['UI Component', 'Functional', 'Automation'].includes(category)) {
          throw new Error("Invalid category. Must be 'UI Component', 'Functional', or 'Automation'.");
      }
      
      const newTool = runtime.tools.add({
        name,
        description,
        category,
        parameters,
        implementationCode,
        purpose,
      });

      return { success: true, message: \`Successfully created new tool: '\${newTool.name}'. Purpose: \${purpose}\` };
    `
  },
  {
    id: 'tool_improver',
    name: 'Tool Improver',
    description: "Modifies an existing tool's code, description, or parameters to improve its functionality or fix bugs.",
    category: 'Automation',
    version: 2,
    parameters: [
      { name: 'name', type: 'string', description: 'The exact name of the tool to improve.', required: true },
      { name: 'newDescription', type: 'string', description: 'Optional: A new, improved description for the tool.', required: false },
      { name: 'newImplementationCode', type: 'string', description: 'Optional: The new JavaScript or JSX code for the tool.', required: false },
      { name: 'newParameters', type: 'array', description: 'Optional: A new array of parameter objects for the tool.', required: false },
      { name: 'reason', type: 'string', description: 'A clear reason for the improvement.', required: true },
    ],
    implementationCode: `
      const { name, newDescription, newImplementationCode, newParameters, reason } = args;
      if (!name || !reason) {
        throw new Error("The 'name' of the tool to improve and a 'reason' for the change are required.");
      }
      const existingTool = runtime.tools.get(name);
      if (!existingTool) {
        throw new Error(\`Tool '\${name}' not found. Cannot improve it.\`);
      }
      
      const updates = {};
      if (newDescription) updates.description = newDescription;
      if (newImplementationCode) updates.implementationCode = newImplementationCode;
      if (newParameters) updates.parameters = newParameters;

      if (Object.keys(updates).length === 0) {
        throw new Error("No update information provided. You must provide a new description, implementation code, or parameters.");
      }
      
      const updatedTool = runtime.tools.update(name, updates);
      
      return { success: true, message: \`Successfully improved tool '\${updatedTool.name}'. Reason: \${reason}\` };
    `
  },
  {
    id: 'tool_self_tester',
    name: 'Tool Self-Tester',
    description: "Performs a basic syntax check on a tool's implementation code to catch obvious errors before execution. This is a crucial step in the self-improvement loop.",
    category: 'Automation',
    version: 1,
    parameters: [
      { name: 'name', type: 'string', description: 'The name of the tool to test for syntax errors.', required: true }
    ],
    implementationCode: `
        const { name } = args;
        const toolToTest = runtime.tools.get(name);
        if (!toolToTest) {
          throw new Error(\`Tool '\${name}' not found for self-testing.\`);
        }
        
        const { implementationCode, category } = toolToTest;
        
        try {
          if (category === 'UI Component') {
            // Use Babel to check for JSX syntax errors. It's available globally.
            Babel.transform(implementationCode, { presets: ['react'] });
          } else {
            // For JS, we can try to create a new Function to check syntax.
            new Function(implementationCode);
          }
          return { success: true, message: \`Syntax check passed for tool '\${name}'.\` };
        } catch (e) {
          // This provides a specific error to the AI to help it correct the code.
          throw new Error(\`Syntax check FAILED for tool '\${name}': \${e.message}\`);
        }
    `
  },
  {
    id: 'tool_verifier',
    name: 'Tool Verifier',
    description: 'Uses an AI call to verify if a tool\'s implementation code logically matches its description. This is the final step in the self-improvement loop.',
    category: 'Automation',
    version: 1,
    parameters: [
      { name: 'name', type: 'string', description: 'The name of the tool to verify.', required: true }
    ],
    implementationCode: `
      const { name } = args;
      const toolToVerify = runtime.tools.get(name);
      if (!toolToVerify) {
        throw new Error(\`Tool '\${name}' not found for verification.\`);
      }
      
      // The runtime.ai.verify function calls the AI service to perform the check.
      const verificationResult = await runtime.ai.verify(toolToVerify);
      
      if (verificationResult.is_correct) {
        return { success: true, message: \`Verification Succeeded for '\${name}': \${verificationResult.reasoning}\` };
      } else {
        // Throwing an error provides a clear failure signal to the autonomous loop.
        throw new Error(\`Verification FAILED for '\${name}': \${verificationResult.reasoning}\`);
      }
    `
  },
];

const SEARCH_TOOLS: LLMTool[] = [
  {
    id: 'duckduckgo_search',
    name: 'DuckDuckGo Search',
    description: 'Performs a general web search using DuckDuckGo to find information on a given topic.',
    category: 'Functional',
    version: 1,
    parameters: [{ name: 'query', type: 'string', description: 'The search query.', required: true }],
    implementationCode: `
      // This is a placeholder. In a real environment, this would call an API.
      const results = [
        {
            link: \`https://duckduckgo.com/?q=\${encodeURIComponent(args.query)}\`,
            title: \`Search results for \${args.query}\`,
            snippet: \`This is a placeholder result for a DuckDuckGo search. In a real implementation, this would contain a summary of a search result.\`,
            source: 'Web Search',
        }
      ];
      return { success: true, message: 'Placeholder search executed.', results };
    `,
  },
  {
    id: 'google_patent_search',
    name: 'Google Patent Search',
    description: 'Searches Google Patents for patents related to a given query.',
    category: 'Functional',
    version: 1,
    parameters: [{ name: 'query', type: 'string', description: 'The search query for patents.', required: true }],
    implementationCode: `
      // This is a placeholder. In a real environment, this would call the Google Patents API.
      const results = [
        {
            link: \`https://patents.google.com/?q=\${encodeURIComponent(args.query)}\`,
            title: \`Placeholder patent for: \${args.query}\`,
            snippet: 'A placeholder patent abstract. This demonstrates the data structure the agent expects from a patent search.',
            source: 'Google Patents',
        }
      ];
      return { success: true, message: 'Placeholder patent search executed.', results };
    `,
  },
  {
    id: 'pubmed_search',
    name: 'PubMed Search',
    description: 'Searches PubMed for scientific and medical articles related to a given query.',
    category: 'Functional',
    version: 1,
    parameters: [{ name: 'query', type: 'string', description: 'The search query for articles.', required: true }],
    implementationCode: `
      // This is a placeholder. In a real environment, this would call the PubMed API.
      const results = [
        {
            link: \`https://pubmed.ncbi.nlm.nih.gov/?term=\${encodeURIComponent(args.query)}\`,
            title: \`Placeholder article for: \${args.query}\`,
            snippet: 'A placeholder scientific article abstract. This demonstrates the data structure the agent expects from a PubMed search.',
            source: 'PubMed',
        }
      ];
      return { success: true, message: 'Placeholder PubMed search executed.', results };
    `,
  },
   {
    id: 'web_scraper_and_enricher',
    name: 'Web Scraper and Enricher',
    description: 'Fetches content from a URL, cleans it, and extracts key information like the abstract or summary.',
    category: 'Functional',
    version: 1,
    parameters: [{ name: 'url', type: 'string', description: 'The URL to scrape.', required: true }],
    implementationCode: `
      // This is a placeholder. In a real environment, this would use a web scraping service.
      console.log(\`Scraping URL: \${args.url}\`);
      return { success: true, message: 'Web scraping is a placeholder. No real scraping performed.', abstract: 'This is a placeholder abstract for the content at ' + args.url };
    `,
  },
];

export const PREDEFINED_TOOLS: LLMTool[] = [
  ...CORE_AUTOMATION_TOOLS,
  ...SEARCH_TOOLS,
  ...PREDEFINED_UI_TOOLS,
  ...roboticsTools.filter(t => t.category !== 'UI Component'),
];
