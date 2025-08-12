# Singularity Agent Factory

**Live Demo:** [https://neuroidss.github.io/Singularity-Agent-Factory/](https://neuroidss.github.io/Singularity-Agent-Factory/)

This project is an experimental platform for building a self-improving AI agent. The application has been streamlined to focus on a core use case: developing an AI pilot that can navigate a complex environment, learn from observation, and share its skills with a collective.

The ultimate goal is to bootstrap a "singularity agent" that can recursively enhance its own intelligence by striving for true autonomy, both individually and as part of a collective.

## Architecture: Frontend + Optional Backend

The system is composed of two main parts:
1.  **Frontend (this repository):** A React-based user interface that runs entirely in the browser. It handles all visualizations, user interactions, and the execution of client-side tools (UI, browser-based JavaScript). It can function completely standalone.
2.  **Backend (the `server` directory):** An **optional** Node.js server that acts as a "body" for the AI, allowing it to perform tasks that are impossible in a browser's sandbox. It provides the AI with two critical capabilities: writing files to disk and executing shell commands.

The frontend will automatically detect if the backend server is running. If not, it will default to a safe, **client-only mode**.

## Core Concept: Purpose-Driven Swarm Architecture

This project is founded on a set of principles for self-organization. This provides a robust framework for an AI that can manage its own evolution without direct human micromanagement.

1.  **Delta-Driven Execution**: The agent doesn't just execute a plan. It identifies and resolves "Deltas"—the gap between the current reality and a potential future. A user's request is the initial Delta. A missing tool is an "Evolutionary Delta." An inefficient process is an "Operational Delta."

2.  **Mandates, not Agents**: An agent process is not a monolithic entity. It is a process executing a "Mandate." The Mandate is a definition of work with a clear **Purpose** and **Accountabilities**. This separation means if one agent process fails, the Mandate's definition persists, and another process could theoretically execute it.

3.  **System Evolution is the Core Directive**: The agent's primary way to solve systemic problems (Evolutionary Deltas) is to evolve itself and the system.
    *   **`Tool Creator`**: If the agent lacks a capability, its highest priority is to resolve this delta by creating a new tool. This is a formal act of system evolution that permanently enhances the entire system.
    *   **`Workflow Creator`**: If the agent identifies a repetitive, inefficient process, it resolves this delta by creating a workflow, thus automating the pattern and freeing itself for more complex problems.

4.  **Distributed Authority & Capability Sets**: Sets of tools are treated as "Capability Sets" (e.g., KiCad tools, Robotics tools). The agent is guided to respect these sets, preventing chaotic cross-interference and promoting modular, specialized capabilities.

When one agent creates a new tool (on either client or server), it instantly becomes available to all other agents in the swarm. This allows the collective to dynamically create and distribute contextual skills, making the entire system more capable.

---

## Getting Started

### Option 1: Run in Browser Only (No Setup)
Simply open the `index.html` file in your browser. The application will run in client-only mode.

### Option 2: Run with the Backend Server (Full Functionality)
To enable server-side tools (like running local Python scripts), follow these simple steps.

1.  **Navigate to the `server` directory** in your terminal.

2.  **Prepare the setup scripts:** The setup scripts are provided as `.txt` files. Rename them and make them executable:
    ```bash
    mv install.sh.txt install.sh
    mv start.sh.txt start.sh
    chmod +x install.sh start.sh
    ```

3.  **Run the installation script:** This will install all Node.js and Python dependencies. (Requires Node.js, npm, Python, and pip).
    ```bash
    ./install.sh
    ```

4.  **Install Freerouting (Required for PCB Autorouting):**
    The new autorouting feature depends on the external `freerouting` Java application.
    - Download the JAR file from the official repository: [https://github.com/freerouting/freerouting/releases/latest](https://github.com/freerouting/freerouting/releases/latest)
    - Rename the downloaded file to `freerouting.jar`.
    - Place the `freerouting.jar` file inside the `server/scripts/` directory. The application is configured to find it there.

5.  **Start the server:**
    ```bash
    ./start.sh
    ```
    The server will start on `http://localhost:3001`.

6.  **Launch the Frontend:** Open `index.html` in your browser. It will automatically connect to the running server.

---

## Use Case: Audio Processing Testbed

To demonstrate the full client-server loop, the application includes an "Audio Testbed". This UI component allows you to:
1. Record audio from your microphone in the browser.
2. Send the audio file to the backend server.
3. The server then uses an AI-created tool (e.g., "Gemma Audio Processor") to execute a Python script on the audio file.
4. The result from the Python script is sent back to the browser and displayed.

**SECURITY WARNING:** The backend server is designed to execute arbitrary code and shell commands generated by an AI using Node.js's `child_process`. This is **EXTREMELY DANGEROUS** and grants the AI the ability to read/write files and run any command on the machine where the server is running. **DO NOT** expose this server to the internet or run it in a production environment without extreme caution and robust sandboxing. It is intended for local, experimental use only.