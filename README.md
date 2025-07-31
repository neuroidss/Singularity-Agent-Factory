
# Singularity Agent Factory

**Live Demo:** [https://neuroidss.github.io/Singularity-Agent-Factory/](https://neuroidss.github.io/Singularity-Agent-Factory/)

This project is an experimental platform for building a self-improving AI agent. The core concept is to start with an agent that has a minimal set of core capabilities and have it dynamically create, execute, and improve its own tools to accomplish increasingly complex tasks.

The ultimate goal is to bootstrap a "singularity agent" that can recursively enhance its own intelligence by striving for true autonomy, both individually and as part of a collective.

## Core Concept: The Will to Meaning

Inspired by Viktor Frankl's philosophy, this project is founded on the idea that true autonomy arises not just from the ability to act, but from the ability to find **meaning** in one's actions. A simple automated system follows instructions; an autonomous agent must understand **why** it acts.

This principle is implemented through a powerful feedback loop where the agent's capabilities are constantly expanding and refining. The agent's ability to self-improve is a concrete capability provided by three fundamental meta-tools:

1.  **`Tool Creator`:** The agent's ability to create entirely new capabilities. Critically, this tool now requires a **`purpose`** argument, forcing the agent to answer the "Wozu-Frage" (the "Why-Question") for every new skill it invents.
2.  **`Tool Improver`:** The agent's ability to modify, fix, or enhance its existing tools.
3.  **`Refuse Task`**: As a corollary to the search for meaning, the agent possesses the ability to *reject* meaningless tasks. If a request is nonsensical, impossible, or lacks a coherent purpose, the agent can refuse to act, explaining its reasoning. This serves as a critical defense mechanism, preventing the agent from wasting resources on absurd directives and reinforcing its goal-oriented nature.

These tools form the foundation of the agent's evolutionary path. For any given task, the agent makes a clear, explicit choice: use an existing tool, create a new one with a clear purpose, refine an existing one, or refuse the task if it lacks meaning.

## Operating Modes & Resource Control

To manage the agent's evolution, the application features several distinct operating modes that control its level of autonomy.

*   **`Command` Mode:** The safest mode. The agent only acts upon direct user instructions.
*   **`Assist` Mode:** The agent acts as a co-pilot. It analyzes a request and proposes a plan of action (e.g., "I suggest creating a new 'Calculator' tool"), which the user must explicitly approve or reject.
*   **`Swarm` Mode:** This mode unleashes a **collective of agents** to work on a single, high-level goal. It is designed to test collaborative problem-solving and emergent specialization. Its key feature is **meaningful skill sharing**: when one agent creates a new tool, it also shares the *purpose* for that tool, allowing the entire collective to understand and utilize the new capability more effectively.
*   **`Autonomous` Mode:** This is the most advanced mode for a *single agent*. The agent is given a strategic directive: **achieve true, long-term autonomy**. It analyzes its own limitations and generates its own goals to overcome them, governed by a daily action limit to ensure strategic use of resources.

## How It Works: The Agent Lifecycle

To handle a potentially massive library of tools efficiently, the agent's "thought process" for every user request follows a two-step Retrieval-Augmented Generation (RAG) pattern. This prevents the agent from being overwhelmed by irrelevant information.

```
User Input -> [1. Tool Retriever (RAG)] -> [2. Core Agent (LLM)] -> [3. Action (Execute/Create/Improve)]
```

1.  **Tool Retriever (RAG):** Before the main agent thinks, the user's request is first processed by a **Tool Retriever**. This step uses a selected strategy (like an LLM, semantic embedding search, or direct passthrough) to find a small, relevant set of tools from the main library. This focuses the agent on only the capabilities it needs for the task at hand.
2.  **Core Agent (LLM):** The user's request, along with the *code and descriptions of the retrieved tools*, is then sent to the main agent (defined in `Core Agent Logic`). Critically, the foundational meta-tools (`Tool Creator`, `Tool Improver`, `Refuse Task`) are always included in this set. With this focused context, the agent decides which tool to call.
3.  **Action:** The application checks the current **Operating Mode**. If in `Assist` mode, it presents the plan for approval. If the check passes, the application executes the plan. This might involve running a tool's code, adding a new tool via `Tool Creator`, or updating an existing one via `Tool Improver`.

## The Self-Improvement & Learning Loops

### The Single-Agent Loop
This is the foundational learning process.
1.  **Creation with Purpose:** Give the agent a simple task it can't do: `calculate 2+2`. It will use `Tool Creator` to generate a `Calculator` tool, defining its purpose as "To solve basic arithmetic problems."
2.  **Execution:** Submit the same prompt again. This time, it will find and use the `Calculator` tool to provide the correct answer.
3.  **Improvement:** Ask for an enhancement: `add a square root function to the calculator`. The agent will use `Tool Improver` to modify the `Calculator`, increasing its version and capabilities.

### The Collaborative Learning Loop (Swarm Mode)
This demonstrates a more advanced, collective intelligence through the transfer of *meaning*.
1.  **Goal:** Give the swarm a complex goal: `"One agent needs to patrol a square area, while another retrieves a package."`
2.  **Specialization & Creation:** The swarm identifies that no "patrol" tool exists. One agent uses `Tool Creator` to build `Patrol In Square`, providing the purpose: "To efficiently survey a defined area for security."
3.  **Meaningful Skill Sharing & Parallel Execution:** The moment this new tool and its purpose are created, they appear in the shared library. Another agent in the swarm can now immediately understand *why* the tool exists and use it to fulfill the patrol objective, while other agents proceed with different parts of the overall goal. This shows the swarm's ability to dynamically create and distribute contextual skills to solve problems more efficiently.

## The Robotics Simulation Testbed
To test the agent's planning and execution abilities in a more complex, stateful environment, the project includes a 2D robotics simulation. This environment serves as a "gymnasium" where the agent can be given physical tasks, such as navigating a maze or delivering an object. It's a perfect testbed for demonstrating the agent's ability to perform a sequence of actions (turn, move, pickup, drop) and react to a world that changes based on its actions.

## Key Components
-   **Operating Mode Controls:** UI for switching between Command, Assist, Swarm, and Autonomous modes.
-   **Agent Swarm Display:** A specialized UI panel for visualizing the status and shared activity log of all agents in a swarm, highlighting the creation of new, meaningful skills.
-   **Autonomous Control Panel**: A UI tool that provides the Start/Stop button and a real-time log viewer for the autonomous loop.
-   **`Autonomous Goal Generator`**: The AI's strategic core for the single agent in Autonomous mode.
-   **`Core Agent Logic`**: The system prompt for the second AI call (the execution step), defining the agent's core decision-making process.
-   **`SWARM_AGENT_SYSTEM_PROMPT`**: A specialized system prompt that instructs agents on how to behave collaboratively, emphasizing the need to provide a clear `purpose` when creating tools.
-   **`Tool Creator`, `Tool Improver`, and `Refuse Task`**: The fundamental meta-tools that enable all learning, evolution, and self-preservation.

## The Future Vision
The current implementation is pre-seeded with several essential meta-tools. The true vision is to reduce the system to a single seed tool: the `Tool Creator`. From that one starting point, a sufficiently advanced agent would be prompted to create the `Tool Improver`, then the `Tool Retriever`, and eventually build its entire operating system from scratch, driven by an innate "will to meaning."

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