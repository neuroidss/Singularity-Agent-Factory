import type { ToolCreatorPayload } from '../types';

import { UI_CONFIG_TOOLS } from './ui_config_tools';
import { UI_DISPLAY_TOOLS } from './ui_display_tools';
import { KICAD_TOOLS } from './kicad_tools';
import { ROBOTICS_TOOLS } from './robotics_tools';
import { UI_AGENT_TOOLS } from './ui_agent_tools';
import { PHYSICS_LAYOUT_TOOLS } from './rapier_layout_tool';
import { STRATEGY_TOOLS } from './strategy_tools';
import { WORKFLOW_CAPTURE_PANEL_TOOL } from './post_run_tools';
import { UI_WORKFLOW_TOOLS } from './ui_demo_tools';
import { LAYOUT_RULES_TOOLS } from './ui_layout_rules_tools';
import { UI_LAYOUT_HEURISTICS_TOOLS } from './ui_layout_heuristics_tools';
import { INSPECTOR_TOOL_PAYLOAD } from './ui_inspector_tool';
import { UI_LAYOUT_TOOLS } from './ui_layout_tools';
import { SIMULATION_TOOLS } from './simulation_tools';
import { DATASHEET_TOOLS } from './datasheet_tools';
import { AETHERIUM_TOOLS, AETHERIUM_CLIENT_TOOL_PAYLOAD } from './aetherium_tools';
import { NEUROFEEDBACK_TOOLS } from './neurofeedback_tools';
import { SUPPLY_CHAIN_TOOLS } from './supply_chain_tools';
import { UI_SYSTEM_TOOLS } from './ui_system_tools';
import { MIXED_REALITY_TOOLS } from './mixed_reality_tools';
import { UI_WORLD_MODEL_TOOLS } from './ui_world_model_tools';
import { GAMEPAD_TOOLS } from './gamepad_tools';
import { FIELD_AGENT_TOOLS } from './field_agent_tools';
import { GAZEBO_TOOLS } from './gazebo_tools';
import { MCP_TOOLS } from '../framework/mcp';
import { AUTOMATION_TOOLS } from './automation_tools';
import { FILM_PRODUCTION_TOOLS } from './film_production_tools';
import { VIRTUAL_FILM_SET_TOOLS } from './virtual_film_set_tools';
import { AUDIO_PRODUCTION_TOOLS } from './audio_production_tools';

export const BOOTSTRAP_TOOL_PAYLOADS: ToolCreatorPayload[] = [
    ...AUTOMATION_TOOLS,
    ...MCP_TOOLS,
    ...UI_CONFIG_TOOLS,
    ...UI_DISPLAY_TOOLS,
    ...KICAD_TOOLS,
    ...ROBOTICS_TOOLS,
    ...UI_AGENT_TOOLS,
    ...PHYSICS_LAYOUT_TOOLS,
    ...STRATEGY_TOOLS,
    ...SIMULATION_TOOLS,
    ...DATASHEET_TOOLS,
    ...AETHERIUM_TOOLS,
    AETHERIUM_CLIENT_TOOL_PAYLOAD,
    ...NEUROFEEDBACK_TOOLS,
    ...SUPPLY_CHAIN_TOOLS,
    ...MIXED_REALITY_TOOLS,
    ...UI_WORLD_MODEL_TOOLS,
    ...GAMEPAD_TOOLS,
    ...FIELD_AGENT_TOOLS,
    ...GAZEBO_TOOLS,
    ...FILM_PRODUCTION_TOOLS,
    ...VIRTUAL_FILM_SET_TOOLS,
    ...AUDIO_PRODUCTION_TOOLS,
    WORKFLOW_CAPTURE_PANEL_TOOL,
    ...UI_WORKFLOW_TOOLS,
    ...LAYOUT_RULES_TOOLS,
    ...UI_LAYOUT_HEURISTICS_TOOLS,
    INSPECTOR_TOOL_PAYLOAD,
    ...UI_LAYOUT_TOOLS,
    ...UI_SYSTEM_TOOLS,
];