/* Cursor AI Editor - Enhanced Implementation */

// Global state
let monacoEditor = null;
let currentFilePath = null;
let terminals = new Map();
let openTabs = new Map();
let activeTab = null;
let sidebarVisible = true;
let currentPanel = 'explorer';
let currentSuggestion = null;
let autocompleteRequestId = 0;
let chatHistory = [];
let activeTerminalId = null;
let terminalCounter = 1;

// Safety and undo state
let pendingActions = null;
let undoStackInfo = null;

// File selection state for agent
let selectedFiles = new Set();
let fileSelectionModal = null;

// Utility functions
const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => Array.from(document.querySelectorAll(sel));

function debounce(func, wait) {
  let timeout;
  return function executedFunction(...args) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
}

function showToast(message, type = 'info', duration = 3000) {
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.innerHTML = `
    <i class="toast-icon codicon codicon-${type === 'success' ? 'check' : type === 'error' ? 'error' : 'info'}"></i>
    <span class="toast-message">${message}</span>
    <button class="toast-close"><i class="codicon codicon-close"></i></button>
  `;
  
  toast.querySelector('.toast-close').addEventListener('click', () => toast.remove());
  $('#toastContainer').appendChild(toast);
  setTimeout(() => toast.remove(), duration);
}

// Panel management
async function switchPanel(panelName) {
  $$('.sidebar-panel').forEach(panel => panel.classList.add('hidden'));
  $$('.ab-item').forEach(btn => btn.classList.remove('active'));
  
  const panel = $(`#${panelName}Panel`);
  const button = $(`#act${panelName.charAt(0).toUpperCase() + panelName.slice(1)}`);
  
  if (panel) panel.classList.remove('hidden');
  if (button) button.classList.add('active');
  
  currentPanel = panelName;
  if (!sidebarVisible) toggleSidebar();
  
  // If switching to agent panel, update placeholder with project structure
  if (panelName === 'agent') {
    await updateAgentPlaceholder();
  }
}

// Update agent input placeholder with project structure
async function updateAgentPlaceholder() {
  try {
    const structureResult = await window.api.aiGetProjectStructure();
    if (structureResult && structureResult.success) {
      const agentInput = $('#agentInput');
      if (agentInput && structureResult.formatted) {
        const shortStructure = structureResult.formatted.split('\n').slice(0, 8).join('\n');
        agentInput.placeholder = `Describe what you want me to build or modify...

Current project structure:
${shortStructure}
${structureResult.formatted.split('\n').length > 8 ? '...' : ''}

Examples:
- "Add a login form to the existing HTML"
- "Create a new React component for user profiles"  
- "Update the CSS to make the site responsive"`;
      }
    }
  } catch (error) {
    console.error('Failed to get project structure:', error);
  }
}

function toggleSidebar() {
  sidebarVisible = !sidebarVisible;
  const sidebar = $('#sidebar');
  const workspace = $('#workspace');
  
  if (sidebarVisible) {
    sidebar.style.display = 'flex';
    workspace.style.gridTemplateColumns = '48px 320px 1fr';
  } else {
    sidebar.style.display = 'none';
    workspace.style.gridTemplateColumns = '48px 0 1fr';
  }
  
  if (monacoEditor) setTimeout(() => monacoEditor.layout(), 100);
}

// Monaco Editor setup
async function initializeMonacoEditor() {
  return new Promise((resolve) => {
    require.config({
      paths: { vs: 'https://cdnjs.cloudflare.com/ajax/libs/monaco-editor/0.51.0/min/vs' }
    });
    
    require(['vs/editor/editor.main'], () => {
      monacoEditor = monaco.editor.create($('#editor'), {
        value: '',
        language: 'plaintext',
        theme: 'vs-dark',
        automaticLayout: true,
        fontSize: 14,
        minimap: { enabled: true },
        wordWrap: 'on',
        tabSize: 2,
        suggest: {
          showIcons: true,
          maxVisibleSuggestions: 12
        }
      });
      
      setupEditorFeatures();
      resolve();
    });
  });
}

function setupEditorFeatures() {
  monacoEditor.onDidChangeCursorPosition(() => {
    updateStatusBar();
    debouncedRequestAutocomplete();
  });
  
  monacoEditor.onDidChangeModelContent(() => {
    markTabAsModified(currentFilePath);
    debouncedRequestAutocomplete();
  });
  
  // Key bindings
  monacoEditor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, saveCurrentFile);
  monacoEditor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyK, toggleCommandPalette);
  monacoEditor.addCommand(monaco.KeyCode.Tab, () => {
    if (currentSuggestion) acceptAISuggestion();
    else monacoEditor.trigger('', 'tab', null);
  });
}

// AI Autocomplete
const debouncedRequestAutocomplete = debounce(requestAutocomplete, 500);

function requestAutocomplete() {
  if (!monacoEditor || !currentFilePath || !window.ws.isConnected()) return;
  
  const model = monacoEditor.getModel();
  if (!model) return;
  
  const position = monacoEditor.getPosition();
  const code = model.getValue();
  const language = model.getLanguageId();
  const requestId = ++autocompleteRequestId;
  
  window.ws.requestAutocomplete(code, position, currentFilePath, language, requestId);
}

function handleAutocompleteResponse(data) {
  if (data.requestId !== autocompleteRequestId) return;
  if (data.completion && data.completion.trim()) {
    showAISuggestion(data.completion);
  }
}

function showAISuggestion(completion) {
  currentSuggestion = completion;
  $('#suggestionContent').textContent = completion;
  $('#aiSuggestions').classList.remove('hidden');
  setTimeout(() => hideAISuggestion(), 10000);
}

function acceptAISuggestion() {
  if (!currentSuggestion || !monacoEditor) return;
  
  const position = monacoEditor.getPosition();
  const range = new monaco.Range(position.lineNumber, position.column, position.lineNumber, position.column);
  
  monacoEditor.executeEdits('ai-suggestion', [{
    range: range,
    text: currentSuggestion
  }]);
  
  hideAISuggestion();
  showToast('AI suggestion accepted', 'success');
}

function hideAISuggestion() {
  currentSuggestion = null;
  $('#aiSuggestions').classList.add('hidden');
}

// Chat Interface
function initializeChatInterface() {
  const chatInput = $('#chatInput');
  const sendButton = $('#btnSendChat');
  
  chatInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
      sendChatMessage();
    }
  });
  
  sendButton.addEventListener('click', sendChatMessage);
}

async function sendChatMessage() {
  const chatInput = $('#chatInput');
  const message = chatInput.value.trim();
  if (!message) return;
  
  chatInput.value = '';
  addChatMessage(message, 'user');
  
  // Show typing indicator
  const typingIndicator = document.createElement('div');
  typingIndicator.className = 'chat-message assistant typing';
  typingIndicator.innerHTML = '<div class="chat-message-content">AI is thinking...</div>';
  $('#chatMessages').appendChild(typingIndicator);
  $('#chatMessages').scrollTop = $('#chatMessages').scrollHeight;
  
  const context = gatherChatContext();
  
  try {
    // Check if this is an agent request (file writing, code generation, etc.)
    if (isAgentRequest(message)) {
      await handleAgentRequest(message, context, typingIndicator);
    } else {
      // Regular chat
      const result = await window.api.aiChat(message, context);
      
      // Remove typing indicator
      typingIndicator.remove();
      
      if (result.success) {
        addChatMessage(result.response, 'assistant');
  } else {
        throw new Error(result.error);
      }
    }
  } catch (error) {
    // Remove typing indicator
    typingIndicator.remove();
    addChatMessage(`Error: ${error.message}`, 'system');
    showToast(`Chat error: ${error.message}`, 'error');
  }
}

// Check if the message is an agent request (file writing, creation, etc.)
function isAgentRequest(message) {
  const agentKeywords = [
    'create', 'write', 'generate', 'make', 'build', 'add', 'implement', 
    'fix', 'update', 'modify', 'edit', 'change', 'save', 'file',
    'function', 'component', 'class', 'html', 'css', 'js', 'javascript',
    'python', 'react', 'vue', 'angular', 'node', 'express'
  ];
  
  const lowerMessage = message.toLowerCase();
  return agentKeywords.some(keyword => lowerMessage.includes(keyword)) ||
         lowerMessage.includes('in ') || // "write this in file.js"
         lowerMessage.includes('to ') ||  // "add this to index.html"
         lowerMessage.includes('.js') || lowerMessage.includes('.html') || 
         lowerMessage.includes('.css') || lowerMessage.includes('.py') ||
         lowerMessage.includes('.jsx') || lowerMessage.includes('.ts');
}

