
import React, { useState, useCallback, useRef, useEffect } from 'react';
import type { WorkflowStep, AIToolCall, EnrichedAIResponse, LLMTool, KnowledgeGraphNode, KnowledgeGraphEdge, MainView, KnowledgeGraph } from '../types';

type UseKicadManagerProps = {
    logEvent: (message: string) => void;
    startSwarmTask: (params: { task: any, systemPrompt: string | null }) => Promise<void>;
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

    const handleStartKicadTask = useCallback(async (payload: { prompt: string; files: any[]; urls: string[]; useSearch: boolean; }) => {
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
You MUST follow this sequence of operations. Check the action history to see what the previous agent did, and perform the NEXT logical step(s).

1.  **Define ALL Components (Parallel Execution):** Your first step MUST be to define every single component from the user's request. Call \`Define KiCad Component\` for all components in parallel in a single response.
2.  **Define ALL Placement Constraints (Parallel Execution):** If the request implies mechanical constraints (e.g., connectors must be X mm apart, circular layouts), define them using \`Define KiCad Placement Constraint\`. Do this after components are defined.
3.  **Define ALL Nets (Parallel Execution):** After all components and constraints are defined, define every single electrical net. Call \`Define KiCad Net\` for each net in parallel.
4.  **Generate Netlist:** After all components, constraints, and nets are defined, call \`Generate KiCad Netlist\`.
5.  **Create PCB & Arrange:** Call \`Create Initial PCB\`, then immediately call \`Arrange Components\`. You must decide if the agent should wait for user input (\`waitForUserInput: true\`) or proceed autonomously (\`waitForUserInput: false\`).
6.  **Create Board Outline:** After arrangement is committed, call \`Create Board Outline\`.
    *   You can specify a rectangular shape with \`boardWidthMillimeters\` and \`boardHeightMillimeters\`.
    *   **NEW:** You can create a circular board by setting \`shape='circle'\` and providing \`diameterMillimeters\`.
    *   If you omit dimensions, the tool will automatically create an outline that fits all components.
7.  **Autoroute:** After the outline is created, the next step is to call \`Autoroute PCB\`.
8.  **Export:** Finally, call \`Export Fabrication Files\`.
9.  **Task Complete:** After exporting, you MUST call the \`Task Complete\` tool.

## Critical Instructions
*   **Mezzanine Boards:** If asked to design a mezzanine or shield for a board like an Arduino or Seeed Xiao, DO NOT place the main board itself. INSTEAD, add standard 2.54mm pin header components (e.g., from the 'Connector_PinHeader_2.54mm' library) to represent the connection points. Connect the nets to these headers.
*   **Circular Layouts:** For circular layouts (e.g., placing pogo pins in a ring), you MUST calculate the (x, y) coordinates for each component using trigonometry and apply them with \`Define KiCad Placement Constraint\`. Define a radius and calculate \`x = radius * cos(angle)\` and \`y = radius * sin(angle)\` for each component, incrementing the angle.
*   **PARALLELISM:** When a step can be broken down into independent actions (like defining multiple components), you MUST call the relevant tool for all actions in parallel in a single turn.
*   **PROJECT NAME:** You MUST use the exact 'projectName' provided for ALL tool calls.
*   **CHECK HISTORY:** Carefully review the swarm's action history to determine what has already been done. DO NOT repeat a step.
`;
    
        const nonEmptyUrls = payload.urls.filter(u => u.trim() !== '');
        const augmentedPrompt = `${payload.prompt}\n\n${nonEmptyUrls.length > 0 ? `Reference URLs:\n${nonEmptyUrls.join('\n')}` : ''}`;

        const taskPayload = {
            userRequest: {
                text: augmentedPrompt,
                files: payload.files, // Already base64 encoded
            },
            useSearch: payload.useSearch,
            projectName: projectName,
        };

        await startSwarmTask({ task: taskPayload, systemPrompt: kicadSystemPrompt });

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
