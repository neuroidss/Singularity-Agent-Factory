

# Singularity Agent Factory

**Live Demo:** [https://neuroidss.github.io/Singularity-Agent-Factory/](https://neuroidss.github.io/Singularity-Agent-Factory/)

This project is an experimental platform for building a self-improving AI agent. The core concept is to start with an agent that has a minimal set of core capabilities and have it dynamically create, execute, and improve its own tools to accomplish increasingly complex tasks.

The ultimate goal is to bootstrap a "singularity agent" that can recursively enhance its own intelligence.

## Core Concept

The system is built around a powerful feedback loop where the agent's capabilities are constantly expanding and refining based on user interaction. The agent's ability to self-improve is not an abstract concept but a concrete capability provided by two fundamental, unchangeable meta-tools:

1.  **`Tool Creator`:** The agent's ability to create entirely new capabilities from scratch.
2.  **`Tool Improver`:** The agent's ability to modify, fix, or enhance its existing tools.

These two tools form the foundation of the agent's evolutionary path. For any given task, the agent makes a clear, explicit choice: use an existing tool, create a new one with `Tool Creator`, or refine an existing one with `Tool Improver`.

To ensure this cycle of self-improvement is never broken, the agent's core logic is designed to understand that the abilities to **CREATE** and **IMPROVE** are fundamental. The `Tool Creator` and `Tool Improver` are not just other tools in the list; they are permanent fixtures of the agent's capabilities, ensuring it is always ready to learn and evolve.

## How It Works: The Agent Lifecycle

The agent's "thought process" for every user request follows a Retrieval-Augmented Generation (RAG) pattern.

```
User Input -> [1. Tool Retriever (RAG)] -> [2. Core Agent (LLM)] -> [3. Action (Execute/Create/Improve)]
```

1.  **Tool Retriever (RAG):** The user's request is first sent to a "Tool Retriever" model. Its job is to analyze the request and select a small, relevant set of tools from the main tool library. This is crucial—the agent doesn't get overwhelmed with every tool at once, only the ones it needs for the task at hand. Critically, it always includes the foundational meta-tools (`Core Agent Logic`, `Tool Creator`, `Tool Improver`) for any request that requires an action.
2.  **Core Agent (LLM):** The user's request, along with the *code and descriptions of the retrieved tools*, is then sent to the main agent. The agent uses this context to decide which tool to call and generates a JSON object describing its plan.
3.  **Action:** The application parses the agent's JSON plan and executes it. This might involve running a tool's code, adding a new tool via `Tool Creator`, or updating an existing one via `Tool Improver`.

## Key Components

### The Tools

Everything the agent can do is defined as a "tool". Even its core abilities are just tools that can be viewed and, theoretically, improved by the agent itself.

-   `Core Agent Logic`: This tool contains the fundamental system prompt for the main agent. It defines the agent's core personality and decision-making process.
-   `Tool Creator`: This "meta-tool" allows the agent to create entirely new tools.
-   `Tool Improver`: This "meta-tool" allows the agent to modify and enhance existing tools, which is the key to recursive self-improvement.
-   **Functional & UI Tools:** All other tools that the agent creates or starts with, from a simple `Calculator` to the components that render the application's UI.

## The Self-Improvement Loop In Action

This is the most important concept to test.

1.  **Creation:** Give the agent a simple task it can't do:
    > `calculate 2+2`

    The agent should recognize it lacks a calculator and call the `Tool Creator` to generate a new `Calculator` tool.

2.  **Execution:** After the calculator is created, submit the same prompt again:
    > `calculate 2+2`

    This time, the agent should find the `Calculator` tool and call it to provide the correct answer.

3.  **Improvement:** Now, ask for an enhancement that the current tool cannot handle:
    > `add a square root function to the calculator`

    The agent should identify the `Calculator` tool and call the `Tool Improver`, providing the new `implementationCode` to add the new functionality and increase its version number.

### Guiding Complex Creation (The "Snake Game" Test)

For more complex tasks, like creating a `UI Component` for a game, the agent needs more explicit guidance. By default, an LLM may not understand the specific constraints of a React-based environment (e.g., it might try to generate HTML with `<script>` tags).

To solve this, the `Core Agent Logic` tool has been enhanced with specific rules for creating UI Components. It now instructs the agent to:
- Write valid JSX.
- Use React Hooks (`useState`, `useEffect`) for state and interactivity.
- Avoid invalid patterns like `<script>` tags or direct DOM manipulation.

This "teaching" process is a manual improvement to the agent's "brain," enabling it to successfully tackle more sophisticated creation tasks and continue its path toward self-sufficiency.

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