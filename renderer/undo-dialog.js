// Selective Undo Dialog Component
class UndoDialog {
  constructor() {
    this.dialog = null;
    this.resolvePromise = null;
    this.selectedIndices = new Set();
    this.init();
  }

  init() {
    // Create dialog element
    this.dialog = document.createElement('div');
    this.dialog.className = 'undo-dialog-overlay';
    this.dialog.innerHTML = `
      <div class="undo-dialog">
        <div class="undo-dialog-header">
          <h3>🔄 Selective Undo</h3>
          <button class="undo-dialog-close" onclick="undoDialog.close()">×</button>
        </div>
        
        <div class="undo-dialog-content">
          <div class="undo-description">
            <p>Select which actions you want to undo:</p>
          </div>
          
          <div class="undo-actions-list" id="undo-actions-list">
            <!-- Actions will be populated here -->
          </div>
          
          <div class="undo-summary">
            <div class="undo-selection-info">
              <span id="undo-selection-count">0</span> of <span id="undo-total-count">0</span> actions selected
            </div>
            <div class="undo-buttons">
              <button class="undo-btn undo-btn-select-all" onclick="undoDialog.selectAll()">
                Select All
              </button>
              <button class="undo-btn undo-btn-deselect-all" onclick="undoDialog.deselectAll()">
                Deselect All
              </button>
            </div>
          </div>
        </div>
        
        <div class="undo-dialog-actions">
          <button class="undo-btn undo-btn-cancel" onclick="undoDialog.cancel()">
            ❌ Cancel
          </button>
          <button class="undo-btn undo-btn-undo" onclick="undoDialog.confirm()" disabled>
            🔄 Undo Selected
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
      .undo-dialog-overlay {
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background: rgba(0, 0, 0, 0.7);
        display: none;
        z-index: 10001;
        backdrop-filter: blur(5px);
      }

      .undo-dialog {
        position: absolute;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        background: white;
        border-radius: 12px;
        box-shadow: 0 20px 40px rgba(0, 0, 0, 0.3);
        max-width: 700px;
        width: 90%;
        max-height: 80vh;
        overflow: hidden;
        display: flex;
        flex-direction: column;
      }

      .undo-dialog-header {
        background: linear-gradient(135deg, #007bff, #0056b3);
        color: white;
        padding: 20px;
        display: flex;
        justify-content: space-between;
        align-items: center;
      }

      .undo-dialog-header h3 {
        margin: 0;
        font-size: 1.4rem;
        font-weight: 600;
      }

      .undo-dialog-close {
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

      .undo-dialog-close:hover {
        background: rgba(255, 255, 255, 0.2);
      }

      .undo-dialog-content {
        padding: 20px;
        overflow-y: auto;
        flex: 1;
      }

      .undo-description {
        margin-bottom: 20px;
        color: #666;
      }

      .undo-actions-list {
        margin-bottom: 20px;
        max-height: 300px;
        overflow-y: auto;
        border: 1px solid #e9ecef;
        border-radius: 8px;
      }

      .undo-action-item {
        display: flex;
        align-items: center;
        padding: 12px 15px;
        border-bottom: 1px solid #f8f9fa;
        transition: background 0.2s;
      }

      .undo-action-item:last-child {
        border-bottom: none;
      }

      .undo-action-item:hover {
        background: #f8f9fa;
      }

      .undo-action-item.selected {
        background: #e3f2fd;
        border-left: 4px solid #007bff;
      }

      .undo-action-checkbox {
        margin-right: 12px;
        width: 18px;
        height: 18px;
        cursor: pointer;
      }

      .undo-action-info {
        flex: 1;
      }

      .undo-action-description {
        font-weight: 500;
        color: #333;
        margin-bottom: 4px;
      }

      .undo-action-details {
        font-size: 12px;
        color: #666;
      }

      .undo-action-type {
        display: inline-block;
        padding: 2px 6px;
        border-radius: 4px;
        font-size: 10px;
        font-weight: 600;
        text-transform: uppercase;
        margin-right: 8px;
      }

      .undo-action-type.create {
        background: #d4edda;
        color: #155724;
      }

      .undo-action-type.edit {
        background: #fff3cd;
        color: #856404;
      }

      .undo-action-type.delete {
        background: #f8d7da;
        color: #721c24;
      }

      .undo-summary {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 15px;
        background: #f8f9fa;
        border-radius: 8px;
        border: 1px solid #e9ecef;
      }

      .undo-selection-info {
        font-weight: 500;
        color: #495057;
      }

      .undo-buttons {
        display: flex;
        gap: 8px;
      }

      .undo-btn {
        padding: 6px 12px;
        border: 1px solid #dee2e6;
        border-radius: 4px;
        background: white;
        color: #495057;
        cursor: pointer;
        font-size: 12px;
        transition: all 0.2s;
      }

      .undo-btn:hover {
        background: #e9ecef;
        border-color: #adb5bd;
      }

      .undo-btn:disabled {
        opacity: 0.6;
        cursor: not-allowed;
      }

      .undo-btn-undo {
        background: #007bff;
        color: white;
        border-color: #007bff;
      }

      .undo-btn-undo:hover:not(:disabled) {
        background: #0056b3;
        border-color: #0056b3;
      }

      .undo-dialog-actions {
        padding: 20px;
        display: flex;
        gap: 15px;
        justify-content: flex-end;
        background: #f8f9fa;
        border-top: 1px solid #dee2e6;
      }

      .undo-btn-cancel {
        background: #6c757d;
        color: white;
        border-color: #6c757d;
      }

      .undo-btn-cancel:hover {
        background: #5a6268;
        border-color: #5a6268;
      }
    `;
    document.head.appendChild(style);
  }

