const { app, BrowserWindow, dialog, ipcMain, shell } = require('electron');
const path = require('path');
const fs = require('fs-extra');
const chokidar = require('chokidar');
const pty = require('node-pty');
const axios = require('axios');
const { exec } = require('child_process');
const { promisify } = require('util');

const execAsync = promisify(exec);

/** @type {BrowserWindow | null} */
let mainWindow = null;
/** @type {string | null} */
let workspacePath = null;
/** @type {import('chokidar').FSWatcher | null} */
let watcher = null;

/** @type {Map<string, import('node-pty').IPty>} */
const terminalIdToPty = new Map();

// AI Configuration
let openrouterApiKey = null;
let geminiApiKey = null;
let aiAgentActive = false;
let currentProjectPlan = null;
let selectedModel = 'deepseek';
let isBuildingProject = false;
let currentTerminalId = null;

// API Keys
const OPENROUTER_API_KEYS = [
  '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',
  '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',
  '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',
  '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',
  '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'
];
let currentOpenRouterKeyIndex = 0;

const GEMINI_API_KEYS = [
  'AIzaSyBDA_wIQPBjWVVelfjzAToKhQfkkGYDyac',
  'AIzaSyA3npCN1ntj8Cw9BtqaIy4M6kDijC9Wcxg'
];
let currentGeminiKeyIndex = 0;

// Available AI Models
const AI_MODELS = {
  deepseek: {
    name: 'DeepSeek Chat v3',
    provider: 'OpenRouter',
    model: 'deepseek/deepseek-chat-v3-0324:free'
  },
  deepseekR1: {
    name: 'DeepSeek R1',
    provider: 'OpenRouter',
    model: 'deepseek/deepseek-r1:free'
  },
  deepseekR1Preview: {
    name: 'DeepSeek R1 Preview',
    provider: 'OpenRouter',
    model: 'deepseek/deepseek-r1-0528:free'
  },
  deepcoder: {
    name: 'DeepCoder 14B Preview',
    provider: 'OpenRouter',
    model: 'agentica-org/deepcoder-14b-preview:free'
  },
  qwen: {
    name: 'Qwen 3 Coder',
    provider: 'OpenRouter',
    model: 'qwen/qwen3-coder:free'
  },
  gemini: {
    name: 'Gemini Flash 2.0',
    provider: 'Google',
    model: 'gemini-1.5-flash'
  }
};

// Initialize AI
function initializeAI() {
  openrouterApiKey = OPENROUTER_API_KEYS[currentOpenRouterKeyIndex];
  geminiApiKey = GEMINI_API_KEYS[currentGeminiKeyIndex];
  console.log(`AI initialized with OpenRouter key ${currentOpenRouterKeyIndex + 1} and Gemini key ${currentGeminiKeyIndex + 1}`);
}

// Create main window
function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 800,
    minHeight: 600,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      enableRemoteModule: false,
      preload: path.join(__dirname, 'preload.js')
    },
    icon: path.join(__dirname, 'assets', 'icon.png'),
    show: false,
    titleBarStyle: 'hiddenInset',
    title: 'Whizan - Intelligent Code Editor'
  });

  // Load the landing page first
  mainWindow.loadFile('landing.html');

  // Show window when ready
  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });

  // Handle window closed
  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  // Handle external links
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  // Development tools
  if (process.env.NODE_ENV === 'development') {
    mainWindow.webContents.openDevTools();
  }
}

// Load editor with workspace
function loadEditor(workspacePath) {
  if (!mainWindow) return;
  
  mainWindow.loadFile('renderer/index.html');
  
  // Set workspace path
  mainWindow.webContents.on('did-finish-load', () => {
    mainWindow.webContents.send('workspace-loaded', workspacePath);
  });
}

// IPC Handlers
ipcMain.handle('select-folder', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openDirectory']
  });
  
  if (!result.canceled && result.filePaths.length > 0) {
    const selectedPath = result.filePaths[0];
    workspacePath = selectedPath;
    
    // Load the editor with the selected workspace
    loadEditor(selectedPath);
    
    return selectedPath;
  }
  
  return null;
});

ipcMain.handle('open-folder', async (event, folderPath) => {
  if (fs.existsSync(folderPath)) {
    workspacePath = folderPath;
    loadEditor(folderPath);
    return folderPath;
  }
  return null;
});

ipcMain.handle('get-workspace-path', () => {
  return workspacePath;
});

