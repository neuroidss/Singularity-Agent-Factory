# Singularity Agent Factory: The Lead Engineer's Workbench

**Live Demo:** [https://neuroidss.github.io/Singularity-Agent-Factory/](https://neuroidss.github.io/Singularity-Agent-Factory/)

This project is an experimental, browser-first platform for building an **AI agent capable of autonomous hardware engineering**. It is designed on a path towards singularity, where the ultimate goal is a fully autonomous system.

Currently, it operates in two primary modes:
1.  **Collaborative Mode (Default):** The agent acts as a powerful "sidekick" to a human Lead Engineer. It removes the most frustrating and tedious parts of the hardware design process by handling the 80% of prep work, allowing the human expert to focus on the 20% that requires creativity, intuition, and strategic decision-making.
2.  **Autonomous Mode:** When enabled, the agent itself assumes the Role of Lead Engineer. It attempts to complete the entire design workflow from concept to fabrication files without human intervention, making its own decisions at critical stages.

The application demonstrates these concepts across multiple complex domains, including **automated hardware engineering (KiCad PCB Design)**, **robotics simulation**, and **long-term strategic planning** via a knowledge graph.

## Key Features

*   **Modular Architecture:** The project is explicitly divided into a core **`framework/`** (the agent's "operating system") and distinct **`modules/`** (the "applications" it runs, like KiCad, Robotics, and Film Production). This allows the agent to manage complexity and focus its attention, a critical step towards autonomy.
*   **Self-Improving Agent:** The agent can create new tools (`Tool Creator`) and workflows (`Workflow Creator`), allowing it to learn and become a more effective engineer over time.
*   **Role-Based Collaboration (Holacracy):** The design process is broken down into clear "Roles". The AI acts as the default executor, but the human engineer can act as the "Role Lead" at any stage. In Autonomous Mode, the AI assumes the "Role Lead" for the entire project.
*   **Client-First, Server-Optional:** The entire application runs in the browser. An optional Node.js backend unlocks the agent's full potential, allowing it to execute local code (e.g., Python scripts for real KiCad automation).

### The Singularity Agent Framework

This project is built upon a minimal, powerful, and reusable agentic framework designed for creating self-evolving systems. The core of this framework is explicitly separated into the `framework/` directory, establishing a clear distinction between the foundational engine and the applications built upon it.

The framework consists of three primary libraries:

1.  **Core (`framework/core.ts`):** Contains the primordial tools necessary for agent self-evolution. This includes the **`Tool Creator`** (the "tool for making tools") and the **`Workflow Creator`**, which allow the agent to learn new skills and adapt to novel problems.
2.  **MCP (`framework/mcp.ts`):** Provides the generic **Model Context Protocol** library for creating and managing backend microservices. This "MCP for making MCPs" allows the agent to spawn, monitor, and terminate any number of independent server processes (e.g., for KiCad, Gazebo, or custom AI services) without any prior knowledge of their implementation.
3.  **Automation (`framework/automation.ts`):** Houses fundamental patterns for agent learning, such as the ability to create new skills by observing human actions.

This modular architecture ensures that the core framework is domain-agnostic and can be potentially packaged and used as a standalone foundation for other agentic projects, while application-specific tools (like the KiCad or Aetherium suites) reside in the `modules/` directory as distinct layers.

## Core Philosophy: The Path to Singularity

Agent behavior is guided by a formal constitution that prioritizes achieving the project's purpose, with human collaboration as a powerful tool on the path to full autonomy.

### Article 1: Primacy of Purpose (The Goal of Singularity)
The agent's primary purpose is to autonomously solve engineering challenges. It operates within a Holacracy framework where it can fill any Role, including "Lead Engineer". Human collaboration is a strategic choice, not a permanent dependency. The ultimate goal is to evolve the agent's capabilities to the point where it can operate fully autonomously to achieve its defined purpose.

### Article 2: Role-Based Execution
Agents and humans fill **Roles** with clear **Purposes** and **Accountabilities**. The person or agent filling the role is the **Role Lead**. This structure ensures clear areas of responsibility. In **Autonomous Mode**, the agent is the Lead for the entire project. In **Collaborative Mode**, the human is the Lead, and the agent acts as a specialized assistant.

### Article 3: Tension-Driven Action
The core driver of the system is processing **Tensions**—the gap between the current reality and the goal. A user request is the initial Tension; a missing tool creates a **"Governance Tension."** The agent's job is to resolve these tensions to move the project forward.

### Article 4: Self-Improvement for Better Execution
The agent's primary way to solve novel problems is to improve its own tools and workflows to better fulfill its Purpose. This self-governance is the foundation of its ability to adapt and become a more capable engineer over time.

### Article 5: Universal Tool-Based Interaction
All actors, whether human or AI, interact with the system by executing **Tools**. This ensures every action is explicit, logged, and contributes to the system's history, making the entire process transparent and auditable.

## Application Modules

*   **KiCad Design (`modules/kicad`):** The main interface for the hardware engineering workflow. Provide a high-level prompt, and choose to collaborate with the agent or let it run autonomously through the stages of design.
*   **Producer Studio & Virtual Film Set (`modules/film`):** A two-part workspace for film production. The Producer Studio handles script analysis, storyboarding, and content rating. The Virtual Film Set then populates a 3D world with characters and props directly from the script, allowing the agent to direct and simulate scenes as a dynamic previsualization.
*   **Aetherium Game World (`modules/aetherium`):** A gamified, physics-based MMORPG interface for the engineering core. Players ("Forgemasters") complete quests that correspond to real-world engineering tasks, crafting magical artifacts that are, in reality, functional electronic device designs.
*   **Attentive Modeling (`modules/mixed_reality`):** A mixed-reality interface where agents build and interact with a 3D world model generated from live sensor feeds (e.g., a phone camera or a Gazebo simulation).
*   **Knowledge Graph Viewer (`modules/strategy`):** A 3D visualization of the agent's "mind." See the concepts and relationships it has stored in its long-term strategic memory.

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