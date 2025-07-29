import type { LLMTool } from '../../types';
import { applicationLayoutTools } from './application_layout';
import { configurationTools } from './configuration';
import { agentControlsTools } from './agent_controls';
import { displayTools } from './displays';
import { roboticsTools } from '../robotics_tools'; // Temporarily add robotics tools here

export const PREDEFINED_UI_TOOLS: LLMTool[] = [
  ...applicationLayoutTools,
  ...configurationTools,
  ...agentControlsTools,
  ...displayTools,
  ...roboticsTools.filter(t => t.category === 'UI Component'),
];
