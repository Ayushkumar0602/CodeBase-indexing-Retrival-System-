// Safety Dialog Component for AI Agent Actions
class SafetyDialog {
  constructor() {
    this.dialog = null;
    this.resolvePromise = null;
    this.init();
  }

  init() {
    // Create dialog element
    this.dialog = document.createElement('div');
    this.dialog.className = 'safety-dialog-overlay';
    this.dialog.innerHTML = `
      <div class="safety-dialog">
        <div class="safety-dialog-header">
          <h3>⚠️ AI Action Confirmation Required</h3>
          <button class="safety-dialog-close" onclick="safetyDialog.close()">×</button>
        </div>
        
        <div class="safety-dialog-content">
          <div class="safety-warnings">
            <h4>⚠️ Safety Warnings:</h4>
            <ul id="safety-warnings-list"></ul>
          </div>
          
          <div class="safety-diffs">
            <h4>📝 Proposed Changes:</h4>
            <div id="safety-diffs-list"></div>
          </div>
          
          <div class="safety-scope">
            <h4>🎯 Scope Information:</h4>
            <div id="safety-scope-info"></div>
          </div>
        </div>
        
        <div class="safety-dialog-actions">
          <button class="safety-btn safety-btn-cancel" onclick="safetyDialog.cancel()">
            ❌ Cancel Operation
          </button>
          <button class="safety-btn safety-btn-confirm" onclick="safetyDialog.confirm()">
            ✅ Confirm Changes
          </button>
        </div>
      </div>
    `;

    // Add styles
    this.addStyles();
    
    // Add to document
    document.body.appendChild(this.dialog);
  }

  addStyles() {
    const style = document.createElement('style');
    style.textContent = `
      .safety-dialog-overlay {
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background: rgba(0, 0, 0, 0.7);
        display: none;
        z-index: 10000;
        backdrop-filter: blur(5px);
      }

      .safety-dialog {
        position: absolute;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        background: white;
        border-radius: 12px;
        box-shadow: 0 20px 40px rgba(0, 0, 0, 0.3);
        max-width: 800px;
        width: 90%;
        max-height: 80vh;
        overflow: hidden;
        display: flex;
        flex-direction: column;
      }

      .safety-dialog-header {
        background: linear-gradient(135deg, #ff6b6b, #ee5a24);
        color: white;
        padding: 20px;
        display: flex;
        justify-content: space-between;
        align-items: center;
      }

      .safety-dialog-header h3 {
        margin: 0;
        font-size: 1.4rem;
        font-weight: 600;
      }

      .safety-dialog-close {
        background: none;
        border: none;
        color: white;
        font-size: 24px;
        cursor: pointer;
        padding: 0;
        width: 30px;
        height: 30px;
        display: flex;
        align-items: center;
        justify-content: center;
        border-radius: 50%;
        transition: background 0.2s;
      }

      .safety-dialog-close:hover {
        background: rgba(255, 255, 255, 0.2);
      }

      .safety-dialog-content {
        padding: 20px;
        overflow-y: auto;
        flex: 1;
      }

      .safety-warnings {
        margin-bottom: 20px;
        padding: 15px;
        background: #fff3cd;
        border: 1px solid #ffeaa7;
        border-radius: 8px;
      }

      .safety-warnings h4 {
        margin: 0 0 10px 0;
        color: #856404;
      }

      .safety-warnings ul {
        margin: 0;
        padding-left: 20px;
      }

      .safety-warnings li {
        color: #856404;
        margin-bottom: 5px;
      }

      .safety-diffs {
        margin-bottom: 20px;
      }

      .safety-diffs h4 {
        margin: 0 0 15px 0;
        color: #333;
      }

      .diff-item {
        background: #f8f9fa;
        border: 1px solid #e9ecef;
        border-radius: 8px;
        margin-bottom: 15px;
        overflow: hidden;
      }

      .diff-header {
        background: #e9ecef;
        padding: 10px 15px;
        font-weight: 600;
        color: #495057;
        border-bottom: 1px solid #dee2e6;
      }

      .diff-content {
        padding: 15px;
        font-family: 'Monaco', 'Menlo', 'Ubuntu Mono', monospace;
        font-size: 12px;
        line-height: 1.4;
        max-height: 200px;
        overflow-y: auto;
        white-space: pre-wrap;
      }

      .diff-line {
        padding: 2px 0;
      }

      .diff-line.added {
        background: #d4edda;
        color: #155724;
      }

      .diff-line.removed {
        background: #f8d7da;
        color: #721c24;
      }

      .diff-line.modified {
        background: #fff3cd;
        color: #856404;
      }

      .safety-scope {
        padding: 15px;
        background: #e3f2fd;
        border: 1px solid #bbdefb;
        border-radius: 8px;
      }

      .safety-scope h4 {
        margin: 0 0 10px 0;
        color: #1976d2;
      }

      .scope-info {
        color: #1976d2;
        font-size: 14px;
      }

      .safety-dialog-actions {
        padding: 20px;
        display: flex;
        gap: 15px;
        justify-content: flex-end;
        background: #f8f9fa;
        border-top: 1px solid #dee2e6;
      }

      .safety-btn {
        padding: 12px 24px;
        border: none;
        border-radius: 6px;
        font-size: 14px;
        font-weight: 600;
        cursor: pointer;
        transition: all 0.2s;
        min-width: 120px;
      }

      .safety-btn-cancel {
        background: #6c757d;
        color: white;
      }

      .safety-btn-cancel:hover {
        background: #5a6268;
      }

      .safety-btn-confirm {
        background: #28a745;
        color: white;
      }

      .safety-btn-confirm:hover {
        background: #218838;
      }

      .safety-btn:disabled {
        opacity: 0.6;
        cursor: not-allowed;
      }
    `;
    document.head.appendChild(style);
  }