// Handle agent requests (file writing, etc.)
async function handleAgentRequest(message, context, typingIndicator) {
  try {
    // Gather current workspace context
    const currentFile = getCurrentFileContext();
    const workspaceFiles = await getWorkspaceFilesList();
    
    // Update typing indicator
    typingIndicator.innerHTML = '<div class="chat-message-content">AI Agent analyzing your request...</div>';
    
    const result = await window.api.aiAgent(message, currentFile, workspaceFiles);
    
    // Remove typing indicator
    typingIndicator.remove();
    
    if (result.success) {
      // Display analysis
      addChatMessage(`**Analysis:** ${result.analysis}\n\n**Actions Taken:**`, 'assistant');
      
      // Display each action
      result.actions.forEach(action => {
        const status = action.executed ? '✅' : '❌';
        const actionMsg = `${status} **${action.type}**: \`${action.path}\`\n${action.reason}`;
        addChatMessage(actionMsg, 'assistant');
        
        if (action.executed && (action.type === 'write_file' || action.type === 'create_file' || action.type === 'edit_file')) {
          // Auto-open the file that was written
          openFile(action.path);
        }
      });
      
      // Display explanation
      if (result.explanation) {
        addChatMessage(`**Explanation:** ${result.explanation}`, 'assistant');
      }
      
      // Show success toast
      const successCount = result.actions.filter(a => a.executed).length;
      showToast(`AI Agent completed ${successCount} actions successfully!`, 'success');
      
    } else {
      throw new Error(result.error);
    }
  } catch (error) {
    typingIndicator.remove();
    addChatMessage(`Agent Error: ${error.message}`, 'system');
    showToast(`Agent error: ${error.message}`, 'error');
  }
}

// Get current file context for the AI agent
function getCurrentFileContext() {
  if (!currentFilePath || !monacoEditor) return null;
  
  return {
    path: currentFilePath,
    content: monacoEditor.getValue(),
    language: monacoEditor.getModel()?.getLanguageId() || 'plaintext',
    cursorPosition: monacoEditor.getPosition()
  };
}

// Get comprehensive workspace structure for AI context
async function getWorkspaceFilesList() {
  try {
    const workspace = await window.api.getWorkspace();
    if (!workspace) return [];
    
    // Get all files recursively (AI agent will get the structure in main.js)
    const allFiles = await window.api.searchText(workspace, '', 10000); // Get all files
    const fileList = allFiles.map(f => f.relative).filter(f => f && !f.startsWith('node_modules/'));
    
    return [...new Set(fileList)]; // Remove duplicates
  } catch (error) {
    console.error('Failed to get workspace files:', error);
    return [];
  }
}

function gatherChatContext() {
  const context = {};
  
  if (currentFilePath && monacoEditor) {
    const model = monacoEditor.getModel();
    const selection = monacoEditor.getSelection();
    
    context.currentFile = {
      path: currentFilePath,
      language: model?.getLanguageId(),
      content: model?.getValue(),
      selection: selection && !selection.isEmpty() ? model?.getValueInRange(selection) : null
    };
  }
  
  return context;
}

function addChatMessage(message, role) {
  const messagesContainer = $('#chatMessages');
  const messageEl = document.createElement('div');
  messageEl.className = `chat-message ${role}`;
  
  const contentEl = document.createElement('div');
  contentEl.className = 'chat-message-content';
  contentEl.textContent = message;
  
  messageEl.appendChild(contentEl);
  messagesContainer.appendChild(messageEl);
  messagesContainer.scrollTop = messagesContainer.scrollHeight;
  
  chatHistory.push({ role, content: message, timestamp: Date.now() });
}

// File operations
async function openFile(filePath) {
  try {
    const { content, language } = await window.api.readFile(filePath);
    
    if (!monacoEditor) await initializeMonacoEditor();
    
    let tabData = openTabs.get(filePath);
    if (!tabData) {
      const model = monaco.editor.createModel(content, language, monaco.Uri.file(filePath));
      const tab = createTab(filePath);
      $('#tabList').appendChild(tab);
      
      tabData = { model, tab, modified: false };
      openTabs.set(filePath, tabData);
    } else {
      tabData.model.setValue(content);
    }
    
    switchToTab(filePath);
    showToast(`Opened: ${filePath.split('/').pop()}`, 'success');
    
  } catch (error) {
    showToast(`Failed to open file: ${error.message}`, 'error');
  }
}

function createTab(filePath) {
  const fileName = filePath.split('/').pop();
  const tab = document.createElement('div');
  tab.className = 'tab';
  tab.dataset.path = filePath;
  
  tab.innerHTML = `
    <span class="tab-name">${fileName}</span>
    <button class="tab-close"><i class="codicon codicon-close"></i></button>
  `;
  
  tab.addEventListener('click', (e) => {
    if (!e.target.closest('.tab-close')) switchToTab(filePath);
  });
  
  tab.querySelector('.tab-close').addEventListener('click', (e) => {
    e.stopPropagation();
    closeTab(filePath);
  });
  
  return tab;
}

function switchToTab(filePath) {
  if (!openTabs.has(filePath)) return;
  
  $$('.tab').forEach(tab => tab.classList.remove('active'));
  const tab = $(`.tab[data-path="${filePath}"]`);
  if (tab) tab.classList.add('active');
  
  const tabData = openTabs.get(filePath);
  if (monacoEditor && tabData.model) {
    monacoEditor.setModel(tabData.model);
    currentFilePath = filePath;
    updateBreadcrumbs(filePath);
    updateStatusBar();
  }
  
  activeTab = filePath;
}

function closeTab(filePath) {
  if (!openTabs.has(filePath)) return;
  
  const tabData = openTabs.get(filePath);
  if (tabData.model) tabData.model.dispose();
  
  const tab = $(`.tab[data-path="${filePath}"]`);
  if (tab) tab.remove();
  
  openTabs.delete(filePath);
  
  if (activeTab === filePath) {
    const remainingTabs = Array.from(openTabs.keys());
    if (remainingTabs.length > 0) {
      switchToTab(remainingTabs[0]);
      } else {
      if (monacoEditor) monacoEditor.setModel(null);
      currentFilePath = null;
      updateBreadcrumbs(null);
      activeTab = null;
    }
  }
}

async function saveCurrentFile() {
  if (!currentFilePath || !monacoEditor) {
    showToast('No file to save', 'warning');
    return;
  }
  
  try {
  const content = monacoEditor.getValue();
  await window.api.writeFile(currentFilePath, content);
    
    const tabData = openTabs.get(currentFilePath);
    if (tabData) {
      tabData.modified = false;
      updateTabTitle(currentFilePath);
    }
    
    showToast('File saved', 'success');
    } catch (error) {
    showToast(`Failed to save: ${error.message}`, 'error');
  }
}

function markTabAsModified(filePath) {
  const tabData = openTabs.get(filePath);
  if (tabData && !tabData.modified) {
    tabData.modified = true;
    updateTabTitle(filePath);
  }
}

function updateTabTitle(filePath) {
  const tab = $(`.tab[data-path="${filePath}"]`);
  const tabData = openTabs.get(filePath);
  
  if (tab && tabData) {
    const nameEl = tab.querySelector('.tab-name');
    const fileName = filePath.split('/').pop();
    nameEl.textContent = tabData.modified ? `● ${fileName}` : fileName;
  }
}

// UI Updates
function updateStatusBar() {
  if (!monacoEditor) return;
  
  const position = monacoEditor.getPosition();
  const model = monacoEditor.getModel();
  
  if (position && model) {
    $('#statusPosition').textContent = `Ln ${position.lineNumber}, Col ${position.column}`;
    $('#statusLanguage').textContent = model.getLanguageId();
  }
}

function updateBreadcrumbs(filePath) {
  const breadcrumbs = $('#breadcrumbs');
  
  if (!filePath) {
    breadcrumbs.innerHTML = '';
    return;
  }
  
  const parts = filePath.split('/');
  const fileName = parts.pop();
  const folderPath = parts.join(' › ');
  
  breadcrumbs.innerHTML = `
    <span style="color: var(--text-muted)">${folderPath}</span>
    ${folderPath ? ' › ' : ''}
    <span style="color: var(--text-primary)">${fileName}</span>
  `;
}

// WebSocket handlers
function setupWebSocketHandlers() {
  // Set up event listeners for AI chat responses
  window.ws.onMessage('chat_response', (data) => addChatMessage(data.response, 'assistant'));
  window.ws.onMessage('chat_error', (data) => addChatMessage(`Error: ${data.error}`, 'system'));
}

// File tree implementation
async function buildFileTree() {
  const tree = $('#tree');
  tree.innerHTML = '';
  
  const rootPath = await window.api.getWorkspace();
  if (!rootPath) {
    tree.innerHTML = '<div style="padding: 20px; text-align: center; color: var(--text-muted);">No folder opened<br><button onclick="openWorkspace()" style="margin-top: 8px; padding: 4px 8px; background: var(--accent-blue); color: white; border: none; border-radius: 4px; cursor: pointer;">Open Folder</button></div>';
    return;
  }
  
  try {
    const entries = await window.api.readDir(rootPath);
    entries.forEach(entry => {
      tree.appendChild(createTreeItem(entry));
    });
  } catch (error) {
    showToast(`Failed to load file tree: ${error.message}`, 'error');
  }
}

