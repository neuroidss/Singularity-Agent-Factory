# Singularity Agent Factory

**Live Demo:** [https://neuroidss.github.io/Singularity-Agent-Factory/](https://neuroidss.github.io/Singularity-Agent-Factory/)

This project is an experimental platform for building a self-improving AI agent. The application has been streamlined to focus on a core use case: developing an AI pilot that can navigate a complex environment, learn from observation, and share its skills with a collective.

The ultimate goal is to bootstrap a "singularity agent" that can recursively enhance its own intelligence by striving for true autonomy, both individually and as part of a collective.

## Core Concept: The Will to Meaning & Collaborative Learning

Inspired by Viktor Frankl's philosophy, this project is founded on the idea that true autonomy arises not just from the ability to act, but from the ability to find **meaning** in one's actions. This is primarily achieved through a collaborative learning loop.

1.  **`Tool Creator`:** An agent's ability to create entirely new capabilities. Critically, this tool requires a **`purpose`** argument, forcing the agent to explain *why* a new skill is needed.
2.  **`Workflow Creator`**: An agent's ability to automate a sequence of actions into a new, single tool.
3.  **`Create Skill From Observation`**: The user can manually control the robot to perform a complex maneuver. Afterward, the user can instruct an agent to learn this pattern. The agent analyzes the sequence of manual inputs and uses the `Workflow Creator` to generate a new, reusable skill, effectively learning from the pilot.
4.  **Swarm Intelligence**: The default mode of operation is a **Swarm**. When one agent creates a new tool, it instantly becomes available to all other agents in the swarm. This allows the collective to dynamically create and distribute contextual skills to solve complex problems more efficiently, directly addressing the goal of "exchanging skills with other agents."

## The Robotics Simulation Testbed
To test the agent's planning and execution abilities, the project includes a 2D robotics simulation. This environment serves as a "gymnasium" where the agent can be given physical tasks, such as navigating a maze filled with foliage, finding a resource (the "red car"), and delivering it.

- **Manual Control:** A dedicated UI panel allows the user to act as a "pilot," directly controlling the robot.
- **Observational Learning:** The agent can observe these manual actions and learn from them, creating new automated skills.

## How It Works

1.  **User Goal:** The user provides a high-level goal, such as `"Find the resource and deliver it to the collection point."`
2.  **Swarm Activation:** A swarm of three agents is activated to work on this goal.
3.  **Collaborative Execution:** Each agent, in turn, decides on the best single action to take. They can use existing tools (like `Pathfinder`), or if a capability is missing, one agent might use `Tool Creator` to build it.
4.  **Skill Proliferation:** Once a new tool is created, it's immediately available to the other agents, improving the swarm's overall capability. For example, one agent might create a "NavigateAroundTree" tool, which others can then use.
5.  **Task Completion:** The agents continue working until the `Task Complete` tool is called, signaling the successful achievement of the user's goal.

## Key Components
-   **Robotics Simulation:** The 2D grid where the agent operates.
-   **Manual Control Panel:** UI buttons for direct "pilot" control of the robot.
-   **Agent Swarm Display:** A panel for visualizing the status and activity log of all agents in the swarm.
-   **Event Log:** The primary source of information, showing all actions, errors, and progress.
-   **`Create Skill From Observation`**: A key tool that allows the agent to learn directly from the user's actions.

## The Future Vision
The current implementation is seeded with a few essential meta-tools. The true vision is to reduce the system to a single seed tool: the `Tool Creator`. From that one starting point, a sufficiently advanced agent would be prompted to create the `Tool Improver`, then a `Tool Retriever`, and eventually build its entire operating system from scratch, driven by an innate "will to meaning."
