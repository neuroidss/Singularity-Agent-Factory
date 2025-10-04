// bootstrap/audio_production_tools.ts
import type { ToolCreatorPayload } from '../types';

// These definitions are modified by the installer before being created.
const AUDIO_PRODUCTION_TOOL_DEFINITIONS: ToolCreatorPayload[] = [
    {
        name: 'Generate Dialogue Audio',
        description: 'Generates spoken dialogue for a given line of text and character using a Text-to-Speech model. Returns a playable AudioBuffer and its duration.',
        category: 'Functional',
        executionEnvironment: 'Client',
        purpose: 'To provide voice-over capabilities for characters in a script, enhancing the pre-production and storytelling process.',
        parameters: [
            { name: 'text', type: 'string', description: 'The line of dialogue to be spoken.', required: true },
            { name: 'voiceName', type: 'string', description: 'The prebuilt voice to use (e.g., "Zephyr", "Puck").', required: true },
            { name: 'context', type: 'string', description: 'The surrounding context of the scene for emotional tone.', required: false },
            { name: 'contextAudio_base64', type: 'string', description: 'Optional base64 encoded audio sample of the character\'s voice for consistency.', required: false },
            { name: 'contextImage_base64', type: 'string', description: 'Optional base64 encoded image of the scene for visual context.', required: false },
        ],
        implementationCode: `
            const { text, voiceName, context, contextAudio_base64, contextImage_base64 } = args;
            if (!text || !text.trim()) {
                runtime.logEvent('[WARN] Generate Dialogue Audio called with no text.');
                return { success: false, message: 'No text provided.' };
            }

            const config = runtime.getGenerativeConfig();
            const ttsModel = config.ttsModel || 'browser';

            if (ttsModel === 'browser') {
                return new Promise((resolve, reject) => {
                    if (typeof window.speechSynthesis === 'undefined') {
                        return reject(new Error('Browser Speech Synthesis API is not available.'));
                    }
                    const utterance = new SpeechSynthesisUtterance(text);
                    const voices = window.speechSynthesis.getVoices();
                    if (voices.length > 0) {
                        utterance.voice = voices.find(v => v.lang.startsWith('en')) || voices[0];
                    }
                    
                    utterance.onend = () => {
                        runtime.logEvent('[TTS] Browser speech finished.');
                        resolve({ success: true, message: 'Dialogue spoken by browser.', audioBuffer: null, duration: 0 });
                    };
                    utterance.onerror = (e) => {
                        runtime.logEvent('[ERROR] Browser TTS failed: ' + e.error);
                        reject(new Error('Browser TTS failed: ' + e.error));
                    };
                    window.speechSynthesis.speak(utterance);
                });
            }

            // --- Gemini TTS Logic ---

            // Helper to decode raw PCM (16-bit signed int) to a Web Audio AudioBuffer (32-bit float).
            const decodePcmToAudioBuffer = async (pcmData, audioCtx) => {
                // The TTS API returns 24kHz mono audio as 16-bit PCM.
                const dataInt16 = new Int16Array(pcmData.buffer, pcmData.byteOffset, pcmData.length / 2);
                const frameCount = dataInt16.length;
                const audioBuffer = audioCtx.createBuffer(1, frameCount, 24000); // 1 channel (mono), 24000 sample rate
                const channelData = audioBuffer.getChannelData(0);
                for (let i = 0; i < frameCount; i++) {
                    // Convert from [-32768, 32767] to [-1.0, 1.0]
                    channelData[i] = dataInt16[i] / 32768.0;
                }
                return audioBuffer;
            };

            // Helper to encode a byte array to base64
            const encodeBytesToBase64 = (bytes) => {
                let binary = '';
                const len = bytes.byteLength;
                for (let i = 0; i < len; i++) {
                    binary += String.fromCharCode(bytes[i]);
                }
                return window.btoa(binary);
            }

            try {
                runtime.logEvent(\`[TTS] Generating audio for speaker with voice '\${voiceName}'...\`);
                const response = await runtime.ai.generateAudioStream(text, voiceName, context, contextAudio_base64, contextImage_base64);
                
                let audioDataChunks = [];

                for await (const chunk of response) {
                    if (chunk.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data) {
                        const base64Data = chunk.candidates[0].content.parts[0].inlineData.data;
                        const binaryString = window.atob(base64Data);
                        const len = binaryString.length;
                        const bytes = new Uint8Array(len);
                        for (let i = 0; i < len; i++) {
                            bytes[i] = binaryString.charCodeAt(i);
                        }
                        audioDataChunks.push(bytes);
                    }
                }
                
                if (audioDataChunks.length === 0) {
                  throw new Error("No audio data received from TTS API.");
                }
                
                // Concatenate all Uint8Array chunks into a single Uint8Array
                const totalLength = audioDataChunks.reduce((acc, chunk) => acc + chunk.length, 0);
                const completePcmData = new Uint8Array(totalLength);
                let offset = 0;
                for (const chunk of audioDataChunks) {
                    completePcmData.set(chunk, offset);
                    offset += chunk.length;
                }

                // Use a temporary AudioContext to decode the raw PCM data.
                const tempAudioContext = new (window.AudioContext || window.webkitAudioContext)();
                const audioBuffer = await decodePcmToAudioBuffer(completePcmData, tempAudioContext);
                tempAudioContext.close(); // Clean up the temporary context
                
                // Re-encode the full byte array to base64 for storage/transmission if needed.
                const audio_base64 = encodeBytesToBase64(completePcmData);

                return { success: true, message: 'Dialogue audio generated.', audioBuffer: audioBuffer, duration: audioBuffer.duration, audio_base64 };

            } catch (e) {
                runtime.logEvent('[ERROR] TTS generation failed: ' + e.message);
                throw e;
            }
        `
    },
    {
        name: 'Generate Background Music',
        description: 'Starts generating and streaming background music based on a text prompt using the Lyria model.',
        category: 'Functional',
        executionEnvironment: 'Client',
        purpose: 'To provide real-time, AI-generated musical scores for scenes in the virtual film set.',
        parameters: [
            { name: 'prompt', type: 'string', description: 'A text prompt describing the desired music (e.g., "dramatic orchestral score").', required: true },
        ],
        implementationCode: `
            const config = runtime.getGenerativeConfig();
            const musicModel = config.musicModel || 'lyria';

            if (musicModel === 'local_musicgen') {
                runtime.logEvent('[MUSIC] MusicGen (Local) is not yet implemented. This is a placeholder.');
                return { success: true, message: 'MusicGen (Local) would be activated here.' };
            }

            // --- Lyria Logic ---
            if (window.__musicSession) {
                runtime.logEvent('[MUSIC] A music session is already active. Please stop it first.');
                return { success: false, message: 'Music session already active.' };
            }

            const pcm16ToAudioBuffer = (pcmData, audioCtx) => {
                const samples = new Int16Array(pcmData.buffer, pcmData.byteOffset, pcmData.length / 2);
                const frameCount = samples.length / 2; // 2 channels
                const audioBuffer = audioCtx.createBuffer(2, frameCount, audioCtx.sampleRate);
                const leftChannel = audioBuffer.getChannelData(0);
                const rightChannel = audioBuffer.getChannelData(1);
                for (let i = 0; i < frameCount; i++) {
                    leftChannel[i] = samples[i * 2] / 32768.0;
                    rightChannel[i] = samples[i * 2 + 1] / 32768.0;
                }
                return audioBuffer;
            };
            
            try {
                window.__audioContext = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: 44100 });
                window.__gainNode = window.__audioContext.createGain();
                window.__gainNode.connect(window.__audioContext.destination);

                let audioQueue = [];
                let nextStartTime = 0;
                let isPlaying = false;

                const schedulePlayback = async () => {
                    if (isPlaying || audioQueue.length === 0) return;
                    isPlaying = true;

                    const pcmData = audioQueue.shift();
                    if (!pcmData) { isPlaying = false; return; }
                    const audioBuffer = pcm16ToAudioBuffer(pcmData, window.__audioContext);
                    const source = window.__audioContext.createBufferSource();
                    source.buffer = audioBuffer;
                    source.connect(window.__gainNode);
                    
                    const startTime = Math.max(nextStartTime, window.__audioContext.currentTime);
                    source.start(startTime);
                    nextStartTime = startTime + audioBuffer.duration;
                    
                    source.onended = () => {
                        isPlaying = false;
                        if(window.__musicSession) schedulePlayback(); // Only schedule next if session is active
                    };
                };

                const session = await runtime.ai.connectToMusicSession({
                    onmessage: (message) => {
                        if (message.serverContent?.audioChunks) {
                            for (const chunk of message.serverContent.audioChunks) {
                                const binaryString = window.atob(chunk.data);
                                const len = binaryString.length;
                                const bytes = new Uint8Array(len);
                                for (let i = 0; i < len; i++) { bytes[i] = binaryString.charCodeAt(i); }
                                audioQueue.push(bytes);
                                if(!isPlaying) schedulePlayback();
                            }
                        }
                    },
                    onerror: (error) => runtime.logEvent(\`[MUSIC ERROR] \${error.message || 'Unknown error'}\`),
                    onclose: () => { runtime.logEvent('[MUSIC] Stream closed.'); window.__musicSession = null; }
                });
                window.__musicSession = session;

                await session.setWeightedPrompts({ weightedPrompts: [ { text: args.prompt, weight: 1.0 } ] });
                await session.setMusicGenerationConfig({ musicGenerationConfig: { bpm: 120, temperature: 1.0, audioFormat: "pcm16", sampleRateHz: 44100 } });
                await session.play();

                runtime.logEvent(\`[MUSIC] Started generating music for prompt: "\${args.prompt}"\`);
                return { success: true, message: 'Music generation started.' };

            } catch(e) {
                runtime.logEvent('[ERROR] Music generation failed: ' + e.message);
                if (window.__musicSession) { try { window.__musicSession.close(); } catch(e) {} window.__musicSession = null; }
                throw e;
            }
        `
    },
    {
        name: 'Stop Background Music',
        description: 'Stops the currently playing background music stream.',
        category: 'Functional',
        executionEnvironment: 'Client',
        purpose: 'To terminate the Lyria music generation session.',
        parameters: [],
        implementationCode: `
            const config = runtime.getGenerativeConfig();
            const musicModel = config.musicModel || 'lyria';
            
            if (musicModel === 'local_musicgen') {
                 runtime.logEvent('[MUSIC] No local music session to stop.');
                 return { success: true, message: 'No local music session active.' };
            }

            // --- Lyria Logic ---
            if (!window.__musicSession) {
                return { success: false, message: 'No music session is active.' };
            }
            try {
                window.__musicSession.close();
                window.__musicSession = null;
                if (window.__audioContext) {
                    window.__audioContext.close().catch(e => console.error("Error closing audio context", e));
                    window.__audioContext = null;
                }
                return { success: true, message: 'Music stopped.' };
            } catch (e) {
                runtime.logEvent('[ERROR] Failed to stop music: ' + e.message);
                window.__musicSession = null; // Ensure session is cleared even on error
                window.__audioContext = null;
                throw e;
            }
        `
    }
];

const AUDIO_PRODUCTION_INSTALLER_TOOL: ToolCreatorPayload = {
    name: 'Install Audio Production Suite',
    description: 'Installs all necessary tools for audio and music generation within the film production workflow.',
    category: 'Automation',
    executionEnvironment: 'Client',
    purpose: "To bootstrap the agent's capabilities for TTS and music generation.",
    parameters: [],
    implementationCode: `
        runtime.logEvent('[INFO] Installing Audio Production Suite...');
        
        const toolPayloads = ${JSON.stringify(AUDIO_PRODUCTION_TOOL_DEFINITIONS)};
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
                runtime.logEvent(\`[ERROR] Failed to create new tool '\${payload.name}'. Error: \${e.message}\`);
            }
        }
        
        return { success: true, message: 'Audio Production Suite installed successfully.' };
    `
};

export const AUDIO_PRODUCTION_TOOLS: ToolCreatorPayload[] = [
    AUDIO_PRODUCTION_INSTALLER_TOOL,
];
