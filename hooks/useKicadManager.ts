


import React, { useState, useCallback, useRef, useEffect } from 'react';
import type { WorkflowStep, AIToolCall, EnrichedAIResponse, LLMTool, KnowledgeGraphNode, KnowledgeGraphEdge, MainView, KnowledgeGraph } from '../types';
import { TEST_LAYOUT_DATA } from '../bootstrap/test_layout_data';

type UseKicadManagerProps = {
    logEvent: (message: string) => void;
    startSwarmTask: (params: { task: any, systemPrompt: string | null, sequential?: boolean, resume?: boolean, allTools: LLMTool[] }) => Promise<void>;
    allTools: LLMTool[];
};

type Subtask = { name: string; status: 'pending' | 'completed' };
type WorkflowStepState = {
    name: string;
    keywords: string[];
    status: 'pending' | 'in-progress' | 'completed';
    subtasks: Subtask[];
};

const INITIAL_WORKFLOW_STEPS: WorkflowStepState[] = [
    { name: "Pre-analysis & Search", keywords: ["performing web search"], status: 'pending', subtasks: [] },
    { name: "Define Components", keywords: ["define kicad component", "component defined"], status: 'pending', subtasks: [] },
    { name: "Define Nets & Constraints", keywords: ["define kicad net", "define placement constraint", "net defined", "constraint defined"], status: 'pending', subtasks: [] },
    { name: "Generate Netlist", keywords: ["generate kicad netlist", "netlist generated successfully", "_netlist.net"], status: 'pending', subtasks: [] },
    { name: "Create & Arrange PCB", keywords: ["create initial pcb", "arrange components", "update kicad component positions"], status: 'pending', subtasks: [] },
    { name: "Autoroute PCB", keywords: ["autoroute pcb"], status: 'pending', subtasks: [] },
    { name: "Export Fabrication Files", keywords: ["export fabrication files"], status: 'pending', subtasks: [] },
    { name: "Task Complete", keywords: ["task completed", "fabrication successful"], status: 'pending', subtasks: [] }
];

const getKicadSystemPrompt = (projectName: string) => `
You are a world-class KiCad automation engineer. Your sole responsibility is to convert a user's request into a precise sequence of tool calls to design and export a PCB.

**Execution Protocol: The KiCad Workflow**
You MUST follow this workflow precisely. Your primary task is to check the action history to determine which step to perform next and generate a plan for ALL subsequent steps.

1.  **Phase 1: Schematic Definition**
    *   First, call \`Update Workflow Checklist\` to outline the components and nets you will define.
    *   Call \`Define KiCad Component\` for EVERY SINGLE component.
    *   Call \`Define KiCad Net\` for EVERY SINGLE electrical connection.
    *   Call \`Define KiCad Placement Constraint\` for any required mechanical constraints.

2.  **Phase 2: Board Setup**
    *   Call \`Generate KiCad Netlist\` to consolidate the schematic.
    *   Call \`Create Initial PCB\` to create the board file.
    *   Call \`Create Board Outline\` to define the physical board shape.

3.  **Phase 3: Physical Layout**
    *   Call \`Arrange Components\`. The system will automatically handle this step and may pause for user input. When you are re-invoked, this step will be in the history.
    *   Call \`Autoroute PCB\` to create the electrical traces.

4.  **Phase 4: Finalization**
    *   Call \`Export Fabrication Files\` to generate manufacturing data.
    *   **Crucial Final Step:** You MUST call \`Task Complete\`. This signals the successful end of the entire design process.

**Mandatory Directives:**
*   **GENERATE THE REMAINING SEQUENCE:** Your output MUST be a single JSON array of tool calls for all steps that have NOT yet been completed. The system will execute them sequentially.
*   **CHECK THE ACTION HISTORY:** This is your most important directive. Before acting, review the history to see what was last done. DO NOT REPEAT completed steps.
*   **USE THE PROJECT NAME:** Every tool call that requires a project name must use this exact name: \`${projectName}\`.
*   **BE CONCRETE:** If the user's request is abstract (e.g., "make a board for an LED"), you must derive the specific components (resistor, LED, connector), nets, and values required, then generate the concrete tool calls. Use common sense engineering principles.
`;