function createTreeItem(entry, level = 0) {
  const item = document.createElement('div');
  item.className = 'tree-item';
  item.style.paddingLeft = `${12 + level * 16}px`;
  item.dataset.path = entry.path;
  item.dataset.isdir = entry.isDirectory ? '1' : '0';
  
  const icon = document.createElement('i');
  icon.className = `tree-item-icon codicon ${getFileIcon(entry)}`;
  
  const name = document.createElement('span');
  name.className = 'tree-item-name';
  name.textContent = entry.name;
  
  item.appendChild(icon);
  item.appendChild(name);
  
  item.addEventListener('click', async (e) => {
    e.stopPropagation();
    
    // Update selection
    $$('.tree-item').forEach(el => el.classList.remove('selected'));
    item.classList.add('selected');
    
    if (entry.isDirectory) {
      await toggleDirectory(item, entry.path, level + 1);
    } else {
      await openFile(entry.path);
    }
  });
  
  return item;
}

// Enhanced file icon mapping function
function getFileIcon(entry) {
  if (entry.isDirectory) {
    return 'codicon-folder';
  }
  
  const fileName = entry.name.toLowerCase();
  const extension = fileName.split('.').pop();
  
  // Programming Languages
  if (['js', 'javascript'].includes(extension)) return 'codicon-symbol-method';
  if (['ts', 'typescript'].includes(extension)) return 'codicon-symbol-class';
  if (['jsx'].includes(extension)) return 'codicon-symbol-component';
  if (['tsx'].includes(extension)) return 'codicon-symbol-component';
  if (['py', 'python'].includes(extension)) return 'codicon-symbol-method';
  if (['java'].includes(extension)) return 'codicon-symbol-class';
  if (['cpp', 'cc', 'cxx'].includes(extension)) return 'codicon-symbol-class';
  if (['c'].includes(extension)) return 'codicon-symbol-method';
  if (['cs', 'csharp'].includes(extension)) return 'codicon-symbol-class';
  if (['php'].includes(extension)) return 'codicon-symbol-method';
  if (['rb', 'ruby'].includes(extension)) return 'codicon-symbol-method';
  if (['go'].includes(extension)) return 'codicon-symbol-method';
  if (['rs', 'rust'].includes(extension)) return 'codicon-symbol-method';
  if (['swift'].includes(extension)) return 'codicon-symbol-class';
  if (['kt', 'kotlin'].includes(extension)) return 'codicon-symbol-class';
  if (['scala'].includes(extension)) return 'codicon-symbol-class';
  if (['dart'].includes(extension)) return 'codicon-symbol-method';
  if (['r'].includes(extension)) return 'codicon-symbol-method';
  if (['m', 'matlab'].includes(extension)) return 'codicon-symbol-method';
  if (['pl', 'perl'].includes(extension)) return 'codicon-symbol-method';
  if (['lua'].includes(extension)) return 'codicon-symbol-method';
  if (['sh', 'bash', 'zsh'].includes(extension)) return 'codicon-terminal';
  if (['ps1', 'powershell'].includes(extension)) return 'codicon-terminal';
  if (['bat', 'cmd'].includes(extension)) return 'codicon-terminal';
  
  // Web Technologies
  if (['html', 'htm'].includes(extension)) return 'codicon-symbol-html';
  if (['css', 'scss', 'sass', 'less'].includes(extension)) return 'codicon-symbol-color';
  if (['xml'].includes(extension)) return 'codicon-symbol-html';
  if (['svg'].includes(extension)) return 'codicon-symbol-color';
  if (['json'].includes(extension)) return 'codicon-symbol-object';
  if (['yaml', 'yml'].includes(extension)) return 'codicon-symbol-object';
  if (['toml'].includes(extension)) return 'codicon-symbol-object';
  if (['ini', 'cfg', 'conf'].includes(extension)) return 'codicon-settings';
  
  // Markup and Documentation
  if (['md', 'markdown'].includes(extension)) return 'codicon-book';
  if (['txt', 'text'].includes(extension)) return 'codicon-symbol-text';
  if (['rst'].includes(extension)) return 'codicon-book';
  if (['adoc', 'asciidoc'].includes(extension)) return 'codicon-book';
  
  // Data and Configuration
  if (['csv'].includes(extension)) return 'codicon-symbol-array';
  if (['sql'].includes(extension)) return 'codicon-database';
  if (['db', 'sqlite'].includes(extension)) return 'codicon-database';
  if (['env'].includes(extension)) return 'codicon-settings';
  if (['gitignore'].includes(fileName)) return 'codicon-git-branch';
  if (['dockerfile'].includes(fileName)) return 'codicon-docker';
  if (['docker-compose'].includes(fileName)) return 'codicon-docker';
  
  // Package and Build Files
  if (['package.json'].includes(fileName)) return 'codicon-package';
  if (['package-lock.json'].includes(fileName)) return 'codicon-package';
  if (['yarn.lock'].includes(fileName)) return 'codicon-package';
  if (['requirements.txt'].includes(fileName)) return 'codicon-package';
  if (['pom.xml'].includes(fileName)) return 'codicon-package';
  if (['build.gradle'].includes(fileName)) return 'codicon-package';
  if (['cargo.toml'].includes(fileName)) return 'codicon-package';
  if (['go.mod'].includes(fileName)) return 'codicon-package';
  if (['composer.json'].includes(fileName)) return 'codicon-package';
  if (['gemfile'].includes(fileName)) return 'codicon-package';
  if (['webpack.config'].includes(fileName)) return 'codicon-package';
  if (['rollup.config'].includes(fileName)) return 'codicon-package';
  if (['vite.config'].includes(fileName)) return 'codicon-package';
  if (['tsconfig.json'].includes(fileName)) return 'codicon-package';
  if (['babel.config'].includes(fileName)) return 'codicon-package';
  if (['eslintrc'].includes(fileName)) return 'codicon-package';
  if (['prettierrc'].includes(fileName)) return 'codicon-package';
  if (['jest.config'].includes(fileName)) return 'codicon-package';
  if (['tailwind.config'].includes(fileName)) return 'codicon-package';
  if (['next.config'].includes(fileName)) return 'codicon-package';
  if (['nuxt.config'].includes(fileName)) return 'codicon-package';
  if (['angular.json'].includes(fileName)) return 'codicon-package';
  if (['vue.config'].includes(fileName)) return 'codicon-package';
  if (['craco.config'].includes(fileName)) return 'codicon-package';
  
  // Image Files
  if (['png', 'jpg', 'jpeg', 'gif', 'bmp', 'ico', 'webp', 'avif'].includes(extension)) return 'codicon-symbol-color';
  
  // Audio Files
  if (['mp3', 'wav', 'ogg', 'flac', 'aac', 'm4a'].includes(extension)) return 'codicon-symbol-event';
  
  // Video Files
  if (['mp4', 'avi', 'mov', 'wmv', 'flv', 'webm', 'mkv'].includes(extension)) return 'codicon-symbol-event';
  
  // Archive Files
  if (['zip', 'rar', '7z', 'tar', 'gz', 'bz2'].includes(extension)) return 'codicon-library';
  
  // Font Files
  if (['ttf', 'otf', 'woff', 'woff2', 'eot'].includes(extension)) return 'codicon-symbol-text';
  
  // Certificate Files
  if (['pem', 'crt', 'key', 'p12', 'pfx'].includes(extension)) return 'codicon-shield';
  
  // Log Files
  if (['log'].includes(extension)) return 'codicon-output';
  
  // Lock Files
  if (['lock'].includes(extension)) return 'codicon-lock';
  
  // Default file icon
  return 'codicon-symbol-file';
}

async function toggleDirectory(item, path, level) {
  const existing = item.nextElementSibling;
  
  if (existing && existing.classList.contains('tree-item-children')) {
    // Directory is expanded, collapse it
    existing.remove();
    item.querySelector('.tree-item-icon').className = 'tree-item-icon codicon codicon-folder';
  } else {
    // Directory is collapsed, expand it
    try {
      const entries = await window.api.readDir(path);
      const container = document.createElement('div');
      container.className = 'tree-item-children';
      
      for (const entry of entries) {
        container.appendChild(createTreeItem(entry, level));
      }
      
      item.insertAdjacentElement('afterend', container);
      item.querySelector('.tree-item-icon').className = 'tree-item-icon codicon codicon-folder-opened';
    } catch (error) {
      showToast(`Failed to read directory: ${error.message}`, 'error');
    }
  }
}

async function openWorkspace() {
  try {
    const path = await window.api.openWorkspace();
    if (path) {
      await buildFileTree();
      updateBreadcrumbs(path);
      showToast(`Opened workspace: ${path}`, 'success');
      }
    } catch (error) {
    showToast(`Failed to open workspace: ${error.message}`, 'error');
  }
}

