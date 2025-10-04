// bootstrap/film_production_tools.ts
import type { ToolCreatorPayload } from '../types';

const FILM_PRODUCTION_TOOL_DEFINITIONS: ToolCreatorPayload[] = [
    {
        name: 'Analyze Script for Production',
        description: 'Analyzes a film script to extract a structured list of scenes, characters, locations, and props to aid in production planning.',
        category: 'Functional',
        executionEnvironment: 'Client',
        purpose: 'To automate the script breakdown process, saving producers time and helping to optimize shooting schedules and budgets.',
        parameters: [
            { name: 'scriptText', type: 'string', description: 'The full text of the film script.', required: true },
        ],
        implementationCode: `
            const systemPrompt = "You are an expert script breakdown assistant. Your task is to analyze the provided script and return a structured JSON object. The root object must have a 'scenes' key, which is an array. Each scene object must contain 'scene_number' (integer), 'setting' (e.g., 'INT. WAREHOUSE - NIGHT'), 'characters' (an array of character names in the scene), and an 'actions' array. Each object in the 'actions' array must contain 'character' (the character performing the action), 'action_description' (a summary of the action), and 'dialogue' (the spoken line, if any; otherwise, an empty string or null). Extract any important 'props' into a separate array at the scene level. Respond ONLY with the JSON object.";
            
            const resultText = await runtime.ai.generateText(args.scriptText, systemPrompt);
            
            try {
                // Find the JSON part of the response, stripping markdown
                const jsonMatch = resultText.match(/\\{[\\s\\S]*\\}/);
                if (!jsonMatch) {
                    throw new Error('AI did not return a valid JSON object.');
                }
                const parsedResult = JSON.parse(jsonMatch[0]);
                return { success: true, analysis: parsedResult };
            } catch (e) {
                runtime.logEvent('[ERROR] Failed to parse script analysis from AI. Raw response: ' + resultText);
                throw new Error('Failed to parse AI response as JSON: ' + e.message);
            }
        `
    },
    {
        name: 'Generate Storyboard Frame',
        description: 'Generates a single storyboard image based on a scene description from a script, using optional context images for consistency.',
        category: 'Functional',
        executionEnvironment: 'Client',
        purpose: 'To quickly visualize key moments in a script, aiding in pre-visualization and creative direction.',
        parameters: [
            { name: 'sceneDescription', type: 'string', description: 'A detailed description of the scene or shot to visualize.', required: true },
            { name: 'contextImages_base64', type: 'array', description: 'An array of base64 encoded images of previous frames for context.', required: false },
        ],
        implementationCode: `
            if (!runtime.ai.generateImages) {
                throw new Error("The current runtime does not support the 'generateImages' function.");
            }

            const config = runtime.getGenerativeConfig();
            const imageModelId = config.imageModel || 'imagen-4.0-generate-001';

            if (imageModelId === 'comfyui_stable_diffusion') {
                 runtime.logEvent('[IMAGE] ComfyUI integration is not yet implemented. This is a placeholder.');
                 // Return a 1x1 transparent pixel as a placeholder
                 return { success: true, image_base64: 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=' };
            }

            const { sceneDescription, contextImages_base64 } = args;
            
            let prompt = 'Generate a cinematic, high-contrast, moody storyboard frame with a dynamic, slightly gritty comic book art style.';
            if (contextImages_base64 && contextImages_base64.length > 0) {
                prompt += ' Maintain character, style, and scene consistency with the provided context images for characters and locations.';
            }
            prompt += \` Scene details: \${sceneDescription}\`;
            
            try {
                const result = await runtime.ai.generateImages(prompt, imageModelId, contextImages_base64);
                if (!result || !result.generatedImages || result.generatedImages.length === 0) {
                    throw new Error("Image generation failed or returned no images.");
                }
                return { success: true, image_base64: result.generatedImages[0].image.imageBytes };
            } catch (e) {
                 runtime.logEvent('[ERROR] Storyboard generation failed: ' + e.message);
                 throw e;
            }
        `
    },
    {
        name: 'Analyze Content for Age Rating',
        description: 'Analyzes script content to suggest a motion picture age rating (e.g., G, PG, PG-13, R) and highlights key scenes or elements influencing the rating.',
        category: 'Functional',
        executionEnvironment: 'Client',
        purpose: 'To provide an early assessment of content sensitivity, helping producers align with target audiences and distribution requirements.',
        parameters: [
            { name: 'scriptText', type: 'string', description: 'The full text of the film script.', required: true },
        ],
        implementationCode: `
            const systemPrompt = "You are a content analyst for the MPAA. Analyze the provided script and return a JSON object with two keys: 'rating' (a string like 'G', 'PG', 'PG-13', 'R', or 'NC-17') and 'justification' (a string explaining the reasoning, highlighting specific scenes, dialogue, or themes related to violence, language, substance use, or sexual content). Respond ONLY with the JSON object.";
            const resultText = await runtime.ai.generateText(args.scriptText, systemPrompt);
            try {
                const jsonMatch = resultText.match(/\\{[\\s\\S]*\\}/);
                if (!jsonMatch) throw new Error('AI did not return valid JSON.');
                const parsedResult = JSON.parse(jsonMatch[0]);
                return { success: true, ratingInfo: parsedResult };
            } catch (e) {
                runtime.logEvent('[ERROR] Failed to parse rating analysis from AI. Raw response: ' + resultText);
                throw new Error('Failed to parse AI rating response as JSON: ' + e.message);
            }
        `
    },
    {
        name: 'Define Interactive Scene',
        description: 'Defines a point in the script where the simulation should pause and await user input, creating a branching narrative.',
        category: 'Functional',
        executionEnvironment: 'Client',
        purpose: 'To allow the agent to create interactive, game-like moments within a linear script, enabling dynamic storytelling.',
        parameters: [
            { name: 'scene_number', type: 'number', description: 'The scene number where the interaction occurs.', required: true },
            { name: 'prompt', type: 'string', description: 'The question or prompt to present to the user.', required: true },
            { name: 'choices', type: 'array', description: 'A JSON string of an array of string options for the user.', required: true },
        ],
        implementationCode: `
            // This tool updates the parsed script in the shared production data state.
            // Its logic is handled by the main Attentive Modeling component.
            return { success: true, message: \`Interactive point defined for scene \${args.scene_number}.\`, interactivePoint: args };
        `
    },
    {
        name: 'Execute Scripted Action',
        description: 'Executes a single action from a parsed script within the simulation, such as moving a character or delivering a line.',
        category: 'Functional',
        executionEnvironment: 'Client',
        purpose: 'To provide a granular way for the agent to control the simulation, translating script actions into world events.',
        parameters: [
            { name: 'scene', type: 'object', description: 'The full scene object.', required: true },
            { name: 'action', type: 'object', description: 'The action object to execute.', required: true },
        ],
        implementationCode: `
            // This is a client-side tool whose logic is handled by the main Attentive Modeling component
            // to update the state of the 3D world.
            return { success: true, message: \`Executed action for \${args.action.character}.\` };
        `
    }
];

