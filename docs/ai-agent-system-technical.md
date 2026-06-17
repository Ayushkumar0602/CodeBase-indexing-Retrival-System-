# Ai agent system — Technical Documentation

## Overview
The `AIAgentSystem` is the core orchestration module for the AI-driven development environment. Its primary purpose is to bridge the gap between user natural language intent and concrete file-system operations. It manages the lifecycle of an AI request: from intent analysis and context gathering to AI response generation, robust JSON parsing, and safe execution of file modifications.

## Architecture
This class serves as the central controller in the system's architecture.

*   **Upstream:** Consumes `codebaseIndexer` (for semantic retrieval) and interfaces with the main process for actual AI model inference (`options.aiService`).
*   **Downstream:** Directs `SessionManager` to track conversation state and `SafetyManager` to handle file I/O operations, backups, and atomic undo operations.
*   **State:** Maintains internal operation history and manages file operation mappings.

## Design Principles
*   **Orchestration Pattern:** The `processRequest` method acts as a facade, hiding the complexity of multi-step AI workflows (analysis -> retrieval -> generation -> parsing -> execution).
*   **Defensive Programming:** The module features a robust suite of recovery strategies for AI-generated JSON, including automated patching of truncated strings and malformed structural elements.
*   **Dependency Injection:** Dependencies like `codebaseIndexer` are injected at construction, facilitating easier unit testing and modularity.
*   **Separation of Concerns:** Intent detection, path normalization, and response parsing are isolated into specialized private-like methods, keeping the orchestrator readable.

## API Reference

### `new AIAgentSystem(workspacePath, codebaseIndexer)`
*   `workspacePath` (string): Absolute path to the project root.
*   `codebaseIndexer` (Object): Service instance providing semantic search and dependency graph data.

### `async processRequest(userRequest, currentFile, options)`
The entry point for the agent.
*   Returns an object containing execution results, operation ID, and diagnostic metadata.

### `async undoLastAction()`
Reverts the most recent file change performed by the agent via the `SafetyManager`.

### `confirmPendingActions(approved)`
A callback interface used to authorize actions requiring manual verification before being written to disk.

## Internal Logic
1.  **Intent Analysis:** Analyzes request keywords to categorize the task (create, edit, delete, etc.) and complexity (high, medium, low).
2.  **Context Assembly:** Queries the `codebaseIndexer` for relevant chunks, incorporating `sessionContext` to prioritize recently modified files in follow-up queries.
3.  **Prompt Engineering:** Dynamically builds a system prompt containing current file context, dependency graphs, project naming conventions, and constraints.
4.  **Response Parsing:** A multi-layered parsing pipeline attempts to recover JSON:
    *   Direct `JSON.parse()`.
    *   Content field normalization (escaping internal quotes).
    *   Truncation detection and structure repair (adding missing closing brackets).
    *   Malformed syntax fixing (injecting missing commas/quotes).
5.  **Execution & Indexing:** Dispatches vetted actions to the `SafetyManager` and triggers `codebaseIndexer.updateIndex()` on success.

## Data Flow
1.  **Request:** User natural language text.
2.  **Transformation:** Enriched with project structure and semantic search results into a `systemPrompt`.
3.  **Inference:** Sent to `options.aiService` (injected external model).
4.  **Validation:** AI output (String/JSON) is parsed/repaired into a canonical `actions` array.
5.  **Side Effects:** Files are written/modified; `SessionManager` tracks state; `codebaseIndexer` is updated.

## Error Handling & Edge Cases
*   **AI Timeout:** Implements a 120s `Promise.race` for model responses.
*   **JSON Corruption:** Uses specialized regex-based repair strategies to handle common LLM output failures (unescaped quotes, trailing commas, truncated output).
*   **Safety:** The `SafetyManager` ensures that if an operation fails midway, the system can provide recovery mechanisms or block destructive writes.
*   **Fallback:** On total parse failure, the system triggers `generateFallbackActions` to prevent accidental file corruption or creation of junk files.

## Usage Example

```javascript
const agent = new AIAgentSystem('/path/to/project', indexer);

// Process a request with context
const result = await agent.processRequest(
  "Create a new login component for the user profile",
  '/path/to/project/src/pages/Profile.jsx',
  { aiService: myLLMConnector, model: 'gpt-4' }
);

if (result.success) {
  console.log(`Action completed: ${result.operationId}`);
} else {
  console.error(`Error: ${result.error}`);
}
```

```javascript
// Undo the last change
await agent.undoLastAction();
```