// Event listeners
function setupEventListeners() {
  // Activity bar
  $('#actExplorer').addEventListener('click', () => switchPanel('explorer'));
  $('#actSearch').addEventListener('click', () => switchPanel('search'));
  $('#actChat').addEventListener('click', () => switchPanel('chat'));
  $('#actCodebase').addEventListener('click', () => switchPanel('codebase'));
  $('#actAgent').addEventListener('click', () => switchPanel('agent'));
  $('#actTerminal').addEventListener('click', () => toggleTerminalPane());
  
  // File operations
  $('#btnOpen').addEventListener('click', openWorkspace);
  $('#btnSave').addEventListener('click', saveCurrentFile);
  $('#btnRefresh').addEventListener('click', buildFileTree);
  
  // AI suggestions
  $('#btnAcceptSuggestion').addEventListener('click', acceptAISuggestion);
  $('#btnRejectSuggestion').addEventListener('click', hideAISuggestion);
  
  // AI Agent
  $('#btnStartAgent').addEventListener('click', startAIAgent);
  $('#btnCheckStatus').addEventListener('click', async () => {
    try {
      const result = await checkAIAgentStatus();
      if (result.success) {
        const status = result.status.initialized ? '✅ Active' : '❌ Inactive';
        const sessionInfo = result.status.sessionStats ? 
          ` (Session: ${result.status.sessionStats.sessionId.substring(0, 8)}...)` : '';
        showToast(`AI Agent Status: ${status}${sessionInfo}`, 'success');
        console.log('Full status:', result.status);
      } else {
        showToast(`Status Check Failed: ${result.error}`, 'error');
      }
    } catch (error) {
      console.error('Status check button error:', error);
      showToast(`Status Check Error: ${error.message}`, 'error');
    }
  });
  
  // Safety and undo event listeners
$('#undoBtn').addEventListener('click', undoLastAction);
$('#clearUndoBtn').addEventListener('click', clearUndoStack);
$('#cleanupBackupsBtn').addEventListener('click', cleanupBackups);
$('#emergencyConfirmBtn').addEventListener('click', emergencyConfirm);
  
  // Codebase search
  $('#codebaseQuery').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      const query = e.target.value.trim();
      if (query) {
        performCodebaseSearch(query);
      }
    }
  });
  
  $('#btnIndexCodebase').addEventListener('click', async () => {
    try {
      const result = await window.api.codebaseReindex();
      if (result.success) {
        showToast('Codebase reindexed successfully', 'success');
        updateCodebasePanel(result.stats);
      } else {
        showToast(`Reindex failed: ${result.error}`, 'error');
      }
    } catch (error) {
      showToast(`Reindex error: ${error.message}`, 'error');
    }
  });
  
  // Terminal operations
  $('#btnNewTerminal').addEventListener('click', createTerminal);
  $('#btnKillTerminal').addEventListener('click', () => {
    if (activeTerminalId) {
      closeTerminal(activeTerminalId);
    }
  });
  $('#btnMaximizeTerminal').addEventListener('click', () => {
    const terminalPane = $('#terminalPane');
    if (terminalPane.classList.contains('hidden')) {
      showTerminalPane();
    } else {
      hideTerminalPane();
    }
  });
  
  // Agent input keyboard shortcuts
  $('#agentInput').addEventListener('keydown', (e) => {
    const mod = navigator.platform.toUpperCase().includes('MAC') ? e.metaKey : e.ctrlKey;
    
    if (mod && e.key === 'Enter') {
      e.preventDefault();
      startAIAgent();
    }
  });
  
  // Chat interface
  $('#btnClearChat').addEventListener('click', () => {
    $('#chatMessages').innerHTML = '';
    chatHistory = [];
    showToast('Chat cleared', 'info');
  });
  
  // Model selection
  $('#aiModelSelect').addEventListener('change', async (e) => {
    try {
      const result = await window.api.aiSetModel(e.target.value);
    if (result.success) {
        showToast(`Switched to ${e.target.options[e.target.selectedIndex].text}`, 'success');
    } else {
        showToast(`Failed to switch model: ${result.error}`, 'error');
    }
  } catch (error) {
      showToast(`Error changing model: ${error.message}`, 'error');
    }
  });
  
  // Agent model selection
  $('#agentModelSelect').addEventListener('change', async (e) => {
    try {
      const result = await window.api.aiSetModel(e.target.value);
    if (result.success) {
        showToast(`Agent switched to ${e.target.options[e.target.selectedIndex].text}`, 'success');
    } else {
        showToast(`Failed to switch agent model: ${result.error}`, 'error');
    }
  } catch (error) {
      showToast(`Error changing agent model: ${error.message}`, 'error');
    }
  });
  
  // Global shortcuts
  document.addEventListener('keydown', (e) => {
    const mod = navigator.platform.toUpperCase().includes('MAC') ? e.metaKey : e.ctrlKey;
    
    if (mod && e.key === 'k') {
      e.preventDefault();
      toggleCommandPalette();
    }
    
    if (mod && e.key === 'b') {
      e.preventDefault();
      toggleSidebar();
    }
    
    if (mod && e.shiftKey && e.key === 'A') {
      e.preventDefault();
      toggleAgentMode();
    }
    
    if (e.key === '`' && (mod || e.ctrlKey)) {
      e.preventDefault();
      toggleTerminalPane();
    }
    
    if (e.key === 'Escape') {
      $('#quickQuestion').classList.add('hidden');
      $('#codeGeneration').classList.add('hidden');
      $('#commandPalette').classList.add('hidden');
      hideAISuggestion();
    }
  });
}

// AI Agent Status Check Function
async function checkAIAgentStatus() {
  try {
    console.log('Checking AI Agent status...');
    const statusResult = await window.api.aiGetAgentStatus();
    console.log('Status result:', statusResult);
    
    if (!statusResult || !statusResult.success) {
      console.error('Status check failed:', statusResult);
      return { success: false, error: 'Status check failed' };
    }
    
    return { success: true, status: statusResult.status };
  } catch (error) {
    console.error('Error checking AI Agent status:', error);
    return { success: false, error: error.message };
  }
}

