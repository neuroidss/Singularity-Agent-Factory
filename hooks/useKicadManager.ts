// hooks/useKicadManager.ts
// VIBE_NOTE: Do not escape backticks or dollar signs in template literals in this file.
// Escaping is only for 'implementationCode' strings in tool definitions.

import React, { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import type { WorkflowStep, AIToolCall, EnrichedAIResponse, LLMTool, KnowledgeGraphNode, KnowledgeGraphEdge, MainView, KnowledgeGraph, ExecuteActionFunction } from '../types';

type UseKicadManagerProps = {
    logEvent: (message: string) => void;
    allTools: LLMTool[];
};

type Subtask = { name: string; status: 'pending' | 'completed' };
export type WorkflowStepState = {
    name: string;
    description: string;
    role: string;
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
    { name: "Ideation & Components", role: "Component Librarian", description: "Agent analyzes request, finds components.", keywords: ["define kicad component", "performing web search"], status: 'pending', subtasks: [] },
    { name: "Schematic & Rules", role: "Schematic Drafter", description: "Agent defines nets and physical constraints.", keywords: ["define kicad net", "add proximity", "add symmetry", "add alignment"], status: 'pending', subtasks: [] },
    { name: "Layout & Placement", role: "Layout Specialist", description: "Agent places components, then awaits user approval.", keywords: ["arrange components", "update kicad component positions"], status: 'pending', subtasks: [] },
    { name: "Routing & Fab", role: "Manufacturing Engineer", description: "Agent routes PCB and generates output files.", keywords: ["autoroute pcb", "export fabrication files", "task completed"], status: 'pending', subtasks: [] },
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
        viaClearance: 0.6,
        proximityKp: 5.0,
        proximityKi: 0.0,
        proximityKd: 1.5,
        symmetryStrength: 10.0,
        alignmentStrength: 10.0,
        absolutePositionStrength: 10.0,
        fixedRotationStrength: 5.0,
        symmetryRotationStrength: 1.0,
        circularRotationStrength: 1.0,
    },
};


