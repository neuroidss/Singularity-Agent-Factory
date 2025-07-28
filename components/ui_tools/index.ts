import type { LLMTool } from '../../types';
import { applicationLayoutTools } from './application_layout';
import { configurationTools } from './configuration';
import { agentControlsTools } from './agent_controls';
import { displayTools } from './displays';

export const PREDEFINED_UI_TOOLS: LLMTool[] = [
  ...applicationLayoutTools,
  ...configurationTools,
  ...agentControlsTools,
  ...displayTools,
];
