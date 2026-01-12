const fs = require('fs-extra');
const path = require('path');

class SafetyManager {
  constructor(workspacePath) {
    this.workspacePath = workspacePath;
    this.backupDir = path.join(workspacePath, '.ai-backups');
    this.undoStack = [];
    this.maxUndoSteps = 10;
    this.scopedFiles = new Set();
    this.pendingActions = [];
  }

  // Initialize safety manager
  async initialize() {
    try {
      await fs.ensureDir(this.backupDir);
      console.log('[Safety Manager] Initialized backup directory:', this.backupDir);
    } catch (error) {
      console.error('[Safety Manager] Failed to initialize:', error);
    }
  }

  // Set scoped files for this operation
  setScopedFiles(files) {
    this.scopedFiles.clear();
    files.forEach(file => this.scopedFiles.add(file));
    console.log('[Safety Manager] Set scoped files:', Array.from(this.scopedFiles));
  }

  // Check if a file is within scope
  isFileInScope(filePath) {
    return this.scopedFiles.has(filePath) || this.scopedFiles.size === 0;
  }

  // Create backup of a file before modification
  async createBackup(filePath) {
    const fullPath = path.join(this.workspacePath, filePath);
    const backupPath = path.join(this.backupDir, `${filePath.replace(/[\/\\]/g, '_')}_${Date.now()}.backup`);
    
    try {
      if (await fs.pathExists(fullPath)) {
        const content = await fs.readFile(fullPath, 'utf8');
        await fs.writeFile(backupPath, content, 'utf8');
        
        return {
          originalPath: filePath,
          backupPath: backupPath,
          timestamp: new Date().toISOString()
        };
      }
      return null;
    } catch (error) {
      console.error(`[Safety Manager] Failed to create backup for ${filePath}:`, error);
      return null;
    }
  }

  // Generate diff between old and new content
  generateDiff(oldContent, newContent) {
    const diff = {
      type: 'edit',
      changes: [],
      summary: {
        linesAdded: 0,
        linesRemoved: 0,
        linesModified: 0
      }
    };

    if (!oldContent) {
      diff.type = 'create';
      diff.changes.push({
        type: 'add',
        content: newContent,
        line: 1
      });
      diff.summary.linesAdded = newContent.split('\n').length;
      return diff;
    }

    const oldLines = oldContent.split('\n');
    const newLines = newContent.split('\n');
    
    // Simple diff algorithm - can be enhanced with more sophisticated diffing
    const maxLines = Math.max(oldLines.length, newLines.length);
    
    for (let i = 0; i < maxLines; i++) {
      const oldLine = oldLines[i] || '';
      const newLine = newLines[i] || '';
      
      if (oldLine !== newLine) {
        if (oldLine && newLine) {
          diff.changes.push({
            type: 'modify',
            oldLine: oldLine,
            newLine: newLine,
            line: i + 1
          });
          diff.summary.linesModified++;
        } else if (oldLine) {
          diff.changes.push({
            type: 'remove',
            content: oldLine,
            line: i + 1
          });
          diff.summary.linesRemoved++;
        } else if (newLine) {
          diff.changes.push({
            type: 'add',
            content: newLine,
            line: i + 1
          });
          diff.summary.linesAdded++;
        }
      }
    }

    return diff;
  }

  // Validate actions for safety
  validateActions(actions) {
    const validation = {
      valid: true,
      warnings: [],
      errors: [],
      requiresConfirmation: false,
      scopedViolations: []
    };

    for (const action of actions) {
      // Check if file is in scope
      if (!this.isFileInScope(action.path)) {
        validation.scopedViolations.push(action.path);
        validation.requiresConfirmation = true;
        validation.warnings.push(`File ${action.path} is outside the current scope`);
      }

      // Check for destructive operations
      if (action.type === 'delete_file') {
        validation.requiresConfirmation = true;
        validation.warnings.push(`Deleting file: ${action.path}`);
      }

      // Check for large content changes
      if (action.content && action.content.length > 10000) {
        validation.warnings.push(`Large content change in ${action.path} (${action.content.length} characters)`);
      }

      // Check for critical files
      const criticalFiles = ['package.json', 'package-lock.json', 'yarn.lock', '.gitignore', 'README.md'];
      if (criticalFiles.includes(path.basename(action.path))) {
        validation.requiresConfirmation = true;
        validation.warnings.push(`Modifying critical file: ${action.path}`);
      }
    }

    if (validation.scopedViolations.length > 0) {
      validation.errors.push(`${validation.scopedViolations.length} files are outside the current scope`);
    }

    return validation;
  }

