const { app, BrowserWindow, dialog, ipcMain, shell } = require('electron');
const path = require('path');
const fs = require('fs-extra');
const chokidar = require('chokidar');
const pty = require('node-pty');
const axios = require('axios');
const { exec } = require('child_process');
const { promisify } = require('util');
const CodebaseIndexer = require('./codebase-indexer');
const EnhancedCodebaseIndexer = require('./enhanced-indexer');
const AIAgentSystem = require('./ai-agent-system');
const SessionManager = require('./session-manager');

const execAsync = promisify(exec);

/** @type {BrowserWindow | null} */
let mainWindow = null;
/** @type {string | null} */
let workspacePath = null;
/** @type {import('chokidar').FSWatcher | null} */
let watcher = null;

/** @type {Map<string, import('node-pty').IPty>} */
const terminalIdToPty = new Map();

/** @type {CodebaseIndexer | null} */
let codebaseIndexer = null;

/** @type {AIAgentSystem | null} */
let aiAgentSystem = null;

// AI Agent Configuration
let openrouterApiKey = null;
let geminiApiKey = null;
let aiAgentActive = false;
let currentProjectPlan = null;
let selectedModel = 'gemini'; // Default to Gemini
let isBuildingProject = false;
let currentTerminalId = null;

// Gemini API keys with fallback
const GEMINI_API_KEYS = [
  'AIzaSyBDA_wIQPBjWVVelfjzAToKhQfkkGYDyac',
  'AIzaSyA3npCN1ntj8Cw9BtqaIy4M6kDijC9Wcxg' 
 
];
let currentGeminiKeyIndex = 0;

// OpenRouter API keys with fallback
const OPENROUTER_API_KEYS = [
  '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',
  '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',
  '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',
  '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',
  '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'
];
let currentOpenRouterKeyIndex = 0;

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

// Initialize AI (you'll need to set API keys in environment)
function initializeAI() {
  // Initialize with first OpenRouter key
  openrouterApiKey = OPENROUTER_API_KEYS[currentOpenRouterKeyIndex];
  console.log(`OpenRouter API initialized with key ${currentOpenRouterKeyIndex + 1}`);
  
  // Initialize with first Gemini key
  geminiApiKey = GEMINI_API_KEYS[currentGeminiKeyIndex];
  console.log(`Gemini API initialized with key ${currentGeminiKeyIndex + 1}`);
  
  if (openrouterApiKey || geminiApiKey) {
    console.log('AI Agent initialized successfully');
  } else {
    console.log('No API keys found. AI features will be disabled.');
  }
}


function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: false,
    },
    title: 'Whizan',
  });

  // Load the landing page first
  mainWindow.loadFile('landing.html');

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

function startWatcher(rootPath) {
  stopWatcher();
  watcher = chokidar.watch(rootPath, {
    ignored: /node_modules|\.git/,
    ignoreInitial: true,
    persistent: true,
  });

  const notify = (event, filePath) => {
    if (mainWindow && mainWindow.webContents) {
      mainWindow.webContents.send('fs:changed', { event, filePath });
    }
  };

  const updateIndex = async (event, filePath) => {
    if (codebaseIndexer && workspacePath) {
      try {
        const relativePath = path.relative(workspacePath, filePath);
        
        if (event === 'add' || event === 'change') {
          // Update index for changed/added files
          await codebaseIndexer.updateIndex([relativePath]);
          console.log(`Updated index for ${relativePath}`);
        } else if (event === 'unlink') {
          // Remove from index for deleted files
          // This would require adding a removeFromIndex method to CodebaseIndexer
          console.log(`File deleted: ${relativePath}`);
        }
      } catch (error) {
        console.error('Index update failed:', error);
      }
    }
  };

  watcher
    .on('add', (p) => {
      notify('add', p);
      updateIndex('add', p);
    })
    .on('change', (p) => {
      notify('change', p);
      updateIndex('change', p);
    })
    .on('unlink', (p) => {
      notify('unlink', p);
      updateIndex('unlink', p);
    })
    .on('addDir', (p) => notify('addDir', p))
    .on('unlinkDir', (p) => notify('unlinkDir', p));
}

function stopWatcher() {
  if (watcher) {
    watcher.close();
    watcher = null;
  }
}

function getDirectoryEntries(targetPath) {
  const entries = fs.readdirSync(targetPath, { withFileTypes: true });
  return entries
    .map((e) => ({
      name: e.name,
      path: path.join(targetPath, e.name),
      isDirectory: e.isDirectory(),
    }))
    .sort((a, b) => {
      if (a.isDirectory && !b.isDirectory) return -1;
      if (!a.isDirectory && b.isDirectory) return 1;
      return a.name.localeCompare(b.name);
    });
}

function getLanguageFromFilename(filename) {
  const ext = path.extname(filename).toLowerCase();
  const map = {
    '.js': 'javascript',
    '.ts': 'typescript',
    '.jsx': 'javascript',
    '.tsx': 'typescript',
    '.json': 'json',
    '.html': 'html',
    '.css': 'css',
    '.md': 'markdown',
    '.py': 'python',
    '.java': 'java',
    '.c': 'c',
    '.h': 'c',
    '.hpp': 'cpp',
    '.cpp': 'cpp',
    '.go': 'go',
    '.rs': 'rust',
    '.sh': 'shell',
    '.yml': 'yaml',
    '.yaml': 'yaml',
  };
  return map[ext] || 'plaintext';
}

// AI Service Functions
async function callAI(messages, options = {}, onProgress) {
  const model = AI_MODELS[selectedModel];
  
  if (!model) {
    throw new Error('Invalid model selected');
  }
  
  // Check if it's an OpenRouter model
  if (model.provider === 'OpenRouter') {
    if (!openrouterApiKey) {
      throw new Error('OpenRouter API key not found');
    }
    return await callOpenRouter(messages, options, onProgress);
  } else if (selectedModel === 'gemini') {
    if (!geminiApiKey) {
      throw new Error('Gemini API key not found');
    }
    
    try {
      return await callGemini(messages, options, onProgress);
    } catch (error) {
      console.error('Gemini failed, falling back to DeepSeek:', error.message);
      if (openrouterApiKey) {
        console.log('Switching to DeepSeek model...');
        selectedModel = 'deepseek';
        return await callOpenRouter(messages, options, onProgress);
      } else {
        throw error; // Re-throw if no fallback available
      }
    }
  } else {
    throw new Error('Invalid model selected');
  }
}

