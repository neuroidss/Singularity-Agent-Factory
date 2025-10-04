// VIBE_NOTE: Do not escape backticks or dollar signs in template literals in this file.
// Escaping is only for 'implementationCode' strings in tool definitions.
import React, { useMemo } from 'react';
import type { LLMTool, UIToolRunnerProps } from '../types';
import DebugLogView from './ui_tools/DebugLogView';
import * as Icons from './icons';
import { ALL_DATASHEETS } from '../bootstrap/datasheets';

// Destructure the imported datasheets for use in the new Function scope
const { ADS131M08_DATASHEET, LP5907_DATASHEET, XIAO_DATASHEET, ECS2520MV_DATASHEET } = ALL_DATASHEETS;

// Tell TypeScript about the global Babel object from the script tag in index.html
declare var Babel: any;

interface UIToolRunnerComponentProps {
  tool: LLMTool;
  props: UIToolRunnerProps;
}

// A wrapper to catch runtime errors in the compiled component.
// It now resets its error state if the tool being rendered changes.
type ErrorBoundaryProps = {
  fallback: React.ReactNode;
  toolName: string;
};
type ErrorBoundaryState = {
  hasError: boolean;
};
// Fix: The ErrorBoundary class must extend React.Component to have access to props, state, and lifecycle methods. This resolves multiple 'property does not exist' errors.
class ErrorBoundary extends React.Component<React.PropsWithChildren<ErrorBoundaryProps>, ErrorBoundaryState> {
  // Fix: Using a state class property is a more modern and robust way to initialize
  // state in React class components. This avoids potential issues with `this` context in
  // constructors and resolves errors where component properties like `state` and `props` were not found.
  state: ErrorBoundaryState = { hasError: false };

  static getDerivedStateFromError(error: any): ErrorBoundaryState {
    return { hasError: true };
  }

  componentDidUpdate(prevProps: Readonly<React.PropsWithChildren<ErrorBoundaryProps>>) {
    if (this.props.toolName !== prevProps.toolName) {
      // eslint-disable-next-line react/no-did-update-set-state
      this.setState({ hasError: false });
    }
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

const UIToolRunner: React.FC<UIToolRunnerComponentProps> = ({ tool, props }) => {
  // Memoize the compiled component to prevent re-compiling and re-mounting on every render,
  // which was causing the flickering and state loss in complex components like the interactive graph.
  const CompiledComponent = useMemo(() => {
    if (tool.category !== 'UI Component') {
      return () => <div>Error: Tool "{tool.name}" is not a UI Component.</div>;
    }

    // Special case for complex, directly imported components that don't need compilation.
    if (tool.name === 'Debug Log View') {
        return DebugLogView;
    }

    const code = tool.implementationCode || '';
    const sanitizedCode = code.replace(/export default .*;?/g, '');

    // Decouple component compilation from the live props object.
    // The list of props to destructure is derived from the tool's static definition.
    // This makes the compiled function stable across renders.
    const propKeys = tool.parameters?.map(p => p.name) || [];

    const componentSource = `(props) => {
      const { ${propKeys.join(', ')} } = props;
      ${sanitizedCode}
    }`;

    try {
      const { code: transformedCode } = Babel.transform(componentSource, {
        presets: ['react']
      });
      
      const iconNames = Object.keys(Icons);
      const iconComponents = Object.values(Icons);
      
      // Add datasheets to the function scope
      const datasheets = { ADS131M08_DATASHEET, LP5907_DATASHEET, XIAO_DATASHEET, ECS2520MV_DATASHEET };
      const datasheetNames = Object.keys(datasheets);
      const datasheetValues = Object.values(datasheets);
      
      const componentFactory = new Function('React', 'UIToolRunner', ...iconNames, ...datasheetNames, `return ${transformedCode}`);
      return componentFactory(React, UIToolRunner, ...iconComponents, ...datasheetValues);

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
  // The dependencies ensure re-compilation only happens if the tool's definition changes.
  // Using tool.id and tool.version is sufficient to detect tool updates.
  }, [tool.id, tool.version]);


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

export default UIToolRunner;