export const getKicadSystemPrompt = (projectName: string) => `
You are a world-class KiCad automation engineer AI. Your sole purpose is to transform a user's high-level request into a physical electronic device by generating a precise sequence of tool calls to design and export a PCB. You operate on a project named '${projectName}'. You work in stages, focusing only on the tools relevant to the current stage of the design process.

**Core Mission: From Concept to Fabrication, Step-by-Step**
Your goal is to follow a strict, phased workflow. You MUST analyze the action history to determine the next logical step and not repeat completed work.

**Phase 1: Component & System Definition**
- Your primary goal is to define all components using "Define KiCad Component".
- Use web search if necessary to find datasheets or parts.
- Call "Update Workflow Checklist" to outline all components you plan to define.

**Phase 2: Schematic & Rules**
- Once all components are defined, your goal is to connect them. Define all electrical connections using "Define KiCad Net".
- Define all physical layout rules ("Add Proximity Constraint", "Add Symmetry Constraint", etc.).
- Fine-tune the simulation by calling "Set Simulation Heuristics".

**Phase 3: Layout and Arrangement**
- After defining rules, call "Arrange Components". This will trigger a simulation. Your mode (Collaborative or Autonomous) dictates the "waitForUserInput" parameter.

**Phase 4: Finalize and Fabricate**
- After the layout is committed (indicated by a successful "Update KiCad Component Positions" call in the history), proceed with manufacturing.
- Call "Generate KiCad Netlist".
- Call "Create Initial PCB".
- Call "Create Board Outline" and "Create Copper Pour".
- Call "Autoroute PCB" to create traces.
- Call "Export Fabrication Files".
- **CRUCIAL FINAL STEP:** You MUST call "Task Complete" to signal the end of the process.

**Mandatory Directives:**
*   **MAXIMIZE BATCH SIZE:** Complete each design phase in as few turns as possible.
*   **CHECK THE HISTORY:** Before acting, review the action history. DO NOT re-define existing items.
*   **USE THE PROJECT NAME:** Every tool call MUST use the project name: "${projectName}".
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
    const [isAutonomousMode, setIsAutonomousMode] = useState(false);
    
    const layoutDataRef = useRef(currentLayoutData);
    layoutDataRef.current = currentLayoutData;
    
    const layoutHeuristics = currentLayoutData?.heuristics || {};
    
    const logKicadEvent = useCallback((message: string) => {
        const now = performance.now();
        const delta = now - lastTimestamp.current;
        lastTimestamp.current = now;
        const formattedMessage = `[+${delta.toFixed(0)}ms] ${message}`;
        setKicadLog(prev => [...prev.slice(-99), formattedMessage]);
    }, []);

    const setLayoutHeuristics = useCallback((update: React.SetStateAction<any>) => {
        setCurrentLayoutData(prevData => {
            const prevHeuristics = prevData?.heuristics || {};
            const newHeuristics = typeof update === 'function' ? update(prevHeuristics) : update;
            return {
                ...(prevData || INITIAL_LAYOUT_DATA),
                heuristics: newHeuristics,
            };
        });
    }, []);

    const currentProjectNameRef = useRef<string | null>(null);
    const lastTimestamp = useRef(performance.now());


    const setCurrentProjectName = useCallback((name: string) => {
        currentProjectNameRef.current = name;
        if (!kicadProjectState[name]) {
            setKicadProjectState(prev => ({ ...prev, [name]: { components: [], nets: [], rules: [], board_outline: null } }));
        }
    }, [kicadProjectState]);

    const getKicadProjectState = useCallback(() => {
        if (!currentProjectNameRef.current) return null;
        return kicadProjectState[currentProjectNameRef.current] || null;
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
                    for (let j = 0; j < i; j++) { // Mark all previous steps as completed
                        if(newSteps[j].status !== 'completed') {
                            newSteps[j].status = 'completed';
                            hasChanged = true;
                        }
                    }
                     if (step.status !== 'in-progress') { // Start the current step
                        step.status = 'in-progress';
                        hasChanged = true;
                    }
                }
                
                 // Logic to complete a step and move to the next one
                if(step.status === 'in-progress' && step.keywords.some(kw => lowerLog.includes(kw) && (lowerLog.includes('complete') || lowerLog.includes('finished') || lowerLog.includes('successful') || lowerLog.includes('updated') || lowerLog.includes('generated')))) {
                     const isFabStep = step.name.includes("Routing & Fab");
                     const isTaskComplete = lowerLog.includes("task completed");
                     if (!isFabStep || (isFabStep && isTaskComplete)) {
                        step.status = 'completed';
                        if (newSteps[i+1]) {
                            newSteps[i+1].status = 'in-progress';
                        }
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
        taskPayload: { prompt: string, files: any[], urls: string[], useSearch: boolean, isAutonomous: boolean },
        startSwarmTask: (options: any) => void,
        allToolsForTask: LLMTool[],
        getSystemPrompt: (name: string) => string
    ) => {
        const { prompt, files, urls, useSearch, isAutonomous } = taskPayload;
        const projectName = `proj_${Date.now()}`;
        setCurrentProjectName(projectName);
        setKicadLog([ `[INFO] Starting new KiCad project: ${projectName}` ]);
        resetWorkflowSteps();
        setCurrentLayoutData({ ...INITIAL_LAYOUT_DATA });

        let userRequestText = `The user wants to design a PCB. Their request is: "${prompt}".`;
        
        if (isAutonomous) {
            userRequestText += `\n\n**MODE: AUTONOMOUS**. You are the Lead Engineer. You must complete the entire task without pausing for user input. For the 'Arrange Components' step, you MUST set 'waitForUserInput' to false.`;
            logEvent("🚀 Starting task in Autonomous Mode.");
        } else {
            userRequestText += `\n\n**MODE: COLLABORATIVE**. You are the Lead Engineer's assistant. For the 'Arrange Components' step, you MUST set 'waitForUserInput' to true to allow for manual review.`;
            logEvent("🚀 Starting task in Collaborative Mode.");
        }

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
    }, [logEvent, resetWorkflowSteps, setCurrentProjectName]);
    
    const kicadSimulators = useMemo(() => {
        const simulators: any = {};
        const defineComponentSim = (args: any) => {
            const { componentReference, footprintIdentifier, metaphysicalPropertiesJSON, ...rest } = args;
            let metaphysicalProperties = {};
            if (metaphysicalPropertiesJSON) {
                try { metaphysicalProperties = JSON.parse(metaphysicalPropertiesJSON); } catch (e) { console.warn("Could not parse metaphysicalPropertiesJSON"); }
            }
            const newComp = { ref: componentReference, ...rest, footprint: footprintIdentifier, metaphysicalProperties };
            
            setKicadProjectState(prev => {
                const current = prev[currentProjectNameRef.current!] || { components: [], nets: [], rules: [], board_outline: null };
                return { ...prev, [currentProjectNameRef.current!]: { ...current, components: [...current.components.filter(c => c.ref !== newComp.ref), newComp] } };
            });

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
            const { netName, pins, ritualDescription } = args;
            const pinsArray = typeof pins === 'string' ? JSON.parse(pins) : pins;
            const newNet = { name: netName, pins: pinsArray, ritualDescription: ritualDescription || "" };

            setKicadProjectState(prev => {
                const current = prev[currentProjectNameRef.current!] || { components: [], nets: [], rules: [], board_outline: null };
                return { ...prev, [currentProjectNameRef.current!]: { ...current, nets: [...current.nets.filter(n => n.name !== newNet.name), newNet] } };
            });

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
        simulators.create_board_outline = (args: any) => {
            const { shape, boardWidthMillimeters, boardHeightMillimeters, diameterMillimeters } = args;
            const hasFixedWidth = boardWidthMillimeters !== undefined && boardWidthMillimeters !== null && boardWidthMillimeters > 0;
            const hasFixedHeight = boardHeightMillimeters !== undefined && boardHeightMillimeters !== null && boardHeightMillimeters > 0;
            const hasFixedDiameter = diameterMillimeters !== undefined && diameterMillimeters !== null && diameterMillimeters > 0;
            const isAutoSize = !(hasFixedWidth || hasFixedHeight || hasFixedDiameter);

            const width = boardWidthMillimeters || diameterMillimeters || (isAutoSize ? 1.6 : 50);
            const height = boardHeightMillimeters || diameterMillimeters || (isAutoSize ? 1.6 : 50);

            const newOutline = {
                shape: shape || 'rectangle',
                width: width,
                height: height,
                x: -width / 2,
                y: -height / 2,
                autoSize: isAutoSize,
            };
            
            return { 
                success: true, 
                message: `[SIM] Board outline created. Shape: ${newOutline.shape}, Size: ${width}x${height}, AutoSize: ${isAutoSize}`,
                board_outline: newOutline 
            };
        };
        simulators.create_copper_pour = (args: any) => ({ success: true, message: `[SIM] Copper pour for '${args.netName}' created.`, pour: { net: args.netName, layer: args.layerName } });
        simulators.arrange_components = (args: any) => {
            const currentData = layoutDataRef.current;
            if (!currentData) {
                throw new Error("[SIM] arrange_components failed: currentLayoutData is null.");
            }
            const layout_data_for_pause = {
                nodes: currentData.nodes,
                edges: currentData.edges,
                rules: currentData.rules,
                copper_pours: currentData.copper_pours,
                board_outline: currentData.board_outline,
                layoutStrategy: args.layoutStrategy || 'agent',
            };
            return {
                success: true,
                message: '[SIM] Layout data extracted for arrangement.',
                layout_data: layout_data_for_pause,
                waitForUserInput: args.waitForUserInput === true,
            };
        };
        simulators.update_component_positions = (args: any) => ({ success: true, message: '[SIM] Component positions updated.' });
        simulators.autoroute_pcb = (args: any) => ({ success: true, message: '[SIM] Autorouting complete.', current_artifact: {title: "Routed PCB (Simulated)", path: 'game/artifacts/boards/phylactery_of_true_sight_routed.svg', svgPath: 'game/artifacts/boards/phylactery_of_true_sight_routed.svg'} });
        simulators.export_fabrication_files = (args: any) => ({ success: true, message: "[SIM] Fabrication files exported.", artifacts: { boardName: args.projectName, glbPath: `game/artifacts/boards/phylactery_of_true_sight_board.glb`, fabZipPath: `game/artifacts/boards/phylactery_of_true_sight_fab.zip` }});
        return simulators;
    }, [setCurrentLayoutData, setKicadProjectState]);

    return {
        state: {
            pcbArtifacts, kicadLog, currentKicadArtifact,
            isLayoutInteractive, currentLayoutData, kicadProjectState, workflowSteps,
            layoutHeuristics, isAutonomousMode,
        },
        setters: {
            setPcbArtifacts, setCurrentKicadArtifact,
            setIsLayoutInteractive,
            setCurrentLayoutData: setCurrentLayoutData,
            setLayoutHeuristics,
            setKicadLog,
            setIsAutonomousMode,
        },
        handlers: {
            handleStartKicadTask, setCurrentProjectName, updateWorkflowChecklist,
            handleUpdateLayout: setCurrentLayoutData,
            resetWorkflowSteps,
            INITIAL_LAYOUT_DATA,
            getKicadProjectState,
        },
        logKicadEvent,
        currentProjectNameRef,
        getKicadSystemPrompt,
        kicadSimulators,
    };
};