export const useKicadManager = (props: UseKicadManagerProps) => {
    const { logEvent, startSwarmTask, allTools } = props;

    const [pcbArtifacts, setPcbArtifacts] = useState<{ boardName: string, glbPath: string, fabZipPath: string } | null>(null);
    const [kicadLog, setKicadLog] = useState<string[]>([]);
    const [currentKicadArtifact, setCurrentKicadArtifact] = useState<{title: string, path: string | null, svgPath: string | null} | null>(null);
    const [isLayoutInteractive, setIsLayoutInteractive] = useState(true);
    const [currentLayoutData, setCurrentLayoutData] = useState<KnowledgeGraph | null>(TEST_LAYOUT_DATA);
    const [workflowSteps, setWorkflowSteps] = useState<WorkflowStepState[]>(INITIAL_WORKFLOW_STEPS);
    
    const currentProjectNameRef = useRef<string | null>(null);

    const logKicadEvent = useCallback((message: string) => {
        setKicadLog(prev => [...prev.slice(-99), message]);
    }, []);
    
    // Effect to update workflow progress based on logs
    useEffect(() => {
        // Do not update progress if we are paused for layout or have no logs
        if (currentLayoutData || kicadLog.length === 0) return;

        setWorkflowSteps(prevSteps => {
            const newSteps = JSON.parse(JSON.stringify(prevSteps));

            // Find the index of the latest step that has a corresponding log entry.
            let latestStepMentioned = -1;
            for (let i = newSteps.length - 1; i >= 0; i--) {
                const step = newSteps[i];
                const hasLog = kicadLog.some(log => {
                    const lowerLog = log.toLowerCase();
                    // Check for keywords OR if a subtask of this step is mentioned as completed
                    const subtaskCompleted = step.subtasks.some(st => lowerLog.includes(st.name.toLowerCase()) && (log.includes('✅') || log.includes('✔️')));
                    return step.keywords.some(kw => lowerLog.includes(kw)) || subtaskCompleted;
                });
                if (hasLog) {
                    latestStepMentioned = i;
                    break; // Found the latest one, no need to check earlier ones.
                }
            }
            
            // If we found any mentioned step, update statuses accordingly.
            if (latestStepMentioned !== -1) {
                for (let i = 0; i < newSteps.length; i++) {
                    if (i < latestStepMentioned) {
                        newSteps[i].status = 'completed';
                    } else if (i === latestStepMentioned) {
                        newSteps[i].status = 'in-progress';
                    } else {
                        // Keep future steps pending, don't revert them if they were different
                        if (newSteps[i].status !== 'pending') {
                           newSteps[i].status = 'pending';
                        }
                    }
                }
            } else if (kicadLog.length > 1) { // Check if logs have started coming in
                 if(newSteps[0].status === 'pending') newSteps[0].status = 'in-progress';
            }


            // Now, for the current 'in-progress' step, update its subtasks.
            const currentStep = newSteps.find(s => s.status === 'in-progress');
            if (currentStep && currentStep.subtasks.length > 0) {
                currentStep.subtasks.forEach(subtask => {
                    if (subtask.status === 'pending') {
                        const completed = kicadLog.some(log => 
                            log.toLowerCase().includes(subtask.name.toLowerCase()) && 
                            (log.includes('✅') || log.includes('✔️') || log.toLowerCase().includes('defined'))
                        );
                        if (completed) subtask.status = 'completed';
                    }
                });
            }
            
            const lastStep = newSteps[newSteps.length - 1];
            const isTaskComplete = kicadLog.some(log => {
                const lowerLog = log.toLowerCase();
                return lastStep.keywords.some(kw => lowerLog.includes(kw));
            });

            if (isTaskComplete) {
                newSteps.forEach(s => s.status = 'completed');
            }

            if (JSON.stringify(newSteps) === JSON.stringify(prevSteps)) {
                return prevSteps;
            }

            return newSteps;
        });
    }, [kicadLog, currentLayoutData]);


    const handleStartKicadTask = useCallback(async (payload: { prompt: string; files: any[]; urls: string[]; useSearch: boolean; }) => {
        // Reset all states for the new task
        setKicadLog(['[INFO] Initializing workflow...']);
        setCurrentLayoutData(null);
        setPcbArtifacts(null);
        setCurrentKicadArtifact(null);
        setIsLayoutInteractive(true);
        setWorkflowSteps(INITIAL_WORKFLOW_STEPS.map(s => ({...s, status: 'pending', subtasks: []})));
        
        const projectName = `brd_${Date.now()}`;
        currentProjectNameRef.current = projectName;
        logKicadEvent(`🚀 Starting KiCad Generation Swarm...`);
        logKicadEvent(`Project name set to: ${projectName}`);
    
        const nonEmptyUrls = payload.urls.filter(u => u.trim() !== '');
        const augmentedPrompt = `${payload.prompt}\n\n${nonEmptyUrls.length > 0 ? `Reference URLs:\n${nonEmptyUrls.join('\n')}` : ''}`;

        const taskPayload = {
            userRequest: {
                text: augmentedPrompt,
                files: payload.files,
            },
            useSearch: payload.useSearch,
            projectName: projectName,
        };

        await startSwarmTask({
            task: taskPayload,
            systemPrompt: getKicadSystemPrompt(projectName),
            sequential: true,
            allTools: allTools,
        });

    }, [logKicadEvent, startSwarmTask, allTools]);
    
    const setCurrentProjectName = (name: string) => {
        currentProjectNameRef.current = name;
    };
    
    const updateWorkflowChecklist = useCallback((stepName: string, items: any) => {
        setWorkflowSteps(prevSteps => {
            const newSteps = [...prevSteps];
            const stepIndex = newSteps.findIndex(s => s.name === stepName);
            if (stepIndex !== -1) {
                let parsedItems = items;
                // Defensively parse if items is a stringified JSON array
                if (typeof parsedItems === 'string') {
                    try {
                        parsedItems = JSON.parse(parsedItems);
                    } catch (e) {
                        // Not a valid JSON string, will be handled by the Array.isArray check below.
                    }
                }

                if (Array.isArray(parsedItems)) {
                    newSteps[stepIndex].subtasks = parsedItems.map(item => ({ name: String(item), status: 'pending' }));
                } else {
                    console.warn(`Update Workflow Checklist: received non-array 'items' for step "${stepName}". Received:`, items);
                    newSteps[stepIndex].subtasks = []; // Default to empty array to prevent crash
                }
            }
            return newSteps;
        });
    }, []);

    return {
        state: {
            pcbArtifacts,
            kicadLog,
            currentKicadArtifact,
            isLayoutInteractive,
            currentLayoutData,
            workflowSteps,
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
            updateWorkflowChecklist,
        },
        logKicadEvent,
        currentProjectNameRef,
        getKicadSystemPrompt,
    };
};