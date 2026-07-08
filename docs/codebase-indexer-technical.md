# Codebase indexer — Technical Documentation

## Overview
The `CodebaseIndexer` is a utility module designed to parse, analyze, and represent a filesystem-based codebase in memory. Its primary purpose is to enable semantic search and dependency awareness across multi-language projects, acting as the foundation for AI-assisted coding tools or advanced IDE plugins that require context-aware retrieval of source code.

## Architecture
This module acts as a **data provider** in the larger system.
- **Role:** It traverses the local filesystem, converts raw source files into structured chunks, maps dependencies, and generates lightweight vector embeddings for semantic analysis.
- **Dependencies:** Uses `fs-extra` for asynchronous file system operations and `crypto` for content integrity verification via MD5 hashing.
- **Consumers:** Typically consumed by RAG (Retrieval-Augmented Generation) pipelines or search interfaces that query `semanticSearch` to provide context to LLMs.

## Design Principles
- **Single Responsibility:** The class separates concerns into distinct phases: file discovery, content chunking, dependency extraction, and semantic analysis.
- **Defensive Programming:** Employs a robust `ignorePatterns` mechanism and file-extension filtering to prevent indexing of binary blobs, build artifacts, or VCS configuration files.
- **Idempotency:** The use of MD5 content hashing allows for incremental updates, ensuring that only modified files are re-processed during the lifecycle of the index.

## API Reference

### `new CodebaseIndexer(workspacePath)`
*   `workspacePath` (string): The absolute path to the root of the project to be indexed.

### `async indexCodebase()`
Performs a full walk of the directory, builds the dependency graph, and generates embeddings for all valid files.

### `async semanticSearch(query, maxResults)`
*   `query` (string): Search string.
*   `maxResults` (number): Limit for results returned.
*   **Returns:** Array of objects containing `chunkId`, `similarity` score, and the original `chunk` data.

### `async getRelevantContext(query, maxChunks)`
Higher-level wrapper for `semanticSearch` that bundles the search results with project metadata, formatted for LLM consumption.

### `async updateIndex(changedFiles)`
*   `changedFiles` (string[]): List of relative paths that have changed. Efficiently triggers re-processing only for those specific files.

## Internal Logic
1.  **Discovery:** The `scanFileTree` method uses a recursive walk filtered by `isIndexable` and `shouldIgnore`.
2.  **Hashing:** Before processing, `processFile` generates an MD5 hash of the file content. If the hash matches the current cache, the file is skipped.
3.  **Chunking:** Source code is split into fixed-size segments (`chunkSize` = 500 characters), preserving line-break integrity. Each chunk is tagged with start/end line numbers.
4.  **Parsing:** The `extractDependencies` logic iterates through lines, using regex pattern matching against known syntax structures for supported languages (JS/TS, Python, Java, C++).
5.  **Vectorization:** Embeddings are generated as word-frequency maps. Similarity is determined via **Cosine Similarity** (Dot product / product of magnitudes).

## Data Flow
1.  **Input:** Filesystem stream (`fs-extra`).
2.  **Processing:** Files → Chunks → Dependency Graph → Embeddings.
3.  **Storage:** Internal `Map` structures indexed by file path or chunk ID.
4.  **Output:** Search results are returned as structured JSON objects containing snippet content, similarity metrics, and metadata.

## Error Handling & Edge Cases
- **Permission Errors:** `scanFileTree` uses a `try/catch` block within the recursive loop to ensure that access-denied errors on specific subfolders do not crash the entire indexing process.
- **Malformed Content:** `processFile` catches errors during read/process, logging the failure for that specific file while continuing the queue.
- **Empty Queries:** The `calculateSimilarity` function gracefully returns `0` if no common words are found between the query and the chunk.

## Usage Example

### Initializing and Indexing
```javascript
const indexer = new CodebaseIndexer('/path/to/my-project');
await indexer.indexCodebase();
console.log('Stats:', indexer.getIndexStats());
```

### Searching for Context
```javascript
const query = "How do I implement the authentication middleware?";
const context = await indexer.getRelevantContext(query, 3);

context.relevantChunks.forEach(chunk => {
  console.log(`Found in ${chunk.filePath} (Similarity: ${chunk.similarity.toFixed(2)})`);
  console.log(chunk.content);
});
```