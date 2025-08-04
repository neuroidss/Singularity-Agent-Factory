
// server/server.ts
import express from 'express';
import cors from 'cors';
import fs from 'fs/promises';
import path from 'path';
import { exec, spawn, ChildProcess } from 'child_process';
import type { LLMTool, NewToolPayload, AIToolCall } from '../types';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = 3001;
const TOOLS_DB_PATH = path.join(__dirname, 'tools.json');
const SCRIPTS_DIR = path.join(__dirname, 'scripts');

// --- In-memory state ---
let serverToolsCache: LLMTool[] = [];
let gemmaProcess: ChildProcess | null = null;
let gemmaLogs: string[] = [];
const MAX_LOGS = 100;

// --- Middleware ---
app.use(cors()); // Allow requests from the frontend
app.use('/', express.json()); // Parse JSON bodies

// --- Utility Functions ---
const readToolsAndLoadCache = async (): Promise<LLMTool[]> => {
    try {
        await fs.access(TOOLS_DB_PATH);
        const data = await fs.readFile(TOOLS_DB_PATH, 'utf-8');
        serverToolsCache = JSON.parse(data) as LLMTool[];
        console.log(`[INFO] Loaded ${serverToolsCache.length} tools into server cache.`);
        return serverToolsCache;
    } catch (error) {
        serverToolsCache = [];
        console.log('[INFO] tools.json not found or empty. Initializing with 0 server tools.');
        return [];
    }
};

const writeTools = async (tools: LLMTool[]): Promise<void> => {
    await fs.writeFile(TOOLS_DB_PATH, JSON.stringify(tools, null, 2));
};

const generateMachineReadableId = (name: string, existingTools: LLMTool[]): string => {
  let baseId = name.trim().toLowerCase().replace(/[^a-z0-9\s_]/g, '').replace(/\s+/g, '_').slice(0, 50);
  if (!baseId) baseId = 'unnamed_tool';
  let finalId = baseId;
  let counter = 1;
  const existingIds = new Set(existingTools.map(t => t.id));
  while (existingIds.has(finalId)) {
    finalId = `${baseId}_${counter}`;
    counter++;
  }
  return finalId;
};

const addLog = (log: string) => {
    gemmaLogs.push(log);
    if (gemmaLogs.length > MAX_LOGS) {
        gemmaLogs.shift();
    }
};

// --- API Endpoints ---

// Get all server-side tools from the cache
app.get('/api/tools', (req, res) => {
    res.json(serverToolsCache);
});

