const crypto = require('crypto');

class SessionManager {
  constructor() {
    this.sessions = new Map();
    this.activeSessionId = null;
  }

  // Create a new session
  createSession(workspacePath) {
    const sessionId = this.generateSessionId();
    const session = {
      id: sessionId,
      workspacePath,
      createdAt: new Date().toISOString(),
      lastActivity: new Date().toISOString(),
      context: {
        lastRequest: null,
        lastFilesModified: [],
        lastCodeChunks: [],
        operationHistory: [],
        fileDiffs: new Map(),
        sessionSummary: ''
      },
      memory: {
        recentOperations: [],
        fileStates: new Map(),
        contextChunks: new Map()
      }
    };
    
    this.sessions.set(sessionId, session);
    this.activeSessionId = sessionId;
    
    console.log(`[SessionManager] Created session ${sessionId} for workspace: ${workspacePath}`);
    return sessionId;
  }

  // Get current active session
  getActiveSession() {
    if (!this.activeSessionId) return null;
    return this.sessions.get(this.activeSessionId);
  }

  // Update session with new operation
  updateSession(operationId, request, analysis, actions, context) {
    const session = this.getActiveSession();
    if (!session) return;

    session.lastActivity = new Date().toISOString();
    
    // Update context
    session.context.lastRequest = request;
    session.context.lastFilesModified = actions
      .filter(action => action.executed && ['create_file', 'edit_file'].includes(action.type))
      .map(action => action.path);
    
    session.context.lastCodeChunks = context.relevantChunks || [];
    
    // Store operation in history
    const operation = {
      id: operationId,
      timestamp: new Date().toISOString(),
      request,
      analysis,
      actions: actions.filter(a => a.executed),
      context: {
        filesAnalyzed: context.filesAnalyzed || 0,
        chunksRetrieved: context.chunksRetrieved || 0,
        dependenciesFound: context.dependenciesFound || 0
      }
    };
    
    session.context.operationHistory.push(operation);
    
    // Keep only last 10 operations for memory
    if (session.context.operationHistory.length > 10) {
      session.context.operationHistory.shift();
    }
    
    // Update session summary
    session.context.sessionSummary = this.generateSessionSummary(session);
    
    console.log(`[SessionManager] Updated session ${session.id} with operation ${operationId}`);
  }

  // Generate session summary for context
  generateSessionSummary(session) {
    const recentOps = session.context.operationHistory.slice(-3);
    if (recentOps.length === 0) return 'No recent operations';
    
    const summaries = recentOps.map(op => {
      const actionTypes = [...new Set(op.actions.map(a => a.type))];
      const files = [...new Set(op.actions.map(a => a.path))];
      return `${op.request} → ${actionTypes.join(', ')} on ${files.join(', ')}`;
    });
    
    return summaries.join('; ');
  }

  // Get context for incremental prompting
  getIncrementalContext(request) {
    const session = this.getActiveSession();
    if (!session) return null;

    const lastOperation = session.context.operationHistory[session.context.operationHistory.length - 1];
    if (!lastOperation) return null;

    // Analyze if this is a follow-up request
    const isFollowUp = this.isFollowUpRequest(request, lastOperation.request);
    
    if (isFollowUp) {
      return {
        type: 'follow_up',
        lastRequest: lastOperation.request,
        lastFilesModified: session.context.lastFilesModified,
        lastCodeChunks: session.context.lastCodeChunks,
        sessionSummary: session.context.sessionSummary,
        operationHistory: session.context.operationHistory.slice(-3)
      };
    }

    return {
      type: 'new_request',
      sessionSummary: session.context.sessionSummary
    };
  }

  // Detect if request is a follow-up to previous request
  isFollowUpRequest(currentRequest, lastRequest) {
    const followUpKeywords = [
      'make it', 'make the', 'make this', 'make that',
      'add', 'add more', 'add some', 'add a',
      'improve', 'enhance', 'better', 'more',
      'fix', 'fix the', 'fix this',
      'update', 'update the', 'update this',
      'change', 'modify', 'adjust',
      'it', 'this', 'that', 'them', 'those'
    ];
    
    const lowerCurrent = currentRequest.toLowerCase();
    const lowerLast = lastRequest.toLowerCase();
    
    // Check for follow-up keywords
    const hasFollowUpKeyword = followUpKeywords.some(keyword => 
      lowerCurrent.includes(keyword)
    );
    
    // Check for pronoun references
    const hasPronoun = /\b(it|this|that|them|those)\b/i.test(currentRequest);
    
    // Check for context continuity
    const hasContextContinuity = this.hasContextContinuity(currentRequest, lastRequest);
    
    return hasFollowUpKeyword || hasPronoun || hasContextContinuity;
  }

