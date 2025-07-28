import type { LLMTool } from '../../types';

export const applicationLayoutTools: LLMTool[] = [
  {
    id: 'application_header',
    name: 'Application Header',
    description: 'Renders the main header and subtitle of the application.',
    category: 'UI Component',
    version: 4,
    parameters: [],
    implementationCode: `
      return (
        <header className="text-center mb-6">
          <h1 className="text-3xl font-bold text-gray-200">
              Singularity Agent Factory
          </h1>
          <p className="mt-1 text-sm text-gray-400">
              An experimental, self-improving AI agent.
          </p>
        </header>
      );
    `,
  },
  {
    id: 'security_warning_banner',
    name: 'Security Warning Banner',
    description: 'Renders the security warning about AI-generated code execution.',
    category: 'UI Component',
    version: 2,
    parameters: [],
    implementationCode: `
      return (
        <div className="w-full max-w-7xl mx-auto p-2 mb-4 bg-yellow-900/40 border border-yellow-700/60 rounded-md text-yellow-300 text-center text-xs">
          <p>️<span className="font-bold">Warning:</span> This app's UI and logic are modifiable by the AI. Unpredictable behavior may occur.</p>
        </div>
      );
    `
  },
  {
    id: 'application_footer',
    name: 'Application Footer',
    description: 'Renders the footer with attribution.',
    category: 'UI Component',
    version: 1,
    parameters: [],
    implementationCode: `
      return (
        <footer className="text-center mt-12 text-gray-500 text-sm">
          <p>Powered by Google Gemini</p>
        </footer>
      );
    `
  },
];
