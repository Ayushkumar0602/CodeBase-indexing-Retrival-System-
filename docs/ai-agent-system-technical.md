# Ai agent system — Technical Documentation

## Overview
The `AIAgentSystem` is the central orchestration engine responsible for bridging user natural language requests with actual codebase modifications. It serves as a facade that coordinates intent analysis, context retrieval, AI response generation, and secure file system execution. Its primary purpose is to provide an autonomous, yet safe and session-aware, coding assistant within a specific workspace.

## Architecture
This class functions as the **Controller** in the AI agent's architecture.

*   **Inputs:** Raw user requests, workspace file paths, and external AI service providers.
*   **Dependencies:**
    *   `SessionManager`: Maintains state across multiple requests (incremental context).
    *   `SafetyManager`: Acts as a middleware for file I/O, providing validation, diff tracking, and undo capabilities.
    *   `CodebaseIndexer`: Provides semantic search and dependency graph data.
*   **Consumers:** Typically initialized by a main process (e.g., an Electron main process or a CLI runner) that injects the required services and handles UI/UX interaction.

## Design Principles
*   **Facade Pattern:** The `processRequest` method hides the complexity of multi-step AI orchestration (analysis → retrieval → generation → execution → validation).
*   **Single Responsibility:** Logic is delegated to specialized managers (Safety, Session, Indexer), keeping the agent class focused on workflow orchestration.
*   **Defensive Programming:** The system implements multiple JSON parsing strategies (including heuristics for malformed or truncated output) to ensure reliability despite LLM unpredictability.
*   **Strategy Pattern (Path Management):** File paths are dynamically adjusted based on project-specific naming conventions (e.g., converting `.js` to `.tsx` in TypeScript projects).

## API Reference

### `new AIAgentSystem(workspacePath, codebaseIndexer)`
*   `workspacePath`: Absolute path to the project root.
*   `codebaseIndexer`: Reference to the codebase indexing service.

### `async processRequest(userRequest, currentFile, options)`
The primary entry point. Orchestrates the full lifecycle of an AI coding task.
*   **Returns:** A result object containing `success`, `operationId`, `analysis`, `actions`, and metadata.

### `async analyzeRequest(userRequest, currentFile)`
Parses the request to determine `intent` (e.g., 'edit', 'create'), `complexity`, and potential file operation targets.

### `async undoLastAction()`
Requests the `SafetyManager` to revert the most recent file change, utilizing stored backups.

## Internal Logic
1.  **Session Injection:** Retrieves previous state (modified files, conversation history) to enable incremental prompting.
2.  **Context Aggregation:** Uses the `CodebaseIndexer` to fetch relevant code chunks via semantic search or history-based lookup.
3.  **Prompt Engineering:** Constructs a comprehensive system prompt including project architecture, naming conventions, and current file context.
4.  **Resilient Parsing:** If the AI returns malformed JSON, the system attempts multiple recovery strategies:
    *   Regex-based fixing of unescaped quotes in `content` fields.
    *   Automatic closure of hanging braces/brackets for truncated streams.
    *   Correction of common JSON syntax errors (missing quotes on keys, etc.).
5.  **Execution & Safety:** Routes all `fs` operations through `SafetyManager` to ensure changes can be rolled back.

## Data Flow
1.  **Request:** User inputs a command.
2.  **Analysis:** Intent is mapped to specific categories.
3.  **Search:** Semantic retrieval gathers relevant code context.
4.  **AI Service:** Payload sent to LLM.
5.  **Validation:** JSON is extracted and sanitized.
6.  **Action:** File operations performed via `SafetyManager`.
7.  **Index Update:** The codebase index is refreshed to reflect the new state.

## Error Handling & Edge Cases
*   **Malformed JSON:** The `parseAIResponse` method features an aggressive multi-strategy cleanup process for LLM output.
*   **AI Timeout:** A `Promise.race` implementation triggers an error if the AI service exceeds 120 seconds.
*   **Missing Files:** If an `edit_file` request targets a non-existent file, the system attempts to fallback gracefully or alerts the operator.
*   **Safety Barriers:** The `SafetyManager` intercepts all I/O, ensuring that if a process fails halfway through a multi-file change, the system state remains recoverable.

## Usage Example

```javascript
const agent = new AIAgentSystem('/path/to/project', myIndexer);

// Processing a user request
const result = await agent.processRequest(
  "Add a new user profile component", 
  '/path/to/project/src/App.js',
  { aiService: myCustomLLMConnector }
);

if (result.success) {
  console.log('Operation completed:', result.operationId);
} else {
  console.error('Task failed:', result.error);
}

// Handling user-initiated undo
await agent.undoLastAction();
```