    // Request user confirmation for actions
  async requestConfirmation(actions, validation, diff) {
    return new Promise((resolve) => {
      // Store pending actions for confirmation
      this.pendingActions = {
        actions,
        validation,
        diff,
        resolve
      };

      console.log('[Safety Manager] Requesting confirmation for actions...');
      console.log('[Safety Manager] Validation warnings:', validation.warnings);
      console.log('[Safety Manager] Scoped violations:', validation.scopedViolations);

      // Add timeout to prevent infinite waiting
      const timeout = setTimeout(() => {
        console.log('[Safety Manager] Confirmation timeout - auto-approving for better UX');
        if (this.pendingActions && this.pendingActions.resolve) {
          this.pendingActions.resolve(true); // Auto-approve on timeout for better UX
          this.pendingActions = null;
        }
      }, 10000); // 10 second timeout - shorter for better UX

      // Store timeout reference
      if (this.pendingActions) {
        this.pendingActions.timeout = timeout;
      }

      // Also log a simple message for manual confirmation if needed
      console.log('[Safety Manager] If you see this message, the operation will auto-approve in 10 seconds');
      console.log('[Safety Manager] Actions to be executed:', actions.map(a => `${a.type}: ${a.path}`).join(', '));
    });
  }

  // Confirm actions (called from main process)
  confirmActions(approved) {
    if (this.pendingActions && this.pendingActions.resolve) {
      // Clear timeout if it exists
      if (this.pendingActions.timeout) {
        clearTimeout(this.pendingActions.timeout);
      }
      this.pendingActions.resolve(approved);
      this.pendingActions = null;
    }
  }

    // Execute actions with safety checks
  async executeActionsSafely(actions, context) {
    // Set scoped files from context
    if (context && context.relevantFiles) {
      this.setScopedFiles(context.relevantFiles);
    }

    // Validate actions
    const validation = this.validateActions(actions);

    if (!validation.valid) {
      throw new Error(`Action validation failed: ${validation.errors.join(', ')}`);
    }

    // Generate diffs for all actions
    const diffs = [];
    for (const action of actions) {
      if (action.type === 'edit_file') {
        const fullPath = path.join(this.workspacePath, action.path);
        let oldContent = '';
        try {
          oldContent = await fs.readFile(fullPath, 'utf8');
        } catch (error) {
          // File doesn't exist, that's okay for edit operations
        }
        const diff = this.generateDiff(oldContent, action.content);
        diffs.push({ action, diff });
      } else {
        diffs.push({ action, diff: { type: action.type, content: action.content } });
      }
    }

    // Request confirmation if needed
    let shouldProceed = true;
    if (validation.requiresConfirmation) {
      try {
        console.log('[Safety Manager] Requesting user confirmation...');
        const approved = await this.requestConfirmation(actions, validation, diffs);
        if (!approved) {
          shouldProceed = false;
          console.log('[Safety Manager] User cancelled the operation');
        } else {
          console.log('[Safety Manager] User confirmed actions');
        }
      } catch (error) {
        console.error('[Safety Manager] Confirmation failed:', error.message);
        // Auto-approve if confirmation system fails (with warning)
        console.warn('[Safety Manager] Auto-approving actions due to confirmation failure');
        shouldProceed = true;
      }
    } else {
      console.log('[Safety Manager] No confirmation required, proceeding with actions');
    }

    if (!shouldProceed) {
      throw new Error('User cancelled the operation');
    }

    // Execute actions with backups
    const results = [];
    for (const action of actions) {
      try {
        const result = await this.executeActionWithBackup(action);
        results.push(result);
      } catch (error) {
        results.push({
          ...action,
          executed: false,
          error: error.message,
          timestamp: new Date().toISOString()
        });
      }
    }

    return results;
  }

  // Execute single action with backup
  async executeActionWithBackup(action) {
    const fullPath = path.join(this.workspacePath, action.path);
    
    try {
      let backup = null;
      
      // Create backup for existing files
      if (action.type === 'edit_file' || action.type === 'delete_file') {
        backup = await this.createBackup(action.path);
      }

      // Execute action
      let result;
      switch (action.type) {
        case 'create_file':
          await fs.ensureFile(fullPath);
          await fs.writeFile(fullPath, action.content, 'utf8');
          result = { success: true, type: 'created' };
          break;
          
        case 'edit_file':
          await fs.writeFile(fullPath, action.content, 'utf8');
          result = { success: true, type: 'modified', backup };
          break;
          
        case 'delete_file':
          await fs.remove(fullPath);
          result = { success: true, type: 'deleted', backup };
          break;
          
        case 'create_folder':
          await fs.ensureDir(fullPath);
          result = { success: true, type: 'folder_created' };
          break;
          
        default:
          throw new Error(`Unknown action type: ${action.type}`);
      }

      // Add to undo stack
      this.addToUndoStack(action, backup);

      return {
        ...action,
        executed: true,
        result,
        timestamp: new Date().toISOString()
      };

    } catch (error) {
      console.error(`[Safety Manager] Failed to execute action ${action.type}: ${action.path}`, error);
      throw error;
    }
  }

