const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  // File system operations
  selectFolder: () => ipcRenderer.invoke('select-folder'),
  openFolder: (folderPath) => ipcRenderer.invoke('open-folder', folderPath),
  getWorkspacePath: () => ipcRenderer.invoke('get-workspace-path'),
  readFile: (filePath) => ipcRenderer.invoke('read-file', filePath),
  writeFile: (filePath, content) => ipcRenderer.invoke('write-file', filePath, content),
  createDirectory: (dirPath) => ipcRenderer.invoke('create-directory', dirPath),
  deleteFile: (filePath) => ipcRenderer.invoke('delete-file', filePath),
  renameFile: (oldPath, newPath) => ipcRenderer.invoke('rename-file', oldPath, newPath),
  getFileStats: (filePath) => ipcRenderer.invoke('get-file-stats', filePath),
  listDirectory: (dirPath) => ipcRenderer.invoke('list-directory', dirPath),

  // Terminal operations
  createTerminal: (terminalId, shell) => ipcRenderer.invoke('create-terminal', terminalId, shell),
  writeTerminal: (terminalId, data) => ipcRenderer.invoke('write-terminal', terminalId, data),
  resizeTerminal: (terminalId, cols, rows) => ipcRenderer.invoke('resize-terminal', terminalId, cols, rows),
  killTerminal: (terminalId) => ipcRenderer.invoke('kill-terminal', terminalId),

  // AI operations
  sendAIMessage: (message, context) => ipcRenderer.invoke('send-ai-message', message, context),
  setAIModel: (modelName) => ipcRenderer.invoke('set-ai-model', modelName),
  getAIModels: () => ipcRenderer.invoke('get-ai-models'),
  getCurrentModel: () => ipcRenderer.invoke('get-current-model'),

  // Event listeners
  onTerminalData: (callback) => {
    const listener = (event, terminalId, data) => callback(terminalId, data);
    ipcRenderer.on('terminal-data', listener);
    return () => ipcRenderer.removeListener('terminal-data', listener);
  },

  onTerminalExit: (callback) => {
    const listener = (event, terminalId, exitCode) => callback(terminalId, exitCode);
    ipcRenderer.on('terminal-exit', listener);
    return () => ipcRenderer.removeListener('terminal-exit', listener);
  },

  onWorkspaceLoaded: (callback) => {
    const listener = (event, workspacePath) => callback(workspacePath);
    ipcRenderer.on('workspace-loaded', listener);
    return () => ipcRenderer.removeListener('workspace-loaded', listener);
  }
});

