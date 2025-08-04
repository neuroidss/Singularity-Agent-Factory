
import type { LLMTool } from '../../types';
import { applicationLayoutTools } from './application_layout';
import { displayTools } from './displays';
import { roboticsTools } from '../robotics_tools';
import { agentViewTools } from './agent_views';
import { configurationTools } from './configuration';


export const PREDEFINED_UI_TOOLS: LLMTool[] = [
  ...applicationLayoutTools,
  ...displayTools,
  ...agentViewTools,
  ...configurationTools,
  ...roboticsTools.filter(t => t.category === 'UI Component'),
];
