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
You are a world-class KiCad automation engineer. Your sole responsibility is to convert a user's request into a precise sequence of tool calls to design and export a PCB.

**Execution Protocol: The KiCad Workflow**
You MUST follow this workflow precisely. Your primary task is to check the action history to determine which step to perform next and generate a plan for ALL subsequent steps.

1.  **Phase 1: Schematic Definition**
    *   First, call \`Update Workflow Checklist\` to outline the components and nets you will define.
    *   Call \`Define KiCad Component\` for EVERY SINGLE component.
    *   Call \`Define KiCad Net\` for EVERY SINGLE electrical connection.
    *   Call the appropriate layout rule tools ONE AT A TIME to build the set of placement constraints. Use tools like \`Add Proximity Constraint\`, \`Add Alignment Constraint\`, \`Add Circular Constraint\`, etc., for each rule required.

2.  **Phase 2: Board Setup**
    *   Call \`Generate KiCad Netlist\` to consolidate the schematic.
    *   Call \`Create Initial PCB\` to create the board file. THIS IS THE STEP THAT CREATES THE .kicad_pcb FILE.

3.  **Phase 3: Physical Layout**
    *   Call \`Create Board Outline\` to define the board's physical dimensions. **This MUST be called AFTER 'Create Initial PCB'.**
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
    
    const getProject = useCallback((projectName: string) => {
        return kicadProjectState[projectName] || { components: [], nets: [], rules: [], board_outline: null };
    }, [kicadProjectState]);

    const updateProject = useCallback((projectName: string, updates: Partial<KicadProjectState[string]>) => {
        setKicadProjectState(prev => ({
            ...prev,
            [projectName]: { ...getProject(projectName), ...updates }
        }));
    }, [getProject]);

    // --- Demo Data Memoization ---
    const demoComponentData = useMemo(() => {
        const map = new Map();
        DEMO_COMPONENTS.forEach(comp => map.set(comp.ref, comp));
        return map;
    }, []);


    // --- KiCad Tool Simulators ---
    const kicadSimulators = {
        define_component: (args: any) => {
            const project = getProject(args.projectName);
            const newComponent = { ref: args.componentReference, componentValue: args.componentValue, footprint: args.footprintIdentifier };
            const otherComponents = project.components.filter(c => c.ref !== args.componentReference);
            updateProject(args.projectName, { components: [...otherComponents, newComponent] });
            
            // Enhance simulation with pre-defined data for a richer demo experience
            const demoData = demoComponentData.get(args.componentReference);
            const dataToReturn = {
                message: `Component ${args.componentReference} defined.`,
                svgPath: demoData?.svgPath || null,
                dimensions: demoData ? { width: demoData.width, height: demoData.height } : null,
                CrtYdDimensions: demoData?.courtyardDimensions || null,
                pins: demoData?.pins || [],
            };
            return { success: true, stdout: JSON.stringify(dataToReturn) };
        },
        define_layout_rules: (args: any) => {
            let rules = [];
            try {
                rules = JSON.parse(args.rulesJSON);
                if (!Array.isArray(rules)) throw new Error("Rules JSON is not an array.");
            } catch (e) {
                const errorMsg = e instanceof Error ? e.message : String(e);
                 return { success: false, error: `Invalid JSON in rulesJSON argument: ${errorMsg}` };
            }
            updateProject(args.projectName, { rules: rules });
            return { success: true, stdout: JSON.stringify({ message: `Saved ${rules.length} layout rules for project '${args.projectName}'.` }) };
        },
        define_net: (args: any) => {
            const project = getProject(args.projectName);
            // In the demo workflow, `args.pins` is already an array.
            const newNet = { name: args.netName, pins: args.pins };
            const otherNets = project.nets.filter(n => n.name !== args.netName);
            updateProject(args.projectName, { nets: [...otherNets, newNet] });
            return { success: true, stdout: JSON.stringify({ message: `Net ${args.netName} defined successfully.` }) };
        },
        generate_netlist: (args: any) => ({ success: true, stdout: JSON.stringify({ message: `Netlist generated successfully.` }) }),
        create_initial_pcb: (args: any) => ({ success: true, stdout: JSON.stringify({ message: `Initial PCB created.` }) }),
        create_board_outline: (args: any) => {
            const { projectName, shape, diameterMillimeters, boardWidthMillimeters, boardHeightMillimeters } = args;
            let outline;
            if (shape === 'circle') {
                const diameter = diameterMillimeters > 0 ? diameterMillimeters : 35; // default
                outline = { x: -diameter / 2, y: -diameter / 2, width: diameter, height: diameter, shape: 'circle' };
            } else {
                const width = boardWidthMillimeters > 0 ? boardWidthMillimeters : 35;
                const height = boardHeightMillimeters > 0 ? boardHeightMillimeters : 35;
                outline = { x: 0, y: 0, width, height, shape: 'rectangle' };
            }
            updateProject(projectName, { board_outline: outline });
            return { success: true, stdout: JSON.stringify({ message: `Board outline created.` }) };
        },
        arrange_components: (args: any) => {
            const project = getProject(args.projectName);
            const layoutData = JSON.parse(JSON.stringify(TEST_LAYOUT_DATA)); 

            // Use the rules from the project state, which were set by the define_layout_rules simulator.
            layoutData.rules = project.rules || [];

            // Use the outline from the project state if it exists, otherwise use the template's
            if (project.board_outline) {
                layoutData.board_outline = project.board_outline;
            }

            layoutData.nodes.forEach((node: any) => {
                if (!node.glbPath) {
                    const footprintName = node.footprint?.split(':')[1] || node.footprint;
                    if (footprintName) {
                        const cleanFootprintName = footprintName.replace('.kicad_mod', '');
                        node.glbPath = `assets/${cleanFootprintName}.glb`;
                    }
                }
            });
            // ALWAYS set waitForUserInput to true for simulations to ensure the button is enabled.
            return { success: true, stdout: JSON.stringify({ layout_data: layoutData, waitForUserInput: true }) };
        },
        update_component_positions: (args: any) => ({ success: true, stdout: JSON.stringify({ message: `Component positions updated and board outline resized.` }) }),
        autoroute_pcb: (args: any) => {
            // Simulate a delay for autorouting
            return new Promise(resolve => setTimeout(() => {
                resolve({ success: true, stdout: JSON.stringify({ message: `Autorouting complete.` }) });
            }, 1500));
        },
        export_fabrication_files: (args: any) => {
             const artifactData = {
                boardName: args.projectName,
                glbPath: `assets/${args.projectName}_board_simulated.glb`,
                fabZipPath: `assets/${args.projectName}_fab_simulated.zip`
            };
            return { success: true, stdout: JSON.stringify({ message: "Fabrication files exported (Simulated).", artifacts: artifactData }) };
        }
    };

    // Effect to update workflow progress based on logs
    useEffect(() => {
        if (currentLayoutData || kicadLog.length === 0) return;

        setWorkflowSteps(prevSteps => {
            const newSteps = JSON.parse(JSON.stringify(prevSteps));
            let latestStepMentioned = -1;
            for (let i = newSteps.length - 1; i >= 0; i--) {
                const step = newSteps[i];
                const hasLog = kicadLog.some(log => {
                    const lowerLog = log.toLowerCase();
                    const subtaskCompleted = step.subtasks.some(st => lowerLog.includes(st.name.toLowerCase()) && (log.includes('✅') || log.includes('✔️')));
                    return step.keywords.some(kw => lowerLog.includes(kw)) || subtaskCompleted;
                });
                if (hasLog) {
                    latestStepMentioned = i;
                    break;
                }
            }
            
            if (latestStepMentioned !== -1) {
                newSteps.forEach((step, i) => {
                    step.status = i < latestStepMentioned ? 'completed' : i === latestStepMentioned ? 'in-progress' : 'pending';
                });
            } else if (kicadLog.length > 1) {
                 if(newSteps[0].status === 'pending') newSteps[0].status = 'in-progress';
            }

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
            if (kicadLog.some(log => lastStep.keywords.some(kw => log.toLowerCase().includes(kw)))) {
                newSteps.forEach(s => s.status = 'completed');
            }

            return JSON.stringify(newSteps) === JSON.stringify(prevSteps) ? prevSteps : newSteps;
        });
    }, [kicadLog, currentLayoutData]);


    const handleStartKicadTask = useCallback(async (payload: { prompt: string; files: any[]; urls: string[]; useSearch: boolean; }) => {
        setIsDemoRunning(false);
        const projectName = currentProjectNameRef.current || `brd_${Date.now()}`;
        currentProjectNameRef.current = projectName;
        
        logKicadEvent(`🚀 Starting KiCad Generation Swarm...`);
        logKicadEvent(`Project name set to: ${projectName}`);
    
        const nonEmptyUrls = payload.urls.filter(u => u.trim() !== '');
        const augmentedPrompt = `${payload.prompt}\n\n${nonEmptyUrls.length > 0 ? `Reference URLs:\n${nonEmptyUrls.join('\n')}` : ''}`;

        const taskPayload = {
            userRequest: { text: augmentedPrompt, files: payload.files },
            useSearch: payload.useSearch,
            projectName: projectName,
        };

        // Resume flag tells the swarm manager to use existing history.
        await startSwarmTask({
            task: taskPayload,
            systemPrompt: getKicadSystemPrompt(projectName),
            sequential: true,
            resume: true,
            allTools: allTools,
        });

    }, [logKicadEvent, startSwarmTask, allTools]);

    const runDemoWorkflow = useCallback(async (
        workflow: AIToolCall[],
        executeAction: ExecuteActionFunction
    ) => {
        setIsDemoRunning(true);
        logKicadEvent(`[SIM] Starting/Resuming simulation with ${workflow.length} steps.`);
        
        for (const toolCall of workflow) {
            logKicadEvent(`[SIM] ⚙️ Executing: ${toolCall.name}`);
            await new Promise(resolve => setTimeout(resolve, 150)); // Small delay for visual feedback

            const result = await executeAction(toolCall, 'simulation-agent');
            appendToSwarmHistory(result); // Add result to the shared history

            if (result.executionError) {
                logKicadEvent(`[SIM] ❌ ERROR: ${result.executionError}`);
                logKicadEvent('[SIM] Halting simulation due to error.');
                setIsDemoRunning(false);
                break;
            }

            const stdout = result.executionResult?.stdout;
            if (stdout) {
                try {
                    const parsed = JSON.parse(stdout);
                    if (parsed.layout_data && parsed.waitForUserInput) {
                        logKicadEvent('[SIM] ⏸️ Workflow paused for interactive layout.');
                        setCurrentLayoutData(parsed.layout_data);
                        setIsLayoutInteractive(true);
                        setCurrentProjectName(toolCall.arguments.projectName);
                        return;
                    }
                } catch (e) { /* Not a pause signal, continue */ }
            }
        }
    }, [logKicadEvent, appendToSwarmHistory]);
    
    const setCurrentProjectName = (name: string) => {
        currentProjectNameRef.current = name;
    };
    
    const updateWorkflowChecklist = useCallback((stepName: string, items: any) => {
        setWorkflowSteps(prevSteps => {
            const newSteps = [...prevSteps];
            const stepIndex = newSteps.findIndex(s => s.name === stepName);
            if (stepIndex !== -1) {
                let parsedItems = items;
                if (typeof parsedItems === 'string') {
                    try { parsedItems = JSON.parse(parsedItems); } catch (e) {}
                }

                if (Array.isArray(parsedItems)) {
                    newSteps[stepIndex].subtasks = parsedItems.map(item => ({ name: String(item), status: 'pending' }));
                } else {
                    console.warn(`Update Workflow Checklist: received non-array 'items' for step "${stepName}".`, items);
                    newSteps[stepIndex].subtasks = [];
                }
            }
            return newSteps;
        });
    }, []);
    
    const handleResetDemo = useCallback(() => {
        setIsDemoRunning(false);
        logKicadEvent('Workflow state has been reset.');
        setKicadLog(['Ready for KiCad task.']);
        setWorkflowSteps(INITIAL_WORKFLOW_STEPS.map(s => ({ ...s, status: 'pending', subtasks: [] })));
        setCurrentLayoutData(null);
        setPcbArtifacts(null);
        clearSwarmHistory(); // Clear the shared history
    }, [logKicadEvent, clearSwarmHistory]);

    const handleStartDemo = useCallback(async (workflow: AIToolCall[], executeAction: ExecuteActionFunction) => {
        handleResetDemo(); // Reset state before starting a new simulation
        if (executeAction) {
            await runDemoWorkflow(workflow, executeAction);
        } else {
            logKicadEvent('[ERROR] Cannot start simulation, execution context is missing.');
        }
    }, [handleResetDemo, runDemoWorkflow, logKicadEvent]);


    return {
        state: {
            pcbArtifacts,
            kicadLog,
            currentKicadArtifact,
            isLayoutInteractive,
            currentLayoutData,
            workflowSteps,
            isDemoRunning,
        },
        setters: {
            setPcbArtifacts,
            setKicadLog,
            setCurrentKicadArtifact,
            setCurrentLayoutData,
            setIsLayoutInteractive,
            setIsDemoRunning,
        },
        handlers: {
            handleStartKicadTask,
            setCurrentProjectName,
            updateWorkflowChecklist,
            runDemoWorkflow,
            handleStartDemo,
            handleResetDemo,
        },
        logKicadEvent,
        currentProjectNameRef,
        getKicadSystemPrompt,
        kicadProjectState,
        kicadSimulators,
    };
};