async function callOpenRouter(messages, options = {}, onProgress) {
  const maxRetries = OPENROUTER_API_KEYS.length;
  
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      // Use current OpenRouter key
      const currentKey = OPENROUTER_API_KEYS[currentOpenRouterKeyIndex];
      console.log(`Attempting OpenRouter API call with key ${currentOpenRouterKeyIndex + 1}`);
      
      const response = await axios.post('https://openrouter.ai/api/v1/chat/completions', {
        model: AI_MODELS[selectedModel].model,
        messages: messages,
        temperature: options.temperature || 0.7,
        max_tokens: options.max_tokens || 2000,
        stream: options.stream || false
      }, {
        headers: {
          'Authorization': `Bearer ${currentKey}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': 'https://whizan-ai-editor.com',
          'X-Title': 'Whizan AI Editor'
        },
        responseType: options.stream ? 'stream' : 'json',
        timeout: 30000 // 30 second timeout
      });

      if (options.stream) {
        return handleOpenRouterStream(response, onProgress);
      } else {
        return response.data.choices[0].message.content;
      }
    } catch (error) {
      console.error(`OpenRouter API error with key ${currentOpenRouterKeyIndex + 1}:`, error.response?.status, error.response?.data);
      
      // Try next API key
      currentOpenRouterKeyIndex = (currentOpenRouterKeyIndex + 1) % OPENROUTER_API_KEYS.length;
      openrouterApiKey = OPENROUTER_API_KEYS[currentOpenRouterKeyIndex];
      
      if (attempt < maxRetries - 1) {
        console.log(`Switching to OpenRouter API key ${currentOpenRouterKeyIndex + 1}`);
        continue;
      } else {
        // All keys failed, throw error
        if (error.response?.status === 429) {
          throw new Error('All OpenRouter API keys are currently rate-limited. Please try again later.');
        } else if (error.response?.status === 401) {
          throw new Error('Invalid OpenRouter API key. All API keys failed.');
        } else {
          throw new Error(`OpenRouter API error: ${error.message}`);
        }
      }
    }
  }
}

async function callGemini(messages, options = {}, onProgress) {
  const maxRetries = GEMINI_API_KEYS.length;
  
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      // Use current Gemini key
      const currentKey = GEMINI_API_KEYS[currentGeminiKeyIndex];
      console.log(`Attempting Gemini API call with key ${currentGeminiKeyIndex + 1}`);
      
      // Convert messages to Gemini format
      const geminiMessages = messages.map(msg => ({
        role: msg.role === 'system' ? 'user' : msg.role,
        parts: [{ text: msg.content }]
      }));

      const response = await axios.post(`https://generativelanguage.googleapis.com/v1beta/models/${AI_MODELS.gemini.model}:generateContent?key=${currentKey}`, {
        contents: geminiMessages,
        generationConfig: {
          temperature: options.temperature || 0.7,
          maxOutputTokens: options.max_tokens || 2000
        }
      }, {
        headers: {
          'Content-Type': 'application/json'
        },
        timeout: 30000 // 30 second timeout
      });

      if (response.data.candidates && response.data.candidates[0] && response.data.candidates[0].content) {
        return response.data.candidates[0].content.parts[0].text;
      } else {
        throw new Error('Invalid response format from Gemini API');
      }
    } catch (error) {
      console.error(`Gemini API error with key ${currentGeminiKeyIndex + 1}:`, error.response?.status, error.response?.data);
      
      // Try next API key
      currentGeminiKeyIndex = (currentGeminiKeyIndex + 1) % GEMINI_API_KEYS.length;
      geminiApiKey = GEMINI_API_KEYS[currentGeminiKeyIndex];
      
      if (attempt < maxRetries - 1) {
        console.log(`Switching to Gemini API key ${currentGeminiKeyIndex + 1}`);
        continue;
      } else {
        // All keys failed, throw error
        if (error.response?.status === 503) {
          throw new Error('All Gemini API keys are currently unavailable. Please try using DeepSeek model instead.');
        } else if (error.response?.status === 400) {
          throw new Error('Invalid request to Gemini API. All API keys failed.');
        } else {
          throw new Error(`Gemini API error: ${error.message}`);
        }
      }
    }
  }
}

async function handleOpenRouterStream(response, onProgress) {
  let fullResponse = '';
  let buffer = '';

  return new Promise((resolve, reject) => {
    response.data.on('data', (chunk) => {
      const lines = chunk.toString().split('\n');
      
      for (const line of lines) {
        if (line.startsWith('data: ')) {
          const data = line.slice(6);
          if (data === '[DONE]') {
            if (onProgress) onProgress('Processing response...', 90);
            resolve(fullResponse);
            return;
          }
          
          try {
            const parsed = JSON.parse(data);
            if (parsed.choices && parsed.choices[0] && parsed.choices[0].delta && parsed.choices[0].delta.content) {
              const content = parsed.choices[0].delta.content;
              fullResponse += content;
              buffer += content;
              
              if (buffer.length > 50 && onProgress) {
                onProgress(`Generating... (${fullResponse.length} chars)`, 30 + Math.min(50, (fullResponse.length / 100)));
                buffer = '';
              }
            }
          } catch (e) {
            // Ignore parsing errors for incomplete chunks
          }
        }
      }
    });

    response.data.on('error', reject);
    response.data.on('end', () => {
      if (!fullResponse) {
        reject(new Error('No response received from AI'));
      }
    });
  });
}

// AI Agent Functions
async function generateProjectPlan(prompt, onProgress) {
  if (!openrouterApiKey && !geminiApiKey) {
    throw new Error('No AI API keys found. Please set OPENROUTER_API_KEY or GEMINI_API_KEY environment variable.');
  }

  const systemPrompt = `You are an expert full-stack developer and project architect. 
  Given a user's project description, create a detailed project plan including:
  
  1. Project Overview: Brief description of what the project will do
  2. Technology Stack: Recommended technologies (frontend, backend, database, etc.)
  3. Project Structure: Folder structure and key files that EXACTLY match the framework generator
  4. Dependencies: Required packages and their purposes
  5. Implementation Steps: Step-by-step development plan
  6. Key Features: Main functionality to implement
  7. Setup Commands: Exact commands to run for project initialization
  
  IMPORTANT: 
  - Return ONLY a valid JSON object with these exact fields
  - The project structure MUST match the framework generator output exactly
  - Include the exact setup command that would be used to create the project
  - For React projects, structure should match "npx create-react-app" output
  - For Next.js projects, structure should match "npx create-next-app" output
  - For Vue projects, structure should match "npm create vue@latest" output
  - For Node.js/Express projects, include proper package.json and folder structure
  
  Required JSON structure:
  {
    "overview": "Project description",
    "techStack": {
      "frontend": ["tech1", "tech2"],
      "backend": ["tech1", "tech2"],
      "database": "tech",
      "other": ["tech1", "tech2"]
    },
    "structure": {
      "folders": ["folder1", "folder2"],
      "files": ["file1", "file2"]
    },
    "dependencies": {
      "frontend": ["package1", "package2"],
      "backend": ["package1", "package2"]
    },
    "steps": ["step1", "step2", "step3"],
    "features": ["feature1", "feature2"],
    "setupCommand": "exact command to run",
    "framework": "react|next|vue|express|vanilla"
  }`;

  try {
    if (onProgress) onProgress('Starting AI analysis...', 10);
    
    const response = await callAI([
      { role: 'system', content: systemPrompt },
      { role: 'user', content: prompt }
    ], {
      temperature: 0.7,
      max_tokens: 2000,
      stream: true
    }, onProgress);

    if (onProgress) onProgress('Processing AI response...', 80);
    
    // Extract JSON from markdown code blocks if present
    let jsonText = response;
    if (response.includes('```json')) {
      const jsonMatch = response.match(/```json\s*([\s\S]*?)\s*```/);
      if (jsonMatch) {
        jsonText = jsonMatch[1];
      }
    } else if (response.includes('```')) {
      const jsonMatch = response.match(/```\s*([\s\S]*?)\s*```/);
      if (jsonMatch) {
        jsonText = jsonMatch[1];
      }
    }
    
    try {
      const result = JSON.parse(jsonText);
      
      // Validate and enhance the result
      if (!result.setupCommand) {
        result.setupCommand = generateDefaultSetupCommand(result);
      }
      
      if (onProgress) onProgress('Project plan generated successfully!', 100);
      return result;
    } catch (parseError) {
      console.error('Error parsing JSON:', parseError);
      console.error('Raw response:', response);
      
      // Try to extract JSON from the response more aggressively
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        try {
          const fallbackResult = JSON.parse(jsonMatch[0]);
          if (!fallbackResult.setupCommand) {
            fallbackResult.setupCommand = generateDefaultSetupCommand(fallbackResult);
          }
          if (onProgress) onProgress('Project plan generated successfully!', 100);
          return fallbackResult;
        } catch (fallbackError) {
          console.error('Fallback JSON parsing also failed:', fallbackError);
        }
      }
      
      throw new Error(`Invalid JSON response from AI. Please try again. Raw response: ${response.substring(0, 200)}...`);
    }
  } catch (error) {
    console.error('Error generating project plan:', error);
    throw error;
  }
}

