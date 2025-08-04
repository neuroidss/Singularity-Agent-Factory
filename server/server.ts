
// server/server.ts
import express, { Request, Response } from 'express';
import cors from 'cors';
import fs from 'fs/promises';
import path from 'path';
import { exec } from 'child_process';
import multer from 'multer';
import type { LLMTool, NewToolPayload, AIToolCall } from '../types';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = 3001;
const TOOLS_DB_PATH = path.join(__dirname, 'tools.json');
const SCRIPTS_DIR = path.join(__dirname, 'scripts');
const UPLOADS_DIR = path.join(__dirname, 'uploads');

// Ensure directories exist
fs.mkdir(SCRIPTS_DIR, { recursive: true });
fs.mkdir(UPLOADS_DIR, { recursive: true });

// --- Middleware ---
app.use(cors()); // Allow requests from the frontend
app.use(express.json()); // Parse JSON bodies

// --- Multer Setup for File Uploads ---
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, UPLOADS_DIR);
  },
  filename: (req, file, cb) => {
    // Create a unique filename to avoid collisions
    cb(null, `${Date.now()}-${file.originalname}`);
  },
});
const upload = multer({ storage });


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

// --- API Endpoints ---

// Get all server-side tools
app.get('/api/tools', async (req: Request, res: Response) => {
    const tools = await readTools();
    res.json(tools);
});

// Create a new server-side tool
app.post('/api/tools/create', async (req: Request, res: Response) => {
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
app.post('/api/execute', async (req: Request, res: Response) => {
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
app.post('/api/files/write', async (req: Request, res: Response) => {
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

// Process an uploaded audio file
app.post('/api/audio/process', upload.single('audioFile'), async (req: Request, res: Response) => {
    const { toolName } = req.body;
    
    if (!(req as any).file) return res.status(400).json({ error: 'No audio file uploaded.' });
    if (!toolName) return res.status(400).json({ error: 'Tool name for processing is required.' });

    const tools = await readTools();
    const toolToExecute = tools.find(t => t.name === toolName);
    if (!toolToExecute) return res.status(404).json({ error: `Server-side tool '${toolName}' not found.` });

    const audioFilePath = (req as any).file.path;
    let command = toolToExecute.implementationCode.replace(/\$\{audioFilePath\}/g, audioFilePath);

    exec(command, { timeout: 120000 }, async (error, stdout, stderr) => {
        // Cleanup: delete the temporary file regardless of outcome
        try {
            await fs.unlink(audioFilePath);
        } catch (unlinkError) {
            console.error(`Failed to delete temp audio file: ${audioFilePath}`, unlinkError);
        }

        if (error) {
            console.error(`Exec error for tool '${toolName}':`, error);
            return res.status(500).json({ error: `Tool execution failed: ${error.message}`, stdout, stderr });
        }
        res.json({ success: true, message: `Tool '${toolName}' executed successfully.`, stdout, stderr });
    });
});


// --- Server Start ---
app.listen(PORT, () => {
    console.log(`Singularity Agent Factory Backend Server listening on http://localhost:${PORT}`);
    console.log('This server allows the AI to execute local commands and write files.');
    console.warn('SECURITY WARNING: This server can execute arbitrary code. Do not expose it to the internet.');
});