ipcMain.handle('read-file', async (event, filePath) => {
  try {
    const content = await fs.readFile(filePath, 'utf8');
    return { success: true, content };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('write-file', async (event, filePath, content) => {
  try {
    await fs.writeFile(filePath, content, 'utf8');
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('create-directory', async (event, dirPath) => {
  try {
    await fs.ensureDir(dirPath);
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('delete-file', async (event, filePath) => {
  try {
    await fs.remove(filePath);
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('rename-file', async (event, oldPath, newPath) => {
  try {
    await fs.move(oldPath, newPath);
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('get-file-stats', async (event, filePath) => {
  try {
    const stats = await fs.stat(filePath);
    return { success: true, stats };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('list-directory', async (event, dirPath) => {
  try {
    const items = await fs.readdir(dirPath);
    const fileList = [];
    
    for (const item of items) {
      const fullPath = path.join(dirPath, item);
      const stats = await fs.stat(fullPath);
      fileList.push({
        name: item,
        path: fullPath,
        isDirectory: stats.isDirectory(),
        size: stats.size,
        modified: stats.mtime
      });
    }
    
    return { success: true, files: fileList };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

// Terminal handlers
ipcMain.handle('create-terminal', async (event, terminalId, shell) => {
  try {
    const ptyProcess = pty.spawn(shell || process.env.SHELL || 'bash', [], {
      name: 'xterm-color',
      cols: 80,
      rows: 30,
      cwd: workspacePath || process.env.HOME,
      env: process.env
    });

    terminalIdToPty.set(terminalId, ptyProcess);

    ptyProcess.onData(data => {
      mainWindow.webContents.send('terminal-data', terminalId, data);
    });

    ptyProcess.onExit(exitCode => {
      mainWindow.webContents.send('terminal-exit', terminalId, exitCode);
      terminalIdToPty.delete(terminalId);
    });

    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('write-terminal', async (event, terminalId, data) => {
  const ptyProcess = terminalIdToPty.get(terminalId);
  if (ptyProcess) {
    ptyProcess.write(data);
    return { success: true };
  }
  return { success: false, error: 'Terminal not found' };
});

ipcMain.handle('resize-terminal', async (event, terminalId, cols, rows) => {
  const ptyProcess = terminalIdToPty.get(terminalId);
  if (ptyProcess) {
    ptyProcess.resize(cols, rows);
    return { success: true };
  }
  return { success: false, error: 'Terminal not found' };
});

ipcMain.handle('kill-terminal', async (event, terminalId) => {
  const ptyProcess = terminalIdToPty.get(terminalId);
  if (ptyProcess) {
    ptyProcess.kill();
    terminalIdToPty.delete(terminalId);
    return { success: true };
  }
  return { success: false, error: 'Terminal not found' };
});

// AI Chat handlers
ipcMain.handle('send-ai-message', async (event, message, context) => {
  try {
    const model = AI_MODELS[selectedModel];
    if (!model) {
      throw new Error('Invalid model selected');
    }

    let response;
    if (model.provider === 'OpenRouter') {
      response = await sendOpenRouterMessage(message, context);
    } else if (model.provider === 'Google') {
      response = await sendGeminiMessage(message, context);
    } else {
      throw new Error('Unsupported AI provider');
    }

    return { success: true, response };
  } catch (error) {
    console.error('AI message error:', error);
    return { success: false, error: error.message };
  }
});

// OpenRouter API
async function sendOpenRouterMessage(message, context) {
  const model = AI_MODELS[selectedModel];
  
  try {
    const response = await axios.post('https://openrouter.ai/api/v1/chat/completions', {
      model: model.model,
      messages: [
        {
          role: 'system',
          content: 'You are an intelligent coding assistant. Help users with their programming tasks, code reviews, debugging, and project development.'
        },
        {
          role: 'user',
          content: `Context: ${context}\n\nUser message: ${message}`
        }
      ],
      max_tokens: 4000,
      temperature: 0.7
    }, {
      headers: {
        'Authorization': `Bearer ${openrouterApiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://whizan.app',
        'X-Title': 'Whizan Code Editor'
      }
    });

    return response.data.choices[0].message.content;
  } catch (error) {
    if (error.response?.status === 429 || error.response?.status === 401) {
      // Try next API key
      currentOpenRouterKeyIndex = (currentOpenRouterKeyIndex + 1) % OPENROUTER_API_KEYS.length;
      openrouterApiKey = OPENROUTER_API_KEYS[currentOpenRouterKeyIndex];
      console.log(`Switched to OpenRouter key ${currentOpenRouterKeyIndex + 1}`);
      
      // Retry with new key
      return sendOpenRouterMessage(message, context);
    }
    throw error;
  }
}

// Gemini API
async function sendGeminiMessage(message, context) {
  try {
    const response = await axios.post(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${geminiApiKey}`, {
      contents: [{
        parts: [{
          text: `Context: ${context}\n\nUser message: ${message}`
        }]
      }],
      generationConfig: {
        maxOutputTokens: 4000,
        temperature: 0.7
      }
    });

    return response.data.candidates[0].content.parts[0].text;
  } catch (error) {
    if (error.response?.status === 429 || error.response?.status === 400) {
      // Try next API key
      currentGeminiKeyIndex = (currentGeminiKeyIndex + 1) % GEMINI_API_KEYS.length;
      geminiApiKey = GEMINI_API_KEYS[currentGeminiKeyIndex];
      console.log(`Switched to Gemini key ${currentGeminiKeyIndex + 1}`);
      
      // Retry with new key
      return sendGeminiMessage(message, context);
    }
    throw error;
  }
}

// Model selection
ipcMain.handle('set-ai-model', async (event, modelName) => {
  if (AI_MODELS[modelName]) {
    selectedModel = modelName;
    return { success: true, model: AI_MODELS[modelName] };
  }
  return { success: false, error: 'Invalid model' };
});

ipcMain.handle('get-ai-models', () => {
  return AI_MODELS;
});

ipcMain.handle('get-current-model', () => {
  return AI_MODELS[selectedModel];
});

// App lifecycle
app.whenReady().then(() => {
  initializeAI();
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('before-quit', () => {
  // Clean up terminals
  for (const [terminalId, ptyProcess] of terminalIdToPty) {
    ptyProcess.kill();
  }
  terminalIdToPty.clear();
});

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});