// Generate default setup command based on tech stack
function generateDefaultSetupCommand(plan) {
  const frontend = plan.techStack?.frontend || [];
  const backend = plan.techStack?.backend || [];
  
  // Generate project name based on overview
  const projectName = generateProjectName(plan.overview);
  
  if (frontend.includes('React') && !frontend.includes('Next.js')) {
    return `npx create-react-app ${projectName}`;
  } else if (frontend.includes('Next.js')) {
    return `npx create-next-app@latest ${projectName} --typescript --tailwind --eslint --app --src-dir --import-alias "@/*" --yes`;
  } else if (frontend.includes('Vue')) {
    return `npm create vue@latest ${projectName} -- --yes`;
  } else if (frontend.includes('Svelte')) {
    return `npm create svelte@latest ${projectName} -- --yes`;
  } else if (backend.includes('Express') && !frontend.includes('React') && !frontend.includes('Vue')) {
    return `mkdir ${projectName} && cd ${projectName} && npm init -y && npm install express cors dotenv`;
  } else {
    return `mkdir ${projectName} && cd ${projectName} && npm init -y`;
  }
}

// Generate project name from overview
function generateProjectName(overview) {
  if (!overview) return `whizan-project-${Date.now()}`;
  
  // Extract key words and create a name
  const words = overview.toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .split(' ')
    .filter(word => word.length > 2);
  
  if (words.length === 0) return `whizan-project-${Date.now()}`;
  
  // Take first 2-3 meaningful words
  const nameWords = words.slice(0, 3);
  const projectName = nameWords.join('-');
  
  return projectName || `whizan-project-${Date.now()}`;
}

async function generateCode(filePath, context, requirements, onProgress) {
  if (!openrouterApiKey && !geminiApiKey) {
    throw new Error('No AI API keys found');
  }

  const systemPrompt = `You are an expert full-stack developer. 
  Generate complete, production-ready code for the given file based on the requirements.
  The code should be:
  - Complete and functional
  - Follow best practices
  - Include proper error handling
  - Be well-commented
  - Ready to run immediately
  
  File: ${filePath}
  Context: ${context}
  Requirements: ${requirements}
  
  IMPORTANT: Return ONLY the code. Do not include any markdown formatting, code blocks, or explanatory text.`;

  try {
    if (onProgress) onProgress(`Starting code generation for ${filePath}...`, 10);
    
    const response = await callAI([
      { role: 'system', content: systemPrompt },
      { role: 'user', content: `Generate code for ${filePath} with requirements: ${requirements}` }
    ], {
      temperature: 0.3,
      max_tokens: 4000,
      stream: true
    }, onProgress);

    if (onProgress) onProgress(`Processing code for ${filePath}...`, 80);
    
    // Remove markdown code blocks if present
    let codeText = response;
    if (response.includes('```')) {
      const codeMatch = response.match(/```(?:[a-z]*)\s*([\s\S]*?)\s*```/);
      if (codeMatch) {
        codeText = codeMatch[1];
      }
    }
    
    if (onProgress) onProgress(`${filePath} generated successfully!`, 100);
    return codeText;
  } catch (error) {
    console.error('Error generating code:', error);
    throw error;
  }

}

// Enhanced project building with terminal commands and live code streaming
async function buildProjectWithStreaming(plan, onProgress, onFileOpen, onCodeStream, onTerminalCommand) {
  if (!plan) {
    throw new Error('No project plan provided');
  }
  
  if (isBuildingProject) {
    throw new Error('Project build already in progress');
  }
  
  isBuildingProject = true;
  
  try {
    onProgress('Preparing project workspace...', 5);
    
    // Get desktop path for project creation
    const desktopPath = path.join(require('os').homedir(), 'Desktop');
    let projectPath = desktopPath;
    
    // Extract project name from setup command if available
    let projectName = null;
    if (plan.setupCommand) {
      const match = plan.setupCommand.match(/create-[^ ]+ ([^ ]+)/);
      if (match) {
        projectName = match[1];
        projectPath = path.join(desktopPath, projectName);
      }
    }
    
    // If no project name found, generate one
    if (!projectName) {
      projectName = `whizan-project-${Date.now()}`;
      projectPath = path.join(desktopPath, projectName);
    }
    
    onProgress(`Creating project at: ${projectPath}`, 8);
    
    onProgress('Executing framework setup command...', 10);
    
    // Execute the main setup command first (e.g., create-react-app, create-next-app)
    if (plan.setupCommand) {
      onProgress(`Running: ${plan.setupCommand}`, 12);
      
      try {
        const setupResult = await executeCommand(plan.setupCommand, desktopPath);
        if (setupResult.success) {
          onProgress('Framework setup completed successfully', 20);
          
          // Navigate into the project folder
          onProgress(`Navigating to project folder: ${projectName}`, 22);
          
          // Update workspace path to the new project folder
          workspacePath = projectPath;
          
          // Open the project folder in the application
          if (onFileOpen) {
            onFileOpen(projectPath);
          }
          
          // Start file watcher for the new project
          startWatcher(workspacePath);
          
        } else {
          onProgress(`Framework setup failed: ${setupResult.error}. Trying alternative approach...`, 20);
          // Fallback: create basic structure manually
          await createProjectStructure(plan.structure, projectPath);
        }
      } catch (error) {
        onProgress(`Framework setup error: ${error.message}. Creating structure manually...`, 20);
        await createProjectStructure(plan.structure, projectPath);
      }
    } else {
      // No setup command, create structure manually
      onProgress('Creating project structure manually...', 15);
      const structureResult = await createProjectStructure(plan.structure, projectPath);
      if (!structureResult.success) {
        throw new Error(`Failed to create project structure: ${structureResult.error}`);
      }
      
      // Update workspace path and open project
      workspacePath = projectPath;
      if (onFileOpen) {
        onFileOpen(projectPath);
      }
      startWatcher(workspacePath);
    }
    
    onProgress('Installing dependencies...', 25);
    
    // Install dependencies
    const allDeps = [
      ...(plan.dependencies?.frontend || []),
      ...(plan.dependencies?.backend || [])
    ];
    
    if (allDeps.length > 0) {
      const installCommand = `npm install ${allDeps.join(' ')}`;
      onProgress(`Installing: ${installCommand}`, 27);
      
      try {
        const installResult = await executeCommand(installCommand, workspacePath);
        if (installResult.success) {
          onProgress('Dependencies installed successfully', 35);
        } else {
          onProgress(`Dependency installation failed: ${installResult.error}`, 35);
        }
      } catch (error) {
        onProgress(`Dependency installation error: ${error.message}`, 35);
      }
    }
    
    onProgress('Generating custom code files...', 40);
    
    // Generate code for custom files (not created by framework generators)
    const filesToGenerate = plan.structure.files || [];
    const frameworkFiles = getFrameworkFiles(plan.framework);
    const customFiles = filesToGenerate.filter(file => !frameworkFiles.includes(file));
    
    for (let i = 0; i < customFiles.length; i++) {
      const file = customFiles[i];
      const filePath = path.join(workspacePath, file);
      const context = `Building ${plan.overview}`;
      const requirements = `Create ${file} for ${plan.overview}`;
      
      onProgress(`Opening ${file} in editor...`, 45 + (i * 10));
      
      // Open file in editor
      if (onFileOpen) {
        onFileOpen(filePath);
      }
      
      onProgress(`Generating code for ${file}...`, 50 + (i * 10));
      
      // Generate code
      const codeResult = await generateCodeWithLiveStreaming(filePath, context, requirements, (message, progress, codeChunk) => {
        onProgress(message, 50 + (i * 10) + Math.floor(progress * 0.3));
        if (onCodeStream) {
          onCodeStream(filePath, message, codeChunk);
        }
      });
      
      if (codeResult) {
        // Save the generated code
        await fs.writeFile(filePath, codeResult, 'utf8');
        onProgress(`${file} generated and saved successfully`, 55 + (i * 10));
      } else {
        onProgress(`Failed to generate ${file}`, 55 + (i * 10));
      }
    }
    
    onProgress('Project build completed! Ready to start development server.', 100);
    
  } catch (error) {
    onProgress(`Build failed: ${error.message}`, 100);
    throw error;
  } finally {
    isBuildingProject = false;
  }
}

