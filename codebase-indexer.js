const fs = require('fs-extra');
const path = require('path');
const crypto = require('crypto');

class CodebaseIndexer {
  constructor(workspacePath) {
    this.workspacePath = workspacePath;
    this.index = {
      files: new Map(),
      chunks: new Map(),
      embeddings: new Map(),
      dependencyGraph: new Map(),
      fileHashes: new Map(),
      lastIndexed: new Map()
    };
    this.chunkSize = 500;
    this.indexableExtensions = new Set([
      '.js', '.jsx', '.ts', '.tsx', '.py', '.java', '.cpp', '.c', '.h', '.hpp',
      '.css', '.scss', '.less', '.html', '.htm', '.json', '.xml', '.yaml', '.yml',
      '.md', '.txt', '.sh', '.bash', '.zsh', '.fish', '.ps1', '.bat', '.cmd',
      '.vue', '.svelte', '.php', '.rb', '.go', '.rs', '.swift', '.kt', '.scala'
    ]);
    this.ignorePatterns = [
      'node_modules', '.git', '.vscode', '.idea', 'dist', 'build', 'coverage',
      '.next', '.nuxt', '.cache', 'tmp', 'temp', '.DS_Store', 'Thumbs.db'
    ];
  }

  async indexCodebase() {
    console.log('Starting codebase indexing...');
    const startTime = Date.now();
    
    try {
      const files = await this.scanFileTree();
      console.log(`Found ${files.length} files to index`);
      
      for (const file of files) {
        await this.processFile(file);
      }
      
      await this.buildDependencyGraph();
      await this.generateEmbeddings();
      
      const endTime = Date.now();
      console.log(`Indexing completed in ${endTime - startTime}ms`);
      console.log(`Indexed ${this.index.files.size} files, ${this.index.chunks.size} chunks`);
      
    } catch (error) {
      console.error('Indexing failed:', error);
      throw error;
    }
  }

  async scanFileTree(dir = this.workspacePath, relativePath = '') {
    const files = [];
    
    try {
      const entries = await fs.readdir(dir, { withFileTypes: true });
      
      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        const relPath = path.join(relativePath, entry.name);
        
        if (this.shouldIgnore(relPath)) continue;
        
        if (entry.isDirectory()) {
          const subFiles = await this.scanFileTree(fullPath, relPath);
          files.push(...subFiles);
        } else if (entry.isFile()) {
          if (this.isIndexable(entry.name)) {
            files.push({
              fullPath,
              relativePath: relPath,
              name: entry.name,
              size: (await fs.stat(fullPath)).size
            });
          }
        }
      }
    } catch (error) {
      console.warn(`Error scanning directory ${dir}:`, error.message);
    }
    
