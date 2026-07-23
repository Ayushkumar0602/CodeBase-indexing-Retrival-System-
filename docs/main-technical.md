# Main — Technical Documentation

## Overview
`main.js` serves as the core entry point for the Whizan Electron application. It acts as the central orchestration layer, bridging the Electron main process with the filesystem, integrated terminal (pty), and an AI-driven development stack. Its primary purpose is to manage the application lifecycle, handle Inter-Process Communication (IPC), and facilitate complex interactions between the codebase indexer, AI agents, and the IDE frontend.

## Architecture
This file is the backbone of the application. It maintains global state for the active workspace, AI configuration, and open terminal sessions.

*   **Upstream Dependencies:** Imports specialized modules like `codebase-indexer`, `ai-agent-system`, and `session-manager` to handle domain-specific logic.
*   **Infrastructure Dependencies:** Utilizes `node-pty` for terminal emulation, `chokidar` for file system observation, and `axios` for external API communication with AI providers.
*   **Downstream Consumers:** The renderer process (UI) consumes the provided IPC handlers to request file operations, AI code generation, and project scaffolding.

## Design Principles
*   **Centralized Orchestration:** All high-level control logic (e.g., project building, file indexing) is centralized here to keep the renderer process thin and decoupled from hardware-specific tasks.
*   **Resilient API Handling:** The AI service layer implements a **fallback strategy** and **rate-limit handling** by cycling through arrays of API keys, ensuring high availability even if specific keys fail.
*   **Asynchronous IPC:** Uses `ipcMain` to provide a non-blocking bridge for heavy tasks like indexing large codebases or generating complex project structures.
*   **Event-Driven Updates:** File system changes are broadcast back to the frontend via `chokidar`, ensuring the UI stays synchronized with local disk changes.

## API Reference

### AI Services
*   **`callAI(messages, options, onProgress)`**: A unified gateway for AI requests. Routes requests to OpenRouter or Google Gemini based on the current configuration and availability.
*   **`generateProjectPlan(prompt, onProgress)`**: Analyzes user prompts to produce a JSON-based project architecture, including tech stacks and setup commands.
*   **`buildProjectWithStreaming(...)`**: Orchestrates the multi-stage creation of a new project, from running shell commands (e.g., `npx create-react-app`) to generating custom code files via the AI agent.

### IPC Handlers
The module registers numerous handlers under specific namespaces:
*   **`fs:*`**: Standard file system operations (`readFile`, `writeFile`, `rename`, `delete`).
*   **`pty:*`**: Terminal management (`create`, `write`, `resize`, `kill`).
*   **`ai:*`**: AI agent interactions, including model selection, session management, and undo-stack operations.
*   **`codebase:*`**: Semantic searching and indexing triggers.

## Internal Logic
1.  **Bootstrapping**: Upon `app.whenReady()`, the system initializes AI providers and the main `BrowserWindow`.
2.  **Workspace Loading**: When a folder is selected via `loadEditor()`, the module spawns a `CodebaseIndexer` and an `AIAgentSystem` instance bound to that specific directory.
3.  **Project Building**: The `buildProjectWithStreaming` function acts as a state machine:
    *   Executes base scaffold commands (via `executeCommand`).
    *   Navigates into the generated directory.
    *   Installs dependencies using `npm`.
    *   Iteratively calls `generateCode()` to populate custom file contents.
4.  **AI Fallback**: If an API provider returns an error (e.g., 429), the code automatically shifts to the next key in the `OPENROUTER_API_KEYS` array.

## Data Flow
*   **Input**: User actions in the renderer trigger IPC calls (e.g., `ai:chat`). 
*   **Processing**: The main process merges user prompts with contextual information (codebase chunks from `codebaseIndexer`). 
*   **Output**: Results are returned to the renderer via IPC promises, or side-effect events are emitted to the UI (e.g., `ai:codeStream`).

## Error Handling & Edge Cases
*   **API Failover**: Implements cyclic iteration over API key arrays to mitigate rate limiting or individual key expiration.
*   **Terminal Stability**: Tracks `node-pty` sessions in a `Map<string, IPty>` to prevent leaks; kills processes upon window closure or manual user request.
*   **Atomic Operations**: Uses `fs-extra` to ensure operations like `ensureDir` and `ensureFile` handle directory tree creation safely.
*   **AI Malformation**: The `generateProjectPlan` function includes logic to regex-extract JSON from markdown, providing robustness against non-JSON formatted AI responses.

## Usage Example

### Triggering an AI Code Generation Task
```javascript
// From the Renderer process
const result = await window.electronAPI.invoke('ai:generateCode', 
  '/path/to/file.js', 
  'User context', 
  'Add an authentication middleware'
);

if (result.success) {
  console.log('Generated code:', result.code);
}
```

### Initializing a Terminal
```javascript
// Request a new terminal from main
const { id } = await window.electronAPI.invoke('pty:create', 80, 24);

// Write to it
await window.electronAPI.invoke('pty:write', id, 'npm start\n');
```