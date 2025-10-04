# Project Sentience: The Attentive Modeling Framework
_A Design Document for Mixed Reality World Generation_

## 1. Vision: A World Model as a Living Hypothesis

This framework introduces a new paradigm for the Singularity Agent: **Attentive Modeling**. It bridges the gap between purely virtual simulations (like the Robotics Lab) and the physical world. Instead of operating in a predefined environment, agents will build, refine, and interact with a 3D model of reality that is dynamically generated from a live, multimodal sensory stream.

The core principle is that the world model is a **living hypothesis**, not a static truth. Its fidelity is a direct function of attention.
*   **High Fidelity Focus:** Areas under direct observation (e.g., within a camera's field of view) are modeled in high detail.
*   **Abstracted Periphery:** Areas outside the focus are simplified, abstracted, or allowed to decay in certainty. The model acknowledges that the real world is constantly changing, and unobserved regions are inherently uncertain.

This approach mimics biological perception and allows for efficient, scalable world modeling that is always anchored to, but not limited by, immediate sensory data.

## 2. The Attentive Modeling Loop: Sense, Perceive, Model, Act

The framework operates on a continuous, four-stage loop:

1.  **Sense:** The system captures a multimodal data stream from a source, which can be a human-piloted device (like a phone) or an autonomous agent (like a drone). The planned inputs include:
    *   **Video Stream:** For object recognition, spatial mapping (SLAM/VIO), and texture capture.
    *   **Audio Stream:** For identifying sound sources, ambient noise analysis, and speech/command recognition.
    *   **Inertial Measurement Unit (IMU):** Accelerometer and gyroscope data for tracking the sensor's orientation and movement.

2.  **Perceive:** A specialized **"Observer" agent** processes the raw sensory stream. Its purpose is to translate data into understanding. Using multimodal LLMs, it will:
    *   Identify objects and their classifications (e.g., "a red car," "a desk," "a person speaking").
    *   Estimate spatial relationships and geometries.
    *   Detect changes, anomalies, or new information that contradicts the current world model.

3.  **Model:** Based on its perception, the Observer agent issues tool calls to update the shared **3D World Model**. This model is a dynamic scene graph where:
    *   Nodes are objects with properties: visual (mesh, texture), physical (mass, friction), and semantic (label: "chair", state: "empty").
    *   Elements have a **confidence score** that decays over time if they are not re-observed, representing the system's uncertainty.
    *   The model can handle separate, disconnected "chunks" of reality that the agent can later attempt to stitch together if a relationship is discovered.

4.  **Act (Hypothesize & Guide):** Other agents utilize the shared world model to perform high-level tasks. Their "actions" are often not direct manipulations but **requests for more information**.
    *   **Use Case: "Find the red car."**
        1.  An "Explorer" agent queries the world model. It sees a partial 3D map.
        2.  It identifies areas of high uncertainty or occlusion.
        3.  It issues a request to the sensor pilot (human or drone): "A potential target is occluded by the object labeled 'desk'. Please move the camera 2 meters to the left to gain a new perspective."
        4.  The sensor is moved, the Sense/Perceive/Model loop runs again, and the world model is updated with the new information.
    *   This transforms the system into a collaborative exploration tool, where AI agents guide the focus of a real-world sensor to achieve a goal.

## 3. From Mixed Reality to Real Autonomy

This framework provides a clear developmental path:

*   **Phase 1 (Human-in-the-Loop):** A human operator pilots a mobile device. Agents act as intelligent "co-pilots," guiding the human's attention to build the world model and achieve tasks.
*   **Phase 2 (Drone-in-the-Loop):** The human is replaced by a remote-controlled drone. The core loop remains the same, with agents providing navigational directives to the drone pilot.
*   **Phase 3 (Full Autonomy):** The pilot is replaced by an autonomous navigation agent. The entire swarm—Observers, Explorers, and Navigators—collaborates to map and interact with a real-world environment without direct human control.

This "Attentive Modeling" approach creates a powerful, scalable foundation for building agents that can understand, model, and ultimately operate within our complex physical reality.