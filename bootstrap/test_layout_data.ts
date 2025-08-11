
import type { KnowledgeGraph } from '../types';

export const TEST_LAYOUT_DATA: KnowledgeGraph = {
  nodes: [
    {
      id: "U1", label: "U1 (ESP32)", width: 7, height: 7,
      pins: [
        { name: "1", x: -3.5, y: -2.5 }, { name: "2", x: -3.5, y: -1.5 }, { name: "3", x: -3.5, y: -0.5 }, { name: "4", x: -3.5, y: 0.5 }, { name: "5", x: -3.5, y: 1.5 }, { name: "6", x: -3.5, y: 2.5 },
        { name: "7", x: -2.5, y: 3.5 }, { name: "8", x: -1.5, y: 3.5 }, { name: "9", x: -0.5, y: 3.5 }, { name: "10", x: 0.5, y: 3.5 }, { name: "11", x: 1.5, y: 3.5 }, { name: "12", x: 2.5, y: 3.5 },
        { name: "13", x: 3.5, y: 2.5 }, { name: "14", x: 3.5, y: 1.5 }, { name: "15", x: 3.5, y: 0.5 }, { name: "16", x: 3.5, y: -0.5 }, { name: "17", x: 3.5, y: -1.5 }, { name: "18", x: 3.5, y: -2.5 },
        { name: "19", x: 2.5, y: -3.5 }, { name: "20", x: 1.5, y: -3.5 }, { name: "21", x: 0.5, y: -3.5 }, { name: "22", x: -0.5, y: -3.5 }, { name: "23", x: -1.5, y: -3.5 }, { name: "24", x: -2.5, y: -3.5 },
      ],
      pin_count: 24,
      svgPath: null, glbPath: null, model3d_props: null,
      x: 0, y: 0, rotation: 0
    },
    {
      id: "U2", label: "U2 (Sensor)", width: 2.5, height: 2.5,
      pins: [
        { name: "1", x: -1.25, y: 0.5 }, { name: "2", x: -1.25, y: -0.5 },
        { name: "3", x: 1.25, y: -0.5 }, { name: "4", x: 1.25, y: 0.5 },
      ],
      pin_count: 4,
      svgPath: null, glbPath: null, model3d_props: null,
      x: 0, y: 0, rotation: 0
    },
    {
      id: "J1", label: "J1 (USB-C)", width: 9, height: 3.5,
      pins: [
          { name: "1", x: -3, y: 1.75 }, { name: "2", x: -1, y: 1.75 }, { name: "3", x: 1, y: 1.75 }, { name: "4", x: 3, y: 1.75 },
      ],
      pin_count: 4,
      svgPath: null, glbPath: null, model3d_props: null,
      x: 0, y: 0, rotation: 0
    },
    { id: "R1", label: "R1", width: 1.0, height: 0.5, pins: [{ name: "1", x: 0, y: -0.25 }, { name: "2", x: 0, y: 0.25 }], pin_count: 2, svgPath: null, glbPath: null, model3d_props: null, x: 0, y: 0, rotation: 0 },
    { id: "R2", label: "R2", width: 1.0, height: 0.5, pins: [{ name: "1", x: 0, y: -0.25 }, { name: "2", x: 0, y: 0.25 }], pin_count: 2, svgPath: null, glbPath: null, model3d_props: null, x: 0, y: 0, rotation: 0 },
    { id: "D1", label: "D1 (LED)", width: 1.6, height: 0.8, pins: [{ name: "1", x: 0, y: -0.4 }, { name: "2", x: 0, y: 0.4 }], pin_count: 2, svgPath: null, glbPath: null, model3d_props: null, x: 0, y: 0, rotation: 0 },
    { id: "D2", label: "D2 (LED)", width: 1.6, height: 0.8, pins: [{ name: "1", x: 0, y: -0.4 }, { name: "2", x: 0, y: 0.4 }], pin_count: 2, svgPath: null, glbPath: null, model3d_props: null, x: 0, y: 0, rotation: 0 },
  ],
  edges: [
    // Power nets
    { source: "J1-1", target: "U1-1", label: "VBUS" },
    { source: "J1-4", target: "U1-6", label: "GND" },
    { source: "U1-6", target: "U2-2", label: "GND" },
    { source: "U1-6", target: "D1-1", label: "GND" },
    { source: "U1-6", target: "D2-1", label: "GND" },
    { source: "U1-2", target: "U2-1", label: "3V3" },
    // USB Data
    { source: "J1-2", target: "U1-20", label: "D-" },
    { source: "J1-3", target: "U1-19", label: "D+" },
    // I2C for Sensor
    { source: "U1-4", target: "U2-4", label: "SCL" },
    { source: "U1-5", target: "U2-3", label: "SDA" },
    // LEDs
    { source: "U1-10", target: "R1-1", label: "LED1_CTRL" },
    { source: "R1-2", target: "D1-2", label: "LED1_SINK" },
    { source: "U1-11", target: "R2-1", label: "LED2_CTRL" },
    { source: "R2-2", target: "D2-2", label: "LED2_SINK" },
  ],
  board_outline: {
    x: 0,
    y: 0,
    width: 100,
    height: 100,
  },
  constraints: [],
};