// Create a new server-side tool and add it to cache + file
app.post('/api/tools/create', async (req, res) => {
    try {
        const payload: NewToolPayload = req.body;
        if (!payload.name || !payload.description || !payload.category || !payload.implementationCode) {
            return res.status(400).json({ error: 'Missing required tool properties.' });
        }
        if (payload.category !== 'Server') {
            return res.status(400).json({ error: "Tools created on the server must have the category 'Server'." });
        }
        const currentTools = [...serverToolsCache];
        if (currentTools.some(t => t.name === payload.name)) {
            return res.status(409).json({ error: `A tool with the name '${payload.name}' already exists.` });
        }
        const newTool: LLMTool = {
            ...payload,
            id: generateMachineReadableId(payload.name, currentTools),
            version: 1,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
        };
        currentTools.push(newTool);
        await writeTools(currentTools);
        serverToolsCache = currentTools; // Update the live cache
        
        console.log(`[INFO] New tool '${newTool.name}' created and loaded into memory.`);
        res.status(201).json({ message: 'Server tool created and loaded successfully', tool: newTool });
    } catch (error) {
        console.error('Error creating tool:', error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

// --- Local AI Server Logic ---
const startLocalAiServer = async () => {
    if (gemmaProcess) {
        throw new Error('Local AI server is already running.');
    }
    const scriptPath = path.join(SCRIPTS_DIR, 'gemma_server.py');
    try {
        await fs.access(scriptPath);
    } catch (error) {
        const message = 'Cannot start server: gemma_server.py does not exist. It must be created by an agent first.';
        addLog(`[ERROR] ${message}`);
        console.error(`[STARTUP_FAIL] Attempted to start local AI, but script was not found at ${scriptPath}`);
        throw new Error(message);
    }
    
    const pythonExecutable = path.join(__dirname, '..', 'venv', 'bin', 'python');
    addLog('Starting local AI server...');
    gemmaProcess = spawn(pythonExecutable, [scriptPath]);
    
    gemmaProcess.stdout?.on('data', (data) => addLog(data.toString().trim()));
    gemmaProcess.stderr?.on('data', (data) => addLog(data.toString().trim()));
    gemmaProcess.on('close', (code) => {
        addLog(`Server process exited with code ${code}.`);
        gemmaProcess = null;
    });
    gemmaProcess.on('error', (err) => {
        addLog(`[FATAL] Failed to start server process: ${err.message}`);
        gemmaProcess = null;
    });
    return { message: 'Local AI server process started.' };
};

const stopLocalAiServer = () => {
     if (!gemmaProcess || !gemmaProcess.pid) {
        throw new Error('Local AI server is not running.');
    }
    addLog('Stopping local AI server...');
    gemmaProcess.kill('SIGTERM');
    gemmaProcess = null;
    return { message: 'Local AI server stop signal sent.' };
};

const getLocalAiServerStatus = () => {
    return {
        isRunning: gemmaProcess !== null && gemmaProcess.pid !== undefined,
        pid: gemmaProcess?.pid,
        logs: gemmaLogs,
    };
};


// Execute a server-side tool or a special command
app.post('/api/execute', async (req, res) => {
    const { name, arguments: args }: AIToolCall = req.body;
    if (!name) return res.status(400).json({ error: 'Tool name is required.' });

    // Handle special, built-in server commands
    if (name === 'System_Reload_Tools') {
        console.log('[COMMAND] Received System_Reload_Tools command. Re-reading tools.json...');
        await readToolsAndLoadCache();
        return res.json({ success: true, message: `Successfully reloaded ${serverToolsCache.length} tools from disk.` });
    }
    
    const toolToExecute = serverToolsCache.find(t => t.name === name);
    if (!toolToExecute) return res.status(404).json({ error: `Server-side tool '${name}' not found in the live registry.` });
    
    // Handle built-in server functions identified by special implementation code
    try {
        switch (toolToExecute.implementationCode) {
            case 'start_local_ai':
                const startResult = await startLocalAiServer();
                return res.json({ success: true, ...startResult });
            case 'stop_local_ai':
                const stopResult = stopLocalAiServer();
                return res.json({ success: true, ...stopResult });
            case 'status_local_ai':
                const statusResult = getLocalAiServerStatus();
                return res.json({ success: true, message: "Status retrieved", ...statusResult });
        }
    } catch(e) {
        const errorMessage = e instanceof Error ? e.message : 'Unknown error during built-in command execution.';
        return res.status(500).json({ error: errorMessage });
    }
    
    // Handle user-defined shell commands
    let command = toolToExecute.implementationCode;
    if (args) {
        for (const key in args) {
            // A slightly more permissive sanitation for file paths
            const value = String(args[key]).replace(/[^a-zA-Z0-9_.\-\/\\ ]/g, '');
            command = command.replace(new RegExp(`\\$\\{${key}\\}`, 'g'), value);
        }
    }

    // Use the python from the virtual environment for reliability
    if (command.startsWith('python ')) {
        command = path.join('venv', 'bin', 'python') + command.substring('python'.length);
    }

    exec(command, { timeout: 60000 }, (error, stdout, stderr) => {
        if (error) {
            console.error(`Exec error for tool '${name}':`, error);
            return res.status(500).json({ error: `Tool execution failed: ${error.message}`, stdout, stderr });
        }
        res.json({ success: true, message: `Tool '${name}' executed successfully.`, stdout, stderr });
    });
});

// Create/write a file on the server
app.post('/api/files/write', async (req, res) => {
    try {
        const { filePath, content } = req.body;
        if (!filePath || typeof content !== 'string') {
            return res.status(400).json({ error: "Missing 'filePath' or 'content'." });
        }
        // Security: Ensure the path is clean and does not traverse up directories
        const safeFileName = path.normalize(filePath).replace(/^(\.\.(\/|\\|$))+/, '');
        if (safeFileName.includes('..')) {
           return res.status(400).json({ error: "Invalid file path (directory traversal detected)." });
        }
        const fullPath = path.join(SCRIPTS_DIR, safeFileName);
        
        // Security: double-check it's still within the intended directory
        if (!fullPath.startsWith(SCRIPTS_DIR)) {
            return res.status(400).json({ error: "Invalid file path (resolved outside scripts directory)." });
        }

        await fs.writeFile(fullPath, content);
        res.status(201).json({ success: true, message: `File '${safeFileName}' written successfully.` });
    } catch (error) {
        console.error('Error writing file:', error);
        res.status(500).json({ error: 'Internal Server Error while writing file.' });
    }
});

// --- Server Start ---
app.listen(PORT, async () => {
    console.log(`Singularity Agent Factory Backend Server listening on http://localhost:${PORT}`);
    console.log('This server allows the AI to execute local commands and write files.');
    
    // Ensure directories exist before any operations that might need them
    await fs.mkdir(SCRIPTS_DIR, { recursive: true });
    
    await readToolsAndLoadCache(); // Initial load of tools into memory
    console.warn('SECURITY WARNING: This server can execute arbitrary code. Do not expose it to the internet.');
});