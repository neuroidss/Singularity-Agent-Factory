
import type { KnowledgeGraph } from '../types';

export const LONGEVITY_KNOWLEDGE_GRAPH: KnowledgeGraph = {
  nodes: [
    { id: "Sirtuins", label: "Sirtuins" },
    { id: "AMPK", label: "AMPK" },
    { id: "mTOR", label: "mTOR" },
    { id: "NAD+", label: "NAD+" },
    { id: "Resveratrol", label: "Resveratrol" },
    { id: "Metformin", label: "Metformin" },
    { id: "Rapamycin", label: "Rapamycin" },
    { id: "Caloric Restriction", label: "Caloric Restriction" },
    { id: "Autophagy", label: "Autophagy" },
    { id: "Cellular Senescence", label: "Cellular Senescence" },
    { id: "DNA Repair", label: "DNA Repair" },
    { id: "Longevity", label: "Longevity" },
  ],
  edges: [
    { source: "Caloric Restriction", target: "Sirtuins" },
    { source: "Caloric Restriction", target: "AMPK" },
    { source: "Caloric Restriction", target: "mTOR" },
    { source: "NAD+", target: "Sirtuins" },
    { source: "Resveratrol", target: "Sirtuins" },
    { source: "Metformin", target: "AMPK" },
    { source: "Rapamycin", target: "mTOR" },
    { source: "Sirtuins", target: "DNA Repair" },
    { source: "AMPK", target: "Autophagy" },
    { source: "mTOR", target: "Autophagy" },
    { source: "Autophagy", target: "Cellular Senescence" },
    { source: "DNA Repair", target: "Longevity" },
    { source: "Autophagy", target: "Longevity" },
    // A conceptual link; senescence is a hallmark of aging, and reducing it promotes longevity.
    { source: "Cellular Senescence", target: "Longevity", label: "impacts" },
  ],
};