// AI Agent Functions
async function startAIAgent() {
  const agentInput = $('#agentInput');
  const agentRequest = agentInput.value.trim();
  
  // Initialize safety features if not already done
  if (!undoStackInfo) {
    await initializeSafetyFeatures();
  }
  
  if (!agentRequest) {
    showToast('Please describe what you want the AI agent to do', 'warning');
    return;
  }
  
  // Check AI agent status first
  try {
    console.log('Checking AI Agent status...');
    const statusResult = await window.api.aiGetAgentStatus();
    console.log('Status result:', statusResult);
    
    if (!statusResult || !statusResult.success) {
      console.error('Status check failed:', statusResult);
      showToast('AI Agent system not ready. Please open a workspace first.', 'error');
      return;
    }
    
    if (!statusResult.status.initialized) {
      console.log('AI Agent not initialized');
      showToast('AI Agent system not ready. Please open a workspace first.', 'error');
      return;
    }
    
    console.log('AI Agent status:', statusResult.status);
  } catch (error) {
    console.error('Error checking AI Agent status:', error);
    showToast(`Failed to check AI Agent status: ${error.message}`, 'error');
    return;
  }
  
  // Update UI to show agent is working
  const agentStatus = $('#agentStatus');
  const agentProgress = $('#agentProgress');
  const agentTasks = $('#agentTasks');
  const startButton = $('#btnStartAgent');
  
  // Display session information if available (after UI elements are initialized)
  try {
    const statusResult = await window.api.aiGetAgentStatus();
    if (statusResult && statusResult.success && statusResult.status.sessionStats) {
      const sessionInfo = statusResult.status.sessionStats;
      console.log('Session info:', sessionInfo);
      
      // Add session info to the UI
      const sessionDiv = document.createElement('div');
      sessionDiv.className = 'agent-task session-info';
      sessionDiv.innerHTML = `
        <strong>📋 Session:</strong> ${sessionInfo.sessionId.substring(0, 8)}... 
        (${sessionInfo.totalOperations} ops, ${sessionInfo.totalFilesModified} files modified)
      `;
      agentTasks.appendChild(sessionDiv);
    }
  } catch (error) {
    console.warn('Could not display session info:', error);
  }
  
  // Disable the button and show progress
  startButton.disabled = true;
  startButton.innerHTML = '<i class="codicon codicon-loading spin"></i> Working...';
  agentStatus.textContent = 'Processing...';
  agentProgress.classList.remove('hidden');
  agentTasks.innerHTML = '<div class="agent-task">🔍 Step 1: Analyzing codebase and retrieving relevant context...</div>';
  
  try {
    // Gather enhanced context for the agent with selected files
    const context = await buildAgentContextWithSelectedFiles();
    
    console.log('Starting AI Agent with request:', agentRequest);
    console.log('Current file:', context.currentFile);
    console.log('Workspace files:', context.workspaceFiles);
    console.log('Selected files:', context.selectedFiles.length);
    
    // Get the selected agent model
    const agentModel = $('#agentModelSelect').value;
    
    // Create enhanced request with file context
    let enhancedRequest = agentRequest;
    
    if (context.selectedFiles.length > 0) {
      enhancedRequest += '\n\nSelected files for context:\n';
      context.selectedFiles.forEach(file => {
        enhancedRequest += `- ${file.name} (${file.type})\n`;
      });
      
      enhancedRequest += '\nFile contents:\n';
      context.selectedFiles.forEach(file => {
        if (file.content) {
          enhancedRequest += `\n=== ${file.name} ===\n${file.content}\n`;
        } else if (file.error) {
          enhancedRequest += `\n=== ${file.name} (Error: ${file.error}) ===\n`;
        }
      });
    }
    
    // Update progress to show AI processing
    agentTasks.innerHTML = `
      <div class="agent-task completed">🔍 Step 1: ✅ Codebase analysis complete</div>
      <div class="agent-task">📁 Step 2: ✅ ${context.selectedFiles.length} files loaded for context</div>
      <div class="agent-task">🤖 Step 3: AI Agent processing request...</div>
    `;
    
    // Call the AI agent with enhanced context
    const result = await window.api.aiAgent(enhancedRequest, context.currentFile, context.workspaceFiles, agentModel);
    
    if (result.success) {
      // Update status
      agentStatus.textContent = 'Completed';
      agentStatus.style.color = '#4CAF50';
      
      // Update progress to show completion
      agentTasks.innerHTML = `
        <div class="agent-task completed">🔍 Step 1: ✅ Codebase analysis complete</div>
        <div class="agent-task completed">📁 Step 2: ✅ ${context.selectedFiles.length} files loaded for context</div>
        <div class="agent-task completed">🤖 Step 3: ✅ AI processing complete</div>
        <div class="agent-task completed">
          <strong>📋 Analysis:</strong> ${result.analysis}
        </div>
      `;
      
      // Display actions taken
      result.actions.forEach(action => {
        const status = action.executed ? '✅' : '❌';
        const statusClass = action.executed ? 'completed' : 'failed';
        const actionDiv = document.createElement('div');
        actionDiv.className = `agent-task ${statusClass}`;
        actionDiv.innerHTML = `
          <strong>${status} ${action.type}:</strong> <code>${action.path}</code><br>
          <small>${action.reason}</small>
        `;
        agentTasks.appendChild(actionDiv);
        
        // Auto-open created/edited files
        if (action.executed && (action.type === 'write_file' || action.type === 'create_file' || action.type === 'edit_file')) {
          setTimeout(() => openFile(action.path), 500);
        }
      });
      
      // Display explanation
      if (result.explanation) {
        const explanationDiv = document.createElement('div');
        explanationDiv.className = 'agent-task explanation';
        explanationDiv.innerHTML = `<strong>💡 Explanation:</strong> ${result.explanation}`;
        agentTasks.appendChild(explanationDiv);
      }
      
      // Show success message
      const successCount = result.actions.filter(a => a.executed).length;
      showToast(`AI Agent completed ${successCount} actions successfully!`, 'success');
      
      // Clear the input
      agentInput.value = '';
      
    } else {
      throw new Error(result.error);
    }
    
  } catch (error) {
    console.error('AI Agent error:', error);
    agentStatus.textContent = 'Error';
    agentStatus.style.color = '#f44336';
    agentTasks.innerHTML = `<div class="agent-task failed">❌ Error: ${error.message}</div>`;
    showToast(`AI Agent error: ${error.message}`, 'error');
  } finally {
    // Re-enable the button
    startButton.disabled = false;
    startButton.innerHTML = '<i class="codicon codicon-play"></i> Start Agent';
    agentProgress.classList.add('hidden');
  }
}

// Safety and undo functions
async function initializeSafetyFeatures() {
  try {
    // Load undo stack info
    await updateUndoStackInfo();
    
    // Set up periodic updates
    setInterval(updateUndoStackInfo, 5000);
    
    // Check if safety dialog is available
    if (window.safetyDialog) {
      console.log('Safety dialog loaded successfully');
    } else {
      console.warn('Safety dialog not available, using fallback confirmation');
    }
    
    console.log('Safety features initialized');
  } catch (error) {
    console.error('Failed to initialize safety features:', error);
  }
}

async function updateUndoStackInfo() {
  try {
    const result = await window.api.aiGetUndoStackInfo();
    if (result.success) {
      undoStackInfo = result.info;
      updateUndoButton();
    }
  } catch (error) {
    console.error('Failed to update undo stack info:', error);
  }
}

function updateUndoButton() {
  const undoBtn = $('#undoBtn');
  if (undoBtn && undoStackInfo) {
    undoBtn.disabled = !undoStackInfo.canUndo;
    undoBtn.title = undoStackInfo.canUndo 
      ? `Undo last action (${undoStackInfo.undoCount} actions available)`
      : 'No actions to undo';
  }
}

async function undoLastAction() {
  try {
    // Get undo stack details first
    const detailsResult = await window.api.aiGetUndoStackDetails();
    if (!detailsResult.success || detailsResult.details.length === 0) {
      showToast('No actions to undo', 'info');
      return;
    }

    // Show selective undo dialog if available, otherwise use simple confirm
    let selectedIndices = [];
    if (window.undoDialog && typeof window.undoDialog.show === 'function') {
      selectedIndices = await window.undoDialog.show(detailsResult.details);
    } else {
      // Fallback to simple confirmation
      const actionList = detailsResult.details.map(item => item.description).join('\n');
      const confirmed = confirm(`Undo the following actions?\n\n${actionList}\n\nClick OK to undo all, Cancel to abort.`);
      if (confirmed) {
        selectedIndices = detailsResult.details.map((_, index) => index);
      }
    }
    
    if (selectedIndices.length === 0) {
      showToast('No actions selected for undo', 'info');
      return;
    }

    // Undo selected actions
    const result = await window.api.aiUndoMultipleActions(selectedIndices);
    if (result.success) {
      const successCount = result.results.filter(r => r.success).length;
      const totalCount = result.results.length;
      
      if (successCount === totalCount) {
        showToast(`Successfully undid ${successCount} actions`, 'success');
      } else {
        showToast(`Undid ${successCount}/${totalCount} actions (some failed)`, 'warning');
      }
      
      await updateUndoStackInfo();

      // Refresh file explorer if needed
      if (currentPanel === 'explorer') {
        await refreshFileExplorer();
      }
    } else {
      showToast(`Undo failed: ${result.error}`, 'error');
    }
  } catch (error) {
    console.error('Undo failed:', error);
    showToast('Failed to undo actions', 'error');
  }
}

async function clearUndoStack() {
  try {
    const result = await window.api.aiClearUndoStack();
    if (result.success) {
      showToast('Undo stack cleared', 'success');
      await updateUndoStackInfo();
    } else {
      showToast('Failed to clear undo stack', 'error');
    }
  } catch (error) {
    console.error('Clear undo stack failed:', error);
    showToast('Failed to clear undo stack', 'error');
  }
}

async function cleanupBackups() {
  try {
    const result = await window.api.aiCleanupBackups();
    if (result.success) {
      showToast('Old backups cleaned up', 'success');
    } else {
      showToast('Failed to cleanup backups', 'error');
    }
  } catch (error) {
    console.error('Backup cleanup failed:', error);
    showToast('Failed to cleanup backups', 'error');
  }
}

async function emergencyConfirm() {
  try {
    const result = await window.api.aiEmergencyConfirm();
    if (result.success) {
      showToast('Emergency confirmation applied - operation should continue', 'success');
      // Refresh undo stack info
      await updateUndoStackInfo();
    } else {
      showToast('Emergency confirmation failed', 'error');
    }
  } catch (error) {
    console.error('Emergency confirmation failed:', error);
    showToast('Emergency confirmation failed', 'error');
  }
}

// Handle pending actions confirmation
async function handlePendingActions() {
  try {
    const result = await window.api.aiGetPendingActions();
    if (result.success && result.pendingActions) {
      pendingActions = result.pendingActions;
      
      // Show confirmation dialog if available, otherwise use simple confirm
      let approved = false;
      if (window.safetyDialog && typeof window.safetyDialog.show === 'function') {
        approved = await window.safetyDialog.show(pendingActions);
      } else {
        // Fallback to simple browser confirm
        const warningText = pendingActions.validation?.warnings?.join('\n') || 'AI actions require confirmation';
        approved = confirm(`⚠️ AI Action Confirmation Required\n\n${warningText}\n\nDo you want to proceed?`);
      }
      
      // Send confirmation to main process
      await window.api.aiConfirmActions(approved);
      
      if (approved) {
        showToast('Actions confirmed and executed', 'success');
      } else {
        showToast('Actions cancelled by user', 'info');
      }
      
      pendingActions = null;
    }
  } catch (error) {
    console.error('Failed to handle pending actions:', error);
    showToast('Failed to handle action confirmation', 'error');
  }
}

// Toggle agent mode (keyboard shortcut handler)
function toggleAgentMode() {
  switchPanel('agent');
  const agentInput = $('#agentInput');
  if (agentInput) {
    agentInput.focus();
  }
}

// Placeholder functions
function toggleCommandPalette() { console.log('Command palette toggled'); }
function generateId() { return Math.random().toString(36).substring(2, 15); }