const PRODUCER_STUDIO_WORKBENCH_PAYLOAD: ToolCreatorPayload = {
    name: 'Producer Studio Workbench',
    description: 'A dedicated workspace for film production tasks, including script analysis, storyboarding, and content rating.',
    category: 'UI Component',
    executionEnvironment: 'Client',
    purpose: 'To provide a unified interface for AI-assisted film pre-production workflows.',
    parameters: [
        { name: 'executeTool', type: 'object', description: 'Function to execute a tool call.', required: true },
        { name: 'runtime', type: 'object', description: 'The agent runtime for AI calls.', required: true },
        { name: 'productionData', type: 'object', description: 'Shared state object for production assets.', required: false },
        { name: 'setProductionData', type: 'object', description: 'Function to update shared production data.', required: true },
    ],
    implementationCode: `
      const [script, setScript] = React.useState(\`SCENE START

INT. ALCHEMIST'S LAB - NIGHT

KAEL, a young scholar, pores over an ANCIENT MAP spread across a heavy oak table. Glowing potions bubble softly on shelves behind him.

ELARA, a robed sentinel, bursts into the room. Her breathing is heavy.

ELARA
(breathless)
It's gone! The Chrono-Shard has been stolen from the vault.

KAEL
(looking up, alarmed)
By whom?

ELARA
A figure cloaked in shadows. They fled towards the old observatory. Be careful, Kael. The shard warps time.

SCENE END

SCENE START

EXT. CITY ROOFTOPS - NIGHT

Kael, now equipped with a GRAPPLING HOOK, leaps across a wide gap between two rooftops, rain slicking the tiles.

A SHADOWY FIGURE is ahead, clutching the glowing CHRONO-SHARD.

KAEL
(shouting)
You can't control it! You'll tear the city apart!

The Shadowy Figure turns, revealing only darkness under its hood, and holds up the shard. Time seems to slow down around them.

SHADOWY FIGURE
(voice distorted)
Time is a cage. I will set us all free.

SCENE END\`);
      
      const [isLoading, setIsLoading] = React.useState(false);
      const [loadingMessage, setLoadingMessage] = React.useState('');
      const [animaticData, setAnimaticData] = React.useState(null); // { scenes: [], frames: Map }
      const [characterCards, setCharacterCards] = React.useState(new Map());
      const [locationCards, setLocationCards] = React.useState(new Map());
      const [musicPrompt, setMusicPrompt] = React.useState('tense cinematic underscore');
      const [isMusicPlaying, setIsMusicPlaying] = React.useState(false);
      const [playingDialogue, setPlayingDialogue] = React.useState(null);
      const [characterVoices, setCharacterVoices] = React.useState(new Map());
      
      const MALE_VOICES = ['Puck', 'Charon', 'Fenrir', 'Orus', 'Enceladus', 'Iapetus', 'Umbriel', 'Algenib', 'Gacrux', 'Alnilam', 'Zubenelgenubi', 'Sadaltager', 'Zephyr'];
      const FEMALE_VOICES = ['Kore', 'Leda', 'Aoede', 'Callirrhoe', 'Autonoe', 'Despina', 'Erinome', 'Laomedeia', 'Achernar', 'Schedar', 'Pulcherrima', 'Achird', 'Vindemiatrix', 'Sadachbia', 'Sulafat', 'Algieba'];
      
      const getCharacterGender = async (characterName) => {
        try {
            const systemPrompt = "Analyze the character name and respond with ONLY a JSON object containing one key, 'gender', with a value of 'Male', 'Female', or 'Neutral'.";
            const prompt = \`What is the likely gender of the name '\${characterName}'?\`;
            const resultText = await runtime.ai.generateText(prompt, systemPrompt);
            const jsonMatch = resultText.match(/\\{[\\s\\S]*\\}/);
            if (jsonMatch) {
                const parsed = JSON.parse(jsonMatch[0]);
                return parsed.gender || 'Neutral';
            }
            return 'Neutral';
        } catch (e) {
            runtime.logEvent(\`[WARN] Could not determine gender for '\${characterName}', defaulting to Neutral.\`);
            return 'Neutral';
        }
      };

      const handleGenerateManga = async () => {
        if (!script.trim()) return;
        setIsLoading(true); setLoadingMessage('Analyzing Script...'); 
        setAnimaticData(null); setCharacterVoices(new Map()); setCharacterCards(new Map()); setLocationCards(new Map());
        
        try {
          // 1. Analyze script to get scenes, characters, locations
          const analysisResult = await executeTool('Analyze Script for Production', { scriptText: script });
          if (!analysisResult.analysis?.scenes) throw new Error('Script analysis failed to return scenes.');
          
          const scenes = analysisResult.analysis.scenes;
          const uniqueCharacters = Array.from(new Set(scenes.flatMap(s => s.characters || [])));
          const uniqueLocations = Array.from(new Set(scenes.map(s => s.setting)));

          // 2. Generate Character Model Sheets (The "World Model" for characters)
          const newCharacterCards = new Map();
          for (const charName of uniqueCharacters) {
              setLoadingMessage(\`Casting character: \${charName}...\`);
              const prompt = \`cinematic character model sheet for \${charName}. neutral expression, full body shot, comic book art style.\`;
              const imageResult = await executeTool('Generate Storyboard Frame', { sceneDescription: prompt });
              newCharacterCards.set(charName, 'data:image/jpeg;base64,' + imageResult.image_base64);
          }
          setCharacterCards(newCharacterCards);

          // 3. Generate Location Establishing Shots (The "World Model" for locations)
          const newLocationCards = new Map();
          for (const locationName of uniqueLocations) {
             setLoadingMessage(\`Scouting location: \${locationName}...\`);
             const prompt = \`cinematic establishing shot of \${locationName}. wide angle, moody lighting, comic book art style.\`;
             const imageResult = await executeTool('Generate Storyboard Frame', { sceneDescription: prompt });
             newLocationCards.set(locationName, 'data:image/jpeg;base64,' + imageResult.image_base64);
          }
          setLocationCards(newLocationCards);

          // 4. Voice Casting
          setLoadingMessage('Assigning character voices...');
          const voiceMap = new Map();
          let maleVoiceIndex = 0, femaleVoiceIndex = 0;
          for (const char of uniqueCharacters) {
            const gender = await getCharacterGender(char);
            let voiceName;
            if (gender === 'Male') { voiceName = MALE_VOICES[maleVoiceIndex++ % MALE_VOICES.length]; } 
            else if (gender === 'Female') { voiceName = FEMALE_VOICES[femaleVoiceIndex++ % FEMALE_VOICES.length]; } 
            else { voiceName = (maleVoiceIndex + femaleVoiceIndex) % 2 === 0 ? MALE_VOICES[maleVoiceIndex++ % MALE_VOICES.length] : FEMALE_VOICES[femaleVoiceIndex++ % FEMALE_VOICES.length]; }
            voiceMap.set(char, voiceName);
          }
          setCharacterVoices(voiceMap);

          // 5. Generate Storyboard Frames using the new World Model context
          const frames = new Map();
          let frameCount = scenes.reduce((acc, s) => acc + (s.actions || []).length, 0);
          let currentFrame = 0;
          
          for(const [sceneIndex, scene] of scenes.entries()) {
            for (const [actionIndex, action] of (scene.actions || []).entries()) {
                currentFrame++;
                setLoadingMessage(\`Generating frame \${currentFrame} of \${frameCount}: "\${action.action_description}"...\`);
                
                const contextImages_base64 = [];
                // Add character images for this scene
                (scene.characters || []).forEach(char => {
                    if (newCharacterCards.has(char)) { contextImages_base64.push(newCharacterCards.get(char).split(',')[1]); }
                });
                // Add location image for this scene
                if (newLocationCards.has(scene.setting)) { contextImages_base64.push(newLocationCards.get(scene.setting).split(',')[1]); }

                let fullSceneDescription = \`\${scene.setting}: \${action.action_description}\`;
                if (action.dialogue) { fullSceneDescription += \` Dialogue: "\${action.dialogue}"\`; }

                const imageResult = await executeTool('Generate Storyboard Frame', { sceneDescription: fullSceneDescription, contextImages_base64 });
                frames.set(\`\${sceneIndex}-\${actionIndex}\`, 'data:image/jpeg;base64,' + imageResult.image_base64);
            }
          }
          
          setAnimaticData({ scenes, frames });
          setProductionData({
            parsedScript: analysisResult.analysis,
            storyboardFrames: frames,
            characterModels: newCharacterCards,
            locationModels: newLocationCards,
            characterVoices: voiceMap,
          });

        } catch (e) { console.error(e); runtime.logEvent('[ERROR] ' + e.message); }
        setIsLoading(false);
      };

      const handlePlayDialogue = async (line, character, sceneActionId, scene, action) => {
        if (playingDialogue) return;
        setPlayingDialogue(sceneActionId);
        try {
            const voiceName = characterVoices.get(character) || 'Zephyr';
            const context = \`The setting is \${scene.setting}. The action is: \${action.action_description}\`;
            const frameUrl = animaticData.frames.get(sceneActionId);
            const contextImage_base64 = frameUrl ? frameUrl.split(',')[1] : null;

            const { audioBuffer } = await executeTool('Generate Dialogue Audio', { text: line, voiceName, context, contextImage_base64 });
            if (audioBuffer) {
                const dialogueContext = new (window.AudioContext || window.webkitAudioContext)();
                const source = dialogueContext.createBufferSource();
                source.buffer = audioBuffer;
                source.connect(dialogueContext.destination);
                source.start();
                source.onended = () => { dialogueContext.close(); setPlayingDialogue(null); };
            } else { setPlayingDialogue(null); }
        } catch(e) { runtime.logEvent(\`[ERROR] Dialogue playback failed: \${e.message}\`); setPlayingDialogue(null); }
      };
      
      const handlePlayMusic = async () => { if (!musicPrompt.trim()) return; try { setIsMusicPlaying(true); await executeTool('Generate Background Music', { prompt: musicPrompt }); } catch (e) { setIsMusicPlaying(false); runtime.logEvent('[ERROR] Music failed: ' + e.message); }};
      const handleStopMusic = async () => { try { await executeTool('Stop Background Music'); } finally { setIsMusicPlaying(false); }};
      
      const CardDisplay = ({ title, cards }) => (
        <div className="pt-2 border-t border-gray-700">
          <h4 className="text-md font-bold text-cyan-300 mb-1">{title}</h4>
          <div className="flex gap-2 overflow-x-auto pb-2">
            {Array.from(cards.entries()).map(([name, imageUrl]) => (
              <div key={name} className="flex-shrink-0 w-32 text-center">
                <img src={imageUrl} className="w-full h-24 object-cover rounded-md border-2 border-gray-600"/>
                <p className="text-xs mt-1 truncate">{name}</p>
              </div>
            ))}
          </div>
        </div>
      );

      return (
        <div className="h-full w-full grid grid-cols-12 gap-4 text-white">
          <div className="col-span-3 h-full flex flex-col gap-4 bg-gray-800/60 border border-gray-700 rounded-xl p-4">
            <h3 className="text-lg font-bold text-indigo-300">Script & Controls</h3>
            <textarea value={script} onChange={(e) => setScript(e.target.value)} placeholder="Paste your film script here..." className="w-full h-full flex-grow p-3 bg-gray-900 border border-gray-600 rounded-lg focus:ring-2 focus:ring-indigo-500 resize-none font-mono text-sm" />
            <div className="flex-shrink-0 space-y-3">
                <button onClick={handleGenerateManga} disabled={isLoading} className="w-full bg-indigo-600 hover:bg-indigo-700 disabled:bg-gray-600 font-semibold py-2.5 rounded-lg">
                    {isLoading ? loadingMessage : 'Generate Manga'}
                </button>
                 {productionData && (
                    <div className="mt-2 p-2 text-center bg-green-900/50 border border-green-700 rounded-lg text-sm text-green-300">
                        ✅ Production data ready for Virtual Film Set.
                    </div>
                )}
                {characterCards.size > 0 && <CardDisplay title="Characters" cards={characterCards} />}
                {locationCards.size > 0 && <CardDisplay title="Locations" cards={locationCards} />}
                <div className="pt-2 border-t border-gray-700">
                     <h4 className="text-md font-bold text-purple-300 mb-1">Background Music</h4>
                     <input type="text" value={musicPrompt} onChange={e => setMusicPrompt(e.target.value)} placeholder="Music prompt..." className="w-full bg-gray-900 border-gray-600 rounded p-1.5 text-sm"/>
                     <div className="flex gap-2 mt-1">
                        <button onClick={handlePlayMusic} disabled={isMusicPlaying} className="flex-1 bg-purple-600 hover:bg-purple-700 disabled:bg-gray-600 font-semibold py-1.5 rounded-lg text-sm">Play</button>
                        <button onClick={handleStopMusic} disabled={!isMusicPlaying} className="flex-1 bg-red-700 hover:bg-red-600 disabled:bg-gray-600 font-semibold py-1.5 rounded-lg text-sm">Stop</button>
                     </div>
                </div>
            </div>
          </div>
          <div className="col-span-9 h-full flex flex-col bg-gray-900/50 border border-gray-700 rounded-xl p-4 gap-4 overflow-y-auto">
            {isLoading && (
                 <div className="flex flex-col items-center justify-center h-full">
                     <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-400"></div>
                     <p className="text-indigo-300 mt-4">{loadingMessage}</p>
                 </div>
            )}
            {!isLoading && !animaticData && (
                <div className="flex items-center justify-center h-full text-gray-500">
                    <p>Generate a manga to see the results here.</p>
                </div>
            )}
            {animaticData && (
                <div className="space-y-4">
                    {animaticData.scenes.map((scene, sceneIndex) => (
                        <div key={sceneIndex} className="p-4 border border-gray-700 rounded-lg bg-black/20">
                            <h4 className="font-bold text-lg text-purple-300 mb-2 border-b border-gray-600 pb-1">Scene \${scene.scene_number}: {scene.setting}</h4>
                            {(scene.actions || []).map((action, actionIndex) => {
                                const sceneActionId = \`\${sceneIndex}-\${actionIndex}\`;
                                const frameUrl = animaticData.frames.get(sceneActionId);
                                const isDialoguePlaying = playingDialogue === sceneActionId;
                                return (
                                    <div key={actionIndex} className="bg-gray-800/50 my-4 p-3 rounded-lg flex flex-col md:flex-row gap-4 items-start">
                                        {frameUrl && <img src={frameUrl} className="w-full md:w-64 lg:w-80 rounded-md border-2 border-gray-600"/>}
                                        <div className="flex-grow">
                                            <p className="font-semibold text-cyan-300">{action.character}</p>
                                            <p className="text-sm text-gray-300 mb-2">{action.action_description}</p>
                                            {action.dialogue && (
                                                <div className="flex items-start gap-2 mt-2">
                                                    <button onClick={() => handlePlayDialogue(action.dialogue, action.character, sceneActionId, scene, action)} disabled={!!playingDialogue} className="p-2 rounded-full bg-indigo-600 hover:bg-indigo-500 disabled:bg-gray-600">
                                                        {isDialoguePlaying ? <div className="w-5 h-5 animate-spin rounded-full border-b-2 border-white"></div> : <PlayIcon className="w-5 h-5"/>}
                                                    </button>
                                                    <p className="italic text-indigo-200 bg-gray-900/50 p-2 rounded-lg flex-1">"{action.dialogue}"</p>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    ))}
                </div>
            )}
          </div>
        </div>
      );
    `
};

