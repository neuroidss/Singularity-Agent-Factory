import React, { useMemo } from 'react';
import type { LLMTool, UIToolRunnerProps } from '../types';
import KnowledgeGraphView from './ui_tools/KnowledgeGraphView';
import DebugLogView from './ui_tools/DebugLogView';

// Tell TypeScript about the global Babel object from the script tag in index.html
declare var Babel: any;

interface UIToolRunnerComponentProps {
  tool: LLMTool;
  props: UIToolRunnerProps;
}

// A wrapper to catch runtime errors in the compiled component
class ErrorBoundary extends React.Component<{ fallback: React.ReactNode, children: React.ReactNode, toolName: string }, { hasError: boolean }> {
  constructor(props: any) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: any) {
    return { hasError: true };
  }

  componentDidCatch(error: any, errorInfo: any) {
    console.error(`UI Tool Runner Error in tool '${this.props.toolName}':`, error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return this.props.fallback;
    }
    return this.props.children;
  }
}

export const UIToolRunner: React.FC<UIToolRunnerComponentProps> = ({ tool, props }) => {
  const CompiledComponent = useMemo(() => {
    if (tool.category !== 'UI Component') {
      return () => <div>Error: Tool "{tool.name}" is not a UI Component.</div>;
    }

    // Special case for complex, directly imported components
    if (tool.name === 'KnowledgeGraphView') { // This is the internal component, not the tool
        return KnowledgeGraphView;
    }
    if (tool.name === 'Debug Log View') {
        return DebugLogView;
    }

    // Sanitize the code by removing any potential top-level export statements.
    // This makes the runner more robust against AI-generated code that includes exports.
    // Also, ensure implementationCode is a string to prevent crashes.
    const code = tool.implementationCode || '';
    const sanitizedCode = code.replace(/export default .*;?/g, '');

    // The source code of the component function we're creating on the fly.
    // It takes props and includes the tool's implementation.
    const componentSource = `(props) => {
      const { ${Object.keys(props).join(', ')} } = props;
      ${sanitizedCode}
    }`;

    try {
      // Use Babel to transpile the JSX in our source string into standard JS
      const { code: transformedCode } = Babel.transform(componentSource, {
        presets: ['react']
      });

      // Create a "factory" function that, when called, will return our new component.
      // We pass in React to give the transpiled code access to it.
      const componentFactory = new Function('React', 'UIToolRunner', `return ${transformedCode}`);
      
      // Execute the factory to get the actual, runnable React component
      return componentFactory(React, UIToolRunner);

    } catch (e) {
      console.error(`Error compiling UI tool '${tool.name}':`, e);
      console.error('Offending code:', tool.implementationCode);
      return () => (
        <div className="p-4 bg-red-900/50 border-2 border-dashed border-red-500 rounded-lg text-red-300">
          <p className="font-bold">UI Compilation Error in "{tool.name}" (v{tool.version})</p>
          <pre className="mt-2 text-xs whitespace-pre-wrap">{e instanceof Error ? e.message : String(e)}</pre>
        </div>
      );
    }
  }, [tool.id, tool.version, tool.implementationCode, Object.keys(props).join(',')]); // Use stable dependency key

  const fallback = (
    <div className="p-4 bg-yellow-900/50 border-2 border-dashed border-yellow-500 rounded-lg text-yellow-300">
      <p className="font-bold">UI Runtime Error in "{tool.name}" (v{tool.version})</p>
      <p className="text-sm">The component failed to render. Check console for details.</p>
    </div>
  );

  return (
    <ErrorBoundary fallback={fallback} toolName={tool.name}>
        <CompiledComponent {...props} />
    </ErrorBoundary>
  );
};