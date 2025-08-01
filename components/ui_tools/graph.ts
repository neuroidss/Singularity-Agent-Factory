
import type { LLMTool } from '../../types';

export const graphTools: LLMTool[] = [
  {
    id: 'tool_knowledge_graph_display',
    name: 'Tool Knowledge Graph Display',
    description: 'Renders an interactive knowledge graph of all available tools, showing their relationships and categories.',
    category: 'UI Component',
    version: 4,
    parameters: [
      { name: 'tools', type: 'array', description: 'Array of all available LLMTools', required: true },
      { name: 'UIToolRunner', type: 'string', description: 'The UI tool runner component itself, for recursion', required: true },
      { name: 'selectedGraphNode', type: 'object', description: 'The currently selected node in the graph.', required: false },
      { name: 'handleGraphNodeClick', type: 'string', description: 'Function to handle clicks on a graph node.', required: true },
      { name: 'runtime', type: 'object', description: 'The application runtime API.', required: true },
    ],
    implementationCode: `
      const [graphData, setGraphData] = React.useState(null);
      const [isGraphLoading, setIsGraphLoading] = React.useState(true);
      const [statusMessage, setStatusMessage] = React.useState("Initializing dynamic graph generation...");

      React.useEffect(() => {
          const generate = async () => {
              if (!runtime.graph) {
                  setStatusMessage("Error: Graph generation runtime is not available.");
                  setIsGraphLoading(false);
                  return;
              }
              try {
                  const data = await runtime.graph.generate(tools, setStatusMessage);
                  setGraphData(data);
              } catch (e) {
                  setStatusMessage(\`Failed to generate graph: \${e.message}\`);
                  console.error("Graph generation failed", e);
              } finally {
                  setIsGraphLoading(false);
              }
          };
          generate();
      }, [tools, runtime]);

      const renderContent = () => {
        if (isGraphLoading) {
          return (
              <div className="w-full h-[600px] flex flex-col items-center justify-center text-gray-400">
                  <div className="w-8 h-8 border-4 border-dashed rounded-full animate-spin border-indigo-400 mb-4"></div>
                  <p>{statusMessage}</p>
              </div>
          );
        }
        
        if (!graphData || !graphData.nodes || graphData.nodes.length === 0) {
            return <div className="w-full h-[600px] flex items-center justify-center text-yellow-400">{statusMessage || "Could not generate a valid graph."}</div>
        }

        return (
          <div className="w-full h-[600px] bg-gray-900/50 border border-gray-700 rounded-lg overflow-hidden">
              <UIToolRunner 
                  tool={{ name: 'KnowledgeGraphView', category: 'UI Component' }}
                  props={{
                      graph: graphData,
                      onNodeClick: handleGraphNodeClick,
                      selectedNodeId: selectedGraphNode ? selectedGraphNode.id : null,
                      highlightedNodeIds: null,
                      trendAnalysis: null,
                  }} 
              />
          </div>
        );
      };

      return (
        <div className="w-full max-w-7xl mx-auto mt-8">
            <h2 className="text-2xl font-bold text-center mb-6 text-gray-300">Tool Knowledge Graph (Dynamic)</h2>
            {renderContent()}
        </div>
      );
    `,
  },
];