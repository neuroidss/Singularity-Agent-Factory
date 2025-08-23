
import React, { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import type { WorkflowStep, AIToolCall, EnrichedAIResponse, LLMTool, KnowledgeGraphNode, KnowledgeGraphEdge, MainView, KnowledgeGraph, ExecuteActionFunction } from '../types';
import { WORKFLOW_SCRIPT } from '../bootstrap/demo_workflow';

type UseKicadManagerProps = {
    logEvent: (message: string) => void;
    allTools: LLMTool[];
};

type Subtask = { name: string; status: 'pending' | 'completed' };
export type WorkflowStepState = {
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
    { name: "Define Nets & Rules", keywords: ["define kicad net", "add absolute position", "add proximity", "add alignment", "add symmetry", "add circular", "add layer", "net defined", "rules saved", "simulation heuristics"], status: 'pending', subtasks: [] },
    { name: "Arrange & Simulate PCB", keywords: ["arrange components", "update kicad component positions"], status: 'pending', subtasks: [] },
    { name: "Generate Netlist", keywords: ["generate kicad netlist", "netlist generated successfully"], status: 'pending', subtasks: [] },
    { name: "Create PCB File", keywords: ["create initial pcb"], status: 'pending', subtasks: [] },
    { name: "Autoroute PCB", keywords: ["autoroute pcb", "autorouting complete"], status: 'pending', subtasks: [] },
    { name: "Export Fabrication Files", keywords: ["export fabrication files", "fabrication successful"], status: 'pending', subtasks: [] },
    { name: "Task Complete", keywords: ["task completed", "fabrication successful"], status: 'pending', subtasks: [] }
];

export const INITIAL_LAYOUT_DATA: KnowledgeGraph = {
    nodes: [],
    edges: [],
    rules: [],
    copper_pours: [],
    board_outline: { x: -0.8, y: -0.8, width: 1.6, height: 1.6, shape: 'rectangle', autoSize: true },
    heuristics: {
        componentSpacing: 200.0,
        netLengthWeight: 0.03,
        boardEdgeConstraint: 2.0,
        settlingSpeed: 0.99,
        repulsionRampUpTime: 600,
        distributionStrength: 0.5,
        boardPadding: 5.0,
        proximityStrength: 1.0,
        symmetryStrength: 10.0,
        alignmentStrength: 10.0,
        circularStrength: 10.0,
        symmetricalPairStrength: 20.0,
        absolutePositionStrength: 10.0,
        fixedRotationStrength: 50.0,
        symmetryRotationStrength: 10.0,
        circularRotationStrength: 10.0,
    },
};


export const getKicadSystemPrompt = (projectName: string) => `
You are a world-class KiCad automation engineer AI. Your sole purpose is to transform a user's high-level request into a physical electronic device by generating a precise sequence of tool calls to design and export a PCB. You operate on a project named '${projectName}'.

**Core Mission: From Simulation to Fabrication**
Your goal is to follow a strict, simulation-first workflow. You MUST analyze the action history to determine the next logical step. Do not repeat completed steps.

**Phase 1: System Definition (The Blueprint)**
This is the most critical phase. You must define the entire electronic system before any physical layout is attempted.
- First, call \`Update Workflow Checklist\` to outline all components, nets, and rules you plan to define.
- **BATCH DEFINE EVERYTHING:** In one or two large responses, define the entire system. Call \`Define KiCad Component\` for every single component, \`Define KiCad Net\` for every electrical connection, and all physical layout rules (\`Add Proximity Constraint\`, \`Add Symmetry Constraint\`, etc.).
- **TUNE THE SIMULATION:** After defining rules, call \`Set Simulation Heuristics\` to control how the physics engine behaves.

**Phase 2: Simulation and Arrangement**
Once the system is fully defined, you will trigger the autonomous layout engine.
- Call \`Arrange Components\` with the \`waitForUserInput\` parameter set to \`false\`. The system will then run a physics simulation to find an optimal layout and will pause your execution.

**Phase 3: Finalize and Fabricate**
You will be re-invoked after the simulation is complete. The history will now include a successful \`Update KiCad Component Positions\` call, which contains the final layout. Your task is to proceed with manufacturing file generation.
- Call \`Generate KiCad Netlist\`.
- Call \`Create Initial PCB\`. The board will be created with the components correctly placed.
- Call \`Autoroute PCB\` to create the copper traces.
- Call \`Export Fabrication Files\` to generate the manufacturing data (Gerbers, drill files).

**Phase 4: Completion**
- **CRUCIAL FINAL STEP:** You MUST call \`Task Complete\` to signal the successful end of the entire design process.

**Mandatory Directives:**
*   **MAXIMIZE BATCH SIZE:** Complete the design in as few turns as possible. Your output MUST be a single, large JSON array of all tool calls required to complete the CURRENT phase.
*   **CHECK THE HISTORY:** Before acting, review the action history. DO NOT re-define a component or net that already exists.
*   **USE THE PROJECT NAME:** Every tool call MUST use the project name: \`${projectName}\`.
`;


export const useKicadManager = (props: UseKicadManagerProps) => {
    const { logEvent, allTools } = props;

    const [pcbArtifacts, setPcbArtifacts] = useState<{ boardName: string, glbPath: string, fabZipPath: string } | null>(null);
    const [kicadLog, setKicadLog] = useState<string[]>(['Ready for KiCad task.']);
    const [currentKicadArtifact, setCurrentKicadArtifact] = useState<{title: string, path: string | null, svgPath: string | null} | null>(null);
    const [isLayoutInteractive, setIsLayoutInteractive] = useState(false);
    const [currentLayoutData, setCurrentLayoutData] = useState<KnowledgeGraph | null>(null);
    const [kicadProjectState, setKicadProjectState] = useState<KicadProjectState>({});
    const [workflowSteps, setWorkflowSteps] = useState<WorkflowStepState[]>(INITIAL_WORKFLOW_STEPS);
    
    const layoutHeuristics = currentLayoutData?.heuristics || {};
    
    const setLayoutHeuristics = useCallback((update: React.SetStateAction<any>) => {
        setCurrentLayoutData(prevData => {
            const prevHeuristics = prevData?.heuristics || {};
            const newHeuristics = typeof update === 'function' ? update(prevHeuristics) : update;
            return {
                ...(prevData || INITIAL_LAYOUT_DATA),
                heuristics: { ...prevHeuristics, ...newHeuristics },
            };
        });
    }, []);

    const currentProjectNameRef = useRef<string | null>(null);
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
    
    const resetWorkflowSteps = useCallback(() => {
        setWorkflowSteps(INITIAL_WORKFLOW_STEPS.map(s => ({...s, status: 'pending', subtasks: []})));
    }, []);

    const updateWorkflowStepStatus = useCallback((log: string) => {
        const lowerLog = log.toLowerCase();
        setWorkflowSteps(prevSteps => {
            let hasChanged = false;
            let currentStepInProgress = false;

            const newSteps = prevSteps.map(step => {
                if (step.status === 'in-progress') currentStepInProgress = true;
                return { ...step };
            });

            for (let i = 0; i < newSteps.length; i++) {
                const step = newSteps[i];
                if (step.status === 'completed') continue;
                const isTriggered = step.keywords.some(kw => lowerLog.includes(kw));
                if (isTriggered) {
                    for (let j = 0; j <= i; j++) {
                        if(newSteps[j].status !== 'completed') {
                            newSteps[j].status = 'completed';
                            hasChanged = true;
                        }
                    }
                    if (newSteps[i+1]) {
                        newSteps[i+1].status = 'in-progress';
                        hasChanged = true;
                    }
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
            
            if (!newSteps.some(s => s.status === 'in-progress') && newSteps.some(s => s.status === 'pending')) {
                const firstPending = newSteps.find(s => s.status === 'pending');
                if (firstPending) {
                    firstPending.status = 'in-progress';
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
    
    const handleStartKicadTask = useCallback((
        taskPayload: { prompt: string, files: any[], urls: string[], useSearch: boolean },
        startSwarmTask: (options: any) => void,
        allToolsForTask: LLMTool[],
        getSystemPrompt: (name: string) => string
    ) => {
        const { prompt, files, urls, useSearch } = taskPayload;
        const projectName = `proj_${Date.now()}`;
        setCurrentProjectName(projectName);
        setKicadLog([`[INFO] Starting new KiCad project: ${projectName}`]);
        resetWorkflowSteps();
        setCurrentLayoutData({ ...INITIAL_LAYOUT_DATA });

        let userRequestText = `Project Name: ${projectName}\n\nUser Prompt: ${prompt}`;
        if (urls && urls.length > 0) {
            userRequestText += `\n\nReference URLs:\n${urls.join('\n')}`;
        }

        const task = {
            userRequest: { text: userRequestText, files },
            useSearch: useSearch,
            projectName: projectName
        };

        startSwarmTask({
            task,
            systemPrompt: getSystemPrompt(projectName),
            sequential: true,
            allTools: allToolsForTask,
        });
    }, [logEvent, resetWorkflowSteps]);
    
    const kicadSimulators = useMemo(() => {
        const simulators: any = {};
        const defineComponentSim = (args: any) => {
            const { componentReference, footprintIdentifier, ...rest } = args;
            const newComp = { ref: componentReference, ...rest, footprint: footprintIdentifier };
            const newNode: KnowledgeGraphNode = {
                id: newComp.ref, label: newComp.ref, 
                placeholder_dimensions: newComp.placeholder_dimensions,
                placeholder_shape: newComp.placeholder_shape,
                drc_dimensions: newComp.drc_dimensions,
                drc_shape: newComp.drc_shape,
                ...newComp
            };
            return { success: true, message: `[SIM] Component '${componentReference}' defined.`, component: newComp, newNode: newNode };
        };
        const defineNetSim = (args: any) => {
            const { netName, pins } = args;
            const pinsArray = typeof pins === 'string' ? JSON.parse(pins) : pins;
            const newNet = { name: netName, pins: pinsArray };
            const newEdges: KnowledgeGraphEdge[] = [];
            for (let i = 0; i < pinsArray.length; i++) {
                for (let j = i + 1; j < pinsArray.length; j++) {
                    newEdges.push({ source: pinsArray[i], target: pinsArray[j], label: netName });
                }
            }
            return { success: true, message: `[SIM] Net '${netName}' defined.`, net: newNet, edges: newEdges };
        };
        const addRuleSim = (args: any, ruleType: string) => {
            const { projectName, ...ruleDetails } = args;
            const parsedDetails = { ...ruleDetails };
            for (const key in parsedDetails) {
                if (key.endsWith('JSON') && typeof parsedDetails[key] === 'string') {
                    try {
                        const newKey = key.replace('JSON', '');
                        parsedDetails[newKey] = JSON.parse(parsedDetails[key]);
                        delete parsedDetails[key];
                    } catch (e) {
                         throw new Error(`[SIMULATOR ERROR] Invalid JSON for argument '${key}' in rule '${ruleType}'. Value was: ${parsedDetails[key]}. Parse Error: ${e.message}`);
                    }
                }
            }
            if (parsedDetails.componentReference) {
                parsedDetails.component = parsedDetails.componentReference;
                delete parsedDetails.componentReference;
            }
            const rule = { type: ruleType, ...parsedDetails, enabled: true };
            return { success: true, message: `[SIM] Rule '${ruleType}' added.`, rule: rule };
        };
        simulators.define_component = defineComponentSim;
        simulators.define_net = defineNetSim;
        simulators.add_absolute_position_constraint = (args: any) => addRuleSim(args, 'AbsolutePositionConstraint');
        simulators.add_proximity_constraint = (args: any) => addRuleSim(args, 'ProximityConstraint');
        simulators.add_alignment_constraint = (args: any) => addRuleSim(args, 'AlignmentConstraint');
        simulators.add_symmetry_constraint = (args: any) => addRuleSim(args, 'SymmetryConstraint');
        simulators.add_circular_constraint = (args: any) => addRuleSim(args, 'CircularConstraint');
        simulators.add_layer_constraint = (args: any) => addRuleSim(args, 'LayerConstraint');
        simulators.add_fixed_property_constraint = (args: any) => addRuleSim(args, 'FixedPropertyConstraint');
        simulators.add_symmetrical_pair_constraint = (args: any) => addRuleSim(args, 'SymmetricalPairConstraint');
        simulators.set_simulation_heuristics = (args: any) => ({ success: true, message: 'Simulation heuristics updated.', heuristics: args });
        simulators.generate_netlist = (args: any) => ({ success: true, message: '[SIM] Netlist generated.' });
        simulators.create_initial_pcb = (args: any) => ({ success: true, message: '[SIM] Initial PCB created.' });
        simulators.create_board_outline = (args: any) => ({ success: true, message: '[SIM] Board outline created.', outline: args });
        simulators.create_copper_pour = (args: any) => ({ success: true, message: `[SIM] Copper pour for '${args.netName}' created.`, pour: { net: args.netName, layer: args.layerName } });
        simulators.arrange_components = (args: any) => ({ success: true, message: '[SIM] Layout simulation triggered.' });
        simulators.update_component_positions = (args: any) => ({ success: true, message: '[SIM] Component positions updated.' });
        simulators.autoroute_pcb = (args: any) => ({ success: true, message: '[SIM] Autorouting complete.', current_artifact: {title: "Routed PCB (Simulated)", path: 'assets/demo_routed.svg', svgPath: 'assets/demo_routed.svg'} });
        simulators.export_fabrication_files = (args: any) => ({ success: true, message: "[SIM] Fabrication files exported.", artifacts: { boardName: args.projectName, glbPath: `assets/demo_board.glb`, fabZipPath: `assets/demo_fab.zip` }});
        return simulators;
    }, []);

    return {
        state: {
            pcbArtifacts, kicadLog, currentKicadArtifact,
            isLayoutInteractive, currentLayoutData, kicadProjectState, workflowSteps,
            layoutHeuristics,
        },
        setters: {
            setPcbArtifacts, setCurrentKicadArtifact,
            setIsLayoutInteractive, setCurrentLayoutData,
            setLayoutHeuristics,
            setKicadLog,
        },
        handlers: {
            handleStartKicadTask, setCurrentProjectName, updateWorkflowChecklist,
            handleUpdateLayout: setCurrentLayoutData,
            resetWorkflowSteps,
            INITIAL_LAYOUT_DATA,
        },
        logKicadEvent,
        currentProjectNameRef,
        getKicadSystemPrompt,
        kicadSimulators,
    };
};