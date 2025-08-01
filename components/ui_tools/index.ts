import type { LLMTool } from '../../types';
import { applicationLayoutTools } from './application_layout';
import { configurationTools } from './configuration';
import { agentControlsTools } from './agent_controls';
import { displayTools } from './displays';
import { roboticsTools } from '../robotics_tools';
import { graphTools } from './graph';

export const PREDEFINED_UI_TOOLS: LLMTool[] = [
  ...applicationLayoutTools,
  ...configurationTools,
  ...agentControlsTools,
  ...displayTools,
  ...graphTools,
  ...roboticsTools.filter(t => t.category === 'UI Component'),
];
