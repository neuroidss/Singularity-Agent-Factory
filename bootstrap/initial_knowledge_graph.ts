
import type { KnowledgeGraph, KnowledgeGraphNode, KnowledgeGraphEdge } from '../types';
import { LONGEVITY_KNOWLEDGE_GRAPH } from './longevity_graph';

// --- Pre-computed Datasheet Extractions (Embedded for offline demo reliability) ---
const ADS131M08_PINS = [{"pin": 1, "name": "AIN2P"}, {"pin": 2, "name": "AIN2N"}, {"pin": 3, "name": "AIN3N"}, {"pin": 4, "name": "AIN3P"}, {"pin": 5, "name": "AIN4P"}, {"pin": 6, "name": "AIN4N"}, {"pin": 7, "name": "AIN5N"}, {"pin": 8, "name": "AIN5P"}, {"pin": 9, "name": "AIN6P"}, {"pin": 10, "name": "AIN6N"}, {"pin": 11, "name": "AIN7N"}, {"pin": 12, "name": "AIN7P"}, {"pin": 13, "name": "AGND"}, {"pin": 14, "name": "REFIN"}, {"pin": 15, "name": "AVDD"}, {"pin": 16, "name": "SYNC/RESET"}, {"pin": 17, "name": "CS"}, {"pin": 18, "name": "DRDY"}, {"pin": 19, "name": "SCLK"}, {"pin": 20, "name": "DOUT"}, {"pin": 21, "name": "DIN"}, {"pin": 22, "name": "XTAL2"}, {"pin": 23, "name": "XTAL1/CLKIN"}, {"pin": 24, "name": "CAP"}, {"pin": 25, "name": "DGND"}, {"pin": 26, "name": "DVDD"}, {"pin": 27, "name": "NC"}, {"pin": 28, "name": "AGND"}, {"pin": 29, "name": "AIN0P"}, {"pin": 30, "name": "AIN0N"}, {"pin": 31, "name": "AIN1N"}, {"pin": 32, "name": "AIN1P"}];
const LP5907_PINS = [{"pin": 1, "name": "IN"}, {"pin": 2, "name": "GND"}, {"pin": 3, "name": "EN"}, {"pin": 4, "name": "N/C"}, {"pin": 5, "name": "OUT"}];
const ECS2520MV_PINS = [{"pin": 1, "name": "Tri-state"}, {"pin": 2, "name": "Gnd"}, {"pin": 3, "name": "Output"}, {"pin": 4, "name": "Vdd"}];
// Note: This is the pinout for the XIAO headers, not the raw module pins.
const XIAO_HEADER_1_PINS = [{"pin": 1, "name": "D0"}, {"pin": 2, "name": "D1"}, {"pin": 3, "name": "D2"}, {"pin": 4, "name": "D3"}, {"pin": 5, "name": "D4/SDA"}, {"pin": 6, "name": "D5/SCL"}, {"pin": 7, "name": "D6/TX"}];
const XIAO_HEADER_2_PINS = [{"pin": 1, "name": "5V"}, {"pin": 2, "name": "GND"}, {"pin": 3, "name": "3V3"}, {"pin": 4, "name": "D10/MOSI"}, {"pin": 5, "name": "D9/MISO"}, {"pin": 6, "name": "D8/SCK"}, {"pin": 7, "name": "D7/RX"}];


// --- Base Graph Definition ---
const baseNodes: KnowledgeGraphNode[] = [
    // --- Market Pull Side ---
    { id: "use_case_eeg", label: "EEG Data Acquisition", type: "MarketNeed" },
    { id: "eeg_mezzanine", label: "EEG Mezzanine Board", type: "Device" },
    
    // --- Components ---
    { id: 'U1', label: 'U1 (ADS131M08)', type: "Component" },
    { id: 'U2', label: 'U2 (LP5907)', type: "Component" },
    { id: 'U3', label: 'U3 (LP5907)', type: "Component" },
    { id: 'X1', label: 'X1 (ECS-2520MV)', type: "Component" },
    ...['C1', 'C2', 'C3', 'C4', 'C5', 'C6', 'C7', 'C8'].map(c => ({ id: c, label: c, type: "Component" })),
    ...Array.from({ length: 10 }, (_, i) => ({ id: `J${i + 1}`, label: `J${i + 1}`, type: "Component" })),
    { id: 'J_XIAO_1', label: 'J_XIAO_1', type: "Component" },
    { id: 'J_XIAO_2', label: 'J_XIAO_2', type: "Component" },

    // --- Technology Push Side (Longevity) ---
    ...LONGEVITY_KNOWLEDGE_GRAPH.nodes.map(n => ({...n, type: 'Technology'})),
];

const baseEdges: KnowledgeGraphEdge[] = [
    // --- Market Pull Connections ---
    { source: "eeg_mezzanine", target: "use_case_eeg", label: "enables" },
    ...baseNodes.filter(n => n.type === 'Component').map(c => ({ source: "eeg_mezzanine", target: c.id, label: "uses" })),

    // --- Technology Push Connections ---
    ...LONGEVITY_KNOWLEDGE_GRAPH.edges,
    { source: 'eeg_mezzanine', target: 'Longevity', label: 'enables_research_into' }
];

// --- Dynamic Pin Generation ---
const componentPinData = {
    'U1': ADS131M08_PINS,
    'U2': LP5907_PINS,
    'U3': LP5907_PINS,
    'X1': ECS2520MV_PINS,
    'J_XIAO_1': XIAO_HEADER_1_PINS,
    'J_XIAO_2': XIAO_HEADER_2_PINS,
};

const pinNodes: KnowledgeGraphNode[] = [];
const pinEdges: KnowledgeGraphEdge[] = [];

Object.entries(componentPinData).forEach(([componentId, pins]) => {
    pins.forEach(pin => {
        pinNodes.push({
            id: `${componentId}-${pin.pin}`,
            label: `${pin.pin}: ${pin.name}`,
            type: 'Pin'
        });
        pinEdges.push({
            source: componentId,
            target: `${componentId}-${pin.pin}`,
            label: 'has_pin'
        });
    });
});

// --- Final Export ---
export const INNOVATION_KNOWLEDGE_GRAPH: KnowledgeGraph = {
  nodes: [...baseNodes, ...pinNodes],
  edges: [...baseEdges, ...pinEdges],
};
