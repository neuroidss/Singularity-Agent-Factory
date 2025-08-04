
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

// --- In-memory state for managed processes ---
let gemmaProcess: ChildProcess | null = null;
let gemmaLogs: string[] = [];
const MAX_LOGS = 100;

// Ensure directories exist
fs.mkdir(SCRIPTS_DIR, { recursive: true });

// --- Middleware ---
app.use(cors()); // Allow requests from the frontend
app.use(express.json()); // Parse JSON bodies

// --- Utility Functions ---
const readTools = async (): Promise<LLMTool[]> => {
    try {
        await fs.access(TOOLS_DB_PATH);
        const data = await fs.readFile(TOOLS_DB_PATH, 'utf-8');
        return JSON.parse(data) as LLMTool[];
    } catch (error) {
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

// Get all server-side tools
app.get('/api/tools', async (req, res) => {
    const tools = await readTools();
    res.json(tools);
});

// Create a new server-side tool
app.post('/api/tools/create', async (req, res) => {
    try {
        const payload: NewToolPayload = req.body;
        if (!payload.name || !payload.description || !payload.category || !payload.implementationCode) {
            return res.status(400).json({ error: 'Missing required tool properties.' });
        }
        if (payload.category !== 'Server') {
            return res.status(400).json({ error: "Tools created on the server must have the category 'Server'." });
        }
        const tools = await readTools();
        if (tools.some(t => t.name === payload.name)) {
            return res.status(409).json({ error: `A tool with the name '${payload.name}' already exists.` });
        }
        const newTool: LLMTool = {
            ...payload,
            id: generateMachineReadableId(payload.name, tools),
            version: 1,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
        };
        tools.push(newTool);
        await writeTools(tools);
        res.status(201).json({ message: 'Server tool created successfully', tool: newTool });
    } catch (error) {
        console.error('Error creating tool:', error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

// Execute a server-side tool
app.post('/api/execute', async (req, res) => {
    const { name, arguments: args }: AIToolCall = req.body;
    if (!name) return res.status(400).json({ error: 'Tool name is required.' });

    const tools = await readTools();
    const toolToExecute = tools.find(t => t.name === name);
    if (!toolToExecute) return res.status(404).json({ error: `Server-side tool '${name}' not found.` });
    
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


// --- Local AI Server Management ---

app.post('/api/local-ai/start', (req, res) => {
    if (gemmaProcess) {
        return res.status(400).json({ error: 'Local AI server is already running.' });
    }
    
    const scriptPath = path.join(SCRIPTS_DIR, 'gemma_server.py');
    const pythonExecutable = path.join(__dirname, '..', 'venv', 'bin', 'python');
    
    addLog('Starting local AI server...');
    gemmaProcess = spawn(pythonExecutable, [scriptPath]);
    
    gemmaProcess.stdout?.on('data', (data) => {
        addLog(data.toString().trim());
    });

    gemmaProcess.stderr?.on('data', (data) => {
        // Removed [ERROR] prefix as libraries like unsloth log progress to stderr
        addLog(data.toString().trim());
    });

    gemmaProcess.on('close', (code) => {
        addLog(`Server process exited with code ${code}.`);
        gemmaProcess = null;
    });
    
    gemmaProcess.on('error', (err) => {
        addLog(`[FATAL] Failed to start server process: ${err.message}`);
        gemmaProcess = null;
    });

    res.status(200).json({ message: 'Local AI server process started.' });
});

app.post('/api/local-ai/stop', (req, res) => {
    if (!gemmaProcess || !gemmaProcess.pid) {
        return res.status(400).json({ error: 'Local AI server is not running.' });
    }
    
    addLog('Stopping local AI server...');
    gemmaProcess.kill('SIGTERM'); // Send termination signal
    gemmaProcess = null;
    
    res.status(200).json({ message: 'Local AI server stop signal sent.' });
});

app.get('/api/local-ai/status', (req, res) => {
    res.status(200).json({
        isRunning: gemmaProcess !== null && gemmaProcess.pid !== undefined,
        pid: gemmaProcess?.pid,
        logs: gemmaLogs,
    });
});


// --- Server Start ---
app.listen(PORT, () => {
    console.log(`Singularity Agent Factory Backend Server listening on http://localhost:${PORT}`);
    console.log('This server allows the AI to execute local commands and write files.');
    console.warn('SECURITY WARNING: This server can execute arbitrary code. Do not expose it to the internet.');
});
