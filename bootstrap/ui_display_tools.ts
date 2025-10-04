


import type { ToolCreatorPayload } from '../types';

export const UI_DISPLAY_TOOLS: ToolCreatorPayload[] = [
    {
        name: 'Debug Log View',
        description: 'A floating panel that shows a running log of events, API call counts, and system reset functionality.',
        category: 'UI Component',
        executionEnvironment: 'Client',
        purpose: 'To provide essential debugging and monitoring capabilities for observing the agent\'s behavior and system state.',
        parameters: [
          { name: 'logs', type: 'array', description: 'The array of log messages.', required: true },
          { name: 'onReset', type: 'object', description: 'Function to reset all tools and progress.', required: true },
          { name: 'apiCallCounts', type: 'object', description: 'A record of API calls per model.', required: true },
          { name: 'apiCallLimit', type: 'number', description: 'The limit for API calls.', required: true },
          { name: 'agentCount', type: 'number', description: 'The number of active agents.', required: true },
        ],
        implementationCode: `// This component is implemented natively in DebugLogView.tsx`,
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
                
                const init3D = async () => {
                    try {
                        THREE = await import('three');
                        const { OrbitControls: OC } = await import('three/addons/controls/OrbitControls.js');
                        OrbitControls = OC;
                        const { GLTFLoader: GLTF } = await import('three/addons/loaders/GLTFLoader.js');
                        GLTFLoader = GLTF;
                    } catch (e) {
                         console.error("Failed to load Three.js libraries:", e);
                         if(mountRef.current) mountRef.current.innerHTML = '<p class="text-red-400">Error loading 3D libraries. Check console.</p>';
                         return null;
                    }
                    
                    if (!isMounted || !mountRef.current) return null;

                    const mount = mountRef.current;
                    const scene = new THREE.Scene();
                    scene.background = new THREE.Color(0x111827);
                    const camera = new THREE.PerspectiveCamera(75, mount.clientWidth / mount.clientHeight, 0.1, 1000);
                    camera.position.z = 50;
                    const renderer = new THREE.WebGLRenderer({ antialias: true });
                    renderer.setSize(mount.clientWidth, mount.clientHeight);
                    renderer.setPixelRatio(window.devicePixelRatio);
                    mount.innerHTML = '';
                    mount.appendChild(renderer.domElement);
                    const controls = new OrbitControls(camera, renderer.domElement);
                    controls.enableDamping = true;
                    scene.add(new THREE.AmbientLight(0xffffff, 2.0));
                    const directionalLight = new THREE.DirectionalLight(0xffffff, 3.5);
                    directionalLight.position.set(50, 100, 75);
                    scene.add(directionalLight);
                    const loader = new GLTFLoader();

                    const fullGlbUrl = serverUrl + '/' + glbPath.replace(/\\\\/g, '/');
                    
                    const loadGltfFromBlob = (blob) => {
                        const url = URL.createObjectURL(blob);
                        loader.load(url, (gltf) => {
                            if (!isMounted) return;
                            const model = gltf.scene;
                            model.scale.set(1000, 1000, 1000); // KiCad exports in meters, Three.js scene is in mm
                            model.rotation.x = -Math.PI / 2;
                            model.updateMatrixWorld(true);
                            const box = new THREE.Box3().setFromObject(model);
                            const center = box.getCenter(new THREE.Vector3());
                            const size = box.getSize(new THREE.Vector3());

                            // Center the model on X/Z and place its bottom at Y=0
                            model.position.x -= center.x;
                            model.position.y -= box.min.y;
                            model.position.z -= center.z;

                            const maxDim = Math.max(size.x, size.y, size.z);
                            const fov = camera.fov * (Math.PI / 180);
                            let cameraZ = Math.abs(maxDim / 2 / Math.tan(fov / 2));
                            cameraZ *= 1.5; // Zoom out a bit for padding
                            camera.position.z = cameraZ;
                            camera.position.y = cameraZ * 0.75; // Angled view from above
                            camera.far = cameraZ * 3;
                            camera.updateProjectionMatrix();

                            // Look at the vertical center of the model
                            controls.target.set(0, size.y / 2, 0);
                            controls.update();
                            scene.add(model);
                            URL.revokeObjectURL(url);
                        }, undefined, (error) => console.error('Error loading GLB from blob:', error));
                    };
                    
                    if (window.cacheService) {
                        window.cacheService.getAssetBlob(fullGlbUrl).then(async (blob) => {
                            if (blob && isMounted) {
                                loadGltfFromBlob(blob);
                            } else if (isMounted) {
                                fetch(fullGlbUrl)
                                    .then(res => res.ok ? res.blob() : Promise.reject(new Error(\`HTTP \${res.status}\`)))
                                    .then(blob => {
                                        if (isMounted) {
                                            window.cacheService.setAssetBlob(fullGlbUrl, blob);
                                            loadGltfFromBlob(blob);
                                        }
                                    })
                                    .catch(err => console.error('Failed to fetch and cache GLB:', err));
                            }
                        });
                    } else {
                         loader.load(fullGlbUrl, (gltf) => { /* original logic */ }, undefined, (error) => console.error('Error loading GLB:', error));
                    }

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
                    };
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

                const cleanupPromise = init3D();
                return () => {
                    cleanupPromise.then(cleanupFn => cleanupFn && cleanupFn());
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
        name: 'UI Component Panel',
        description: 'A panel on the right sidebar for displaying contextual UI elements like the active tool context.',
        category: 'UI Component',
        executionEnvironment: 'Client',
        purpose: 'To group and display contextual UI tools in the sidebar.',
        parameters: [
          { name: 'activeTools', type: 'array', description: 'The array of scored tools currently in the context.', required: true },
          { name: 'getTool', type: 'object', description: 'Function to retrieve a tool definition by name.', required: true },
        ],
        implementationCode: `
            const [isContextVisible, setContextVisible] = React.useState(true);
            
            // A simple chevron icon component
            const ChevronIcon = ({ open }) => (
                <svg xmlns="http://www.w3.org/2000/svg" className={"h-5 w-5 transition-transform duration-200 " + (open ? 'rotate-180' : '')} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
            );

            return (
                <div className="bg-gray-800/60 border border-gray-700 rounded-xl p-3 space-y-2">
                    <div className="flex items-center gap-2">
                        <span className="text-indigo-400 font-mono">{'</>'}</span>
                        <h3 className="text-lg font-bold text-indigo-300 flex-grow">UI Component</h3>
                    </div>
                    
                    <div className="bg-gray-900/50 rounded-lg border border-gray-700">
                        <button 
                            onClick={() => setContextVisible(!isContextVisible)} 
                            className="w-full flex justify-between items-center p-2 text-left"
                        >
                            <span className="font-semibold text-gray-200">Active Tool Context</span>
                            <ChevronIcon open={isContextVisible} />
                        </button>
                        {isContextVisible && (
                             <div className="p-2 border-t border-gray-700">
                                 <UIToolRunner tool={getTool('Active Tool Context')} props={{ activeTools }} />
                             </div>
                        )}
                    </div>
                </div>
            )
        `
    },
    {
        name: 'Active Tool Context',
        description: 'A simple list displaying the tools currently provided to the agent. Designed to be embedded in other UI panels.',
        category: 'UI Component',
        executionEnvironment: 'Client',
        purpose: 'To provide clear, real-time feedback on exactly which tools the agent is considering for its current task.',
        parameters: [
          { name: 'activeTools', type: 'array', description: 'The array of scored tools currently in the context.', required: true },
        ],
        implementationCode: `
          if (!activeTools || activeTools.length === 0) {
            return <p className="text-sm text-gray-500 text-center py-2">No active context.</p>;
          }
    
          return (
              <div className="max-h-48 overflow-y-auto pr-1 space-y-1">
                {activeTools.map(({ tool, score }) => (
                  <div key={tool.id} className="bg-gray-800/50 p-1.5 rounded-md" title={\`Score: \${score.toFixed(3)}\`}>
                    <p className="font-semibold text-white text-sm truncate">{tool.name}</p>
                  </div>
                ))}
              </div>
          );
        `
    }
];
