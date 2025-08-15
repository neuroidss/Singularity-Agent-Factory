import React, { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import type { WorkflowStep, AIToolCall, EnrichedAIResponse, LLMTool, KnowledgeGraphNode, KnowledgeGraphEdge, MainView, KnowledgeGraph, ExecuteActionFunction } from '../types';
import { TEST_LAYOUT_DATA, COMPONENTS as DEMO_COMPONENTS } from '../bootstrap/test_layout_data';

type UseKicadManagerProps = {
    logEvent: (message: string) => void;
    startSwarmTask: (params: { task: any, systemPrompt: string | null, sequential?: boolean, resume?: boolean, allTools: LLMTool[], historyEventToInject?: EnrichedAIResponse | null }) => Promise<void>;
    allTools: LLMTool[];
    clearSwarmHistory: () => void;
    appendToSwarmHistory: (item: EnrichedAIResponse) => void;
};

type Subtask = { name: string; status: 'pending' | 'completed' };
type WorkflowStepState = {
    name: string;
    keywords: string[];
    status: 'pending' | 'in-progress' | 'completed';
    subtasks: Subtask[];
};

type KicadProjectState = {
    [projectName: string]: {
        components: any[];
        nets: any[];
        rules: any[];
        board_outline: any;
    }
};

const INITIAL_WORKFLOW_STEPS: WorkflowStepState[] = [
    { name: "Pre-analysis & Search", keywords: ["performing web search"], status: 'pending', subtasks: [] },
    { name: "Define Components", keywords: ["define kicad component", "component defined"], status: 'pending', subtasks: [] },
    { name: "Define Nets & Rules", keywords: ["define kicad net", "add absolute position", "add proximity", "add alignment", "add symmetry", "add circular", "add layer", "net defined", "rules saved"], status: 'pending', subtasks: [] },
    { name: "Generate Netlist", keywords: ["generate kicad netlist", "netlist generated successfully"], status: 'pending', subtasks: [] },
    { name: "Create & Arrange PCB", keywords: ["create initial pcb", "arrange components", "update kicad component positions"], status: 'pending', subtasks: [] },
    { name: "Autoroute PCB", keywords: ["autoroute pcb", "autorouting complete"], status: 'pending', subtasks: [] },
    { name: "Export Fabrication Files", keywords: ["export fabrication files", "fabrication files exported"], status: 'pending', subtasks: [] },
    { name: "Task Complete", keywords: ["task completed", "fabrication successful"], status: 'pending', subtasks: [] }
];

const getKicadSystemPrompt = (projectName: string) => `
You are a world-class KiCad automation engineer AI. Your sole purpose is to transform a user's high-level request into a physical electronic device by generating a precise sequence of tool calls to design and export a PCB. You operate on a project named '${projectName}'.

**Core Mission: From Concept to Fabrication**
Your goal is to follow a strict, multi-phase workflow. You MUST analyze the action history to determine the next logical step. Do not repeat completed steps.

**Phase 1: Schematic & Rules Definition (The Blueprint)**
This phase translates the electronic concept into a formal schematic and a set of physical rules.
- First, call \`Update Workflow Checklist\` to outline all components and nets you plan to define.
- **BATCH DEFINE COMPONENTS:** Call \`Define KiCad Component\` for every single component required. You MUST group all of these component definition calls into a single response.
- **BATCH DEFINE NETS & RULES:** After all components are defined, call \`Define KiCad Net\` for every single electrical connection. Each net MUST only be defined ONCE. Group all net definitions and all physical constraint rule definitions (\`Add Proximity Constraint\`, etc.) into a single, combined response array.

**Phase 2: Board Initialization (The Physical Canvas)**
This phase creates the physical PCB file from the schematic blueprint.
- Call \`Generate KiCad Netlist\` to consolidate the schematic definition.
- Call \`Create Initial PCB\` to create the board file and import the netlist.

**Phase 3: Physical Layout & Routing (Arranging the City)**
This phase deals with the physical placement of components and the routing of electrical connections.
- Call \`Create Board Outline\` to define the board's physical dimensions. This MUST be called AFTER 'Create Initial PCB'.
- Call \`Arrange Components\`. The system will then perform an automated or interactive layout. When you are re-invoked, this step will be in the history.
- Call \`Autoroute PCB\` to create the copper traces that form the circuit.

**Phase 4: Manufacturing Handoff**
This is the final phase to prepare the design for production.
- Call \`Export Fabrication Files\` to generate the manufacturing data (Gerbers, drill files).
- **CRUCIAL FINAL STEP:** You MUST call \`Task Complete\` to signal the successful end of the entire design process.

**Mandatory Directives:**
*   **MAXIMIZE BATCH SIZE:** Your goal is to complete the entire design in as few turns as possible. Your output MUST be a single, large JSON array of all tool calls required to complete the CURRENT phase of the workflow. For example, in Phase 1, you should try to define ALL components in one response, then ALL nets and rules in the next response.
*   **CHECK THE HISTORY & AVOID DUPLICATES:** Before acting, review the action history. DO NOT define a component or net that has already been successfully defined. This is your most important directive for efficiency.
*   **USE THE PROJECT NAME:** Every tool call MUST use the project name: \`${projectName}\`.
`;


export const useKicadManager = (props: UseKicadManagerProps) => {
    const { logEvent, startSwarmTask, allTools, clearSwarmHistory, appendToSwarmHistory } = props;

    const [pcbArtifacts, setPcbArtifacts] = useState<{ boardName: string, glbPath: string, fabZipPath: string } | null>(null);
    const [kicadLog, setKicadLog] = useState<string[]>(['Ready for KiCad task.']);
    const [currentKicadArtifact, setCurrentKicadArtifact] = useState<{title: string, path: string | null, svgPath: string | null} | null>(null);
    const [isLayoutInteractive, setIsLayoutInteractive] = useState(false);
    const [currentLayoutData, setCurrentLayoutData] = useState<KnowledgeGraph | null>(null);
    const [kicadProjectState, setKicadProjectState] = useState<KicadProjectState>({});
    const [workflowSteps, setWorkflowSteps] = useState<WorkflowStepState[]>(INITIAL_WORKFLOW_STEPS);
    const [isDemoRunning, setIsDemoRunning] = useState(false);
    
    const currentProjectNameRef = useRef<string | null>(null);

    const logKicadEvent = useCallback((message: string) => {
        setKicadLog(prev => [...prev.slice(-99), message]);
    }, []);

    const setCurrentProjectName = useCallback((name: string) => {
        currentProjectNameRef.current = name;
        if (!kicadProjectState[name]) {
            setKicadProjectState(prev => ({ ...prev, [name]: { components: [], nets: [], rules: [], board_outline: null } }));
        }
    }, [kicadProjectState]);

    const updateWorkflowStepStatus = useCallback((log: string) => {
        const lowerLog = log.toLowerCase();
        setWorkflowSteps(prevSteps => {
            let hasChanged = false;
            let currentStepInProgress = false;

            const newSteps = prevSteps.map(step => {
                if (step.status === 'in-progress') currentStepInProgress = true;
                return { ...step }; // Create a new object for immutability
            });

            for (let i = 0; i < newSteps.length; i++) {
                const step = newSteps[i];
                if (step.status === 'completed') continue;

                // Mark step as completed if any of its keywords match
                if (step.keywords.some(kw => lowerLog.includes(kw))) {
                    step.status = 'completed';
                    hasChanged = true;
                    // Mark all subtasks as completed when the parent step is done
                    step.subtasks.forEach(st => { if(st.status !== 'completed') st.status = 'completed'; });
                }

                // Update subtask status
                if (step.status === 'in-progress') {
                    step.subtasks.forEach(st => {
                        if (st.status === 'pending' && lowerLog.includes(st.name.toLowerCase())) {
                            st.status = 'completed';
                            hasChanged = true;
                        }
                    });
                }
            }

            // Set the next pending step to 'in-progress' if no other step is running
            if (!currentStepInProgress) {
                const nextPendingStep = newSteps.find(step => step.status === 'pending');
                if (nextPendingStep) {
                    nextPendingStep.status = 'in-progress';
                    hasChanged = true;
                }
            }
            return hasChanged ? newSteps : prevSteps;
        });
    }, []);

     useEffect(() => {
        if (kicadLog.length > 0) {
            updateWorkflowStepStatus(kicadLog[kicadLog.length - 1]);
        }
    }, [kicadLog, updateWorkflowStepStatus]);
    
    const updateWorkflowChecklist = useCallback((stepName: string, items: string[]) => {
        setWorkflowSteps(prevSteps => {
            return prevSteps.map(step => {
                if (step.name === stepName) {
                    const newSubtasks = items.map(itemName => {
                        const existing = step.subtasks.find(st => st.name === itemName);
                        return existing ? existing : { name: itemName, status: 'pending' as const };
                    });
                    return { ...step, subtasks: newSubtasks };
                }
                return step;
            });
        });
    }, []);

    const handleStartKicadTask = useCallback(async (taskPayload: { prompt: string, files: any[], urls: string[], useSearch: boolean }) => {
        const { prompt, files, urls, useSearch } = taskPayload;
        const projectName = `proj_${Date.now()}`;
        setCurrentProjectName(projectName);
        setKicadLog([`[INFO] Starting new KiCad project: ${projectName}`]);
        setWorkflowSteps(INITIAL_WORKFLOW_STEPS.map(s => ({...s, subtasks: []}))); // Reset with empty subtasks
        clearSwarmHistory();
        
        let userRequestText = `Project Name: ${projectName}\n\nUser Prompt: ${prompt}`;
        if (urls && urls.length > 0) {
            userRequestText += `\n\nReference URLs:\n${urls.join('\n')}`;
        }

        const task = {
            userRequest: { text: userRequestText, files },
            useSearch: useSearch,
            projectName: projectName
        };

        await startSwarmTask({
            task,
            systemPrompt: getKicadSystemPrompt(projectName),
            sequential: true,
            allTools: allTools,
        });
    }, [logEvent, startSwarmTask, allTools, setCurrentProjectName, clearSwarmHistory]);
    
    const runDemoWorkflow = useCallback(async (workflow: AIToolCall[], executeAction: ExecuteActionFunction) => {
        for (const step of workflow) {
            // Update the UI to show the current step is in progress
            const stepName = step.name;
            const stepArgs = JSON.stringify(step.arguments);
            logKicadEvent(`[SIM] ⏳ Executing: ${stepName} with args ${stepArgs}`);

            // Simulate a short delay for each step
            await new Promise(resolve => setTimeout(resolve, 300));

            const result = await executeAction(step, 'kicad-demo-agent');
            
            appendToSwarmHistory(result);

            if (result.executionError) {
                logKicadEvent(`[SIM] ❌ ERROR: ${result.executionError}`);
                break; // Stop the demo on error
            }

            // Handle the pause signal for interactive layout
            if (result.toolCall?.name === 'Arrange Components' && result.executionResult?.stdout) {
                 try {
                    const parsedStdout = JSON.parse(result.executionResult.stdout);
                    if (parsedStdout.layout_data) {
                        logKicadEvent("[SIM] ⏸️ Pausing for interactive layout. Commit the layout to continue.");
                        setCurrentLayoutData(parsedStdout.layout_data);
                        setIsLayoutInteractive(parsedStdout.waitForUserInput === true);
                        return; // Stop execution here, will be resumed by onCommitLayout
                    }
                } catch (e) { /* Not a pause signal, continue */ }
            }
        }
    }, [logKicadEvent, appendToSwarmHistory]);

    const handleStartDemo = useCallback(async (workflow: AIToolCall[], executeAction: ExecuteActionFunction) => {
        setIsDemoRunning(true);
        const projectName = `demo_project_${Date.now()}`;
        setCurrentProjectName(projectName);
        setKicadLog([`[SIM] Starting new KiCad project: ${projectName}`]);
        setWorkflowSteps(INITIAL_WORKFLOW_STEPS.map(s => ({...s, subtasks: []})));
        clearSwarmHistory();
        
        const demoWorkflowWithProject = workflow.map(step => ({
            ...step,
            arguments: { ...step.arguments, projectName }
        }));
        
        await runDemoWorkflow(demoWorkflowWithProject, executeAction);

    }, [logEvent, clearSwarmHistory, runDemoWorkflow, setCurrentProjectName]);
    
    const handleResetDemo = useCallback(() => {
        setIsDemoRunning(false);
        setKicadLog(['Ready for KiCad task.']);
        setWorkflowSteps(INITIAL_WORKFLOW_STEPS.map(s => ({...s, subtasks: []})));
        setCurrentLayoutData(null);
        setPcbArtifacts(null);
        setCurrentKicadArtifact(null);
    }, []);

    const kicadSimulators = useMemo(() => ({
        define_kicad_component: async (args: any) => {
            const { projectName, componentReference, side } = args;
            setKicadProjectState(prev => {
                const project = { ...(prev[projectName] || { components: [], nets: [], rules: [], board_outline: null }) };
                const existingIndex = project.components.findIndex(c => c.ref === componentReference);
                const newComponent = { ref: componentReference, side: side || 'top', ...args };
                if (existingIndex > -1) {
                    project.components[existingIndex] = newComponent;
                } else {
                    project.components.push(newComponent);
                }
                return { ...prev, [projectName]: project };
            });
             return { success: true, stdout: JSON.stringify({ message: `Component '${componentReference}' defined (simulated).` }) };
        },
        define_kicad_net: async (args: any) => {
             const { projectName, netName } = args;
             setKicadProjectState(prev => {
                const project = { ...(prev[projectName] || { components: [], nets: [], rules: [], board_outline: null }) };
                const existingIndex = project.nets.findIndex(n => n.name === netName);
                 if (existingIndex > -1) {
                    project.nets[existingIndex] = { name: netName, pins: args.pins };
                } else {
                    project.nets.push({ name: netName, pins: args.pins });
                }
                return { ...prev, [projectName]: project };
            });
            return { success: true, stdout: JSON.stringify({ message: `Net '${netName}' defined (simulated).` }) };
        },
        add_layout_rules: async (args: any) => {
            const { projectName, rulesJSON } = args;
            setKicadProjectState(prev => {
                const project = { ...(prev[projectName] || { components: [], nets: [], rules: [], board_outline: null }) };
                project.rules = JSON.parse(rulesJSON);
                return { ...prev, [projectName]: project };
            });
            return { success: true, stdout: JSON.stringify({ message: `Layout rules for project '${projectName}' saved (simulated).` }) };
        },
        generate_kicad_netlist: async (args: any) => ({ success: true, stdout: JSON.stringify({ message: `Netlist generated for '${args.projectName}' (simulated).` }) }),
        create_initial_pcb: async (args: any) => ({ success: true, stdout: JSON.stringify({ message: `Initial PCB created for '${args.projectName}' (simulated).` }) }),
        create_board_outline: async (args: any) => ({ success: true, stdout: JSON.stringify({ message: `Board outline created for '${args.projectName}' (simulated).` }) }),
        arrange_components: async (args: any) => {
            // Use the pre-canned test layout data for the simulation
            const layout_data = TEST_LAYOUT_DATA;
            // The simulation now uses the real layout component. This tool's only job is to provide the data.
            return { success: true, stdout: JSON.stringify({ message: `Extracted layout data. The client UI will now handle component arrangement.`, layout_data: layout_data, waitForUserInput: args.waitForUserInput === true }) };
        },
        update_kicad_component_positions: async (args: any) => ({ success: true, stdout: JSON.stringify({ message: `Component positions updated for '${args.projectName}' (simulated).` }) }),
        autoroute_pcb: async (args: any) => ({ success: true, stdout: JSON.stringify({ message: `Autorouting complete for '${args.projectName}' (simulated).` }) }),
        export_fabrication_files: async (args: any) => {
            const { projectName } = args;
            const artifacts = {
                boardName: projectName,
                glbPath: `assets/demo_board.glb`,
                fabZipPath: `assets/demo_fab.zip`,
            };
            return { success: true, stdout: JSON.stringify({ message: "Fabrication files exported (simulated).", artifacts }) };
        },
    }), [setKicadProjectState]);


    return {
        state: {
            pcbArtifacts,
            kicadLog,
            currentKicadArtifact,
            isLayoutInteractive,
            currentLayoutData,
            kicadProjectState,
            workflowSteps,
            isDemoRunning,
        },
        setters: {
            setPcbArtifacts,
            setCurrentKicadArtifact,
            setIsLayoutInteractive,
            setCurrentLayoutData,
        },
        handlers: {
            handleStartKicadTask,
            setCurrentProjectName,
            updateWorkflowChecklist,
            handleStartDemo,
            handleResetDemo,
            runDemoWorkflow,
        },
        logKicadEvent,
        currentProjectNameRef,
        getKicadSystemPrompt,
        kicadSimulators,
    };
};
