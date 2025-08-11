

import type { ToolCreatorPayload } from '../types';

export const UI_DISPLAY_TOOLS: ToolCreatorPayload[] = [
    {
        name: 'User Input Form',
        description: 'Renders the main textarea for user input and the submit button.',
        category: 'UI Component',
        executionEnvironment: 'Client',
        purpose: 'To provide the primary user interface for assigning high-level goals to the agent swarm.',
        parameters: [
            {name: 'userInput', type: 'string', description: 'Current value of the input', required: true},
            {name: 'setUserInput', type: 'object', description: 'Function to update the input value', required: true},
            {name: 'handleSubmit', type: 'object', description: 'Function to call on submit', required: true},
            {name: 'isSwarmRunning', type: 'boolean', description: 'Whether the swarm is running.', required: true },
        ],
        implementationCode: `
          const Spinner = () => (
            <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
            </svg>
          );
          
          const isDisabled = isSwarmRunning;
          const buttonText = isSwarmRunning ? 'Agent is Active...' : 'Start Task';
          let placeholderText = "Describe a high-level goal for the agent...";
          if(isSwarmRunning) placeholderText = "Agent task is running...";
    
          return (
            <div className="w-full bg-gray-800/60 border border-gray-700 rounded-xl p-4">
                <h3 className="text-lg font-bold text-indigo-300 mb-2">Mission Control</h3>
                <div className="relative w-full group">
                    <textarea
                        id="userInput"
                        value={userInput}
                        onChange={(e) => setUserInput(e.target.value)}
                        placeholder={placeholderText}
                        className="w-full h-24 p-3 bg-gray-900 border border-gray-600 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-colors duration-200 resize-y disabled:cursor-not-allowed"
                        disabled={isDisabled}
                        onKeyDown={(e) => {
                            if (e.key === 'Enter' && !e.shiftKey) {
                                e.preventDefault();
                                if (!isDisabled) handleSubmit();
                            }
                        }}
                    />
                </div>
                <button
                    onClick={handleSubmit}
                    disabled={isDisabled || !userInput.trim()}
                    className="mt-3 w-full flex items-center justify-center gap-2 bg-indigo-600 text-white font-semibold py-2.5 px-4 rounded-lg hover:bg-indigo-700 disabled:bg-indigo-900/50 disabled:cursor-not-allowed disabled:text-gray-400 transition-all duration-200"
                >
                    {isSwarmRunning ? <Spinner /> : null}
                    {buttonText}
                </button>
            </div>
          );
        `
    },
    {
        name: 'Debug Log View',
        description: 'A floating panel that shows a running log of events, API call counts, and system reset functionality.',
        category: 'UI Component',
        executionEnvironment: 'Client',
        purpose: 'To provide essential debugging and monitoring capabilities for observing the agent\'s behavior and system state.',
        parameters: [
          { name: 'logs', type: 'array', description: 'The array of log messages.', required: true },
          { name: 'onReset', type: 'object', description: 'Function to reset all tools and progress.', required: true },
          { name: 'apiCallCount', type: 'number', description: 'The number of API calls made.', required: true },
        ],
        implementationCode: `// This component is implemented natively in DebugLogView.tsx`,
    },
    {
        name: 'Tool List Display',
        description: 'Renders the grid of all available tools, highlighting those selected for the current task.',
        category: 'UI Component',
        executionEnvironment: 'Client',
        purpose: 'To give the user a complete and real-time overview of all capabilities available to the agent swarm, on both client and server.',
        parameters: [
          { name: 'tools', type: 'array', description: 'Array of all available tools (client and server)', required: true },
          { name: 'isServerConnected', type: 'boolean', description: 'Whether the backend server is connected', required: true },
        ],
        implementationCode: `
          const [showDetailsId, setShowDetailsId] = React.useState(null);
    
          const sortedTools = React.useMemo(() => {
            return [...tools].sort((a, b) => {
              const aIsServer = a.category === 'Server';
              const bIsServer = b.category === 'Server';
              if (aIsServer && !bIsServer) return -1;
              if (!aIsServer && bIsServer) return 1;
              return a.name.localeCompare(b.name);
            });
          }, [tools]);
    
          const ServerStatus = () => {
              const statusStyle = isServerConnected
                ? "bg-green-900/50 text-green-300"
                : "bg-yellow-900/50 text-yellow-300";
              const dotStyle = isServerConnected ? "bg-green-500" : "bg-yellow-500";
              const text = isServerConnected ? "Server Connected" : "Server Offline";
              return (
                 <div className={\`flex-shrink-0 flex items-center gap-2 px-2.5 py-1 rounded-full text-xs font-semibold \${statusStyle}\`}>
                    <div className={\`w-2 h-2 rounded-full \${dotStyle} \${isServerConnected ? 'animate-pulse' : ''}\`}></div>
                    {text}
                </div>
              );
          }
    
          return (
            <div className="bg-gray-800/60 border border-gray-700 rounded-xl p-4 h-full">
                <div className="flex justify-between items-center mb-4">
                  <h3 className="text-lg font-bold text-indigo-300">Tool Library ({tools.length})</h3>
                  <ServerStatus />
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 max-h-[calc(100vh-250px)] overflow-y-auto pr-2">
                    {sortedTools.map(tool => {
                        const isServerTool = tool.category === 'Server';
                        return (
                          <div key={tool.id + '-' + tool.version} className="bg-gray-900/70 border border-gray-700 rounded-lg p-3 flex flex-col text-sm h-full">
                              <div className="flex justify-between items-start gap-2">
                                  <h4 className="font-bold text-white truncate pr-2 flex-grow">{tool.name}</h4>
                                  <span className={\`flex-shrink-0 text-xs font-semibold px-2 py-0.5 rounded-full \${isServerTool ? 'bg-sky-800 text-sky-300' : 'bg-gray-700 text-gray-300'}\`}>
                                      {isServerTool ? 'Server' : 'Client'}
                                  </span>
                              </div>
                              <p className="text-xs text-indigo-400 mt-1">{tool.category}</p>
                              <p className="text-gray-300 text-xs flex-grow my-2">{tool.description}</p>
                              {tool.purpose && <p className="text-xs text-yellow-300 bg-yellow-900/30 p-1 rounded italic">Purpose: {tool.purpose}</p>}
                              
                              <div className="mt-2 pt-2 border-t border-gray-700/50">
                                  <button
                                      onClick={() => setShowDetailsId(showDetailsId === tool.id ? null : tool.id)}
                                      className="text-left text-xs font-semibold text-cyan-300 hover:text-cyan-200"
                                  >
                                      {showDetailsId === tool.id ? '[-] Hide Details' : '[+] Show Details'}
                                  </button>
                                  {showDetailsId === tool.id && (
                                      <pre className="mt-2 text-xs text-cyan-200 bg-black p-2 rounded-md font-mono whitespace-pre-wrap max-h-48 overflow-auto">
                                          {isServerTool ? '# Server-side command:\\n' + tool.implementationCode : tool.implementationCode}
                                      </pre>
                                  )}
                              </div>
                          </div>
                        )
                    })}
                </div>
            </div>
          );
        `
    },
    {
        name: 'KiCad PCB Viewer',
        description: 'Displays an interactive 3D model of the generated PCB and provides a download link for the fabrication files.',
        category: 'UI Component',
        executionEnvironment: 'Client',
        purpose: 'To provide immediate, interactive visual feedback and access to the final product of the hardware engineering workflow.',
        parameters: [
            { name: 'boardName', type: 'string', description: 'The name of the generated board.', required: true },
            { name: 'glbPath', type: 'string', description: 'Server-relative path to the final board GLB model.', required: true },
            { name: 'fabZipPath', type: 'string', description: 'Server-relative path to the fabrication ZIP file.', required: true },
            { name: 'serverUrl', type: 'string', description: 'The base URL of the backend server.', required: true },
            { name: 'onClose', type: 'object', description: 'Function to call to close the viewer.', required: true },
        ],
        implementationCode: `
            const mountRef = React.useRef(null);

            React.useEffect(() => {
                if (!mountRef.current || !glbPath) return;

                let isMounted = true;
                let THREE, OrbitControls, GLTFLoader;

                const init = async () => {
                    try {
                        THREE = await import('three');
                        const { OrbitControls: OC } = await import('three/addons/controls/OrbitControls.js');
                        OrbitControls = OC;
                        const { GLTFLoader: GLTF } = await import('three/addons/loaders/GLTFLoader.js');
                        GLTFLoader = GLTF;
                    } catch (e) {
                         console.error("Failed to load Three.js libraries:", e);
                         if(mountRef.current) mountRef.current.innerHTML = '<p class="text-red-400">Error loading 3D libraries. Check console.</p>';
                         return;
                    }
                    
                    if (!isMounted || !mountRef.current) return;

                    const scene = new THREE.Scene();
                    scene.background = new THREE.Color(0x111827); // bg-gray-900

                    const mount = mountRef.current;
                    const camera = new THREE.PerspectiveCamera(75, mount.clientWidth / mount.clientHeight, 0.1, 1000);
                    camera.position.z = 50;

                    const renderer = new THREE.WebGLRenderer({ antialias: true });
                    renderer.setSize(mount.clientWidth, mount.clientHeight);
                    renderer.setPixelRatio(window.devicePixelRatio);
                    mount.innerHTML = '';
                    mount.appendChild(renderer.domElement);

                    const controls = new OrbitControls(camera, renderer.domElement);
                    controls.enableDamping = true;

                    const ambientLight = new THREE.AmbientLight(0xffffff, 2.0);
                    scene.add(ambientLight);
                    const directionalLight = new THREE.DirectionalLight(0xffffff, 3.5);
                    directionalLight.position.set(50, 100, 75);
                    scene.add(directionalLight);

                    const loader = new GLTFLoader();
                    const fullGlbUrl = serverUrl + '/' + glbPath.replace(/\\\\/g, '/');
                    
                    loader.load(fullGlbUrl, (gltf) => {
                        if (!isMounted) return;
                        const model = gltf.scene;
                        
                        const box = new THREE.Box3().setFromObject(model);
                        const center = box.getCenter(new THREE.Vector3());
                        model.position.sub(center);
                        
                        const size = box.getSize(new THREE.Vector3());
                        const maxDim = Math.max(size.x, size.y, size.z);
                        const fov = camera.fov * (Math.PI / 180);
                        let cameraZ = Math.abs(maxDim / 2 / Math.tan(fov / 2));
                        cameraZ *= 1.5;
                        camera.position.z = cameraZ;
                        
                        const minZ = box.min.z;
                        const cameraToFarEdge = (minZ < 0) ? -minZ + cameraZ : cameraZ - minZ;
                        camera.far = cameraToFarEdge * 3;
                        camera.updateProjectionMatrix();

                        controls.target.copy(model.position);
                        controls.update();
                        scene.add(model);
                    }, undefined, (error) => {
                        console.error('Error loading GLB model:', error);
                    });
                    
                    let animationFrameId;
                    const animate = () => {
                        if (!isMounted) return;
                        animationFrameId = requestAnimationFrame(animate);
                        controls.update();
                        renderer.render(scene, camera);
                    };
                    animate();
                    
                    const handleResize = () => {
                        if (!isMounted || !mount) return;
                        camera.aspect = mount.clientWidth / mount.clientHeight;
                        camera.updateProjectionMatrix();
                        renderer.setSize(mount.clientWidth, mount.clientHeight);
                    }
                    
                    window.addEventListener('resize', handleResize);

                    return () => {
                        isMounted = false;
                        cancelAnimationFrame(animationFrameId);
                        window.removeEventListener('resize', handleResize);
                        if (mount && mount.contains(renderer.domElement)) {
                            mount.removeChild(renderer.domElement);
                        }
                        renderer.dispose();
                    };
                };

                const cleanup = init();

                return () => {
                    cleanup.then(cleanupFn => cleanupFn && cleanupFn());
                };
            }, [glbPath, serverUrl]);

            const fullZipUrl = serverUrl + '/' + fabZipPath;

            return (
                <div className="bg-gray-800/90 border-2 border-green-500/60 rounded-xl p-4 shadow-lg flex flex-col h-full">
                    <div className="flex justify-between items-center mb-3">
                        <h3 className="text-lg font-bold text-green-300">PCB Fabrication Output</h3>
                        <button onClick={onClose} className="text-gray-400 hover:text-white text-2xl font-bold">&times;</button>
                    </div>
                    <p className="text-sm text-gray-300 mb-2">Generated board: <span className="font-mono text-green-400">{boardName}</span></p>

                    <div ref={mountRef} className="flex-grow bg-black/30 rounded-lg overflow-hidden relative cursor-grab" style={{minHeight: '300px'}}>
                       <div className="w-full h-full flex items-center justify-center">
                            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-green-300"></div>
                            <p className="text-green-300 ml-3">Loading 3D Model...</p>
                       </div>
                    </div>

                    <a
                        href={fullZipUrl}
                        download
                        className="mt-4 w-full text-center bg-green-600 text-white font-semibold py-2.5 px-4 rounded-lg hover:bg-green-700 transition-colors duration-200"
                    >
                        Download Fabrication Files (.zip)
                    </a>
                </div>
            );
        `
    },
    {
        name: 'Active Tool Context',
        description: 'Displays the list of tools that have been selected and provided to the agent for the current task, along with their relevance scores.',
        category: 'UI Component',
        executionEnvironment: 'Client',
        purpose: 'To provide clear, real-time feedback on exactly which tools the agent is considering for its current task.',
        parameters: [
          { name: 'activeTools', type: 'array', description: 'The array of scored tools currently in the context.', required: true },
        ],
        implementationCode: `
          if (!activeTools || activeTools.length === 0) {
            return null; // Don't render if there are no active tools (i.e., task is not running)
          }
    
          const ScoreBar = ({ score }) => {
            const percentage = Math.max(0, Math.min(100, score * 100));
            let colorClass = 'bg-green-500';
            if (percentage < 70) colorClass = 'bg-yellow-500';
            if (percentage < 55) colorClass = 'bg-orange-500';
    
            return (
              <div className="w-full bg-gray-600 rounded-full h-1.5 mt-1">
                <div className={colorClass + " h-1.5 rounded-full"} style={{ width: percentage + '%' }}></div>
              </div>
            );
          };
    
          return (
            <div className="bg-gray-800/60 border border-purple-500/60 rounded-xl p-4 h-full flex flex-col">
              <h3 className="text-lg font-bold text-purple-300 mb-3">Active Tool Context ({activeTools.length})</h3>
              <div className="flex-grow overflow-y-auto pr-2 space-y-2">
                {activeTools.map(({ tool, score }) => (
                  <div key={tool.id} className="bg-gray-900/50 p-2 rounded-lg">
                    <div className="flex justify-between items-center">
                      <p className="font-semibold text-white text-sm truncate pr-2">{tool.name}</p>
                      <p className="text-purple-300 font-mono text-sm">{score.toFixed(3)}</p>
                    </div>
                    <ScoreBar score={score} />
                  </div>
                ))}
              </div>
            </div>
          );
        `
    }
];