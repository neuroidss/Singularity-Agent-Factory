
import React, { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import type { WorkflowStep, AIToolCall, EnrichedAIResponse, LLMTool, KnowledgeGraphNode, KnowledgeGraphEdge, MainView, KnowledgeGraph, ExecuteActionFunction } from '../types';
import { TEST_LAYOUT_DATA, COMPONENTS as DEMO_COMPONENTS } from '../bootstrap/test_layout_data';
import { DEMO_WORKFLOW } from '../bootstrap/demo_workflow';

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
type DemoStepStatus = { status: 'pending' | 'completed' | 'error', result?: string, error?: string };
type ExecutionState = 'idle' | 'running' | 'paused' | 'finished' | 'error';

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
    { name: "Export Fabrication Files", keywords: ["export fabrication files", "fabrication successful"], status: 'pending', subtasks: [] },
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
    
    // --- New state for interactive demo ---
    const [executionState, setExecutionState] = useState<ExecutionState>('idle');
    const [currentStepIndex, setCurrentStepIndex] = useState(0);
    const [demoStepStatuses, setDemoStepStatuses] = useState<DemoStepStatus[]>(() => DEMO_WORKFLOW.map(() => ({ status: 'pending' })));
    
    const currentProjectNameRef = useRef<string | null>(null);
    const executeActionRef = useRef<ExecuteActionFunction | null>(null);
    const lastTimestamp = useRef(performance.now());


    const logKicadEvent = useCallback((message: string) => {
        const now = performance.now();
        const delta = now - lastTimestamp.current;
        lastTimestamp.current = now;
        const formattedMessage = `[+${delta.toFixed(0)}ms] ${message}`;
        setKicadLog(prev => [...prev.slice(-99), formattedMessage]);
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

                if (step.keywords.some(kw => lowerLog.includes(kw))) {
                    step.status = 'completed';
                    hasChanged = true;
                    step.subtasks.forEach(st => { if(st.status !== 'completed') st.status = 'completed'; });
                }

                if (step.status === 'in-progress') {
                    step.subtasks.forEach(st => {
                        if (st.status === 'pending' && lowerLog.includes(st.name.toLowerCase())) {
                            st.status = 'completed';
                            hasChanged = true;
                        }
                    });
                }
            }

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
        setWorkflowSteps(INITIAL_WORKFLOW_STEPS.map(s => ({...s, subtasks: []})));
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

    // --- Interactive Demo Handlers ---

    const executeDemoStep = useCallback(async (index: number) => {
        const actionExecutor = executeActionRef.current;
        if (index >= DEMO_WORKFLOW.length || !actionExecutor) {
            setExecutionState('finished');
            logKicadEvent("[SIM] ✅ Workflow finished.");
            return;
        }

        const step = DEMO_WORKFLOW[index];
        const projectName = currentProjectNameRef.current;
        const stepWithProject = { ...step, arguments: { ...step.arguments, projectName } };

        logKicadEvent(`[SIM] ⏳ Executing: ${step.name}`);
        const result = await actionExecutor(stepWithProject, 'kicad-demo-agent');
        appendToSwarmHistory(result);

        setDemoStepStatuses(prev => {
            const newStatuses = [...prev];
            newStatuses[index] = {
                status: result.executionError ? 'error' : 'completed',
                error: result.executionError,
                result: result.executionResult?.message,
            };
            return newStatuses;
        });

        if (result.executionError) {
            logKicadEvent(`[SIM] ❌ ERROR: ${result.executionError}`);
            setExecutionState('error');
            return; // Stop on error
        }

        if (result.toolCall?.name === 'Arrange Components' && result.executionResult?.stdout) {
             try {
                const parsedStdout = JSON.parse(result.executionResult.stdout);
                if (parsedStdout.layout_data) {
                    logKicadEvent("[SIM] ⏸️ Pausing for interactive layout. Commit the layout or press play to continue.");
                    setCurrentLayoutData(parsedStdout.layout_data);
                    setIsLayoutInteractive(parsedStdout.waitForUserInput === true);
                    setExecutionState('paused'); // Pause execution
                    setCurrentStepIndex(index + 1); // Move pointer to next step
                    return; // Stop this cycle, wait for user action
                }
            } catch (e) { /* Not a pause signal, continue */ }
        }

        // If not paused or finished, automatically move to the next step
        setCurrentStepIndex(index + 1);

    }, [logKicadEvent, appendToSwarmHistory]);
    
    useEffect(() => {
        if (executionState === 'running') {
            // Using requestAnimationFrame ensures the next step is queued without a fixed delay,
            // making the execution as fast as the browser can render updates.
            requestAnimationFrame(() => executeDemoStep(currentStepIndex));
        }
    }, [executionState, currentStepIndex, executeDemoStep]);

    const handleStartDemo = useCallback((workflow: AIToolCall[], actionExecutor: ExecuteActionFunction) => {
        executeActionRef.current = actionExecutor;
        const projectName = `demo_project_${Date.now()}`;
        setCurrentProjectName(projectName);
        lastTimestamp.current = performance.now();
        setKicadLog([`[+0ms] [SIM] Starting new KiCad project: ${projectName}`]);
        setWorkflowSteps(INITIAL_WORKFLOW_STEPS.map(s => ({...s, subtasks: []})));
        clearSwarmHistory();
        setDemoStepStatuses(DEMO_WORKFLOW.map(() => ({ status: 'pending' })));
        setCurrentStepIndex(0);
        setExecutionState('running');
    }, [logEvent, clearSwarmHistory, setCurrentProjectName]);
    
    const handleStopDemo = useCallback(() => {
        setExecutionState('idle');
        setCurrentStepIndex(0);
        setKicadLog(['Ready for KiCad task.']);
        setWorkflowSteps(INITIAL_WORKFLOW_STEPS.map(s => ({...s, subtasks: []})));
        setDemoStepStatuses(DEMO_WORKFLOW.map(() => ({ status: 'pending' })));
        setCurrentLayoutData(null);
        setPcbArtifacts(null);
        setCurrentKicadArtifact(null);
        executeActionRef.current = null;
    }, []);

    const handlePlayPause = useCallback((actionExecutor: ExecuteActionFunction | null) => {
        if (actionExecutor) executeActionRef.current = actionExecutor;
        setExecutionState(prev => prev === 'running' ? 'paused' : 'running');
    }, []);

    const handleStepForward = useCallback((actionExecutor: ExecuteActionFunction | null) => {
        if (executionState !== 'paused') return;
        if (actionExecutor) executeActionRef.current = actionExecutor;
        executeDemoStep(currentStepIndex);
    }, [executionState, currentStepIndex, executeDemoStep]);

    const handleStepBackward = useCallback(() => {
        if (executionState !== 'paused' || currentStepIndex === 0) return;
        setDemoStepStatuses(prev => {
            const newStatuses = [...prev];
            newStatuses[currentStepIndex - 1] = { status: 'pending' };
            return newStatuses;
        });
        setCurrentStepIndex(prev => prev - 1);
    }, [executionState, currentStepIndex]);
    
    const handleRunFromStep = useCallback((index: number, actionExecutor: ExecuteActionFunction | null) => {
        if (actionExecutor) executeActionRef.current = actionExecutor;
        logKicadEvent(`[SIM] Resetting workflow to step ${index + 1}...`);
        setDemoStepStatuses(prev => {
            const newStatuses = [...prev];
            for (let i = index; i < newStatuses.length; i++) {
                newStatuses[i] = { status: 'pending' };
            }
            return newStatuses;
        });
        setCurrentStepIndex(index);
        setExecutionState('running');
    }, [logKicadEvent]);


    const kicadSimulators = useMemo(() => {
        const simulators: any = {};
    
        // Generic state-updating functions
        const defineComponentSim = (args: any) => {
            const { projectName, componentReference, ...rest } = args;
            setKicadProjectState(prev => {
                const project = { ...(prev[projectName] || { components: [], nets: [], rules: [], board_outline: null }) };
                const existingIndex = project.components.findIndex(c => c.ref === componentReference);
                const newComp = { ref: componentReference, ...rest };
                if (existingIndex !== -1) {
                    project.components[existingIndex] = { ...project.components[existingIndex], ...newComp };
                } else {
                    project.components.push(newComp);
                }
                return { ...prev, [projectName]: project };
            });
            return { success: true, stdout: JSON.stringify({ message: `Component '${componentReference}' defined.` }) };
        };
    
        const defineNetSim = (args: any) => {
            const { projectName, netName, pins } = args;
            const pinsArray = typeof pins === 'string' ? JSON.parse(pins) : pins;
            setKicadProjectState(prev => {
                const project = { ...(prev[projectName] || { components: [], nets: [], rules: [], board_outline: null }) };
                project.nets.push({ name: netName, pins: pinsArray });
                return { ...prev, [projectName]: project };
            });
            return { success: true, stdout: JSON.stringify({ message: `Net '${netName}' defined.` }) };
        };
    
        const addRuleSim = (args: any, ruleType: string) => {
            const { projectName, ...ruleDetails } = args;
            const rule = { type: ruleType, ...ruleDetails };
            setKicadProjectState(prev => {
               const project = { ...(prev[projectName] || { components: [], nets: [], rules: [], board_outline: null }) };
               project.rules.push(rule);
               return { ...prev, [projectName]: project };
           });
            return { success: true, stdout: JSON.stringify({ message: `Rule '${ruleType}' added.` }) };
        };
    
        // Assign simulators
        simulators.define_kicad_component = defineComponentSim;
        simulators.define_net = defineNetSim;
        simulators.add_absolute_position_constraint = (args: any) => addRuleSim(args, 'AbsolutePositionConstraint');
        simulators.add_proximity_constraint = (args: any) => addRuleSim(args, 'ProximityConstraint');
        simulators.add_alignment_constraint = (args: any) => addRuleSim(args, 'AlignmentConstraint');
        simulators.add_symmetry_constraint = (args: any) => addRuleSim(args, 'SymmetryConstraint');
        simulators.add_circular_constraint = (args: any) => addRuleSim(args, 'CircularConstraint');
        simulators.add_layer_constraint = (args: any) => addRuleSim(args, 'LayerConstraint');
        simulators.add_fixed_property_constraint = (args: any) => addRuleSim(args, 'FixedPropertyConstraint');
        simulators.add_symmetrical_pair_constraint = (args: any) => addRuleSim(args, 'SymmetricalPairConstraint');
    
        simulators.generate_netlist = (args: any) => ({ success: true, stdout: JSON.stringify({ message: 'Netlist generated (simulated).' }) });
        simulators.create_initial_pcb = (args: any) => ({ success: true, stdout: JSON.stringify({ message: 'Initial PCB created (simulated).' }) });
        
        simulators.create_board_outline = (args: any) => {
            const { projectName, ...outline } = args;
            setKicadProjectState(prev => {
                const project = { ...(prev[projectName] || { components: [], nets: [], rules: [], board_outline: null }) };
                project.board_outline = outline;
                return { ...prev, [projectName]: project };
            });
            return { success: true, stdout: JSON.stringify({ message: 'Board outline created (simulated).' }) };
        };
    
        simulators.arrange_components = (args: any) => {
            const { projectName, waitForUserInput, layoutStrategy } = args;
            const projectState = kicadProjectState[projectName];
            if (!projectState) return { success: false, error: "Project not found for arrangement." };
            const nodes = projectState.components.map(c => ({ id: c.ref, label: c.ref, ...c }));
            const edges = [];
            projectState.nets.forEach(net => {
                for (let i = 0; i < net.pins.length; i++) {
                    for (let j = i + 1; j < net.pins.length; j++) {
                        edges.push({ source: net.pins[i], target: net.pins[j], label: net.name });
                    }
                }
            });
            const layout_data = { nodes, edges, rules: projectState.rules, board_outline: projectState.board_outline, layoutStrategy: layoutStrategy || 'agent' };
            return { success: true, stdout: JSON.stringify({ message: 'Component layout data extracted.', layout_data, waitForUserInput }) };
        };
    
        simulators.update_component_positions = (args: any) => ({ success: true, stdout: JSON.stringify({ message: 'Component positions updated (simulated).' }) });
        
        simulators.autoroute_pcb = (args: any) => {
             const svgPath = 'assets/demo_routed.svg';
             setCurrentKicadArtifact({ title: 'Autorouted PCB (Simulated)', path: svgPath, svgPath });
             return { success: true, stdout: JSON.stringify({ message: 'Autorouting complete (simulated).', current_artifact: {title: "Routed PCB", path: svgPath} }) };
        };

        simulators.export_fabrication_files = (args: any) => {
            const { projectName } = args;
            const artifacts = {
                boardName: projectName,
                glbPath: `assets/demo_board.glb`,
                fabZipPath: `assets/demo_fab.zip`,
            };
            return { success: true, stdout: JSON.stringify({ message: "Fabrication files exported (simulated).", artifacts }) };
        };
        
        return simulators;
    }, [kicadProjectState, setKicadProjectState, setCurrentKicadArtifact]);


    return {
        state: {
            pcbArtifacts, kicadLog, currentKicadArtifact,
            isLayoutInteractive, currentLayoutData, kicadProjectState, workflowSteps,
            executionState, currentStepIndex, demoStepStatuses,
        },
        setters: {
            setPcbArtifacts, setCurrentKicadArtifact,
            setIsLayoutInteractive, setCurrentLayoutData,
        },
        handlers: {
            handleStartKicadTask, setCurrentProjectName, updateWorkflowChecklist,
            handleStartDemo, handleStopDemo, handlePlayPause,
            handleStepForward, handleStepBackward, handleRunFromStep,
        },
        logKicadEvent,
        currentProjectNameRef,
        getKicadSystemPrompt,
        kicadSimulators,
    };
};