// Codebase indexing functions
async function updateCodebasePanel(stats) {
  const codebaseResults = $('#codebaseResults');
  if (!codebaseResults) return;
  
  const statsHtml = `
    <div class="codebase-stats">
      <h4>Index Statistics</h4>
      <div class="stats-grid">
        <div class="stat-item">
          <span class="stat-label">Files:</span>
          <span class="stat-value">${stats.totalFiles}</span>
        </div>
        <div class="stat-item">
          <span class="stat-label">Chunks:</span>
          <span class="stat-value">${stats.totalChunks}</span>
        </div>
        <div class="stat-item">
          <span class="stat-label">Embeddings:</span>
          <span class="stat-value">${stats.totalEmbeddings}</span>
        </div>
      </div>
      <div class="language-stats">
        <h5>Languages:</h5>
        <div class="language-list">
          ${Object.entries(stats.languages || {}).map(([lang, count]) => 
            `<span class="language-tag">${lang}: ${count}</span>`
          ).join('')}
        </div>
      </div>
    </div>
  `;
  
  codebaseResults.innerHTML = statsHtml;
}

async function performCodebaseSearch(query) {
  try {
    const result = await window.api.codebaseSearch(query, 10);
    if (result.success) {
      displayCodebaseSearchResults(result.results);
    } else {
      showToast(`Search failed: ${result.error}`, 'error');
    }
  } catch (error) {
    showToast(`Search error: ${error.message}`, 'error');
  }
}

function displayCodebaseSearchResults(results) {
  const codebaseResults = $('#codebaseResults');
  if (!codebaseResults) return;
  
  if (results.length === 0) {
    codebaseResults.innerHTML = '<div class="no-results">No results found</div>';
    return;
  }
  
  const resultsHtml = results.map(result => `
    <div class="search-result">
      <div class="result-header">
        <span class="result-file">${result.embedding.metadata.filePath}</span>
        <span class="result-lines">Lines ${result.embedding.metadata.startLine}-${result.embedding.metadata.endLine}</span>
        <span class="result-similarity">${(result.score * 10).toFixed(1)}% match</span>
      </div>
      <div class="result-content">
        <pre><code>${result.snippet}</code></pre>
      </div>
    </div>
  `).join('');
  
  codebaseResults.innerHTML = resultsHtml;
}

// Terminal Management Functions
async function createTerminal() {
  try {
    console.log('Creating new terminal...');
    const terminalId = `terminal-${terminalCounter++}`;
    const terminalElement = document.createElement('div');
    terminalElement.className = 'terminal-instance';
    terminalElement.id = terminalId;
    
    // Create xterm instance
    const term = new Terminal({
      cursorBlink: true,
      fontSize: 14,
      fontFamily: 'Menlo, Monaco, "Courier New", monospace',
      theme: {
        background: '#1e1e1e',
        foreground: '#cccccc',
        cursor: '#ffffff',
        selection: '#264f78',
        black: '#000000',
        red: '#cd3131',
        green: '#0dbc79',
        yellow: '#e5e510',
        blue: '#2472c8',
        magenta: '#bc3fbc',
        cyan: '#11a8cd',
        white: '#e5e5e5',
        brightBlack: '#666666',
        brightRed: '#f14c4c',
        brightGreen: '#23d18b',
        brightYellow: '#f5f543',
        brightBlue: '#3b8eea',
        brightMagenta: '#d670d6',
        brightCyan: '#29b8db',
        brightWhite: '#ffffff'
      }
    });
    
    // Add fit addon for responsive sizing
    const fitAddon = new FitAddon.FitAddon();
    term.loadAddon(fitAddon);
    
    // Open terminal in the element
    term.open(terminalElement);
    fitAddon.fit();
    
    // Create PTY connection
    console.log('Creating PTY connection...');
    const ptyResult = await window.api.ptyCreate(term.cols, term.rows);
    const ptyId = ptyResult.id;
    console.log('PTY created with ID:', ptyId);
    
    // Store terminal info
    terminals.set(terminalId, {
      term,
      ptyId,
      fitAddon,
      element: terminalElement
    });
    
    // Set up data handlers
    term.onData((data) => {
      window.api.ptyWrite(ptyId, data);
    });
    
    // Handle PTY data
    window.api.onPtyData((data) => {
      if (data.id === ptyId) {
        term.write(data.data);
      }
    });
    
    // Handle PTY exit
    window.api.onPtyExit((data) => {
      if (data.id === ptyId) {
        term.write('\r\n\x1b[31mTerminal closed\x1b[0m\r\n');
        terminals.delete(terminalId);
      }
    });
    
    // Handle resize
    term.onResize((size) => {
      window.api.ptyResize(ptyId, size.cols, size.rows);
    });
    
    // Add terminal tab
    addTerminalTab(terminalId);
    
    // Add terminal element to container
    const terminalsContainer = $('#terminalsContainer');
    terminalsContainer.appendChild(terminalElement);
    
    // Show terminal pane
    showTerminalPane();
    
    // Set as active terminal
    setActiveTerminal(terminalId);
    
    // Focus the terminal
    term.focus();
    
    return terminalId;
  } catch (error) {
    console.error('Failed to create terminal:', error);
    showToast('Failed to create terminal', 'error');
  }
}

function addTerminalTab(terminalId) {
  const tabList = $('#terminalTabList');
  const tab = document.createElement('div');
  tab.className = 'terminal-tab';
  tab.dataset.terminalId = terminalId;
  tab.innerHTML = `
    <span class="terminal-tab-title">Terminal ${terminalId.split('-')[1]}</span>
    <button class="terminal-tab-close" onclick="closeTerminal('${terminalId}')">
      <i class="codicon codicon-close"></i>
    </button>
  `;
  
  tab.addEventListener('click', (e) => {
    if (!e.target.closest('.terminal-tab-close')) {
      setActiveTerminal(terminalId);
    }
  });
  
  tabList.appendChild(tab);
}

function setActiveTerminal(terminalId) {
  // Remove active class from all terminals and tabs
  $$('.terminal-instance').forEach(el => el.classList.remove('active'));
  $$('.terminal-tab').forEach(el => el.classList.remove('active'));
  
  // Add active class to selected terminal and tab
  const terminalElement = $(`#${terminalId}`);
  const tabElement = $(`.terminal-tab[data-terminal-id="${terminalId}"]`);
  
  if (terminalElement) {
    terminalElement.classList.add('active');
  }
  if (tabElement) {
    tabElement.classList.add('active');
  }
  
  activeTerminalId = terminalId;
  
  // Focus the terminal
  const terminal = terminals.get(terminalId);
  if (terminal && terminal.term) {
    terminal.term.focus();
  }
}

async function closeTerminal(terminalId) {
  const terminal = terminals.get(terminalId);
  if (terminal) {
    // Kill PTY
    await window.api.ptyKill(terminal.ptyId);
    
    // Remove terminal element
    terminal.element.remove();
    
    // Remove tab
    const tab = $(`.terminal-tab[data-terminal-id="${terminalId}"]`);
    if (tab) tab.remove();
    
    // Remove from terminals map
    terminals.delete(terminalId);
    
    // If no terminals left, hide terminal pane
    if (terminals.size === 0) {
      hideTerminalPane();
    } else {
      // Set first remaining terminal as active
      const firstTerminalId = terminals.keys().next().value;
      setActiveTerminal(firstTerminalId);
    }
  }
}

function showTerminalPane() {
  const terminalPane = $('#terminalPane');
  const editorPane = $('#editorPane');
  
  terminalPane.classList.remove('hidden');
  editorPane.style.height = '60%';
  terminalPane.style.height = '40%';
  
  console.log('Terminal pane shown, terminals count:', terminals.size);
  
  // Trigger resize for terminal fit
  setTimeout(() => {
    terminals.forEach(terminal => {
      if (terminal.fitAddon) {
        terminal.fitAddon.fit();
      }
    });
  }, 100);
}

function hideTerminalPane() {
  const terminalPane = $('#terminalPane');
  const editorPane = $('#editorPane');
  
  terminalPane.classList.add('hidden');
  editorPane.style.height = '100%';
}

function toggleTerminalPane() {
  const terminalPane = $('#terminalPane');
  if (terminalPane.classList.contains('hidden')) {
    if (terminals.size === 0) {
      createTerminal();
    } else {
      showTerminalPane();
    }
  } else {
    hideTerminalPane();
  }
}

