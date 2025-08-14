# Singularity Agent Factory

**Live Demo:** [https://neuroidss.github.io/Singularity-Agent-Factory/](https://neuroidss.github.io/Singularity-Agent-Factory/)

This project is an experimental, browser-first platform for building a self-improving AI agent swarm. The system is designed around a purpose-driven architecture where agents resolve user requests by identifying and processing "deltas"—the gap between the current reality and a desired potential. It dynamically evolves its own capabilities by creating new tools and automating complex workflows, with the ultimate goal of bootstrapping a recursively self-improving "singularity agent."

The application demonstrates these concepts across multiple complex domains, including **automated hardware engineering (KiCad PCB Design)**, **robotics simulation**, and **long-term strategic planning** via a knowledge graph.

## Key Features

*   **Self-Improving Swarm:** The core evolutionary loop allows agents to create new tools (`Tool Creator`) and codify multi-step processes into automated workflows (`Workflow Creator`), permanently expanding the system's capabilities.
*   **Multi-Domain Capability:**
    *   **KiCad EDA:** An entire PCB design workflow, from natural language prompt to fabrication-ready files, is automated by the agent.
    *   **Robotics Simulation:** A 3D environment where agents can be defined with unique behaviors, controlled manually, and observed by the swarm to learn new skills.
    *   **Strategic Memory:** A persistent knowledge graph allows the agent to build long-term plans and "Directives" that transcend single tasks.
*   **Learning from Observation:** A human can "pilot" a robot agent through a sequence of actions. The AI can then observe this history and automatically create a new, reusable skill (`Create Skill From Observation`).
*   **Dynamic Tool Context:** Using in-browser sentence embeddings, the system filters a vast library of tools to provide the agent with only the most relevant capabilities for the task at hand, improving focus and performance.
*   **Pluggable AI Brains:** Supports multiple AI model providers, including Google Gemini, any OpenAI-compatible API (like a local Ollama server), and fully in-browser HuggingFace transformer models.
*   **Client-First, Server-Optional:** The entire application runs as a self-contained demo in the browser (no installation needed). An optional Node.js backend can be run to unlock the agent's full potential, allowing it to write files and execute local code (e.g., Python scripts for real KiCad automation).

## The Agent Constitution

Agent behavior is not hard-coded but guided by a formal constitution. This provides a robust framework for an AI that can manage its own evolution. Key principles include:

1.  **Delta-Driven Execution**: The agent doesn't just execute a plan. It identifies and resolves "Deltas"—the gap between the current reality and a potential future. A user's request is the initial Delta; a missing tool is an "Evolutionary Delta."

2.  **Evolution is the Prime Directive**: The agent's primary way to solve novel problems is to evolve the system itself. If a capability is missing, its highest priority is to create a new tool.

3.  **Strategic Cognition**: Agents operate on two levels: tactical (solving the immediate problem) and strategic (pursuing long-term goals, or "Directives"). These Directives are stored in a persistent knowledge graph, forming the agent's long-term memory.

4.  **Distributed Capabilities**: When one agent creates a new tool, it instantly becomes available to all other agents. This allows the collective to dynamically create and distribute contextual skills, making the entire system more capable.

## Application Modules

*   **KiCad EDA Panel:** The main interface for the hardware engineering workflow. Provide a high-level prompt, and watch the agent define components, create a netlist, arrange the board, and generate fabrication files.
*   **Robotics Simulation Panel:** A 3D environment for defining robot agents with different personalities (e.g., 'patroller', 'resource_collector'). Pilot an agent to teach the swarm, then command the swarm to execute the learned skill.
*   **Knowledge Graph Viewer:** A 3D visualization of the agent's "mind." See the Directives, concepts, and relationships it has stored in its long-term strategic memory.

---

## Getting Started (Client-Only Demo)

Simply open the `index.html` file in a modern web browser (like Chrome or Edge). Everything you need for the simulated, in-browser experience is included.

## Running the Full Stack (Optional)

To unlock the agent's ability to interact with your local file system and execute code (e.g., running Python scripts to control the real KiCad), you can run the optional backend server.

**Prerequisites:**
*   Node.js and npm
*   Python 3 and `venv`

**Setup:**
1.  Navigate to the `server/` directory.
2.  Rename `install.sh.txt` to `install.sh` and make it executable (`chmod +x install.sh`).
3.  Run the installation script: `./install.sh`. This will install Node dependencies and create a Python virtual environment with required packages.
4.  Rename `start.sh.txt` to `start.sh` and make it executable (`chmod +x start.sh`).

**Execution:**
*   Run `./start.sh` from the `server/` directory to launch the backend.
*   The frontend application will automatically detect the server and enable server-side tools.

> **Security Warning:** The backend server is designed to execute code based on AI-generated commands. It is a powerful tool for agent development but should **never** be exposed to the internet.

