# Enhanced indexer — Technical Documentation

## Overview
The `EnhancedCodebaseIndexer` is a sophisticated, intent-aware codebase analysis engine designed to facilitate deep semantic search and structural understanding of software projects. Unlike traditional static analyzers, this module performs multi-layered indexing, including dependency graph generation, semantic chunking based on language-specific syntax, and intent-based categorization to provide LLM-friendly context retrieval.

## Architecture
This module acts as the core "brain" of the codebase ingestion pipeline.

*   **Role in Data Flow:** It ingests raw file system data, transforms it into high-fidelity index structures, and stores them in memory for rapid retrieval.
*   **Dependencies:** `fs-extra` (filesystem operations), `path` (path resolution), and `crypto` (hashing for change detection).
*   **Consumers:** Likely consumed by CLI tools, IDE plugins, or LLM-based agents requiring context-aware knowledge of the repository.

## Design Principles
*   **Single Responsibility:** The class delegates specific tasks like language detection, dependency analysis, and intent categorization to dedicated methods.
*   **Performance:** Implements an MD5-based `fileHash` tracking mechanism to avoid re-processing unmodified files.
*   **Semantic Integrity:** Uses regex-driven "semantic boundaries" to ensure that code is split into logical chunks (classes/functions/imports) rather than arbitrary byte offsets, preserving the code's functional context.
*   **Extensibility:** Configuration objects (e.g., `semanticBoundaries`, `docExtractionPatterns`) are easily adjustable for new languages.

## API Reference

### `new EnhancedCodebaseIndexer(workspacePath)`
Initializes the indexer instance with a designated `workspacePath`.

### `async indexCodebase()`
Performs a full walk of the workspace. Orchestrates scanning, documentation extraction, chunking, graph building, and embedding generation.

### `async searchSemantic(query, options)`
Performs an advanced weighted search across all indexed chunks.
*   **Parameters:** `query` (string), `options` (`{ limit: number }`).
*   **Returns:** An array of ranked objects including `chunkId`, `score`, `snippet`, and `matchType`.

### `getFileInfo(filePath)`
Retrieves the comprehensive index state for a specific file, including documentation, dependencies, and chunk data.

### `getProjectOverview()`
Returns high-level statistics regarding the codebase, such as file counts by language and category.

## Internal Logic
1.  **Scanning:** Performs a recursive crawl of the file tree while filtering via `ignorePatterns`.
2.  **Hashing:** Generates a digest for each file to ensure incremental updates only target changes.
3.  **Semantic Chunking:** Splits code files based on language-specific triggers (e.g., `function`, `class`, `import` declarations).
4.  **Intent Analysis:** Analyzes inline comments and code structure to map chunks into categories like `authentication`, `businessLogic`, or `testing`.
5.  **Graph Generation:** Connects files via import/export relationships to build a dependency map.
6.  **Embedding Enrichment:** Merges metadata (complexity, purpose, docstrings) into the embedding representation to enhance vector-based query relevance.

## Data Flow
1.  **Input:** Local Filesystem path.
2.  **Transformation:** 
    *   `Raw Content` → `Semantic Chunks`
    *   `Code` → `Dependency Graph`
    *   `Comments/JSDoc` → `Intent Metadata`
3.  **Output:** An in-memory `this.index` object containing maps for high-speed lookups and semantic vector storage.

## Error Handling & Edge Cases
*   **Incremental Processing:** Re-processes only changed files based on `fileHashes`.
*   **Ignore Patterns:** Safely ignores ephemeral directories (`node_modules`, `.git`, `dist`).
*   **File Read Failures:** Uses `try-catch` blocks at the individual file-processing level to ensure one corrupt file doesn't halt the entire indexing process.
*   **Malformed JSON/Config:** Uses `try-catch` when parsing `package.json` to prevent crashes during project type detection.

## Usage Example

### Initialization and Indexing
```javascript
const EnhancedCodebaseIndexer = require('./enhanced-indexer');

const indexer = new EnhancedCodebaseIndexer('/path/to/my/project');
await indexer.indexCodebase();
```

### Context-Aware Semantic Search
```javascript
const results = await indexer.searchSemantic('How does user authentication work?', { limit: 5 });

results.forEach(res => {
  console.log(`Found in: ${res.chunkId}`);
  console.log(`Snippet: ${res.snippet}`);
});
```