  show(undoStackDetails) {
    return new Promise((resolve) => {
      this.resolvePromise = resolve;
      this.selectedIndices.clear();
      this.populateDialog(undoStackDetails);
      this.dialog.style.display = 'block';
    });
  }

  populateDialog(undoStackDetails) {
    const actionsList = document.getElementById('undo-actions-list');
    const selectionCount = document.getElementById('undo-selection-count');
    const totalCount = document.getElementById('undo-total-count');
    const undoButton = document.querySelector('.undo-btn-undo');

    // Clear existing content
    actionsList.innerHTML = '';
    
    // Set total count
    totalCount.textContent = undoStackDetails.length;

    // Populate actions
    undoStackDetails.forEach((item, index) => {
      const actionItem = document.createElement('div');
      actionItem.className = 'undo-action-item';
      actionItem.dataset.index = index;
      
      const actionType = this.getActionTypeClass(item.action.type);
      
      actionItem.innerHTML = `
        <input type="checkbox" class="undo-action-checkbox" data-index="${index}">
        <div class="undo-action-info">
          <div class="undo-action-description">${item.description}</div>
          <div class="undo-action-details">
            <span class="undo-action-type ${actionType}">${item.action.type}</span>
            <span>${new Date(item.timestamp).toLocaleString()}</span>
          </div>
        </div>
      `;

      // Add click handler
      const checkbox = actionItem.querySelector('.undo-action-checkbox');
      checkbox.addEventListener('change', (e) => {
        this.toggleSelection(index, e.target.checked);
      });

      actionItem.addEventListener('click', (e) => {
        if (e.target !== checkbox) {
          checkbox.checked = !checkbox.checked;
          this.toggleSelection(index, checkbox.checked);
        }
      });

      actionsList.appendChild(actionItem);
    });

    // Update selection count
    this.updateSelectionCount();
  }

  getActionTypeClass(actionType) {
    switch (actionType) {
      case 'create_file':
        return 'create';
      case 'edit_file':
        return 'edit';
      case 'delete_file':
        return 'delete';
      default:
        return 'edit';
    }
  }

  toggleSelection(index, selected) {
    if (selected) {
      this.selectedIndices.add(index);
    } else {
      this.selectedIndices.delete(index);
    }
    this.updateSelectionCount();
  }

  selectAll() {
    const checkboxes = document.querySelectorAll('.undo-action-checkbox');
    checkboxes.forEach((checkbox, index) => {
      checkbox.checked = true;
      this.selectedIndices.add(index);
    });
    this.updateSelectionCount();
  }

  deselectAll() {
    const checkboxes = document.querySelectorAll('.undo-action-checkbox');
    checkboxes.forEach((checkbox, index) => {
      checkbox.checked = false;
      this.selectedIndices.delete(index);
    });
    this.updateSelectionCount();
  }

  updateSelectionCount() {
    const selectionCount = document.getElementById('undo-selection-count');
    const undoButton = document.querySelector('.undo-btn-undo');
    
    selectionCount.textContent = this.selectedIndices.size;
    undoButton.disabled = this.selectedIndices.size === 0;
  }

  confirm() {
    if (this.resolvePromise) {
      const selectedIndices = Array.from(this.selectedIndices);
      this.resolvePromise(selectedIndices);
      this.close();
    }
  }

  cancel() {
    if (this.resolvePromise) {
      this.resolvePromise([]);
      this.close();
    }
  }

  close() {
    this.dialog.style.display = 'none';
    this.resolvePromise = null;
  }
}

// Global instance
window.undoDialog = new UndoDialog();

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
  module.exports = UndoDialog;
}