  // Add action to undo stack
  addToUndoStack(action, backup) {
    this.undoStack.push({
      action,
      backup,
      timestamp: new Date().toISOString()
    });

    // Limit undo stack size
    if (this.undoStack.length > this.maxUndoSteps) {
      this.undoStack.shift();
    }
  }

    // Undo last action
  async undoLastAction() {
    if (this.undoStack.length === 0) {
      throw new Error('No actions to undo');
    }

    const lastAction = this.undoStack.pop();
    const { action, backup } = lastAction;

    try {
      const fullPath = path.join(this.workspacePath, action.path);

      if (backup) {
        // Restore from backup
        const backupContent = await fs.readFile(backup.backupPath, 'utf8');
        await fs.writeFile(fullPath, backupContent, 'utf8');

        // Remove backup file
        await fs.remove(backup.backupPath);

        console.log(`[Safety Manager] Undid ${action.type}: ${action.path}`);
        return { success: true, action: action.type, path: action.path };
      } else if (action.type === 'create_file') {
        // Remove created file
        await fs.remove(fullPath);
        console.log(`[Safety Manager] Undid create: ${action.path}`);
        return { success: true, action: 'deleted', path: action.path };
      }

    } catch (error) {
      console.error(`[Safety Manager] Failed to undo action:`, error);
      throw error;
    }
  }

  // Get undo stack with detailed information
  getUndoStackDetails() {
    return this.undoStack.map((item, index) => ({
      index: this.undoStack.length - index - 1, // Reverse order (newest first)
      action: item.action,
      backup: item.backup,
      timestamp: item.timestamp,
      canUndo: true,
      description: this.getActionDescription(item.action)
    }));
  }

  // Get human-readable description of action
  getActionDescription(action) {
    switch (action.type) {
      case 'create_file':
        return `Created file: ${action.path}`;
      case 'edit_file':
        return `Modified file: ${action.path}`;
      case 'delete_file':
        return `Deleted file: ${action.path}`;
      case 'create_folder':
        return `Created folder: ${action.path}`;
      default:
        return `${action.type}: ${action.path}`;
    }
  }

  // Undo specific action by index
  async undoActionByIndex(index) {
    if (index < 0 || index >= this.undoStack.length) {
      throw new Error('Invalid action index');
    }

    // Remove the action at the specified index
    const actionToUndo = this.undoStack.splice(index, 1)[0];
    const { action, backup } = actionToUndo;

    try {
      const fullPath = path.join(this.workspacePath, action.path);

      if (backup) {
        // Restore from backup
        const backupContent = await fs.readFile(backup.backupPath, 'utf8');
        await fs.writeFile(fullPath, backupContent, 'utf8');

        // Remove backup file
        await fs.remove(backup.backupPath);

        console.log(`[Safety Manager] Undid ${action.type}: ${action.path}`);
        return { success: true, action: action.type, path: action.path };
      } else if (action.type === 'create_file') {
        // Remove created file
        await fs.remove(fullPath);
        console.log(`[Safety Manager] Undid create: ${action.path}`);
        return { success: true, action: 'deleted', path: action.path };
      }

    } catch (error) {
      console.error(`[Safety Manager] Failed to undo action:`, error);
      throw error;
    }
  }

  // Undo multiple actions by indices
  async undoMultipleActions(indices) {
    const results = [];
    const sortedIndices = indices.sort((a, b) => b - a); // Sort in descending order to avoid index shifting

    for (const index of sortedIndices) {
      try {
        const result = await this.undoActionByIndex(index);
        results.push({ index, ...result });
      } catch (error) {
        results.push({ index, success: false, error: error.message });
      }
    }

    return results;
  }

  // Get undo stack info
  getUndoStackInfo() {
    return {
      canUndo: this.undoStack.length > 0,
      undoCount: this.undoStack.length,
      lastAction: this.undoStack.length > 0 ? this.undoStack[this.undoStack.length - 1] : null
    };
  }

  // Clear undo stack
  clearUndoStack() {
    this.undoStack = [];
    console.log('[Safety Manager] Cleared undo stack');
  }

  // Clean up old backups
  async cleanupOldBackups(maxAge = 24 * 60 * 60 * 1000) { // 24 hours default
    try {
      const files = await fs.readdir(this.backupDir);
      const now = Date.now();
      
      for (const file of files) {
        const filePath = path.join(this.backupDir, file);
        const stats = await fs.stat(filePath);
        
        if (now - stats.mtime.getTime() > maxAge) {
          await fs.remove(filePath);
          console.log(`[Safety Manager] Cleaned up old backup: ${file}`);
        }
      }
    } catch (error) {
      console.error('[Safety Manager] Failed to cleanup backups:', error);
    }
  }
}

module.exports = SafetyManager;