// Get list of files typically created by framework generators
function getFrameworkFiles(framework) {
  const frameworkFiles = {
    'react': [
      'public/index.html',
      'public/manifest.json',
      'src/App.js',
      'src/App.css',
      'src/index.js',
      'src/index.css',
      'src/logo.svg',
      'src/reportWebVitals.js',
      'src/setupTests.js',
      'package.json',
      'README.md'
    ],
    'next': [
      'app/page.tsx',
      'app/layout.tsx',
      'app/globals.css',
      'public/next.svg',
      'public/vercel.svg',
      'next.config.js',
      'tailwind.config.ts',
      'tsconfig.json',
      'package.json',
      'README.md'
    ],
    'vue': [
      'src/App.vue',
      'src/main.js',
      'src/assets/logo.svg',
      'src/components/HelloWorld.vue',
      'public/index.html',
      'package.json',
      'README.md'
    ],
    'express': [
      'package.json',
      'server.js',
      'index.js',
      'README.md'
    ],
    'vanilla': [
      'index.html',
      'style.css',
      'script.js',
      'package.json',
      'README.md'
    ]
  };
  
  return frameworkFiles[framework] || [];
}



// Generate code with live streaming to editor
async function generateCodeWithLiveStreaming(filePath, context, requirements, onProgress) {
  if (!geminiApiKey && !openrouterApiKey) {
    throw new Error('No AI API keys found');
  }

  const systemPrompt = `You are an expert full-stack developer. 
  Generate complete, production-ready code for the given file based on the requirements.
  The code should be:
  - Complete and functional
  - Follow best practices
  - Include proper error handling
  - Be well-commented
  - Ready to run immediately
  
  File: ${filePath}
  Context: ${context}
  Requirements: ${requirements}
  
  IMPORTANT: Return ONLY the code. Do not include any markdown formatting, code blocks, or explanatory text.`;

  try {
    if (onProgress) onProgress(`Starting code generation for ${path.basename(filePath)}...`, 10);
    
    const response = await callAI([
      { role: 'system', content: systemPrompt },
      { role: 'user', content: `Generate code for ${path.basename(filePath)} with requirements: ${requirements}` }
    ], {
      temperature: 0.3,
      max_tokens: 4000,
      stream: false // Use non-streaming for now, we'll implement live streaming separately
    }, onProgress);

    if (onProgress) onProgress(`Processing code for ${path.basename(filePath)}...`, 80);
    
    // Remove markdown code blocks if present
    let codeText = response;
    if (response.includes('```')) {
      const codeMatch = response.match(/```(?:[a-z]*)\s*([\s\S]*?)\s*```/);
      if (codeMatch) {
        codeText = codeMatch[1];
      }
    }
    
    if (onProgress) onProgress(`${path.basename(filePath)} generated successfully!`, 100);
    return codeText;
  } catch (error) {
    console.error('Error generating code:', error);
    throw error;
  }
}

async function executeCommand(command, cwd = workspacePath) {
  try {
    console.log(`Executing: ${command} in ${cwd}`);
    const { stdout, stderr } = await execAsync(command, { cwd });
    if (stderr) console.error('Command stderr:', stderr);
    return { success: true, output: stdout, error: stderr };
  } catch (error) {
    console.error('Command failed:', error);
    return { success: false, output: error.stdout, error: error.stderr };
  }
}

async function installDependencies(dependencies, type = 'npm') {
  if (!dependencies || dependencies.length === 0) return { success: true, output: 'No dependencies to install' };
  
  const command = type === 'npm' ? `npm install ${dependencies.join(' ')}` : `yarn add ${dependencies.join(' ')}`;
  return await executeCommand(command);
}

async function createProjectStructure(structure) {
  if (!workspacePath) {
    return { success: false, error: 'No workspace path set' };
  }
  
  if (!structure) {
    return { success: false, error: 'No structure provided' };
  }
  
  const results = [];
  
  try {
    // Create folders
    for (const folder of structure.folders || []) {
      try {
        const folderPath = path.join(workspacePath, folder);
        await fs.ensureDir(folderPath);
        results.push({ type: 'folder', path: folder, success: true });
        console.log(`Created folder: ${folder}`);
      } catch (error) {
        console.error(`Failed to create folder ${folder}:`, error);
        results.push({ type: 'folder', path: folder, success: false, error: error.message });
      }
    }
    
    // Create files
    for (const file of structure.files || []) {
      try {
        const filePath = path.join(workspacePath, file);
        await fs.ensureFile(filePath);
        results.push({ type: 'file', path: file, success: true });
        console.log(`Created file: ${file}`);
      } catch (error) {
        console.error(`Failed to create file ${file}:`, error);
        results.push({ type: 'file', path: file, success: false, error: error.message });
      }
    }
    
    const successCount = results.filter(r => r.success).length;
    const totalCount = results.length;
    
    console.log(`Project structure created: ${successCount}/${totalCount} items successful`);
    
    return { 
      success: successCount > 0, 
      results,
      summary: `${successCount}/${totalCount} items created successfully`
    };
  } catch (error) {
    console.error('Error creating project structure:', error);
    return { success: false, error: error.message, results };
  }
}