// Initialize application
async function initializeApp() {
  console.log('Initializing Cursor AI Editor...');
  
  try {
    setupEventListeners();
    setupWebSocketHandlers();
    initializeChatInterface();
    initializeFileSelection();
    
    const workspace = await window.api.getWorkspace();
    if (workspace) updateBreadcrumbs(workspace);
    
    await initializeMonacoEditor();
    
    try {
      // Set default model to deepseek
      await window.api.aiSetModel('deepseek');
      const selectedModel = await window.api.aiGetSelectedModel();
      const privacyMode = await window.api.aiGetPrivacyMode();
      
      $('#aiModelSelect').value = selectedModel || 'deepseek';
      $('#agentModelSelect').value = selectedModel || 'deepseek';
      $('#statusPrivacy').classList.toggle('hidden', !privacyMode);
      
          // Initialize file tree
    await buildFileTree();
    
    // Set up AI agent file written listener
    window.api.onAiFileWritten((data) => {
      console.log('AI wrote file:', data);
      // Refresh file tree to show new/modified files
      buildFileTree();
      
      // Show notification
      showToast(`AI Agent ${data.type}: ${data.path}`, 'success');
    });
    
    // Set up AI agent indexing context listener
    window.api.onAiIndexingContext((data) => {
      console.log('AI used indexing context:', data);
      showToast(`AI analyzed ${data.contextChunks} code chunks from ${data.totalFiles} files`, 'info');
    });
    
    // Set up workspace change listener for terminal updates
    window.api.onWorkspaceChange((data) => {
      console.log('Workspace changed:', data.path);
      // Update terminal working directory if terminals exist
      if (terminals.size > 0) {
        showToast(`Terminal working directory updated to: ${data.path}`, 'info');
      }
    });
    
    // Set up workspace loaded listener to refresh file tree
    window.api.onWorkspaceLoaded((workspacePath) => {
      console.log('Workspace loaded:', workspacePath);
      // Refresh file tree when workspace is loaded
      buildFileTree();
      showToast(`Workspace loaded: ${workspacePath}`, 'success');
    });
    
    // Set up codebase indexing listener
    window.api.onCodebaseIndexed((data) => {
      console.log('Codebase indexed:', data.stats);
      showToast(`Codebase indexed: ${data.stats.totalFiles} files, ${data.stats.totalChunks} chunks`, 'success');
      updateCodebasePanel(data.stats);
    });
    
    showToast('Cursor AI Editor ready - Gemini AI loaded', 'success');
    } catch (error) {
      console.error('Failed to load AI settings:', error);
      showToast('AI features may be limited', 'warning');
    }
    
    console.log('Cursor AI Editor initialized successfully');
    
  } catch (error) {
    console.error('Failed to initialize app:', error);
    showToast(`Initialization failed: ${error.message}`, 'error');
  }
}

// Start the application
initializeApp();

// File Selection Functions
function initializeFileSelection() {
  // Event listeners for file selection buttons
  $('#btnSelectCurrentFile').addEventListener('click', addCurrentFileToSelection);
  $('#btnSelectFromTree').addEventListener('click', showFileSelectionModal);
  $('#btnClearFiles').addEventListener('click', clearSelectedFiles);
  
  // Update the display
  updateSelectedFilesDisplay();
}

function addCurrentFileToSelection() {
  const currentFile = getCurrentFileContext();
  if (currentFile && currentFile.path) {
    const fileName = currentFile.path.split('/').pop();
    addFileToSelection(currentFile.path, fileName);
    showToast(`Added current file: ${fileName}`, 'success');
  } else {
    showToast('No file is currently open', 'warning');
  }
}

function addFileToSelection(filePath, fileName) {
  if (!filePath || !fileName) return;
  
  const fileKey = `${filePath}|${fileName}`;
  if (!selectedFiles.has(fileKey)) {
    selectedFiles.add(fileKey);
    updateSelectedFilesDisplay();
  }
}

function removeFileFromSelection(filePath, fileName) {
  console.log('removeFileFromSelection called with:', filePath, fileName);
  const fileKey = `${filePath}|${fileName}`;
  console.log('File key:', fileKey);
  console.log('Current selected files:', Array.from(selectedFiles));
  
  if (selectedFiles.has(fileKey)) {
    selectedFiles.delete(fileKey);
    console.log('File removed. Updated selected files:', Array.from(selectedFiles));
    updateSelectedFilesDisplay();
  } else {
    console.log('File key not found in selected files');
  }
}

function clearSelectedFiles() {
  selectedFiles.clear();
  updateSelectedFilesDisplay();
  showToast('Cleared all selected files', 'info');
}

function updateSelectedFilesDisplay() {
  const selectedFilesList = $('#selectedFilesList');
  
  if (selectedFiles.size === 0) {
    selectedFilesList.innerHTML = `
      <div class="no-files-selected">
        <i class="codicon codicon-info"></i>
        No files selected. Use the file tree to select files for context.
      </div>
    `;
    return;
  }
  
  selectedFilesList.innerHTML = '';
  
  selectedFiles.forEach(fileKey => {
    const [filePath, fileName] = fileKey.split('|');
    const fileItem = createSelectedFileItem(filePath, fileName);
    selectedFilesList.appendChild(fileItem);
  });
}

function createSelectedFileItem(filePath, fileName) {
  const fileItem = document.createElement('div');
  fileItem.className = 'selected-file-item';
  
  // Determine file type for icon and styling
  const fileType = getFileTypeFromName(fileName);
  const iconClass = getFileIcon({ name: fileName, isDirectory: fileType === 'folder' });
  
  fileItem.dataset.fileType = fileType;
  fileItem.dataset.filePath = filePath;
  fileItem.dataset.fileName = fileName;
  
  fileItem.innerHTML = `
    <i class="selected-file-icon codicon ${iconClass}"></i>
    <span class="selected-file-name" title="${filePath}">${fileName}</span>
    <button class="selected-file-remove" title="Remove from selection">
      <i class="codicon codicon-close"></i>
    </button>
  `;
  
  // Add remove functionality with proper event handling
  const removeButton = fileItem.querySelector('.selected-file-remove');
  removeButton.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    console.log('Removing file:', filePath, fileName);
    removeFileFromSelection(filePath, fileName);
    showToast(`Removed: ${fileName}`, 'info');
  });
  
  return fileItem;
}

function getFileTypeFromName(fileName) {
  const extension = fileName.toLowerCase().split('.').pop();
  
  // Map extensions to file types
  const fileTypeMap = {
    'js': 'js',
    'ts': 'ts',
    'jsx': 'jsx',
    'tsx': 'tsx',
    'html': 'html',
    'htm': 'html',
    'css': 'css',
    'scss': 'scss',
    'sass': 'sass',
    'py': 'py',
    'json': 'json',
    'md': 'md',
    'txt': 'txt',
    'xml': 'xml',
    'svg': 'svg',
    'png': 'image',
    'jpg': 'image',
    'jpeg': 'image',
    'gif': 'image',
    'webp': 'image',
    'ico': 'image'
  };
  
  return fileTypeMap[extension] || 'file';
}

function showFileSelectionModal() {
  if (fileSelectionModal) {
    fileSelectionModal.remove();
  }
  
  fileSelectionModal = createFileSelectionModal();
  document.body.appendChild(fileSelectionModal);
  
  // Focus the search input
  setTimeout(() => {
    const searchInput = fileSelectionModal.querySelector('.file-selection-search input');
    if (searchInput) {
      searchInput.focus();
    }
  }, 100);
}

function createFileSelectionModal() {
  const modal = document.createElement('div');
  modal.className = 'file-selection-modal';
  
  modal.innerHTML = `
    <div class="file-selection-modal-content">
      <div class="file-selection-modal-header">
        <div class="file-selection-modal-title">
          <i class="codicon codicon-folder-opened"></i>
          Select Files for Agent Context
        </div>
        <button class="file-selection-modal-close">
          <i class="codicon codicon-close"></i>
        </button>
      </div>
      
      <div class="file-selection-modal-body">
        <div class="file-selection-search">
          <input type="text" placeholder="Search files..." />
        </div>
        <div class="file-selection-tree" id="fileSelectionTree">
          <div class="loading-files">
            <i class="codicon codicon-loading spin"></i>
            Loading files...
          </div>
        </div>
      </div>
      
      <div class="file-selection-status">
        <span>Selected: <span class="file-selection-count">${selectedFiles.size}</span> files</span>
      </div>
      
      <div class="file-selection-modal-footer">
        <button class="file-selection-modal-cancel">Cancel</button>
        <button class="file-selection-modal-confirm" disabled>Add Selected Files</button>
      </div>
    </div>
  `;
  
  // Add event listeners
  const closeButton = modal.querySelector('.file-selection-modal-close');
  const cancelButton = modal.querySelector('.file-selection-modal-cancel');
  const confirmButton = modal.querySelector('.file-selection-modal-confirm');
  const searchInput = modal.querySelector('.file-selection-search input');
  
  closeButton.addEventListener('click', () => modal.remove());
  cancelButton.addEventListener('click', () => modal.remove());
  
  // Handle search
  searchInput.addEventListener('input', (e) => {
    filterFileSelectionTree(e.target.value);
  });
  
  // Load file tree
  loadFileSelectionTree(modal);
  
  return modal;
}