    return files;
  }

  shouldIgnore(filePath) {
    const normalizedPath = filePath.replace(/\\/g, '/');
    return this.ignorePatterns.some(pattern => 
      normalizedPath.includes(pattern)
    );
  }

  isIndexable(filename) {
    const ext = path.extname(filename).toLowerCase();
    return this.indexableExtensions.has(ext);
  }

  async processFile(fileInfo) {
    try {
      const content = await fs.readFile(fileInfo.fullPath, 'utf8');
      const hash = this.generateFileHash(content);
      
      const lastHash = this.index.fileHashes.get(fileInfo.relativePath);
      if (lastHash === hash) return;
      
      this.index.files.set(fileInfo.relativePath, {
        ...fileInfo,
        content,
        hash,
        lastModified: Date.now(),
        language: this.detectLanguage(fileInfo.name)
      });
      
      const chunks = this.generateChunks(content, fileInfo.relativePath);
      this.index.chunks.set(fileInfo.relativePath, chunks);
      
      this.index.fileHashes.set(fileInfo.relativePath, hash);
      this.index.lastIndexed.set(fileInfo.relativePath, Date.now());
      
    } catch (error) {
      console.warn(`Error processing file ${fileInfo.relativePath}:`, error.message);
    }
  }

  generateFileHash(content) {
    return crypto.createHash('md5').update(content).digest('hex');
  }

  detectLanguage(filename) {
    const ext = path.extname(filename).toLowerCase();
    const languageMap = {
      '.js': 'javascript', '.jsx': 'javascript', '.ts': 'typescript', '.tsx': 'typescript',
      '.py': 'python', '.java': 'java', '.cpp': 'cpp', '.c': 'c', '.h': 'c', '.hpp': 'cpp',
      '.css': 'css', '.scss': 'scss', '.less': 'less', '.html': 'html', '.htm': 'html',
      '.json': 'json', '.xml': 'xml', '.yaml': 'yaml', '.yml': 'yaml', '.md': 'markdown',
      '.txt': 'text', '.sh': 'shell', '.bash': 'shell', '.zsh': 'shell', '.fish': 'shell',
      '.ps1': 'powershell', '.bat': 'batch', '.cmd': 'batch', '.vue': 'vue', '.svelte': 'svelte',
      '.php': 'php', '.rb': 'ruby', '.go': 'go', '.rs': 'rust', '.swift': 'swift',
      '.kt': 'kotlin', '.scala': 'scala'
    };
    return languageMap[ext] || 'text';
  }

  generateChunks(content, filePath) {
    const chunks = [];
    const lines = content.split('\n');
    let currentChunk = '';
    let chunkStart = 0;
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const lineWithNewline = line + '\n';
      
      if ((currentChunk + lineWithNewline).length > this.chunkSize && currentChunk.length > 0) {
        chunks.push({
          id: `${filePath}:${chunkStart}-${i-1}`,
          content: currentChunk.trim(),
          filePath,
          startLine: chunkStart + 1,
          endLine: i,
          tokenCount: this.estimateTokenCount(currentChunk)
        });
        
        currentChunk = lineWithNewline;
        chunkStart = i;
      } else {
        currentChunk += lineWithNewline;
      }
    }
    
    if (currentChunk.trim().length > 0) {
      chunks.push({
        id: `${filePath}:${chunkStart}-${lines.length-1}`,
        content: currentChunk.trim(),
        filePath,
        startLine: chunkStart + 1,
        endLine: lines.length,
        tokenCount: this.estimateTokenCount(currentChunk)
      });
    }
    
    return chunks;
  }

  estimateTokenCount(text) {
    return Math.ceil(text.length / 4);
  }

  async buildDependencyGraph() {
    console.log('Building dependency graph...');
    
    for (const [filePath, fileInfo] of this.index.files) {
      const dependencies = this.extractDependencies(fileInfo.content, fileInfo.language);
      this.index.dependencyGraph.set(filePath, dependencies);
    }
  }

  extractDependencies(content, language) {
    const dependencies = {
      imports: [],
      exports: [],
      functions: [],
      classes: [],
      references: []
    };
    
    const lines = content.split('\n');
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      
      const importMatch = this.matchImport(line, language);
      if (importMatch) {
        dependencies.imports.push({
          line: i + 1,
          module: importMatch.module,
          items: importMatch.items
        });
      }
      
      const exportMatch = this.matchExport(line, language);
      if (exportMatch) {
        dependencies.exports.push({
          line: i + 1,
          items: exportMatch.items
        });
      }
      
      const functionMatch = this.matchFunction(line, language);
      if (functionMatch) {
        dependencies.functions.push({
          line: i + 1,
          name: functionMatch.name,
          signature: functionMatch.signature
        });
      }
      
      const classMatch = this.matchClass(line, language);
      if (classMatch) {
        dependencies.classes.push({
          line: i + 1,
          name: classMatch.name
        });
      }
    }
    
    return dependencies;
  }

  matchImport(line, language) {
    const patterns = {
      javascript: /^(?:import|const|let|var)\s+(?:\{[^}]*\}|\w+)\s+from\s+['"`]([^'"`]+)['"`]/,
      typescript: /^(?:import|const|let|var)\s+(?:\{[^}]*\}|\w+)\s+from\s+['"`]([^'"`]+)['"`]/,
      python: /^from\s+([\w.]+)\s+import\s+(.+)$|^import\s+([\w.]+)/,
      java: /^import\s+([\w.]+);/,
      cpp: /^#include\s+[<"]([^>"]+)[>"]/
    };
    
    const pattern = patterns[language];
    if (!pattern) return null;
    
    const match = line.match(pattern);
    if (match) {
      return {
        module: match[1] || match[3],
        items: this.extractImportItems(line, language)
      };
    }
    
    return null;
  }

  extractImportItems(line, language) {
    if (language === 'javascript' || language === 'typescript') {
      const braceMatch = line.match(/\{([^}]+)\}/);
      if (braceMatch) {
        return braceMatch[1].split(',').map(item => item.trim());
      }
    }
    return [];
  }

  matchExport(line, language) {
    const patterns = {
      javascript: /^export\s+(?:default\s+)?(?:function|class|const|let|var)\s+(\w+)/,
      typescript: /^export\s+(?:default\s+)?(?:function|class|const|let|var|interface|type)\s+(\w+)/,
      python: /^def\s+(\w+)|^class\s+(\w+)/
    };
    
    const pattern = patterns[language];
    if (!pattern) return null;
    
    const match = line.match(pattern);
    if (match) {
      return {
        items: [match[1] || match[2]]
      };
    }
    
    return null;
  }

  matchFunction(line, language) {
    const patterns = {
      javascript: /^(?:export\s+)?(?:async\s+)?function\s+(\w+)\s*\(/,
      typescript: /^(?:export\s+)?(?:async\s+)?function\s+(\w+)\s*\(/,
      python: /^def\s+(\w+)\s*\(/,
      java: /^(?:public\s+|private\s+|protected\s+)?(?:static\s+)?(?:final\s+)?(?:synchronized\s+)?(?:native\s+)?(?:abstract\s+)?(?:strictfp\s+)?(?:[\w<>\[\]]+\s+)?(\w+)\s*\(/,
      cpp: /^(?:[\w<>\[\]]+\s+)?(\w+)\s*\(/
    };
    
    const pattern = patterns[language];
    if (!pattern) return null;
    
    const match = line.match(pattern);
    if (match) {
      return {
        name: match[1],
        signature: line.trim()
      };
    }
    
    return null;
  }

  matchClass(line, language) {
    const patterns = {
      javascript: /^(?:export\s+)?class\s+(\w+)/,
      typescript: /^(?:export\s+)?(?:abstract\s+)?class\s+(\w+)/,
      python: /^class\s+(\w+)/,
      java: /^(?:public\s+|private\s+|protected\s+)?(?:abstract\s+)?(?:final\s+)?class\s+(\w+)/,
      cpp: /^class\s+(\w+)/
    };
    
    const pattern = patterns[language];
    if (!pattern) return null;
    
    const match = line.match(pattern);
    if (match) {
      return {
        name: match[1]
      };
    }
    
    return null;
  }

  async generateEmbeddings() {
    console.log('Generating embeddings for chunks...');
    
    for (const [filePath, chunks] of this.index.chunks) {
      for (const chunk of chunks) {
        const embedding = this.createSimpleEmbedding(chunk.content);
        this.index.embeddings.set(chunk.id, embedding);
      }
    }
  }

  createSimpleEmbedding(content) {
    const words = content.toLowerCase().split(/\s+/);
    const wordFreq = {};
    
    words.forEach(word => {
      wordFreq[word] = (wordFreq[word] || 0) + 1;
    });
    
    return {
      vector: wordFreq,
      magnitude: Math.sqrt(Object.values(wordFreq).reduce((sum, freq) => sum + freq * freq, 0))
    };
  }

  async semanticSearch(query, maxResults = 10) {
    const queryEmbedding = this.createSimpleEmbedding(query);
    const results = [];
    
    for (const [chunkId, embedding] of this.index.embeddings) {
      const similarity = this.calculateSimilarity(queryEmbedding, embedding);
      results.push({
        chunkId,
        similarity,
        chunk: this.index.chunks.get(chunkId.split(':')[0])?.find(c => c.id === chunkId)
      });
    }
    
    return results
      .filter(r => r.chunk)
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, maxResults);
  }

  calculateSimilarity(embedding1, embedding2) {
    const words1 = Object.keys(embedding1.vector);
    const words2 = Object.keys(embedding2.vector);
    const commonWords = words1.filter(word => words2.includes(word));
    
    if (commonWords.length === 0) return 0;
    
    let dotProduct = 0;
    commonWords.forEach(word => {
      dotProduct += embedding1.vector[word] * embedding2.vector[word];
    });
    
    const cosineSimilarity = dotProduct / (embedding1.magnitude * embedding2.magnitude);
    return cosineSimilarity;
  }

  async getRelevantContext(query, maxChunks = 5) {
    const searchResults = await this.semanticSearch(query, maxChunks);
    
    const context = {
      query,
      relevantChunks: searchResults.map(r => ({
        filePath: r.chunk.filePath,
        content: r.chunk.content,
        startLine: r.chunk.startLine,
        endLine: r.chunk.endLine,
        similarity: r.similarity
      })),
      totalFiles: this.index.files.size,
      totalChunks: this.index.chunks.size
    };
    
    return context;
  }

  async updateIndex(changedFiles = []) {
    console.log(`Updating index for ${changedFiles.length} changed files`);
    
    for (const filePath of changedFiles) {
      await this.processFile({
        fullPath: path.join(this.workspacePath, filePath),
        relativePath: filePath,
        name: path.basename(filePath)
      });
    }
    
    await this.buildDependencyGraph();
    await this.generateEmbeddings();
  }

  getIndexStats() {
    return {
      totalFiles: this.index.files.size,
      totalChunks: this.index.chunks.size,
      totalEmbeddings: this.index.embeddings.size,
      languages: this.getLanguageStats(),
      lastIndexed: this.index.lastIndexed
    };
  }

  getLanguageStats() {
    const stats = {};
    for (const fileInfo of this.index.files.values()) {
      const lang = fileInfo.language;
      stats[lang] = (stats[lang] || 0) + 1;
    }
    return stats;
  }

  clearIndex() {
    this.index.files.clear();
    this.index.chunks.clear();
    this.index.embeddings.clear();
    this.index.dependencyGraph.clear();
    this.index.fileHashes.clear();
    this.index.lastIndexed.clear();
  }
}

module.exports = CodebaseIndexer;