function setupIpc() {
  ipcMain.handle('dialog:openWorkspace', async () => {
    const res = await dialog.showOpenDialog(mainWindow, {
      properties: ['openDirectory'],
    });
    if (res.canceled || res.filePaths.length === 0) return null;
    workspacePath = res.filePaths[0];
    startWatcher(workspacePath);
    
    // Initialize codebase indexer for the new workspace
    try {
      console.log('Initializing codebase indexer...');
      codebaseIndexer = new EnhancedCodebaseIndexer(workspacePath);
      await codebaseIndexer.indexCodebase();
      console.log('Codebase indexing completed');
      
      // Initialize AI agent system
      console.log('Initializing AI agent system...');
      aiAgentSystem = new AIAgentSystem(workspacePath, codebaseIndexer);
      console.log('AI agent system initialized');
      
      // Send indexing stats to renderer
      if (mainWindow && mainWindow.webContents) {
        const stats = codebaseIndexer.getIndexStats();
        mainWindow.webContents.send('codebase:indexed', { stats });
      }
    } catch (error) {
      console.error('Codebase indexing failed:', error);
    }
    
    // Notify renderer about workspace change for terminal updates
    if (mainWindow && mainWindow.webContents) {
      mainWindow.webContents.send('workspace:changed', { path: workspacePath });
    }
    
    return workspacePath;
  });

  ipcMain.handle('workspace:get', () => workspacePath);

  ipcMain.handle('fs:readDir', (_, targetPath) => {
    const p = targetPath || workspacePath;
    if (!p) return [];
    return getDirectoryEntries(p);
  });

  ipcMain.handle('fs:readFile', async (_, filePath) => {
    const data = await fs.readFile(filePath, 'utf8');
    return { content: data, language: getLanguageFromFilename(filePath) };
  });

  ipcMain.handle('fs:writeFile', async (_, filePath, content) => {
    await fs.ensureFile(filePath);
    await fs.writeFile(filePath, content, 'utf8');
    return true;
  });

  ipcMain.handle('fs:createFolder', async (_, folderPath) => {
    await fs.ensureDir(folderPath);
    return true;
  });

  ipcMain.handle('fs:createFile', async (_, filePath) => {
    await fs.ensureFile(filePath);
    await fs.writeFile(filePath, '', 'utf8');
    return true;
  });

  ipcMain.handle('fs:deletePath', async (_, targetPath) => {
    await fs.remove(targetPath);
    return true;
  });

  ipcMain.handle('fs:renamePath', async (_, fromPath, toPath) => {
    await fs.move(fromPath, toPath, { overwrite: false });
    return true;
  });

  // Recursively list files under workspace
  ipcMain.handle('fs:listFiles', async (_, root) => {
    const start = root || workspacePath;
    if (!start) return [];
    const results = [];
    async function walk(dir) {
      let entries = [];
      try {
        entries = await fs.readdir(dir, { withFileTypes: true });
      } catch (_) {
        return;
      }
      for (const e of entries) {
        const full = path.join(dir, e.name);
        const rel = path.relative(start, full);
        if (rel.startsWith('node_modules') || rel.startsWith('.git')) continue;
        if (e.isDirectory()) {
          await walk(full);
        } else {
          results.push({ path: full, relative: rel });
        }
      }
    }
    await walk(start);
    return results;
  });

  // Search text in files under workspace
  ipcMain.handle('fs:searchText', async (_, root, query, maxResults = 500) => {
    const start = root || workspacePath;
    if (!start || !query) return [];
    const results = [];
    const lower = query.toLowerCase();
    async function walk(dir) {
      let entries = [];
      try {
        entries = await fs.readdir(dir, { withFileTypes: true });
      } catch (_) {
        return;
      }
      for (const e of entries) {
        const full = path.join(dir, e.name);
        const rel = path.relative(start, full);
        if (rel.startsWith('node_modules') || rel.startsWith('.git')) continue;
        if (e.isDirectory()) {
          await walk(full);
        } else {
          try {
            const content = await fs.readFile(full, 'utf8');
            const lines = content.split(/\r?\n/);
            for (let i = 0; i < lines.length; i++) {
              const line = lines[i];
              if (line.toLowerCase().includes(lower)) {
                results.push({ path: full, relative: rel, lineNumber: i + 1, line });
                if (results.length >= maxResults) return results;
              }
            }
          } catch (_) {
            // ignore binary or unreadable files
          }
        }
      }
      return results;
    }
    await walk(start);
    return results;
  });

  ipcMain.handle('external:revealInFinder', async (_, targetPath) => {
    if (process.platform === 'darwin') {
      shell.showItemInFolder(targetPath);
    } else {
      shell.openPath(path.dirname(targetPath));
    }
    return true;
  });

  // removed live server IPC

  ipcMain.handle('pty:create', async (_, cols, rows) => {
    const shellPath = process.env.SHELL || '/bin/zsh';
    
    // Determine working directory: workspace path if available, otherwise desktop
    let workingDir;
    if (workspacePath) {
      workingDir = workspacePath;
    } else {
      // Default to desktop path
      workingDir = path.join(require('os').homedir(), 'Desktop');
    }
    
    console.log(`Creating terminal with working directory: ${workingDir}`);
    
    const term = pty.spawn(shellPath, [], {
      name: 'xterm-256color',
      cols: cols || 80,
      rows: rows || 24,
      cwd: workingDir,
      env: process.env,
    });

    const id = Math.random().toString(36).slice(2);
    terminalIdToPty.set(id, term);

    term.onData((data) => {
      if (mainWindow && mainWindow.webContents) {
        mainWindow.webContents.send('pty:data', { id, data });
      }
    });

    term.onExit(() => {
      terminalIdToPty.delete(id);
      if (mainWindow && mainWindow.webContents) {
        mainWindow.webContents.send('pty:exit', { id });
      }
    });

    return { id };
  });

  ipcMain.handle('pty:write', async (_, id, data) => {
    const term = terminalIdToPty.get(id);
    if (term) term.write(data);
    return true;
  });

  ipcMain.handle('pty:resize', async (_, id, cols, rows) => {
    const term = terminalIdToPty.get(id);
    if (term) term.resize(cols, rows);
    return true;
  });

  ipcMain.handle('pty:kill', async (_, id) => {
    const term = terminalIdToPty.get(id);
    if (term) term.kill();
    terminalIdToPty.delete(id);
    return true;
  });

  // AI Agent IPC Handlers
  ipcMain.handle('ai:generatePlan', async (event, prompt) => {
    try {
      const plan = await generateProjectPlan(prompt, (message, progress) => {
        event.sender.send('ai:planProgress', { message, progress });
      });
      currentProjectPlan = plan;
      return { success: true, plan };
    } catch (error) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('ai:generateCode', async (event, filePath, context, requirements) => {
    try {
      const code = await generateCode(filePath, context, requirements, (message, progress) => {
        event.sender.send('ai:codeProgress', { message, progress, filePath });
      });
      return { success: true, code };
    } catch (error) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('ai:executeCommand', async (_, command, cwd) => {
    try {
      const result = await executeCommand(command, cwd);
      return result;
    } catch (error) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('ai:installDependencies', async (_, dependencies, type) => {
    try {
      const result = await installDependencies(dependencies, type);
      return result;
    } catch (error) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('ai:createProjectStructure', async (_, structure) => {
    try {
      const results = await createProjectStructure(structure);
      return { success: true, results };
    } catch (error) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('ai:getProjectPlan', () => {
    return currentProjectPlan;
  });

  ipcMain.handle('ai:isInitialized', () => {
    return !!(openrouterApiKey || geminiApiKey);
  });

  ipcMain.handle('ai:getAvailableModels', () => {
    return AI_MODELS;
  });

  ipcMain.handle('ai:setModel', (_, model) => {
    if (AI_MODELS[model]) {
      selectedModel = model;
      return { success: true, model };
    }
    return { success: false, error: 'Invalid model' };
  });

  ipcMain.handle('ai:getSelectedModel', () => {
    return selectedModel;
  });

  ipcMain.handle('ai:buildProjectWithStreaming', async (event, plan) => {
    try {
      await buildProjectWithStreaming(
        plan,
        (message, progress) => {
          event.sender.send('ai:buildProgress', { message, progress });
        },
        (filePath) => {
          event.sender.send('ai:openFile', { filePath });
        },
        (filePath, message, codeChunk) => {
          event.sender.send('ai:codeStream', { filePath, message, codeChunk });
        },
        async (command) => {
          return await executeCommandInTerminal(command, event);
        }
      );
      return { success: true };
    } catch (error) {
      console.error('Build error:', error);
      return { success: false, error: error.message };
    } finally {
      isBuildingProject = false;
    }
  });

  // Execute command in integrated terminal
  async function executeCommandInTerminal(command, event) {
    try {
      // Create terminal if not exists
      if (!currentTerminalId) {
        const terminalResult = await ipcMain.handle('pty:create', 80, 24);
        currentTerminalId = terminalResult.id;
      }
      
      // Send command to terminal
      await ipcMain.handle('pty:write', currentTerminalId, `${command}\n`);
      
      // Wait a bit for command to execute
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      return true;
    } catch (error) {
      console.error('Terminal command execution failed:', error);
      return false;
    }
  }

  ipcMain.handle('ai:getBuildStatus', () => {
    return { isBuilding: isBuildingProject };
  });

  // Execute setup command automatically
  // Get project structure for UI display
  ipcMain.handle('ai:getProjectStructure', async () => {
    try {
      if (!workspacePath) return null;
      const structure = await getProjectStructure(workspacePath);
      return {
        success: true,
        structure: structure,
        formatted: formatProjectStructure(structure)
      };
    } catch (error) {
      console.error('Error getting project structure:', error);
      return { success: false, error: error.message };
    }
  });

  // Codebase indexing IPC handlers
  ipcMain.handle('codebase:getIndexStats', () => {
    if (!codebaseIndexer) {
      return { success: false, error: 'No codebase indexer available' };
    }
    return { success: true, stats: codebaseIndexer.getIndexStats() };
  });

  ipcMain.handle('codebase:search', async (_, query, maxResults = 10) => {
    if (!codebaseIndexer) {
      return { success: false, error: 'No codebase indexer available' };
    }
    try {
      const results = await codebaseIndexer.searchSemantic(query, { limit: maxResults });
      return { success: true, results };
    } catch (error) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('codebase:getContext', async (_, query, maxChunks = 5) => {
    if (!codebaseIndexer) {
      return { success: false, error: 'No codebase indexer available' };
    }
    try {
      const context = await codebaseIndexer.getRelevantContext(query, maxChunks);
      return { success: true, context };
    } catch (error) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('codebase:reindex', async () => {
    if (!codebaseIndexer || !workspacePath) {
      return { success: false, error: 'No workspace or indexer available' };
    }
    try {
      await codebaseIndexer.indexCodebase();
      const stats = codebaseIndexer.getIndexStats();
      return { success: true, stats };
    } catch (error) {
      return { success: false, error: error.message };
    }
  });

  // AI Agent System IPC handlers
  ipcMain.handle('ai:getOperationHistory', () => {
    if (!aiAgentSystem) {
      return { success: false, error: 'AI Agent system not available' };
    }
    return { success: true, history: aiAgentSystem.getOperationHistory() };
  });

  ipcMain.handle('ai:clearOperationHistory', () => {
    if (!aiAgentSystem) {
      return { success: false, error: 'AI Agent system not available' };
    }
    aiAgentSystem.clearOperationHistory();
    return { success: true };
  });

  ipcMain.handle('ai:getAgentStatus', () => {
    console.log('[Main] AI Agent status requested');
    console.log('[Main] aiAgentSystem exists:', !!aiAgentSystem);
    console.log('[Main] codebaseIndexer exists:', !!codebaseIndexer);
    console.log('[Main] workspacePath:', workspacePath);
    
    const status = {
      success: true,
      status: {
        initialized: !!aiAgentSystem,
        workspacePath: workspacePath,
        codebaseIndexed: !!codebaseIndexer,
        totalFiles: codebaseIndexer ? codebaseIndexer.index.files.size : 0,
        totalChunks: codebaseIndexer ? codebaseIndexer.index.chunks.size : 0,
        sessionStats: aiAgentSystem ? aiAgentSystem.getSessionStats() : null
      }
    };
    
    console.log('[Main] Returning status:', status);
    return status;
  });

  // Session management IPC handlers
  ipcMain.handle('ai:getSessionStats', () => {
    if (!aiAgentSystem) {
      return { success: false, error: 'AI Agent system not available' };
    }
    return { success: true, stats: aiAgentSystem.getSessionStats() };
  });

  ipcMain.handle('ai:getSessionContext', () => {
    if (!aiAgentSystem) {
      return { success: false, error: 'AI Agent system not available' };
    }
    return { success: true, context: aiAgentSystem.getSessionContext() };
  });

  ipcMain.handle('ai:clearSession', () => {
    if (!aiAgentSystem) {
      return { success: false, error: 'AI Agent system not available' };
    }
    aiAgentSystem.clearSession();
    return { success: true };
  });

  ipcMain.handle('ai:executeSetupCommand', async (event, setupCommand) => {
    try {
      if (!workspacePath) {
        return { success: false, error: 'No workspace path set' };
      }
      
      if (!setupCommand) {
        return { success: false, error: 'No setup command provided' };
      }
      
      console.log(`Executing setup command: ${setupCommand} in ${workspacePath}`);
      
      const result = await executeCommand(setupCommand, workspacePath);
      
      if (result.success) {
        console.log('Setup command executed successfully');
        return { success: true, output: result.output };
      } else {
        console.error('Setup command failed:', result.error);
        return { success: false, error: result.error, output: result.output };
      }
    } catch (error) {
      console.error('Error executing setup command:', error);
      return { success: false, error: error.message };
    }
  });

  // AI Chat Handler
  ipcMain.handle('ai:chat', async (event, message, context) => {
    try {
      console.log(`Making AI request to model: ${AI_MODELS[selectedModel].model}`);
      
      let relevantContext = '';
      
      // Use codebase indexer to get relevant context if available
      if (codebaseIndexer && workspacePath) {
        try {
          const contextResult = await codebaseIndexer.getRelevantContext(message, 3);
          if (contextResult.relevantChunks.length > 0) {
            relevantContext = '\n\nRelevant code context:\n' + 
              contextResult.relevantChunks.map(chunk => 
                `File: ${chunk.filePath} (lines ${chunk.startLine}-${chunk.endLine})\n` +
                `Content:\n${chunk.content}\n`
              ).join('\n---\n');
          }
        } catch (error) {
          console.warn('Failed to get codebase context:', error);
        }
      }
      
      const systemPrompt = `You are Cursor AI, an expert programming assistant. You have access to the current codebase and can help with:
1. Code analysis and explanations
2. Bug detection and fixes
3. Code generation and refactoring
4. Architecture suggestions
5. Performance optimization

Current workspace: ${workspacePath || 'No workspace open'}
Current context: ${JSON.stringify(context)}${relevantContext}

Be helpful, accurate, and provide actionable code suggestions. Use the provided code context to give more relevant and specific answers.`;

      const response = await callAI([
        { role: 'system', content: systemPrompt },
        { role: 'user', content: message }
      ], {
        temperature: 0.7,
        max_tokens: 2000
      });

      return { success: true, response };
    } catch (error) {
      console.error('Chat error:', error);
      return { success: false, error: error.message };
    }
  });

  // AI Agent Handler - Using the new AI Agent System
  ipcMain.handle('ai:agent', async (event, userRequest, currentFile, workspaceFiles, agentModel) => {
    try {
      console.log('AI Agent processing request:', userRequest);
      
      if (!aiAgentSystem) {
        throw new Error('AI Agent system not initialized. Please open a workspace first.');
      }
      
      // Store current model and switch to agent model if specified
      const originalModel = selectedModel;
      if (agentModel && AI_MODELS[agentModel]) {
        selectedModel = agentModel;
        console.log(`Agent using model: ${AI_MODELS[agentModel].name}`);
      }
      
      // Process request using the AI agent system with AI service integration
      const result = await aiAgentSystem.processRequest(userRequest, currentFile, {
        userRequest,
        model: selectedModel,
        workspaceFiles,
        aiService: async (systemPrompt, userRequest, options) => {
          // Call the actual AI service with streaming for large responses
          try {
            let fullResponse = '';
            let isStreaming = false;
            
            const response = await callAI([
              { role: 'system', content: systemPrompt },
              { role: 'user', content: userRequest }
            ], {
              temperature: 0.3,
              max_tokens: 8000, // Increased for larger responses
              stream: true // Enable streaming
            }, (chunk) => {
              // Handle streaming chunks
              if (chunk && chunk.content) {
                fullResponse += chunk.content;
                isStreaming = true;
                
                // Log progress for large responses
                if (fullResponse.length % 1000 === 0) {
                  console.log(`[AI Agent] Received ${fullResponse.length} characters...`);
                }
              }
            });
            
            // If streaming was used, return the accumulated response
            if (isStreaming) {
              console.log(`[AI Agent] Completed streaming response: ${fullResponse.length} characters`);
              return fullResponse;
            } else {
              // Fallback to non-streaming response
              return response;
            }
          } catch (error) {
            console.error('AI service call failed:', error);
            throw error;
          }
        }
      });
      
      // Restore original model
      if (agentModel && AI_MODELS[agentModel]) {
        selectedModel = originalModel;
      }
      
      if (result.success) {
        // Send indexing context info to renderer
        if (result.context && result.context.chunksRetrieved > 0) {
          try {
            if (event.sender && !event.sender.isDestroyed()) {
              event.sender.send('ai:indexingContext', { 
                contextChunks: result.context.chunksRetrieved,
                totalFiles: result.context.filesAnalyzed,
                totalChunks: result.context.chunksRetrieved
              });
            }
          } catch (sendError) {
            console.log('Could not send indexing context notification:', sendError.message);
          }
        }
        
        return result;
      } else {
        throw new Error(result.error);
      }
      
    } catch (error) {
      console.error('AI Agent error:', error);
      
      // Provide more detailed error information
      let errorMessage = error.message;
      if (error.message.includes('Failed to parse AI response')) {
        errorMessage = 'The AI response was malformed. The system will use fallback actions instead.';
      } else if (error.message.includes('AI service call failed')) {
        errorMessage = 'Unable to connect to AI service. Please check your internet connection and try again.';
      }
      
      return { 
        success: false, 
        error: errorMessage,
        details: error.message,
        timestamp: new Date().toISOString()
      };
    }
  });

  // AI Agent Safety and Undo Management
  ipcMain.handle('ai:getUndoStackInfo', async (event) => {
  if (!aiAgentSystem) {
    return { success: false, error: 'AI Agent system not initialized' };
  }
  return { success: true, info: aiAgentSystem.getUndoStackInfo() };
});

ipcMain.handle('ai:getUndoStackDetails', async (event) => {
  if (!aiAgentSystem) {
    return { success: false, error: 'AI Agent system not initialized' };
  }
  return { success: true, details: aiAgentSystem.getUndoStackDetails() };
});

ipcMain.handle('ai:undoLastAction', async (event) => {
  if (!aiAgentSystem) {
    return { success: false, error: 'AI Agent system not initialized' };
  }
  return await aiAgentSystem.undoLastAction();
});

ipcMain.handle('ai:undoActionByIndex', async (event, index) => {
  if (!aiAgentSystem) {
    return { success: false, error: 'AI Agent system not initialized' };
  }
  return await aiAgentSystem.undoActionByIndex(index);
});

ipcMain.handle('ai:undoMultipleActions', async (event, indices) => {
  if (!aiAgentSystem) {
    return { success: false, error: 'AI Agent system not initialized' };
  }
  return await aiAgentSystem.undoMultipleActions(indices);
});

  ipcMain.handle('ai:clearUndoStack', async (event) => {
    if (!aiAgentSystem) {
      return { success: false, error: 'AI Agent system not initialized' };
    }
    return aiAgentSystem.clearUndoStack();
  });

  ipcMain.handle('ai:cleanupBackups', async (event) => {
    if (!aiAgentSystem) {
      return { success: false, error: 'AI Agent system not initialized' };
    }
    return await aiAgentSystem.cleanupBackups();
  });

  ipcMain.handle('ai:confirmActions', async (event, approved) => {
  if (!aiAgentSystem) {
    return { success: false, error: 'AI Agent system not initialized' };
  }
  aiAgentSystem.confirmPendingActions(approved);
  return { success: true };
});

// Emergency confirmation handler for stuck operations
ipcMain.handle('ai:emergencyConfirm', async (event) => {
  if (!aiAgentSystem) {
    return { success: false, error: 'AI Agent system not initialized' };
  }
  
  try {
    // Force confirm any pending actions
    aiAgentSystem.confirmPendingActions(true);
    console.log('[Main] Emergency confirmation triggered');
    return { success: true, message: 'Emergency confirmation applied' };
  } catch (error) {
    console.error('[Main] Emergency confirmation failed:', error);
    return { success: false, error: error.message };
  }
});

  ipcMain.handle('ai:getPendingActions', async (event) => {
    if (!aiAgentSystem) {
      return { success: false, error: 'AI Agent system not initialized' };
    }
    return { success: true, pendingActions: aiAgentSystem.getPendingActions() };
  });

  // Get dependency context for relevant files
  async function getDependencyContext(relevantFiles) {
    if (!codebaseIndexer) return null;
    
    try {
      const dependencyInfo = [];
      
      for (const filePath of relevantFiles) {
        const dependencies = codebaseIndexer.index.dependencyGraph.get(filePath);
        if (dependencies) {
          const fileInfo = [];
          
          if (dependencies.imports.length > 0) {
            fileInfo.push(`Imports: ${dependencies.imports.map(imp => imp.module).join(', ')}`);
          }
          
          if (dependencies.exports.length > 0) {
            fileInfo.push(`Exports: ${dependencies.exports.map(exp => exp.items.join(', ')).join(', ')}`);
          }
          
          if (dependencies.functions.length > 0) {
            fileInfo.push(`Functions: ${dependencies.functions.map(fn => fn.name).join(', ')}`);
          }
          
          if (dependencies.classes.length > 0) {
            fileInfo.push(`Classes: ${dependencies.classes.map(cls => cls.name).join(', ')}`);
          }
          
          if (fileInfo.length > 0) {
            dependencyInfo.push(`${filePath}: ${fileInfo.join(' | ')}`);
          }
        }
      }
      
      return dependencyInfo.join('\n');
    } catch (error) {
      console.error('Error getting dependency context:', error);
      return null;
    }
  }

  // Get complete project structure
  async function getProjectStructure(rootPath, currentPath = '', level = 0) {
    if (!rootPath || level > 4) return []; // Limit depth to prevent infinite recursion
    
    const structure = [];
    const targetPath = path.join(rootPath, currentPath);
    
    try {
      const entries = await fs.readdir(targetPath, { withFileTypes: true });
      
      for (const entry of entries) {
        // Skip node_modules, .git, and other common ignore patterns
        if (['node_modules', '.git', '.DS_Store', 'dist', 'build', 'coverage', '.next', '.nuxt'].includes(entry.name)) {
          continue;
        }
        
        const relativePath = currentPath ? path.join(currentPath, entry.name) : entry.name;
        
        if (entry.isDirectory()) {
          structure.push({
            name: entry.name,
            type: 'folder',
            path: relativePath,
            children: await getProjectStructure(rootPath, relativePath, level + 1)
          });
        } else {
          structure.push({
            name: entry.name,
            type: 'file',
            path: relativePath
          });
        }
      }
    } catch (error) {
      console.error(`Error reading directory ${targetPath}:`, error);
    }
    
    return structure.sort((a, b) => {
      // Folders first, then files, both alphabetically
      if (a.type !== b.type) {
        return a.type === 'folder' ? -1 : 1;
      }
      return a.name.localeCompare(b.name);
    });
  }
  
  // Format project structure as text
  function formatProjectStructure(structure, indent = '') {
    let result = '';
    
    for (const item of structure) {
      const icon = item.type === 'folder' ? '📁' : '📄';
      result += `${indent}${icon} ${item.name}\n`;
      
      if (item.children && item.children.length > 0) {
        result += formatProjectStructure(item.children, indent + '  ');
      }
    }
    
    return result;
  }

  // Execute individual agent actions
  async function executeAgentAction(action) {
    const fullPath = path.join(workspacePath || '', action.path);
    
    try {
      switch (action.type) {
        case 'write_file':
        case 'create_file':
          await fs.ensureFile(fullPath);
          await fs.writeFile(fullPath, action.content, 'utf8');
          console.log(`✅ ${action.type}: ${action.path}`);
          return { success: true };
          
        case 'edit_file':
          // For edit_file, we'll overwrite with new content
          // In a more advanced implementation, we could do smart merging
          await fs.writeFile(fullPath, action.content, 'utf8');
          console.log(`✅ ${action.type}: ${action.path}`);
          return { success: true };
          
        case 'create_folder':
          await fs.ensureDir(fullPath);
          console.log(`✅ ${action.type}: ${action.path}`);
          return { success: true };
          
        default:
          throw new Error(`Unknown action type: ${action.type}`);
      }
    } catch (error) {
      console.error(`❌ Failed to execute ${action.type} on ${action.path}:`, error);
      return { success: false, error: error.message };
    }
  }

  // Landing Page System IPC Handlers
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
    try {
      console.log('IPC: Opening folder:', folderPath);
      
      if (fs.existsSync(folderPath)) {
        console.log('IPC: Folder exists, loading editor...');
        loadEditor(folderPath);
        console.log('IPC: Editor loaded successfully');
        return { success: true, path: folderPath };
      } else {
        console.log('IPC: Folder does not exist:', folderPath);
        return { success: false, error: 'Folder does not exist' };
      }
    } catch (error) {
      console.error('IPC: Error opening folder:', error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('get-workspace-path', () => {
    return workspacePath;
  });

  ipcMain.handle('get-desktop-path', () => {
    return path.join(require('os').homedir(), 'Desktop');
  });

  ipcMain.handle('execute-command', async (event, command, cwd) => {
    try {
      console.log(`Executing command: ${command} in ${cwd}`);
      const result = await executeCommand(command, cwd);
      return result;
    } catch (error) {
      console.error('Command execution failed:', error);
      return { success: false, error: error.message };
    }
  });

  // Load editor with workspace
  function loadEditor(workspacePathToLoad) {
    if (!mainWindow) return;
    
    console.log('Loading editor with workspace:', workspacePathToLoad);
    
    // Set the global workspace path
    workspacePath = workspacePathToLoad;
    
    // Start file watcher for the workspace
    startWatcher(workspacePath);
    
    // Initialize codebase indexer for the new workspace
    try {
      console.log('Initializing codebase indexer for workspace...');
      codebaseIndexer = new EnhancedCodebaseIndexer(workspacePath);
      codebaseIndexer.indexCodebase().then(() => {
        console.log('Codebase indexing completed for workspace');
        
        // Initialize AI agent system
        aiAgentSystem = new AIAgentSystem(workspacePath, codebaseIndexer);
        console.log('AI agent system initialized for workspace');
        
        // Send indexing stats to renderer if window is ready
        if (mainWindow && mainWindow.webContents) {
          const stats = codebaseIndexer.getIndexStats();
          mainWindow.webContents.send('codebase:indexed', { stats });
        }
      }).catch(error => {
        console.error('Codebase indexing failed for workspace:', error);
      });
    } catch (error) {
      console.error('Failed to initialize codebase indexer for workspace:', error);
    }
    
    // Load the editor interface
    mainWindow.loadFile('renderer/index.html');
    
    // Send workspace path when editor loads
    const sendWorkspace = () => {
      if (mainWindow && mainWindow.webContents) {
        console.log('Sending workspace to renderer:', workspacePath);
        mainWindow.webContents.send('workspace-loaded', workspacePath);
        mainWindow.webContents.send('workspace:changed', { path: workspacePath });
      }
    };
    
    // Send immediately if already loaded, or wait for load
    if (mainWindow.webContents.isLoading()) {
      mainWindow.webContents.once('did-finish-load', sendWorkspace);
    } else {
      // Small delay to ensure renderer is ready
      setTimeout(sendWorkspace, 100);
    }
  }
}

app.whenReady().then(() => {
  initializeAI();
  createWindow();
  setupIpc();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  stopWatcher();
  if (process.platform !== 'darwin') app.quit();
});