  show(pendingActions) {
    return new Promise((resolve) => {
      this.resolvePromise = resolve;
      this.populateDialog(pendingActions);
      this.dialog.style.display = 'block';
    });
  }

  populateDialog(pendingActions) {
    const { actions, validation, diff } = pendingActions;

    // Populate warnings
    const warningsList = document.getElementById('safety-warnings-list');
    warningsList.innerHTML = '';
    validation.warnings.forEach(warning => {
      const li = document.createElement('li');
      li.textContent = warning;
      warningsList.appendChild(li);
    });

    // Populate diffs
    const diffsList = document.getElementById('safety-diffs-list');
    diffsList.innerHTML = '';
    diff.forEach(({ action, diff }) => {
      const diffItem = document.createElement('div');
      diffItem.className = 'diff-item';
      
      const diffHeader = document.createElement('div');
      diffHeader.className = 'diff-header';
      diffHeader.textContent = `${action.type.toUpperCase()}: ${action.path}`;
      
      const diffContent = document.createElement('div');
      diffContent.className = 'diff-content';
      
      if (diff.type === 'create') {
        diffContent.innerHTML = `<div class="diff-line added">+ ${action.content}</div>`;
      } else if (diff.type === 'edit') {
        diff.changes.forEach(change => {
          const line = document.createElement('div');
          line.className = `diff-line ${change.type}`;
          
          if (change.type === 'add') {
            line.textContent = `+ ${change.content}`;
          } else if (change.type === 'remove') {
            line.textContent = `- ${change.content}`;
          } else if (change.type === 'modify') {
            line.textContent = `- ${change.oldLine}\n+ ${change.newLine}`;
          }
          
          diffContent.appendChild(line);
        });
      }
      
      diffItem.appendChild(diffHeader);
      diffItem.appendChild(diffContent);
      diffsList.appendChild(diffItem);
    });

    // Populate scope info
    const scopeInfo = document.getElementById('safety-scope-info');
    if (validation.scopedViolations.length > 0) {
      scopeInfo.innerHTML = `
        <div class="scope-info">
          <strong>⚠️ Files outside scope:</strong><br>
          ${validation.scopedViolations.join(', ')}
        </div>
      `;
    } else {
      scopeInfo.innerHTML = `
        <div class="scope-info">
          ✅ All files are within the current scope
        </div>
      `;
    }
  }

  confirm() {
    if (this.resolvePromise) {
      this.resolvePromise(true);
      this.close();
    }
  }

  cancel() {
    if (this.resolvePromise) {
      this.resolvePromise(false);
      this.close();
    }
  }

  close() {
    this.dialog.style.display = 'none';
    this.resolvePromise = null;
  }
}

// Global instance
window.safetyDialog = new SafetyDialog();

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
  module.exports = SafetyDialog;
}
