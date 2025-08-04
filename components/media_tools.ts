
import type { LLMTool } from '../types';

export const mediaTools: LLMTool[] = [
  {
    id: 'transcribe_ambient_audio',
    name: 'Transcribe Ambient Audio',
    description: 'Records audio from the main microphone for a specified duration, sends it to the server for AI transcription, and returns the recognized text. Useful for listening to the environment or user speech.',
    category: 'Functional',
    version: 1,
    parameters: [
      {
        name: 'durationSeconds',
        type: 'number',
        description: 'The duration of the recording in seconds. Must be between 1 and 20.',
        required: true,
      },
    ],
    implementationCode: `
      const { durationSeconds } = args;

      if (durationSeconds > 20 || durationSeconds <= 0) {
        throw new Error('Duration must be between 1 and 20 seconds.');
      }

      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error('Audio recording is not supported in this environment.');
      }

      const gemmaTool = runtime.tools.list().find(t => t.name === "Gemma Audio Processor");
      if (!gemmaTool) {
          throw new Error("'Gemma Audio Processor' tool not found on server. It must be created first via the Audio Testbed UI.");
      }
      
      console.log('Starting audio recording for ' + durationSeconds + ' seconds...');
      const stream = await navigator.mediaDevices.getUserMedia({ 
          audio: { 
              echoCancellation: false, 
              noiseSuppression: false, 
              autoGainControl: false 
          }
      });

      const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus') ? 'audio/webm;codecs=opus' : 'audio/webm';
      const recorder = new MediaRecorder(stream, { mimeType });
      const chunks = [];
      recorder.ondataavailable = e => {
          if (e.data.size > 0) chunks.push(e.data);
      };

      const recordingPromise = new Promise((resolve, reject) => {
          recorder.onstop = () => {
              const audioBlob = new Blob(chunks, { type: recorder.mimeType });
              resolve(audioBlob);
          };
          recorder.onerror = e => reject(new Error('An error occurred during recording: ' + e.error.message));
      });

      recorder.start();
      await new Promise(resolve => setTimeout(resolve, durationSeconds * 1000));
      
      if (recorder.state === 'recording') {
        recorder.stop();
      }
      stream.getTracks().forEach(track => track.stop());

      const audioBlob = await recordingPromise;
      console.log('Audio recorded, size:', audioBlob.size);

      if (audioBlob.size === 0) {
        throw new Error('Recording resulted in an empty audio file. Check microphone permissions and hardware.');
      }

      const getExtension = (mime) => {
          if (mime.includes('wav')) return 'wav';
          if (mime.includes('ogg')) return 'ogg';
          if (mime.includes('mp4')) return 'mp4';
          return 'webm';
      };

      const formData = new FormData();
      const extension = getExtension(recorder.mimeType);
      formData.append('audioFile', audioBlob, \`recording.\${extension}\`);
      formData.append('toolName', gemmaTool.name);
      
      console.log('Uploading audio for transcription...');
      const serverUrl = runtime.server.getUrl();
      const response = await fetch(\`\${serverUrl}/api/audio/process\`, {
          method: 'POST',
          body: formData,
      });

      const result = await response.json();

      if (!response.ok) {
          const errorMsg = result.error || result.stderr || 'Server failed to process audio.';
          console.error('Transcription failed:', errorMsg);
          throw new Error('Transcription failed: ' + errorMsg);
      }

      console.log('Transcription successful:', result.stdout);
      return { success: true, transcription: result.stdout, message: 'Audio transcribed successfully.' };
    `
  },
];
