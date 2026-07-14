# Main New — Technical Documentation

## Overview
`main-new.js` serves as the core **Electron Main Process** entry point for the "Whizan" IDE. It acts as the orchestration layer between the Chromium-based renderer (UI) and the underlying Node.js system environment. Its primary responsibilities include managing application lifecycle, handling cross-process communication (IPC), providing low-level filesystem access, spawning pseudo-terminals (PTY), and proxying requests to external AI model providers.

## Architecture
This file resides at the root of the Electron main process. 
*   **Upstream:** Consumes `preload.js` (for secure IPC context exposure) and interfaces with the underlying host operating system via Node.js modules (`fs-extra`, `node-pty`, `child_process`).
*   **Downstream:** Serves as the back-end host for the Renderer process (`renderer/index.html`).
*   **Dependencies:** Uses `axios` for external API communication, `chokidar` for filesystem observation, and `node-pty` for terminal emulation.

## Design Principles
*   **Single Responsibility:** The module delegates UI rendering to the Renderer process while maintaining control over system-level sensitive operations (filesystem access, process management).
*   **Resilient API Consumption:** Implements a "Key Rotation" pattern for AI service providers. When an API returns a 429 (Rate Limit) or 401 (Unauthorized), the module automatically cycles through predefined key arrays to maintain uptime.
*   **Abstraction of Complexity:** Provides a unified `ipcMain` interface, shielding the frontend from low-level implementation details like PTY lifecycle management or recursive file stat mapping.

## API Reference

### IPC Handlers (Renderer to Main)
*   `select-folder()`: Opens native directory picker. Returns the chosen path.
*   `read-file(filePath)`: Reads file content via `fs-extra`. Returns `{success, content}` or `{success, error}`.
*   `write-file(filePath, content)`: Persists data to disk.
*   `create-terminal(terminalId, shell)`: Spawns a new PTY instance mapped to a specific `terminalId`.
*   `send-ai-message(message, context)`: Proxies requests to either OpenRouter or Gemini APIs based on the active model configuration.

### Internal State Management
*   `terminalIdToPty`: A `Map<string, IPty>` used to track active terminal processes to prevent memory leaks and manage lifecycle.
*   `AI_MODELS`: A lookup table defining model metadata (Provider, Endpoint, Model ID).

## Internal Logic
1.  **AI Proxying:** When a message is sent to the AI, the code determines the provider (`OpenRouter` vs `Google`). It wraps the request in a standardized system-prompt structure.
2.  **Key Rotation Algorithm:** In `sendOpenRouterMessage` and `sendGeminiMessage`, a `catch` block checks for specific HTTP status codes. If a failure occurs, the index is incremented (modulo the array length) and the request is retried recursively once with the next credential.
3.  **Terminal Emulation:** The module treats terminals as long-lived processes. `node-pty` handles the heavy lifting, while `mainWindow.webContents.send` pushes asynchronous data streams back to the UI (xterm.js integration).

## Data Flow
1.  **Request:** Renderer invokes `window.electronAPI.invoke('write-file', path, data)`.
2.  **Intercept:** `ipcMain` receives the event in `main-new.js`.
3.  **Process:** Node.js performs the FS operation using `fs-extra`.
4.  **Response:** The result is returned directly to the Promise in the Renderer, or emitted via events if the operation is a stream (like terminal data).

## Error Handling & Edge Cases
*   **Uncaught Exceptions:** Global process listeners for `uncaughtException` and `unhandledRejection` prevent the application from crashing on unexpected async failures.
*   **FS Safety:** Uses `fs-extra` for robust filesystem operations (e.g., `ensureDir` replaces standard `mkdir` to handle existing paths gracefully).
*   **Terminal Cleanup:** The `before-quit` app event iterates through the `terminalIdToPty` map to ensure all child PTY processes are terminated, preventing zombie processes.

## Usage Example

### Triggering a File Operation (Renderer Context)
```javascript
// In the frontend renderer
const result = await window.electronAPI.readFile('/path/to/project/index.js');
if (result.success) {
    console.log('File Content:', result.content);
} else {
    console.error('Failed to read:', result.error);
}
```

### Spawning a Terminal (Main Context)
```javascript
// In main-new.js
ipcMain.handle('create-terminal', async (event, terminalId, shell) => {
  const ptyProcess = pty.spawn(shell, [], { cwd: workspacePath });
  terminalIdToPty.set(terminalId, ptyProcess);
  // Pipe data back to UI
  ptyProcess.onData(data => mainWindow.webContents.send('terminal-data', terminalId, data));
});
```