async function loadFileSelectionTree(modal) {
  const treeContainer = modal.querySelector('#fileSelectionTree');
  
  try {
    // Get workspace root path
    const workspacePath = await window.api.getWorkspace();
    if (!workspacePath) {
      treeContainer.innerHTML = '<div class="no-workspace">No workspace open</div>';
      return;
    }
    
    // Load directory contents
    const entries = await window.api.readDir(workspacePath);
    treeContainer.innerHTML = '';
    
    // Create tree items
    entries.forEach(entry => {
      const treeItem = createFileSelectionTreeItem(entry, workspacePath);
      treeContainer.appendChild(treeItem);
    });
    
    // Update status
    updateFileSelectionStatus(modal);
    
  } catch (error) {
    console.error('Failed to load file selection tree:', error);
    treeContainer.innerHTML = `<div class="error">Failed to load files: ${error.message}</div>`;
  }
}

function createFileSelectionTreeItem(entry, basePath, level = 0) {
  const item = document.createElement('div');
  item.className = 'tree-item';
  item.style.paddingLeft = `${12 + level * 16}px`;
  item.dataset.path = entry.path;
  item.dataset.name = entry.name;
  item.dataset.isdir = entry.isDirectory ? '1' : '0';
  
  const icon = document.createElement('i');
  icon.className = `tree-item-icon codicon ${getFileIcon(entry)}`;
  
  const name = document.createElement('span');
  name.className = 'tree-item-name';
  name.textContent = entry.name;
  
  const checkbox = document.createElement('input');
  checkbox.type = 'checkbox';
  checkbox.className = 'file-selection-checkbox';
  checkbox.style.marginLeft = '8px';
  
  // Check if file is already selected
  const fileKey = `${entry.path}|${entry.name}`;
  checkbox.checked = selectedFiles.has(fileKey);
  
  item.appendChild(icon);
  item.appendChild(name);
  item.appendChild(checkbox);
  
  // Handle click events for file selection
  item.addEventListener('click', (e) => {
    // Skip if clicking on specific elements
    if (e.target === checkbox || 
        e.target.classList.contains('codicon-chevron-right') || 
        e.target.classList.contains('codicon-chevron-down') ||
        e.target.classList.contains('tree-item-name')) {
      return;
    }
    
    // Toggle checkbox for file selection
    checkbox.checked = !checkbox.checked;
    handleFileSelectionChange(entry, checkbox.checked);
  });
  
  checkbox.addEventListener('change', (e) => {
    e.stopPropagation();
    handleFileSelectionChange(entry, checkbox.checked);
  });
  
  // Handle directory expansion
  if (entry.isDirectory) {
    // Add expand/collapse indicator
    const expandIcon = document.createElement('i');
    expandIcon.className = 'codicon codicon-chevron-right';
    expandIcon.style.marginLeft = '4px';
    expandIcon.style.fontSize = '12px';
    expandIcon.style.color = 'var(--text-muted)';
    expandIcon.style.cursor = 'pointer';
    expandIcon.title = 'Click to expand/collapse';
    item.appendChild(expandIcon);
    
    // Simple click handler for expansion
    const handleExpand = async (e) => {
      e.preventDefault();
      e.stopPropagation();
      console.log('Directory expansion triggered for:', entry.path);
      await toggleFileSelectionDirectory(item, entry.path, level + 1);
    };
    
    // Add click listeners
    expandIcon.addEventListener('click', handleExpand);
    name.addEventListener('click', handleExpand);
    
    // Prevent checkbox clicks from triggering expansion
    checkbox.addEventListener('click', (e) => {
      e.stopPropagation();
    });
  }
  
  return item;
}

function handleFileSelectionChange(entry, isSelected) {
  const fileKey = `${entry.path}|${entry.name}`;
  
  if (isSelected) {
    if (!selectedFiles.has(fileKey)) {
      selectedFiles.add(fileKey);
      showToast(`Added: ${entry.name}`, 'success');
    }
  } else {
    if (selectedFiles.has(fileKey)) {
      selectedFiles.delete(fileKey);
      showToast(`Removed: ${entry.name}`, 'info');
    }
  }
  
  updateSelectedFilesDisplay();
  updateFileSelectionStatus();
}

async function toggleFileSelectionDirectory(item, path, level) {
  console.log('=== toggleFileSelectionDirectory called ===');
  console.log('Path:', path);
  console.log('Level:', level);
  console.log('Item:', item);
  
  const existing = item.nextElementSibling;
  const expandIcon = item.querySelector('.codicon-chevron-right, .codicon-chevron-down');
  
  console.log('Existing sibling:', existing);
  console.log('Expand icon:', expandIcon);
  
  if (existing && existing.classList.contains('tree-item-children')) {
    // Directory is expanded, collapse it
    console.log('Collapsing directory:', path);
    existing.remove();
    item.querySelector('.tree-item-icon').className = 'tree-item-icon codicon codicon-folder';
    if (expandIcon) {
      expandIcon.className = 'codicon codicon-chevron-right';
    }
  } else {
    // Directory is collapsed, expand it
    console.log('Expanding directory:', path);
    try {
      console.log('Calling window.api.readDir with path:', path);
      const entries = await window.api.readDir(path);
      console.log('Directory entries received:', entries);
      console.log('Number of entries:', entries ? entries.length : 0);
      
      if (!entries || entries.length === 0) {
        console.log('No entries found in directory');
        return;
      }
      
      const container = document.createElement('div');
      container.className = 'tree-item-children';
      
      for (const entry of entries) {
        console.log('Creating tree item for entry:', entry);
        const treeItem = createFileSelectionTreeItem(entry, path, level);
        container.appendChild(treeItem);
      }
      
      console.log('Inserting container after item');
      item.insertAdjacentElement('afterend', container);
      item.querySelector('.tree-item-icon').className = 'tree-item-icon codicon codicon-folder-opened';
      if (expandIcon) {
        expandIcon.className = 'codicon codicon-chevron-down';
      }
      console.log('Directory expansion completed');
    } catch (error) {
      console.error('Failed to read directory:', error);
      showToast(`Failed to read directory: ${error.message}`, 'error');
    }
  }
}

function filterFileSelectionTree(searchTerm) {
  const treeItems = document.querySelectorAll('#fileSelectionTree .tree-item');
  const searchLower = searchTerm.toLowerCase();
  
  treeItems.forEach(item => {
    const fileName = item.dataset.name.toLowerCase();
    const shouldShow = fileName.includes(searchLower);
    item.style.display = shouldShow ? 'flex' : 'none';
  });
}

function updateFileSelectionStatus(modal = null) {
  const statusElement = modal ? 
    modal.querySelector('.file-selection-count') : 
    document.querySelector('.file-selection-count');
  
  if (statusElement) {
    statusElement.textContent = selectedFiles.size;
  }
  
  // Update confirm button state
  const confirmButton = modal ? 
    modal.querySelector('.file-selection-modal-confirm') : 
    document.querySelector('.file-selection-modal-confirm');
  
  if (confirmButton) {
    confirmButton.disabled = selectedFiles.size === 0;
  }
}

// Enhanced agent context building with selected files
async function buildAgentContextWithSelectedFiles() {
  const context = {
    currentFile: getCurrentFileContext(),
    workspaceFiles: await getWorkspaceFilesList(),
    selectedFiles: []
  };
  
  // Add selected files content
  for (const fileKey of selectedFiles) {
    const [filePath, fileName] = fileKey.split('|');
    try {
      console.log('Reading file:', filePath);
      const fileResult = await window.api.readFile(filePath);
      console.log('File result:', fileResult);
      
      // Extract content from the file result object
      const fileContent = typeof fileResult === 'object' && fileResult.content ? fileResult.content : fileResult;
      console.log('Extracted content type:', typeof fileContent, 'Length:', fileContent ? fileContent.length : 0);
      
      context.selectedFiles.push({
        path: filePath,
        name: fileName,
        content: fileContent,
        type: getFileTypeFromName(fileName)
      });
    } catch (error) {
      console.warn(`Failed to read selected file ${fileName}:`, error);
      // Add file info without content
      context.selectedFiles.push({
        path: filePath,
        name: fileName,
        content: null,
        error: error.message,
        type: getFileTypeFromName(fileName)
      });
    }
  }
  
  return context;
}

// Enhanced agent request with file context
async function startAIAgentWithFileContext() {
  const agentInput = $('#agentInput');
  const agentRequest = agentInput.value.trim();
  
  if (!agentRequest) {
    showToast('Please describe what you want the AI agent to do', 'warning');
    return;
  }
  
  // Build enhanced context with selected files
  const context = await buildAgentContextWithSelectedFiles();
  
  // Create enhanced request with file context
  let enhancedRequest = agentRequest;
  
  if (context.selectedFiles.length > 0) {
    enhancedRequest += '\n\nSelected files for context:\n';
    context.selectedFiles.forEach(file => {
      enhancedRequest += `- ${file.name} (${file.type})\n`;
    });
    
    enhancedRequest += '\nFile contents:\n';
    context.selectedFiles.forEach(file => {
      if (file.content) {
        enhancedRequest += `\n=== ${file.name} ===\n${file.content}\n`;
      } else if (file.error) {
        enhancedRequest += `\n=== ${file.name} (Error: ${file.error}) ===\n`;
      }
    });
  }
  
  // Continue with existing agent logic but use enhanced context
  // ... (rest of the existing startAIAgent logic)
}