  // Check if requests have context continuity
  hasContextContinuity(currentRequest, lastRequest) {
    const currentWords = currentRequest.toLowerCase().split(/\s+/);
    const lastWords = lastRequest.toLowerCase().split(/\s+/);
    
    // Find common words (excluding common words)
    const commonWords = ['the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by'];
    const currentUnique = currentWords.filter(word => !commonWords.includes(word) && word.length > 2);
    const lastUnique = lastWords.filter(word => !commonWords.includes(word) && word.length > 2);
    
    const commonTerms = currentUnique.filter(word => lastUnique.includes(word));
    return commonTerms.length >= 2; // At least 2 common terms
  }

  // Store file state for diff tracking
  storeFileState(filePath, content) {
    const session = this.getActiveSession();
    if (!session) return;

    session.memory.fileStates.set(filePath, {
      content,
      timestamp: new Date().toISOString(),
      hash: this.generateContentHash(content)
    });
  }

  // Get file diff for incremental updates
  getFileDiff(filePath, newContent) {
    const session = this.getActiveSession();
    if (!session) return null;

    const oldState = session.memory.fileStates.get(filePath);
    if (!oldState) return null;

    return {
      filePath,
      oldContent: oldState.content,
      newContent,
      diff: this.generateDiff(oldState.content, newContent)
    };
  }

  // Generate content hash
  generateContentHash(content) {
    return crypto.createHash('md5').update(content).digest('hex');
  }

  // Simple diff generation (in production, use a proper diff library)
  generateDiff(oldContent, newContent) {
    const oldLines = oldContent.split('\n');
    const newLines = newContent.split('\n');
    
    const diff = {
      added: [],
      removed: [],
      modified: []
    };
    
    // Simple line-by-line comparison
    const maxLines = Math.max(oldLines.length, newLines.length);
    
    for (let i = 0; i < maxLines; i++) {
      const oldLine = oldLines[i] || '';
      const newLine = newLines[i] || '';
      
      if (oldLine !== newLine) {
        if (oldLine && newLine) {
          diff.modified.push({ line: i + 1, old: oldLine, new: newLine });
        } else if (oldLine) {
          diff.removed.push({ line: i + 1, content: oldLine });
        } else if (newLine) {
          diff.added.push({ line: i + 1, content: newLine });
        }
      }
    }
    
    return diff;
  }

  // Get session context for AI prompting
  getSessionContext() {
    const session = this.getActiveSession();
    if (!session) return null;

    return {
      sessionId: session.id,
      workspacePath: session.workspacePath,
      lastActivity: session.lastActivity,
      context: session.context,
      memory: {
        recentOperations: session.context.operationHistory.slice(-3),
        fileStates: Array.from(session.memory.fileStates.entries())
      }
    };
  }

  // Clear session
  clearSession(sessionId) {
    if (sessionId) {
      this.sessions.delete(sessionId);
      if (this.activeSessionId === sessionId) {
        this.activeSessionId = null;
      }
    } else {
      this.sessions.clear();
      this.activeSessionId = null;
    }
    
    console.log(`[SessionManager] Cleared session ${sessionId || 'all'}`);
  }

  // Generate session ID
  generateSessionId() {
    return `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  // Get session statistics
  getSessionStats() {
    const session = this.getActiveSession();
    if (!session) return null;

    return {
      sessionId: session.id,
      createdAt: session.createdAt,
      lastActivity: session.lastActivity,
      totalOperations: session.context.operationHistory.length,
      totalFilesModified: session.context.lastFilesModified.length,
      totalCodeChunks: session.context.lastCodeChunks.length,
      sessionSummary: session.context.sessionSummary
    };
  }
}

module.exports = SessionManager;