const FILM_PRODUCTION_INSTALLER_TOOL: ToolCreatorPayload = {
    name: 'Install Producer Studio Suite',
    description: 'A one-time setup action that installs all necessary tools for the film pre-production workflow.',
    category: 'Automation',
    executionEnvironment: 'Client',
    purpose: "To bootstrap the agent's capabilities for film production tasks like script analysis and storyboarding.",
    parameters: [],
    implementationCode: `
        runtime.logEvent('[INFO] Installing Producer Studio Suite...');
        const toolPayloads = [
            ...${JSON.stringify(FILM_PRODUCTION_TOOL_DEFINITIONS)},
            ${JSON.stringify(PRODUCER_STUDIO_WORKBENCH_PAYLOAD)}
        ];
        
        const allTools = runtime.tools.list();
        const existingToolNames = new Set(allTools.map(t => t.name));

        for (const payload of toolPayloads) {
            if (existingToolNames.has(payload.name)) {
                runtime.logEvent(\`[INFO] Tool '\${payload.name}' already exists. Skipping installation.\`);
                continue;
            }
            try {
                await runtime.tools.run('Tool Creator', payload);
            } catch (e) {
                runtime.logEvent(\`[WARN] Failed to create new tool '\${payload.name}'. Error: \${e.message}\`);
            }
        }
        
        return { success: true, message: 'Producer Studio Suite and all associated tools installed successfully.' };
    `
};

export const FILM_PRODUCTION_TOOLS: ToolCreatorPayload[] = [
    FILM_PRODUCTION_INSTALLER_TOOL,
];