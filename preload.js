const { contextBridge, ipcRenderer } = require('electron');

// Landing Page System APIs
contextBridge.exposeInMainWorld('electronAPI', {
  // File system operations
          selectFolder: () => ipcRenderer.invoke('select-folder'),
        openFolder: (folderPath) => ipcRenderer.invoke('open-folder', folderPath),
        getWorkspacePath: () => ipcRenderer.invoke('get-workspace-path'),
        getDesktopPath: () => ipcRenderer.invoke('get-desktop-path'),
        executeCommand: (command, cwd) => ipcRenderer.invoke('execute-command', command, cwd),
  readFile: (filePath) => ipcRenderer.invoke('fs:readFile', filePath),
  writeFile: (filePath, content) => ipcRenderer.invoke('fs:writeFile', filePath, content),
  createDirectory: (dirPath) => ipcRenderer.invoke('fs:createFolder', dirPath),
  deleteFile: (filePath) => ipcRenderer.invoke('fs:deletePath', filePath),
  renameFile: (oldPath, newPath) => ipcRenderer.invoke('fs:renamePath', oldPath, newPath),
  getFileStats: (filePath) => ipcRenderer.invoke('fs:readFile', filePath),
  listDirectory: (dirPath) => ipcRenderer.invoke('fs:readDir', dirPath),

  // Terminal operations
  createTerminal: (terminalId, shell) => ipcRenderer.invoke('pty:create', 80, 24),
  writeTerminal: (terminalId, data) => ipcRenderer.invoke('pty:write', terminalId, data),
  resizeTerminal: (terminalId, cols, rows) => ipcRenderer.invoke('pty:resize', terminalId, cols, rows),
  killTerminal: (terminalId) => ipcRenderer.invoke('pty:kill', terminalId),

  // AI operations
  sendAIMessage: (message, context) => ipcRenderer.invoke('ai:chat', message, context),
  setAIModel: (modelName) => ipcRenderer.invoke('ai:setModel', modelName),
  getAIModels: () => ipcRenderer.invoke('ai:getAvailableModels'),
  getCurrentModel: () => ipcRenderer.invoke('ai:getSelectedModel'),

  // Event listeners
  onTerminalData: (callback) => {
    const listener = (event, terminalId, data) => callback(terminalId, data);
    ipcRenderer.on('pty:data', listener);
    return () => ipcRenderer.removeListener('pty:data', listener);
  },

  onTerminalExit: (callback) => {
    const listener = (event, terminalId, exitCode) => callback(terminalId, exitCode);
    ipcRenderer.on('pty:exit', listener);
    return () => ipcRenderer.removeListener('pty:exit', listener);
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
  openWorkspace: () => ipcRenderer.invoke('dialog:openWorkspace'),
  getWorkspace: () => ipcRenderer.invoke('workspace:get'),
  readDir: (targetPath) => ipcRenderer.invoke('fs:readDir', targetPath),
  readFile: (filePath) => ipcRenderer.invoke('fs:readFile', filePath),
  writeFile: (filePath, content) => ipcRenderer.invoke('fs:writeFile', filePath, content),
  createFolder: (folderPath) => ipcRenderer.invoke('fs:createFolder', folderPath),
  createFile: (filePath) => ipcRenderer.invoke('fs:createFile', filePath),
  deletePath: (targetPath) => ipcRenderer.invoke('fs:deletePath', targetPath),
  renamePath: (fromPath, toPath) => ipcRenderer.invoke('fs:renamePath', fromPath, toPath),
  searchText: (root, query, maxResults) => ipcRenderer.invoke('fs:searchText', root, query, maxResults),
  revealInFinder: (targetPath) => ipcRenderer.invoke('external:revealInFinder', targetPath),
  openInBrowser: (url) => ipcRenderer.invoke('external:openInBrowser', url),

  // Terminal (PTY) operations
  ptyCreate: (cols, rows) => ipcRenderer.invoke('pty:create', cols, rows),
  ptyWrite: (id, data) => ipcRenderer.invoke('pty:write', id, data),
  ptyResize: (id, cols, rows) => ipcRenderer.invoke('pty:resize', id, cols, rows),
  ptyKill: (id) => ipcRenderer.invoke('pty:kill', id),

  // AI operations - Core functionality
  aiChat: (message, context) => ipcRenderer.invoke('ai:chat', message, context),
  aiAgent: (userRequest, currentFile, workspaceFiles, agentModel) => ipcRenderer.invoke('ai:agent', userRequest, currentFile, workspaceFiles, agentModel),
  aiSetModel: (model) => ipcRenderer.invoke('ai:setModel', model),
  aiGetSelectedModel: () => ipcRenderer.invoke('ai:getSelectedModel'),
  aiGetAvailableModels: () => ipcRenderer.invoke('ai:getAvailableModels'),
  aiIsInitialized: () => ipcRenderer.invoke('ai:isInitialized'),

  // AI Agent operations
  aiGeneratePlan: (prompt) => ipcRenderer.invoke('ai:generatePlan', prompt),
  aiGenerateCode: (filePath, context, requirements) => ipcRenderer.invoke('ai:generateCode', filePath, context, requirements),
  aiExecuteCommand: (command, cwd) => ipcRenderer.invoke('ai:executeCommand', command, cwd),
  aiInstallDependencies: (dependencies, type) => ipcRenderer.invoke('ai:installDependencies', dependencies, type),
  aiCreateProjectStructure: (structure) => ipcRenderer.invoke('ai:createProjectStructure', structure),
  aiGetProjectPlan: () => ipcRenderer.invoke('ai:getProjectPlan'),
  aiBuildProjectWithStreaming: (plan) => ipcRenderer.invoke('ai:buildProjectWithStreaming', plan),
  aiGetBuildStatus: () => ipcRenderer.invoke('ai:getBuildStatus'),
  aiExecuteSetupCommand: (setupCommand) => ipcRenderer.invoke('ai:executeSetupCommand', setupCommand),
  aiGetProjectStructure: () => ipcRenderer.invoke('ai:getProjectStructure'),
  aiGetOperationHistory: () => ipcRenderer.invoke('ai:getOperationHistory'),
  aiClearOperationHistory: () => ipcRenderer.invoke('ai:clearOperationHistory'),
  aiGetAgentStatus: () => ipcRenderer.invoke('ai:getAgentStatus'),
  
  // Session Management APIs
  aiGetSessionStats: () => ipcRenderer.invoke('ai:getSessionStats'),
  aiGetSessionContext: () => ipcRenderer.invoke('ai:getSessionContext'),
  aiClearSession: () => ipcRenderer.invoke('ai:clearSession'),

  // Safety and Undo Management APIs
  aiGetUndoStackInfo: () => ipcRenderer.invoke('ai:getUndoStackInfo'),
  aiGetUndoStackDetails: () => ipcRenderer.invoke('ai:getUndoStackDetails'),
  aiUndoLastAction: () => ipcRenderer.invoke('ai:undoLastAction'),
  aiUndoActionByIndex: (index) => ipcRenderer.invoke('ai:undoActionByIndex', index),
  aiUndoMultipleActions: (indices) => ipcRenderer.invoke('ai:undoMultipleActions', indices),
  aiClearUndoStack: () => ipcRenderer.invoke('ai:clearUndoStack'),
  aiCleanupBackups: () => ipcRenderer.invoke('ai:cleanupBackups'),
  aiConfirmActions: (approved) => ipcRenderer.invoke('ai:confirmActions', approved),
  aiEmergencyConfirm: () => ipcRenderer.invoke('ai:emergencyConfirm'),
  aiGetPendingActions: () => ipcRenderer.invoke('ai:getPendingActions'),

  // Codebase indexing operations
  codebaseGetIndexStats: () => ipcRenderer.invoke('codebase:getIndexStats'),
  codebaseSearch: (query, maxResults) => ipcRenderer.invoke('codebase:search', query, maxResults),
  codebaseGetContext: (query, maxChunks) => ipcRenderer.invoke('codebase:getContext', query, maxChunks),
  codebaseReindex: () => ipcRenderer.invoke('codebase:reindex'),

  // Event listeners for file system changes
  onFsChange: (callback) => {
    const listener = (_, payload) => callback(payload);
    ipcRenderer.on('fs:changed', listener);
    return () => ipcRenderer.removeListener('fs:changed', listener);
  },
  
  // Event listener for workspace changes
  onWorkspaceChange: (callback) => {
    const listener = (_, payload) => callback(payload);
    ipcRenderer.on('workspace:changed', listener);
    return () => ipcRenderer.removeListener('workspace:changed', listener);
  },
  
  // Event listener for codebase indexing
  onCodebaseIndexed: (callback) => {
    const listener = (_, payload) => callback(payload);
    ipcRenderer.on('codebase:indexed', listener);
    return () => ipcRenderer.removeListener('codebase:indexed', listener);
  },
  
  // Event listeners for terminal data
  onPtyData: (callback) => {
    const listener = (_, payload) => callback(payload);
    ipcRenderer.on('pty:data', listener);
    return () => ipcRenderer.removeListener('pty:data', listener);
  },
  
  onPtyExit: (callback) => {
    const listener = (_, payload) => callback(payload);
    ipcRenderer.on('pty:exit', listener);
    return () => ipcRenderer.removeListener('pty:exit', listener);
  },

  // AI streaming event listeners
  onAiPlanProgress: (callback) => {
    const listener = (_, payload) => callback(payload);
    ipcRenderer.on('ai:planProgress', listener);
    return () => ipcRenderer.removeListener('ai:planProgress', listener);
  },

  onAiCodeProgress: (callback) => {
    const listener = (_, payload) => callback(payload);
    ipcRenderer.on('ai:codeProgress', listener);
    return () => ipcRenderer.removeListener('ai:codeProgress', listener);
  },

  onAiBuildProgress: (callback) => {
    const listener = (_, payload) => callback(payload);
    ipcRenderer.on('ai:buildProgress', listener);
    return () => ipcRenderer.removeListener('ai:buildProgress', listener);
  },

  onAiOpenFile: (callback) => {
    const listener = (_, payload) => callback(payload);
    ipcRenderer.on('ai:openFile', listener);
    return () => ipcRenderer.removeListener('ai:openFile', listener);
  },

  onAiCodeStream: (callback) => {
    const listener = (_, payload) => callback(payload);
    ipcRenderer.on('ai:codeStream', listener);
    return () => ipcRenderer.removeListener('ai:codeStream', listener);
  },

  onAiFileWritten: (callback) => {
    const listener = (_, payload) => callback(payload);
    ipcRenderer.on('ai:fileWritten', listener);
    return () => ipcRenderer.removeListener('ai:fileWritten', listener);
  },
  
  onAiIndexingContext: (callback) => {
    const listener = (_, payload) => callback(payload);
    ipcRenderer.on('ai:indexingContext', listener);
    return () => ipcRenderer.removeListener('ai:indexingContext', listener);
  }
});

// Simple WebSocket compatibility layer for existing code
contextBridge.exposeInMainWorld('ws', {
  send: (data) => {
    console.log('WebSocket compatibility send:', data);
  },
  
  isConnected: () => true, // Always connected via IPC
  
  onMessage: (type, callback) => {
    console.log('WebSocket compatibility onMessage:', type);
    // Handle specific message types
    if (type === 'chat_response') {
      // Listen for chat responses and call the callback
      window.addEventListener('ai-chat-response', (event) => {
        callback({ response: event.detail.response });
      });
    } else if (type === 'chat_error') {
      window.addEventListener('ai-chat-error', (event) => {
        callback({ error: event.detail.error });
      });
    }
  },
  
  sendChatMessage: async (message, context, sessionId) => {
    try {
      const result = await window.api.aiChat(message, context);
      if (result.success) {
        // Dispatch success event
        const event = new CustomEvent('ai-chat-response', { 
          detail: { response: result.response, sessionId } 
        });
        window.dispatchEvent(event);
      } else {
        // Dispatch error event
        const event = new CustomEvent('ai-chat-error', { 
          detail: { error: result.error } 
        });
        window.dispatchEvent(event);
      }
    } catch (error) {
      console.error('Chat message error:', error);
      const event = new CustomEvent('ai-chat-error', { 
        detail: { error: error.message } 
      });
      window.dispatchEvent(event);
    }
  }
});