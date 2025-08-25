
import type { AIToolCall } from '../types';
import { WORKFLOW_SCRIPT } from './demo_workflow';

export const EXAMPLE_PROMPTS: { name: string; prompt: string }[] = [
    {
        name: 'Circular EEG Board',
        prompt: `I need a PCB design for a FreeEEG8-alpha inspired mezzanine board.

Here is the plan:

1.  **Component Definition:**
    *   ADC 'U1': 'ADS131M08', footprint: 'Package_QFP:LQFP-32_5x5mm_P0.5mm', 32 pins.
    *   AVDD LDO 'U2': 'LP5907QMFX-3.3Q1', footprint: 'Package_TO_SOT_SMD:SOT-23-5', 5 pins.
    *   DVDD LDO 'U3': 'LP5907QMFX-3.3Q1', footprint: 'Package_TO_SOT_SMD:SOT-23-5', 5 pins.
    *   Oscillator 'X1': '8.192MHz', footprint: 'freeeeg8-alpha:Oscillator_SMD_EuroQuartz_XO32-4Pin_3.2x2.5mm_RotB_HandSoldering', 4 pins.
    *   Capacitors: 'C1' (220nF), 'C2' (100nF), 'C3' & 'C4' (1uF), all footprint: 'Capacitor_SMD:C_0402_1005Metric', 2 pins each.
    *   LDO Caps: 'C5'-'C8' (2.2uF), footprint: 'Capacitor_SMD:C_0603_1608Metric', 2 pins each.
    *   XIAO Headers 'J_XIAO_1', 'J_XIAO_2', footprint: 'Connector_PinHeader_2.54mm:PinHeader_1x07_P2.54mm_Vertical_SMD_Pin1Right', 7 pins each.
    *   Pogo Pins 'J1'-'J10', footprint: 'freeeeg8-alpha:pogo_pin_d5x10mm_smd', 1 pin each, side: bottom.

2.  **Net Definition:**
    *   A net named 'GND' connecting pins: ["U1-13", "U1-25", "U1-28", "J10-1", "C1-1", "C2-1", "C3-2", "C4-2", "U2-2", "C5-2", "C6-1", "C7-1", "C8-2", "J_XIAO_2-6", "X1-2"]
    *   A net named 'AVDD' connecting pins: ["U1-15", "C3-1", "U2-5", "C5-1"]
    *   A net named 'DVDD' connecting pins: ["U1-26", "C4-1", "U3-5", "C7-2", "X1-4"]
    *   A net named '5V' connecting pins: ["J_XIAO_2-7", "C6-2", "C8-1", "U2-1", "U3-1", "U2-3", "U3-3"]
    *   A net named 'CAP' connecting pins: ["C1-2", "U1-24"]
    *   A net named 'REFIN' connecting pins: ["C2-2", "U1-14"]
    *   A net named 'SYNC/RESET' connecting pins: ["U1-16", "J_XIAO_1-1"]
    *   A net named 'DRDY' connecting pins: ["U1-18", "J_XIAO_1-2"]
    *   A net named 'CS' connecting pins: ["U1-17", "J_XIAO_1-3"]
    *   A net named 'DIN' connecting pins: ["U1-21", "J_XIAO_2-4"]
    *   A net named 'SCLK' connecting pins: ["U1-19", "J_XIAO_2-2"]
    *   A net named 'DOUT' connecting pins: ["U1-20", "J_XIAO_2-3"]
    *   A net named 'XTAL1/CLKIN' connecting pins: ["U1-23", "X1-1"]
    *   A net named 'AIN0P' connecting pins: ["J1-1", "U1-29"]
    *   A net named 'AIN1P' connecting pins: ["J2-1", "U1-32"]
    *   A net named 'AIN2P' connecting pins: ["J3-1", "U1-1"]
    *   A net named 'AIN3P' connecting pins: ["J4-1", "U1-4"]
    *   A net named 'AIN4P' connecting pins: ["J5-1", "U1-5"]
    *   A net named 'AIN5P' connecting pins: ["J6-1", "U1-8"]
    *   A net named 'AIN6P' connecting pins: ["J7-1", "U1-9"]
    *   A net named 'AIN7P' connecting pins: ["J8-1", "U1-12"]
    *   A net named 'AINREF' connecting pins: ["J9-1", "U1-2", "U1-3", "U1-6", "U1-7", "U1-10", "U1-11", "U1-30", "U1-31"]

3.  **Layout Rules:**
    *   The pogo pins (J1 to J10) should be on the 'bottom' layer, arranged in a circle with a radius of 10mm.
    *   All other than pogo pins components should be on the 'top' layer.
    *   The core components 'U1' and 'X1' must be aligned to the central vertical axis.
    *   The design must be symmetrical. The following pairs should be mirrored across the vertical axis: [J_XIAO_1, J_XIAO_2], [U2, U3], [C5, C7], [C6, C8], [C1, C2], [C3, C4].
    *   To ensure good power integrity, the decoupling capacitors must be kept close to the ADC. Define proximity groups for [U1, C1], [U1, C2], [U1, C3], and [U1, C4].
    *   Create proximity rules to place decoupling capacitors C1-C4 near ADC U1, C5-C6 near LDO U2, and C7-C8 near LDO U3.

4.  **Board Generation:**
    *   4.1. Generate netlist.
    *   4.2. Create initial PCB.
    *   4.2. Create a circular 26mm diameter outline.

5.  Arrange the components using the 'agent' arrangement strategy, which respects the defined layout rules, and wait for user input for final adjustments.
6.  Autoroute the PCB.
7.  Export the final fabrication files.

    `
    },
    // Add more prompts here in the future
];

export const WORKFLOW_SCRIPTS: { name: string; workflow: AIToolCall[] }[] = [
    {
        name: 'Circular EEG Board Script',
        workflow: WORKFLOW_SCRIPT
    },
    // Add more scripts here in the future
];
