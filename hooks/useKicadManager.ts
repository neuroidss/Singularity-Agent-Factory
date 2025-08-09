
import React, { useState, useCallback, useRef, useEffect } from 'react';
import type { WorkflowStep, AIToolCall, EnrichedAIResponse, LLMTool, KnowledgeGraphNode, KnowledgeGraphEdge, MainView, KnowledgeGraph } from '../types';

type UseKicadManagerProps = {
    logEvent: (message: string) => void;
    startSwarmTask: (params: { task: string, systemPrompt: string | null }) => Promise<void>;
};

export const useKicadManager = (props: UseKicadManagerProps) => {
    const { logEvent, startSwarmTask } = props;

    const [pcbArtifacts, setPcbArtifacts] = useState<{ boardName: string, topImage: string, bottomImage: string, fabZipPath: string } | null>(null);
    const [kicadLog, setKicadLog] = useState<string[]>([]);
    const [currentKicadArtifact, setCurrentKicadArtifact] = useState<{title: string, path: string | null, svgPath: string | null} | null>(null);
    const [isLayoutInteractive, setIsLayoutInteractive] = useState(true);
    const [currentLayoutData, setCurrentLayoutData] = useState<KnowledgeGraph | null>(null);
    
    const currentProjectNameRef = useRef<string | null>(null);

    const logKicadEvent = useCallback((message: string) => {
        setKicadLog(prev => [...prev.slice(-99), message]);
    }, []);

    const handleStartKicadTask = useCallback(async (prompt: string) => {
        // Reset all states for the new task
        setKicadLog([]);
        setCurrentLayoutData(null);
        setPcbArtifacts(null);
        setCurrentKicadArtifact(null);
        setIsLayoutInteractive(true);
        
        const projectName = `brd_${Date.now()}`;
        currentProjectNameRef.current = projectName;
        logKicadEvent(`🚀 Starting KiCad Generation Swarm...`);
        logKicadEvent(`Project name set to: ${projectName}`);

        const kicadSystemPrompt = `
You are an expert KiCad automation engineer agent in a swarm. Your goal is to contribute to the creation of a PCB based on a user's request by calling one or more of the available KiCad tools.

## KiCad Workflow & Rules
You MUST follow this sequence of operations. Check the action history to see what the previous agent did, and perform the NEXT logical step(s). The KiCad tools are already installed on the server.

1.  **Define ALL Components (Parallel Execution):** Your first step MUST be to define every single component from the user's request. You can and SHOULD call \\\`Define KiCad Component\\\` for all components in parallel in a single response.
2.  **Define ALL Nets (Parallel Execution):** After all components are defined, you MUST define every single electrical net from the user's request. Call the \\\`Define KiCad Net\\\` tool for each net. This can be done in parallel.
3.  **Generate Netlist:** Once ALL components AND nets are defined, call \\\`Generate KiCad Netlist\\\`.
4.  **Create PCB:** After the netlist, call \\\`Create Initial PCB\\\`.
5.  **Arrange Components:** After creating the PCB, call \\\`Arrange Components\\\`. This step triggers the client-side layout. You must decide if the agent should wait for user input (\`waitForUserInput: true\`) or proceed autonomously (\`waitForUserInput: false\`).
6.  **Update Component Positions & Board Outline:** After the client-side layout is complete (either automatically or by the user clicking 'commit'), the agent will be re-invoked. This step is handled by the client, but the NEXT tool for the agent to call is **Autoroute PCB**.
7.  **Autoroute:** After arrangement is committed, call \\\`Autoroute PCB\\\`.
8.  **Export:** Finally, call \\\`Export Fabrication Files\\\`.
9.  **Task Complete:** After exporting, you MUST call the \\\`Task Complete\\\` tool to signal the end of the workflow.

## Critical Instructions
*   **PARALLELISM:** When a step can be broken down into independent actions (like defining multiple components or nets), you MUST call the relevant tool for each action in a single turn.
*   **PROJECT NAME:** You MUST use the exact 'projectName' provided for ALL tool calls. This is critical.
*   **ONE LOGICAL STEP:** Your job is to decide and execute the next logical set of actions. The swarm will handle the rest.
*   **CHECK HISTORY:** Carefully review the swarm's action history to determine what has already been done. DO NOT repeat a step.
`;
    
        const fullTaskPrompt = `User Request: "${prompt}"\n\nUse this project name for all steps: "${projectName}"`;

        await startSwarmTask({ task: fullTaskPrompt, systemPrompt: kicadSystemPrompt });

    }, [logKicadEvent, startSwarmTask]);
    
    const setCurrentProjectName = (name: string) => {
        currentProjectNameRef.current = name;
    };

    return {
        state: {
            pcbArtifacts,
            kicadLog,
            currentKicadArtifact,
            isLayoutInteractive,
            currentLayoutData,
        },
        setters: {
            setPcbArtifacts,
            setKicadLog,
            setCurrentKicadArtifact,
            setCurrentLayoutData,
            setIsLayoutInteractive,
        },
        handlers: {
            handleStartKicadTask,
            setCurrentProjectName,
        },
        logKicadEvent,
        currentProjectNameRef,
    };
};