// Legacy API for backward compatibility
contextBridge.exposeInMainWorld('api', {
  // File system operations
  openWorkspace: () => ipcRenderer.invoke('select-folder'),
  getWorkspace: () => ipcRenderer.invoke('get-workspace-path'),
  readDir: (targetPath) => ipcRenderer.invoke('list-directory', targetPath),
  readFile: (filePath) => ipcRenderer.invoke('read-file', filePath),
  writeFile: (filePath, content) => ipcRenderer.invoke('write-file', filePath, content),
  createFolder: (folderPath) => ipcRenderer.invoke('create-directory', folderPath),
  createFile: (filePath) => ipcRenderer.invoke('write-file', filePath, ''),
  deletePath: (targetPath) => ipcRenderer.invoke('delete-file', targetPath),
  renamePath: (fromPath, toPath) => ipcRenderer.invoke('rename-file', fromPath, toPath),
  searchText: (root, query, maxResults) => ipcRenderer.invoke('search-text', root, query, maxResults),
  revealInFinder: (targetPath) => ipcRenderer.invoke('reveal-in-finder', targetPath),
  openInBrowser: (url) => ipcRenderer.invoke('open-in-browser', url),

  // Terminal (PTY) operations
  ptyCreate: (cols, rows) => ipcRenderer.invoke('create-terminal', `terminal-${Date.now()}`, null),
  ptyWrite: (id, data) => ipcRenderer.invoke('write-terminal', id, data),
  ptyResize: (id, cols, rows) => ipcRenderer.invoke('resize-terminal', id, cols, rows),
  ptyKill: (id) => ipcRenderer.invoke('kill-terminal', id),

  // AI operations - Core functionality
  aiChat: (message, context) => ipcRenderer.invoke('send-ai-message', message, context),
  aiAgent: (userRequest, currentFile, workspaceFiles, agentModel) => ipcRenderer.invoke('ai-agent', userRequest, currentFile, workspaceFiles, agentModel),
  aiSetModel: (model) => ipcRenderer.invoke('set-ai-model', model),
  aiGetSelectedModel: () => ipcRenderer.invoke('get-current-model'),
  aiGetAvailableModels: () => ipcRenderer.invoke('get-ai-models'),
  aiIsInitialized: () => Promise.resolve(true),

  // AI Agent operations
  aiGeneratePlan: (prompt) => ipcRenderer.invoke('ai-generate-plan', prompt),
  aiGenerateCode: (filePath, context, requirements) => ipcRenderer.invoke('ai-generate-code', filePath, context, requirements),
  aiExecuteCommand: (command, cwd) => ipcRenderer.invoke('ai-execute-command', command, cwd),
  aiInstallDependencies: (dependencies, type) => ipcRenderer.invoke('ai-install-dependencies', dependencies, type),
  aiCreateProjectStructure: (structure) => ipcRenderer.invoke('ai-create-project-structure', structure),
  aiGetProjectPlan: () => ipcRenderer.invoke('ai-get-project-plan'),
  aiBuildProjectWithStreaming: (plan) => ipcRenderer.invoke('ai-build-project-with-streaming', plan),
  aiGetBuildStatus: () => ipcRenderer.invoke('ai-get-build-status'),
  aiExecuteSetupCommand: (setupCommand) => ipcRenderer.invoke('ai-execute-setup-command', setupCommand),
  aiGetProjectStructure: () => ipcRenderer.invoke('ai-get-project-structure'),
  aiGetOperationHistory: () => ipcRenderer.invoke('ai-get-operation-history'),
  aiClearOperationHistory: () => ipcRenderer.invoke('ai-clear-operation-history'),
  aiGetAgentStatus: () => ipcRenderer.invoke('ai-get-agent-status'),
  
  // Session Management APIs
  aiGetSessionStats: () => ipcRenderer.invoke('ai-get-session-stats'),
  aiGetSessionContext: () => ipcRenderer.invoke('ai-get-session-context'),
  aiClearSession: () => ipcRenderer.invoke('ai-clear-session'),

  // Safety and Undo Management APIs
  aiGetUndoStackInfo: () => ipcRenderer.invoke('ai-get-undo-stack-info'),
  aiGetUndoStackDetails: () => ipcRenderer.invoke('ai-get-undo-stack-details'),
  aiUndoLastAction: () => ipcRenderer.invoke('ai-undo-last-action'),
  aiUndoActionByIndex: (index) => ipcRenderer.invoke('ai-undo-action-by-index', index),
  aiUndoMultipleActions: (indices) => ipcRenderer.invoke('ai-undo-multiple-actions', indices),
  aiClearUndoStack: () => ipcRenderer.invoke('ai-clear-undo-stack'),
  aiCleanupBackups: () => ipcRenderer.invoke('ai-cleanup-backups'),
  aiConfirmActions: (approved) => ipcRenderer.invoke('ai-confirm-actions', approved),
  aiEmergencyConfirm: () => ipcRenderer.invoke('ai-emergency-confirm'),
  aiGetPendingActions: () => ipcRenderer.invoke('ai-get-pending-actions'),

  // Codebase indexing operations
  codebaseGetIndexStats: () => ipcRenderer.invoke('codebase-get-index-stats'),
  codebaseSearch: (query, maxResults) => ipcRenderer.invoke('codebase-search', query, maxResults),
  codebaseGetContext: (query, maxChunks) => ipcRenderer.invoke('codebase-get-context', query, maxChunks),
  codebaseReindex: () => ipcRenderer.invoke('codebase-reindex'),

  // Event listeners for file system changes
  onFsChange: (callback) => {
    const listener = (_, payload) => callback(payload);
    ipcRenderer.on('fs-changed', listener);
    return () => ipcRenderer.removeListener('fs-changed', listener);
  },
  
  // Event listener for workspace changes
  onWorkspaceChange: (callback) => {
    const listener = (_, payload) => callback(payload);
    ipcRenderer.on('workspace-changed', listener);
    return () => ipcRenderer.removeListener('workspace-changed', listener);
  },
  
  // Event listener for codebase indexing
  onCodebaseIndexed: (callback) => {
    const listener = (_, payload) => callback(payload);
    ipcRenderer.on('codebase-indexed', listener);
    return () => ipcRenderer.removeListener('codebase-indexed', listener);
  },
  
  // Event listeners for terminal data
  onPtyData: (callback) => {
    const listener = (_, payload) => callback(payload);
    ipcRenderer.on('pty-data', listener);
    return () => ipcRenderer.removeListener('pty-data', listener);
  },
  
  onPtyExit: (callback) => {
    const listener = (_, payload) => callback(payload);
    ipcRenderer.on('pty-exit', listener);
    return () => ipcRenderer.removeListener('pty-exit', listener);
  },

  // Event listeners for AI operations
  onAIResponse: (callback) => {
    const listener = (_, payload) => callback(payload);
    ipcRenderer.on('ai-response', listener);
    return () => ipcRenderer.removeListener('ai-response', listener);
  },

  onAIError: (callback) => {
    const listener = (_, payload) => callback(payload);
    ipcRenderer.on('ai-error', listener);
    return () => ipcRenderer.removeListener('ai-error', listener);
  },

  onAgentStatusChange: (callback) => {
    const listener = (_, payload) => callback(payload);
    ipcRenderer.on('agent-status-change', listener);
    return () => ipcRenderer.removeListener('agent-status-change', listener);
  },

  onBuildProgress: (callback) => {
    const listener = (_, payload) => callback(payload);
    ipcRenderer.on('build-progress', listener);
    return () => ipcRenderer.removeListener('build-progress', listener);
  },

  onUndoStackChange: (callback) => {
    const listener = (_, payload) => callback(payload);
    ipcRenderer.on('undo-stack-change', listener);
    return () => ipcRenderer.removeListener('undo-stack-change', listener);
  },

  onSafetyCheck: (callback) => {
    const listener = (_, payload) => callback(payload);
    ipcRenderer.on('safety-check', listener);
    return () => ipcRenderer.removeListener('safety-check', listener);
  }
});
