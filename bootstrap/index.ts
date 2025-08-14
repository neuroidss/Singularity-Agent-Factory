
import type { ToolCreatorPayload } from '../types';

import { AUTOMATION_TOOLS } from './automation_tools';
import { UI_CONFIG_TOOLS } from './ui_config_tools';
import { UI_DISPLAY_TOOLS } from './ui_display_tools';
import { UI_LAYOUT_TOOLS } from './ui_layout_tools';
import { KICAD_TOOLS } from './kicad_tools';
import { ROBOTICS_TOOLS } from './robotics_tools';
import { UI_AGENT_TOOLS } from './ui_agent_tools';
import { PHYSICS_LAYOUT_TOOLS } from './rapier_layout_tool';
import { STRATEGY_TOOLS } from './strategy_tools';
import { TEST_LAYOUT_DATA } from './test_layout_data';
import { DEMO_WORKFLOW } from './demo_workflow';
import { WORKFLOW_CAPTURE_PANEL_TOOL } from './post_run_tools';
import { UI_DEMO_TOOLS } from './ui_demo_tools';


export const BOOTSTRAP_TOOL_PAYLOADS: ToolCreatorPayload[] = [
    ...AUTOMATION_TOOLS,
    ...UI_CONFIG_TOOLS,
    ...UI_DISPLAY_TOOLS,
    ...UI_LAYOUT_TOOLS,
    ...KICAD_TOOLS,
    ...ROBOTICS_TOOLS,
    ...UI_AGENT_TOOLS,
    ...PHYSICS_LAYOUT_TOOLS,
    ...STRATEGY_TOOLS,
    WORKFLOW_CAPTURE_PANEL_TOOL,
    ...UI_DEMO_TOOLS,
];

// Export the test data separately so it can be imported directly
export { TEST_LAYOUT_DATA, DEMO_WORKFLOW };
