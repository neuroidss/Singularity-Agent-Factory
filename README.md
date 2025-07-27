
# Singularity Agent Factory

**Live Demo:** [https://neuroidss.github.io/Singularity-Agent-Factory/](https://neuroidss.github.io/Singularity-Agent-Factory/)

This project is an experimental platform for building a self-improving AI agent. The core concept is to start with an agent that has a minimal set of core capabilities and have it dynamically create, execute, and improve its own tools to accomplish increasingly complex tasks.

The ultimate goal is to bootstrap a "singularity agent" that can recursively enhance its own intelligence.

## Core Concept

The system is built around a "prime directive": **Always Take Action**. The agent must respond to every user request with one of three actions:

1.  **EXECUTE:** If a suitable tool exists to fulfill the request, execute it.
2.  **CREATE:** If no suitable tool exists, create a new one.
3.  **IMPROVE:** If the request is ambiguous or an existing tool can be enhanced, improve it.

This creates a powerful feedback loop where the agent's capabilities are constantly expanding and refining based on user interaction.

## How It Works: The Agent Lifecycle

The agent's "thought process" for every user request follows a Retrieval-Augmented Generation (RAG) pattern.

```
User Input -> [1. Tool Retriever (RAG)] -> [2. Core Agent (LLM)] -> [3. Action (Execute/Create/Improve)]
```

1.  **Tool Retriever (RAG):** The user's request is first sent to a "Tool Retriever" model. Its job is to analyze the request and select a small, relevant set of tools from the main tool library. This is crucial—the agent doesn't get overwhelmed with every tool at once, only the ones it needs for the task at hand.
2.  **Core Agent (LLM):** The user's request, along with the *code and descriptions of the retrieved tools*, is then sent to the main agent. The agent uses this context to decide which action to take (`EXECUTE`, `CREATE`, or `IMPROVE`) and generates a JSON object describing its plan.
3.  **Action:** The application parses the agent's JSON plan and executes it. This might involve running a tool's code, adding a new tool to the library, or updating an existing one.

## Key Components

### The Tools

Everything the agent can do is defined as a "tool". Even its core abilities are just tools that can be viewed and, theoretically, improved by the agent itself.

-   `Core Agent Logic`: This tool contains the fundamental system prompt for the main agent. It defines the "prime directive" and the agent's core personality.
-   `Tool Creator`: This "meta-tool" contains the instructions and schema the agent must follow to create a *new* tool. By making this a tool, the agent could someday learn to improve its own creation process.
-   `Tool Improver`: This "meta-tool" contains the instructions for improving an *existing* tool. This is the key to recursive self-improvement.
-   **Functional & UI Tools:** All other tools that the agent creates or starts with, from a simple `Calculator` to the components that render the application's UI.

### The Self-Improvement Loop In Action

This is the most important concept to test.

1.  **Creation:** Give the agent a simple task it can't do, like:
    > `calculate 2+2`

    The agent should recognize it lacks a calculator, and its response should be `action: "CREATE"`. It will generate a new `Calculator` tool.

2.  **Execution:** After the calculator is created, submit the same prompt again:
    > `calculate 2+2`

    This time, the agent should find the tool and respond with `action: "EXECUTE_EXISTING"`, providing the correct answer.

3.  **Improvement:** Now, ask for an enhancement that the current tool cannot handle:
    > `add a square root function to the calculator`

    The agent should identify the `Calculator` tool and respond with `action: "IMPROVE_EXISTING"`. It will rewrite the tool's `implementationCode` to add the new functionality and increase its version number.

## The Future Vision

The current implementation is pre-seeded with a few essential meta-tools to accelerate development. However, the true vision is to reduce the system to a single seed tool: the `Tool Creator`. From that one starting point, a sufficiently advanced agent would be prompted to create the `Tool Improver`, then the `Tool Retriever`, and eventually build its entire operating system from scratch.

---

## How to Run Locally

**Prerequisites:** [Node.js](https://nodejs.org/)

1.  **Install dependencies:**
    ```bash
    npm install
    ```
2.  **Configure Models:**
    -   **For Google AI Models:** You can provide your API key in two ways. The in-app configuration takes precedence over the environment variable.
        -   *Method 1 (Environment Variable):* You can set a `GEMINI_API_KEY` environment variable. The application will use this key if no key is entered in the UI. This method requires a development server (like Vite) that exposes environment variables to the browser.
        -   *Method 2 (In-App UI):* Select a Gemini model from the dropdown. The "API Configuration" section will appear. Enter your API Key there. This is the most direct method and stores the key in your browser's local storage.
    -   **For other API-based Models (OpenAI, Ollama):** Select a model from the dropdown. The "API Configuration" section will appear. Enter your API Key and/or endpoint URL there.
    -   **For Hugging Face (In-Browser) Models:** Select a model from the "HuggingFace" group. The "Hugging Face Configuration" panel will appear, allowing you to choose an execution device (WebGPU or WASM). The first time you run a request, the model (several hundred MB) will be downloaded and cached by your browser.

3.  **Run the development server:**
    ```bash
    npm run dev
    ```
This will start the development server, and you can view the application in your browser at the local URL provided in your terminal (usually `http://localhost:5173` or similar).
