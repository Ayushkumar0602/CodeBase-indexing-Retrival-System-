const fs = require('fs-extra');
const path = require('path');
const crypto = require('crypto');

class EnhancedCodebaseIndexer {
  constructor(workspacePath) {
    this.workspacePath = workspacePath;
    this.index = {
      files: new Map(),
      chunks: new Map(),
      embeddings: new Map(),
      dependencyGraph: new Map(),
      fileHashes: new Map(),
      lastIndexed: new Map(),
      documentation: new Map(),
      semanticContext: new Map(),
      crossReferences: new Map()
    };
    
    // Enhanced chunking with semantic boundaries
    this.chunkSize = 150; // Smaller chunks for better precision
    this.maxChunkSize = 300; // Maximum chunk size
    
    // Comprehensive file type support
    this.indexableExtensions = new Set([
      '.js', '.jsx', '.ts', '.tsx', '.py', '.java', '.cpp', '.c', '.h', '.hpp',
      '.css', '.scss', '.less', '.html', '.htm', '.json', '.xml', '.yaml', '.yml',
      '.md', '.txt', '.sh', '.bash', '.zsh', '.fish', '.ps1', '.bat', '.cmd',
      '.vue', '.svelte', '.php', '.rb', '.go', '.rs', '.swift', '.kt', '.scala',
      '.sql', '.graphql', '.gql', '.proto', '.thrift', '.avro', '.toml', '.ini',
      '.conf', '.config', '.env', '.env.example', '.dockerfile', '.dockerignore'
    ]);
    
    // Enhanced ignore patterns
    this.ignorePatterns = [
      'node_modules', '.git', '.vscode', '.idea', 'dist', 'build', 'coverage',
      '.next', '.nuxt', '.cache', 'tmp', 'temp', '.DS_Store', 'Thumbs.db',
      '*.log', '*.lock', 'package-lock.json', 'yarn.lock', 'pnpm-lock.yaml',
      '.env.local', '.env.production', '.env.staging', '*.min.js', '*.min.css',
      '*.bundle.js', '*.chunk.js', '*.map', '*.d.ts', '*.generated.*'
    ];
    
    // Documentation patterns with enhanced detection
    this.docPatterns = {
      readme: /^(readme|README)\.(md|txt|rst)$/i,
      architecture: /^(architecture|ARCHITECTURE)\.(md|txt|rst)$/i,
      contributing: /^(contributing|CONTRIBUTING)\.(md|txt|rst)$/i,
      api: /^(api|API)\.(md|txt|rst)$/i,
      setup: /^(setup|SETUP|install|INSTALL)\.(md|txt|rst)$/i,
      changelog: /^(changelog|CHANGELOG)\.(md|txt|rst)$/i,
      license: /^(license|LICENSE)\.(md|txt|rst)$/i,
      todo: /^(todo|TODO)\.(md|txt|rst)$/i,
      docs: /^docs?\//i
    };
    
    // Enhanced semantic boundaries for better chunking
    this.semanticBoundaries = {
      javascript: [
        /^export\s+(class|function|const|let|var|default)/,
        /^import\s+/,
        /^class\s+\w+/,
        /^function\s+\w+/,
        /^const\s+\w+/,
        /^let\s+\w+/,
        /^var\s+\w+/,
        /^if\s*\(/,
        /^for\s*\(/,
        /^while\s*\(/,
        /^switch\s*\(/,
        /^try\s*{/,
        /^catch\s*\(/,
        /^finally\s*{/,
        /^describe\s*\(/,
        /^it\s*\(/,
        /^test\s*\(/,
        /^beforeEach\s*\(/,
        /^afterEach\s*\(/,
        /^beforeAll\s*\(/,
        /^afterAll\s*\(/,
        /^\/\*\*/,
        /^\s*\/\/\s*===/,
        /^\s*\/\/\s*---/
      ],
      typescript: [
        /^export\s+(class|function|const|let|var|default|interface|type|enum)/,
        /^import\s+/,
        /^class\s+\w+/,
        /^function\s+\w+/,
        /^const\s+\w+/,
        /^let\s+\w+/,
        /^var\s+\w+/,
        /^interface\s+\w+/,
        /^type\s+\w+/,
        /^enum\s+\w+/,
        /^namespace\s+\w+/,
        /^if\s*\(/,
        /^for\s*\(/,
        /^while\s*\(/,
        /^switch\s*\(/,
        /^try\s*{/,
        /^catch\s*\(/,
        /^finally\s*{/,
        /^describe\s*\(/,
        /^it\s*\(/,
        /^test\s*\(/,
        /^beforeEach\s*\(/,
        /^afterEach\s*\(/,
        /^beforeAll\s*\(/,
        /^afterAll\s*\(/,
        /^\/\*\*/,
        /^\s*\/\/\s*===/,
        /^\s*\/\/\s*---/
      ],
      python: [
        /^import\s+/,
        /^from\s+\w+\s+import/,
        /^class\s+\w+/,
        /^def\s+\w+/,
        /^async\s+def\s+\w+/,
        /^if\s+__name__\s*==\s*['"]__main__['"]/,
        /^if\s+__name__\s*==\s*['"]__main__['"]/,
        /^try:/,
        /^except\s+/,
        /^finally:/,
        /^with\s+/,
        /^for\s+\w+\s+in/,
        /^while\s+/,
        /^def\s+test_/,
        /^class\s+Test/,
        /^"""/,
        /^'''/,
        /^#\s*===/,
        /^#\s*---/
      ],
      markdown: [
        /^#\s+/,
        /^##\s+/,
        /^###\s+/,
        /^####\s+/,
        /^```/,
        /^---$/,
        /^===/
      ]
    };
    
    // LLM-friendly documentation extraction patterns
    this.docExtractionPatterns = {
      jsdoc: /\/\*\*[\s\S]*?\*\//g,
      inlineComments: /\/\/\s*(.+)$/gm,
      blockComments: /\/\*[\s\S]*?\*\//g,
      pythonDocstrings: /"""[^"]*"""/g,
      pythonComments: /#\s*(.+)$/gm,
      markdownHeaders: /^(#{1,6})\s+(.+)$/gm,
      markdownCodeBlocks: /```[\s\S]*?```/g,
      functionDefinitions: /(?:function|def|class)\s+(\w+)/g,
      parameterPatterns: /@param\s+\{([^}]+)\}\s+(\w+)\s+(.+)/g,
      returnPatterns: /@returns?\s+\{([^}]+)\}\s+(.+)/g,
      throwsPatterns: /@throws?\s+\{([^}]+)\}\s+(.+)/g
    };
    
    // Intent-based categorization
    this.intentCategories = {
      authentication: ['login', 'auth', 'signin', 'signout', 'register', 'password'],
      dataManagement: ['create', 'read', 'update', 'delete', 'crud', 'database', 'query'],
      uiComponents: ['component', 'render', 'display', 'view', 'ui', 'interface'],
      businessLogic: ['business', 'logic', 'rules', 'validation', 'process'],
      utilities: ['util', 'helper', 'tool', 'format', 'parse', 'convert'],
      configuration: ['config', 'settings', 'options', 'env', 'environment'],
      testing: ['test', 'spec', 'mock', 'stub', 'fixture', 'assert'],
      documentation: ['doc', 'comment', 'readme', 'guide', 'tutorial']
    };
  }

  async indexCodebase() {
    console.log('🚀 Starting enhanced codebase indexing...');
    const startTime = Date.now();
    
    try {
      // Step 1: Scan and organize files
      const files = await this.scanFileTree();
      console.log(`📁 Found ${files.length} files to index`);
      
      // Step 2: Extract documentation and architecture
      await this.extractDocumentation(files);
      
      // Step 3: Process files with semantic chunking
      for (const file of files) {
        await this.processFile(file);
      }
      
      // Step 4: Build enhanced dependency graph
      await this.buildEnhancedDependencyGraph();
      
      // Step 5: Generate semantic context and cross-references
      await this.generateSemanticContext();
      
      // Step 6: Create embeddings with metadata
      await this.generateEnhancedEmbeddings();
      
      const endTime = Date.now();
      console.log(`✅ Enhanced indexing completed in ${endTime - startTime}ms`);
      console.log(`📊 Indexed ${this.index.files.size} files, ${this.index.chunks.size} chunks`);
      console.log(`📚 Found ${this.index.documentation.size} documentation files`);
      console.log(`🔗 Generated ${this.index.crossReferences.size} cross-references`);
      
    } catch (error) {
      console.error('❌ Enhanced indexing failed:', error);
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
            const stats = await fs.stat(fullPath);
            files.push({
              fullPath,
              relativePath: relPath,
              name: entry.name,
              size: stats.size,
              lastModified: stats.mtime,
              isDocumentation: this.isDocumentationFile(entry.name),
              language: this.detectLanguage(entry.name),
              category: this.categorizeFile(relPath, entry.name)
            });
          }
        }
      }
    } catch (error) {
      console.warn(`⚠️ Error scanning directory ${dir}:`, error.message);
    }
    
    return files;
  }

  shouldIgnore(filePath) {
    const normalizedPath = filePath.replace(/\\/g, '/').toLowerCase();
    
    // Check exact patterns
    for (const pattern of this.ignorePatterns) {
      if (pattern.includes('*')) {
        // Handle wildcard patterns
        const regex = new RegExp(pattern.replace(/\*/g, '.*'));
        if (regex.test(normalizedPath)) return true;
      } else {
        if (normalizedPath.includes(pattern.toLowerCase())) return true;
      }
    }
    
    return false;
  }

  isIndexable(filename) {
    const ext = path.extname(filename).toLowerCase();
    return this.indexableExtensions.has(ext) || this.isDocumentationFile(filename);
  }

  isDocumentationFile(filename) {
    return Object.values(this.docPatterns).some(pattern => pattern.test(filename));
  }

  categorizeFile(filePath, filename) {
    const normalizedPath = filePath.toLowerCase();
    
    // Configuration files
    if (filename.match(/\.(config|conf|ini|toml|yaml|yml|json)$/)) {
      return 'configuration';
    }
    
    // Documentation
    if (this.isDocumentationFile(filename)) {
      return 'documentation';
    }
    
    // Source code by directory structure
    if (normalizedPath.includes('/src/') || normalizedPath.includes('/app/') || normalizedPath.includes('/lib/')) {
      return 'source';
    }
    
    if (normalizedPath.includes('/test/') || normalizedPath.includes('/tests/') || normalizedPath.includes('/spec/')) {
      return 'test';
    }
    
    if (normalizedPath.includes('/docs/') || normalizedPath.includes('/documentation/')) {
      return 'documentation';
    }
    
    if (normalizedPath.includes('/public/') || normalizedPath.includes('/static/') || normalizedPath.includes('/assets/')) {
      return 'assets';
    }
    
    if (normalizedPath.includes('/scripts/') || normalizedPath.includes('/tools/') || normalizedPath.includes('/bin/')) {
      return 'scripts';
    }
    
    return 'other';
  }

  async extractDocumentation(files) {
    console.log('📚 Extracting documentation and architecture...');
    
    for (const file of files) {
      if (file.isDocumentation) {
        try {
          const content = await fs.readFile(file.fullPath, 'utf8');
          const docType = this.getDocumentationType(file.name);
          
          this.index.documentation.set(file.relativePath, {
            type: docType,
            content,
            fileInfo: file,
            extractedInfo: this.extractDocumentationInfo(content, docType)
          });
        } catch (error) {
          console.warn(`⚠️ Error extracting documentation from ${file.relativePath}:`, error.message);
        }
      }
    }
  }

  getDocumentationType(filename) {
    for (const [type, pattern] of Object.entries(this.docPatterns)) {
      if (pattern.test(filename)) {
        return type;
      }
    }
    return 'other';
  }

  extractDocumentationInfo(content, docType) {
    const info = {
      title: '',
      description: '',
      sections: [],
      dependencies: [],
      apis: []
    };
    
    const lines = content.split('\n');
    let currentSection = '';
    
    for (const line of lines) {
      // Extract title
      if (!info.title && line.match(/^#\s+(.+)$/)) {
        info.title = line.replace(/^#\s+/, '').trim();
      }
      
      // Extract sections
      if (line.match(/^#{2,}\s+(.+)$/)) {
        currentSection = line.replace(/^#{2,}\s+/, '').trim();
        info.sections.push(currentSection);
      }
      
      // Extract dependencies
      if (line.includes('package.json') || line.includes('requirements.txt') || line.includes('dependencies')) {
        const deps = line.match(/(\w+)[@\s]*([\d\.]+)/g);
        if (deps) {
          info.dependencies.push(...deps);
        }
      }
      
      // Extract API endpoints
      if (line.includes('/api/') || line.includes('endpoint') || line.includes('route')) {
        info.apis.push(line.trim());
      }
    }
    
    return info;
  }

  async processFile(fileInfo) {
    try {
      const content = await fs.readFile(fileInfo.fullPath, 'utf8');
      const hash = this.generateFileHash(content);
      
      const lastHash = this.index.fileHashes.get(fileInfo.relativePath);
      if (lastHash === hash) return;
      
      // Enhanced file info
      this.index.files.set(fileInfo.relativePath, {
        ...fileInfo,
        content,
        hash,
        lastModified: Date.now(),
        language: this.detectLanguage(fileInfo.name),
        category: fileInfo.category,
        complexity: this.calculateComplexity(content, fileInfo.language),
        documentation: this.extractInlineDocumentation(content, fileInfo.language),
        imports: this.extractImports(content, fileInfo.language),
        exports: this.extractExports(content, fileInfo.language)
      });
      
      // Generate semantic chunks
      const chunks = this.generateSemanticChunks(content, fileInfo);
      this.index.chunks.set(fileInfo.relativePath, chunks);
      
      this.index.fileHashes.set(fileInfo.relativePath, hash);
      this.index.lastIndexed.set(fileInfo.relativePath, Date.now());
      
    } catch (error) {
      console.warn(`⚠️ Error processing file ${fileInfo.relativePath}:`, error.message);
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
      '.kt': 'kotlin', '.scala': 'scala', '.sql': 'sql', '.graphql': 'graphql', '.gql': 'graphql'
    };
    return languageMap[ext] || 'text';
  }

  calculateComplexity(content, language) {
    const lines = content.split('\n');
    let complexity = 0;
    
    // Count functions, classes, conditionals, loops
    const patterns = {
      javascript: [/function\s+\w+/, /class\s+\w+/, /if\s*\(/, /for\s*\(/, /while\s*\(/, /switch\s*\(/],
      python: [/def\s+\w+/, /class\s+\w+/, /if\s+/, /for\s+/, /while\s+/, /try\s*:/],
      typescript: [/function\s+\w+/, /class\s+\w+/, /interface\s+\w+/, /if\s*\(/, /for\s*\(/, /while\s*\(/]
    };
    
    const langPatterns = patterns[language] || patterns.javascript;
    
    for (const line of lines) {
      for (const pattern of langPatterns) {
        if (pattern.test(line)) {
          complexity++;
        }
      }
    }
    
    return {
      score: complexity,
      level: complexity < 10 ? 'low' : complexity < 30 ? 'medium' : 'high',
      functions: (content.match(/function\s+\w+|def\s+\w+/g) || []).length,
      classes: (content.match(/class\s+\w+/g) || []).length
    };
  }

  extractInlineDocumentation(content, language) {
    const docs = {
      comments: [],
      docstrings: [],
      jsdoc: [],
      readme: [],
      parameters: [],
      returns: [],
      throws: [],
      examples: [],
      crossReferences: [],
      intent: []
    };
    
    // Extract JSDoc comments with enhanced parsing
    const jsdocMatches = content.match(this.docExtractionPatterns.jsdoc) || [];
    for (const jsdoc of jsdocMatches) {
      docs.jsdoc.push(jsdoc);
      
      // Extract parameters
      const paramMatches = jsdoc.match(this.docExtractionPatterns.parameterPatterns) || [];
      docs.parameters.push(...paramMatches);
      
      // Extract return values
      const returnMatches = jsdoc.match(this.docExtractionPatterns.returnPatterns) || [];
      docs.returns.push(...returnMatches);
      
      // Extract throws
      const throwsMatches = jsdoc.match(this.docExtractionPatterns.throwsPatterns) || [];
      docs.throws.push(...throwsMatches);
    }
    
    // Extract inline comments with intent analysis
    const inlineMatches = content.match(this.docExtractionPatterns.inlineComments) || [];
    for (const comment of inlineMatches) {
      const cleanComment = comment.replace(/^\/\/\s*/, '').trim();
      docs.comments.push(cleanComment);
      
      // Analyze intent from comments
      const intent = this.analyzeCommentIntent(cleanComment);
      if (intent) {
        docs.intent.push(intent);
      }
    }
    
    // Extract Python docstrings
    if (language === 'python') {
      const docstringMatches = content.match(this.docExtractionPatterns.pythonDocstrings) || [];
      docs.docstrings.push(...docstringMatches);
      
      const pythonComments = content.match(this.docExtractionPatterns.pythonComments) || [];
      for (const comment of pythonComments) {
        const cleanComment = comment.replace(/^#\s*/, '').trim();
        docs.comments.push(cleanComment);
        
        const intent = this.analyzeCommentIntent(cleanComment);
        if (intent) {
          docs.intent.push(intent);
        }
      }
    }
    
    // Extract cross-references
    const crossRefMatches = content.match(/\/\/\s*See\s+also:\s*(.+)$/gm) || [];
    docs.crossReferences.push(...crossRefMatches.map(ref => ref.replace(/\/\/\s*See\s+also:\s*/, '').trim()));
    
    // Extract examples
    const exampleMatches = content.match(/\/\/\s*Example:\s*(.+)$/gm) || [];
    docs.examples.push(...exampleMatches.map(ex => ex.replace(/\/\/\s*Example:\s*/, '').trim()));
    
    return docs;
  }

  analyzeCommentIntent(comment) {
    const commentLower = comment.toLowerCase();
    
    // Check for intent categories
    for (const [category, keywords] of Object.entries(this.intentCategories)) {
      if (keywords.some(keyword => commentLower.includes(keyword))) {
        return {
          category,
          keywords: keywords.filter(keyword => commentLower.includes(keyword)),
          confidence: keywords.filter(keyword => commentLower.includes(keyword)).length / keywords.length
        };
      }
    }
    
    return null;
  }

  analyzeChunkIntent(content, documentation) {
    const contentLower = content.toLowerCase();
    const categories = [];
    let purpose = 'general';
    
    // Analyze content for intent
    for (const [category, keywords] of Object.entries(this.intentCategories)) {
      if (keywords.some(keyword => contentLower.includes(keyword))) {
        categories.push(category);
      }
    }
    
    // Determine primary purpose
    if (categories.includes('authentication')) purpose = 'authentication';
    else if (categories.includes('dataManagement')) purpose = 'data-management';
    else if (categories.includes('uiComponents')) purpose = 'ui-component';
    else if (categories.includes('businessLogic')) purpose = 'business-logic';
    else if (categories.includes('utilities')) purpose = 'utility';
    else if (categories.includes('configuration')) purpose = 'configuration';
    else if (categories.includes('testing')) purpose = 'testing';
    else if (categories.includes('documentation')) purpose = 'documentation';
    
    return { categories, purpose };
  }

  extractFunctions(content, language) {
    const functions = [];
    const patterns = {
      javascript: /(?:function|const|let|var)\s+(\w+)\s*[=\(]/g,
      typescript: /(?:function|const|let|var)\s+(\w+)\s*[=\(]/g,
      python: /def\s+(\w+)\s*\(/g
    };
    
    const pattern = patterns[language] || patterns.javascript;
    const matches = content.match(pattern);
    
    if (matches) {
      functions.push(...matches.map(match => {
        const nameMatch = match.match(/(\w+)/);
        return nameMatch ? nameMatch[1] : match;
      }));
    }
    
    return functions;
  }

  extractClasses(content, language) {
    const classes = [];
    const patterns = {
      javascript: /class\s+(\w+)/g,
      typescript: /class\s+(\w+)/g,
      python: /class\s+(\w+)/g
    };
    
    const pattern = patterns[language] || patterns.javascript;
    const matches = content.match(pattern);
    
    if (matches) {
      classes.push(...matches.map(match => {
        const nameMatch = match.match(/(\w+)/);
        return nameMatch ? nameMatch[1] : match;
      }));
    }
    
    return classes;
  }

  extractImports(content, language) {
    const imports = [];
    
    const patterns = {
      javascript: [/import\s+.*from\s+['"]([^'"]+)['"]/, /require\s*\(\s*['"]([^'"]+)['"]/],
      python: [/from\s+(\w+)\s+import/, /import\s+(\w+)/],
      typescript: [/import\s+.*from\s+['"]([^'"]+)['"]/, /require\s*\(\s*['"]([^'"]+)['"]/]
    };
    
    const langPatterns = patterns[language] || patterns.javascript;
    
    for (const pattern of langPatterns) {
      const matches = content.match(new RegExp(pattern.source, 'g'));
      if (matches) {
        imports.push(...matches);
      }
    }
    
    return imports;
  }

  extractExports(content, language) {
    const exports = [];
    
    const patterns = {
      javascript: [/export\s+(default\s+)?(function|class|const|let|var)\s+(\w+)/, /module\.exports\s*=\s*(\w+)/],
      python: [/def\s+(\w+)/, /class\s+(\w+)/],
      typescript: [/export\s+(default\s+)?(function|class|const|let|var|interface|type)\s+(\w+)/]
    };
    
    const langPatterns = patterns[language] || patterns.javascript;
    
    for (const pattern of langPatterns) {
      const matches = content.match(new RegExp(pattern.source, 'g'));
      if (matches) {
        exports.push(...matches);
      }
    }
    
    return exports;
  }

  generateSemanticChunks(content, fileInfo) {
    const chunks = [];
    const lines = content.split('\n');
    const language = fileInfo.language;
    
    let currentChunk = '';
    let chunkStart = 0;
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const lineWithNewline = line + '\n';
      
      // Check for semantic boundaries
      const isBoundary = this.isSemanticBoundary(line, language);
      const chunkSize = currentChunk.length + lineWithNewline.length;
      
      // Create chunk if we hit a boundary or size limit
      if ((isBoundary && currentChunk.length > 0) || chunkSize > this.maxChunkSize) {
        if (currentChunk.trim().length > 0) {
          chunks.push(this.createChunk(currentChunk, fileInfo, chunkStart, i - 1));
        }
        currentChunk = lineWithNewline;
        chunkStart = i;
      } else {
        currentChunk += lineWithNewline;
      }
    }
    
    // Add final chunk
    if (currentChunk.trim().length > 0) {
      chunks.push(this.createChunk(currentChunk, fileInfo, chunkStart, lines.length - 1));
    }
    
    return chunks;
  }

  isSemanticBoundary(line, language) {
    const boundaries = this.semanticBoundaries[language] || this.semanticBoundaries.javascript;
    return boundaries.some(pattern => pattern.test(line));
  }

  createChunk(content, fileInfo, startLine, endLine) {
    const chunkId = `${fileInfo.relativePath}:${startLine}-${endLine}`;
    
    // Extract enhanced metadata
    const documentation = this.extractInlineDocumentation(content, fileInfo.language);
    const intent = this.analyzeChunkIntent(content, documentation);
    const functions = this.extractFunctions(content, fileInfo.language);
    const classes = this.extractClasses(content, fileInfo.language);
    
    return {
      id: chunkId,
      content: content.trim(),
      filePath: fileInfo.relativePath,
      startLine: startLine + 1,
      endLine: endLine + 1,
      tokenCount: this.estimateTokenCount(content),
      language: fileInfo.language,
      category: fileInfo.category,
      purpose: intent.purpose,
      functions: functions,
      classes: classes,
      documentation: documentation,
      metadata: {
        hasComments: documentation.comments.length > 0,
        hasJSDoc: documentation.jsdoc.length > 0,
        hasDocstrings: documentation.docstrings.length > 0,
        hasFunctions: functions.length > 0,
        hasClasses: classes.length > 0,
        hasImports: /import\s+|require\s*\(|from\s+/.test(content),
        hasExports: /export\s+|module\.exports/.test(content),
        hasTests: /test|spec|describe|it/.test(content.toLowerCase()),
        hasExamples: documentation.examples.length > 0,
        hasCrossReferences: documentation.crossReferences.length > 0,
        complexity: this.calculateComplexity(content, fileInfo.language),
        intent: intent.categories,
        parameters: documentation.parameters,
        returns: documentation.returns,
        throws: documentation.throws
      }
    };
  }

  estimateTokenCount(text) {
    return Math.ceil(text.length / 4);
  }

  async buildEnhancedDependencyGraph() {
    console.log('🔗 Building enhanced dependency graph...');
    
    for (const [filePath, fileInfo] of this.index.files) {
      const dependencies = this.extractEnhancedDependencies(fileInfo);
      this.index.dependencyGraph.set(filePath, dependencies);
    }
  }

  extractEnhancedDependencies(fileInfo) {
    const dependencies = {
      imports: [],
      exports: [],
      references: [],
      related: [],
      dependsOn: [],
      usedBy: []
    };
    
    // Extract imports and exports
    dependencies.imports = fileInfo.imports || [];
    dependencies.exports = fileInfo.exports || [];
    
    // Find cross-references
    for (const [otherPath, otherInfo] of this.index.files) {
      if (otherPath !== fileInfo.relativePath) {
        // Check if this file references the other file
        if (otherInfo.exports && otherInfo.exports.some(exp => fileInfo.content.includes(exp))) {
          dependencies.references.push(otherPath);
        }
        
        // Check if this file is referenced by the other file
        if (fileInfo.exports && fileInfo.exports.some(exp => otherInfo.content.includes(exp))) {
          dependencies.usedBy.push(otherPath);
        }
      }
    }
    
    return dependencies;
  }

  async generateSemanticContext() {
    console.log('🧠 Generating semantic context and cross-references...');
    
    for (const [filePath, fileInfo] of this.index.files) {
      const context = {
        purpose: this.inferPurpose(fileInfo),
        relationships: this.findRelationships(filePath, fileInfo),
        architecture: this.inferArchitecture(filePath, fileInfo),
        patterns: this.detectPatterns(fileInfo)
      };
      
      this.index.semanticContext.set(filePath, context);
    }
  }

  inferPurpose(fileInfo) {
    const content = fileInfo.content.toLowerCase();
    const path = fileInfo.relativePath.toLowerCase();
    
    if (path.includes('test') || path.includes('spec')) return 'testing';
    if (path.includes('config') || path.includes('setup')) return 'configuration';
    if (path.includes('util') || path.includes('helper')) return 'utilities';
    if (path.includes('api') || path.includes('service')) return 'api';
    if (path.includes('component') || path.includes('ui')) return 'ui';
    if (path.includes('model') || path.includes('schema')) return 'data-model';
    if (path.includes('auth') || path.includes('login')) return 'authentication';
    if (path.includes('db') || path.includes('database')) return 'database';
    
    return 'general';
  }

  findRelationships(filePath, fileInfo) {
    const relationships = [];
    
    // Find related files by naming patterns
    const baseName = path.basename(fileInfo.name, path.extname(fileInfo.name));
    
    for (const [otherPath, otherInfo] of this.index.files) {
      if (otherPath !== filePath) {
        const otherBaseName = path.basename(otherInfo.name, path.extname(otherInfo.name));
        
        // Check for related files (same base name, different extensions)
        if (otherBaseName === baseName) {
          relationships.push({
            type: 'related',
            path: otherPath,
            reason: 'same_base_name'
          });
        }
        
        // Check for test files
        if (otherBaseName.includes(baseName) && otherPath.includes('test')) {
          relationships.push({
            type: 'test',
            path: otherPath,
            reason: 'test_file'
          });
        }
      }
    }
    
    return relationships;
  }

  inferArchitecture(filePath, fileInfo) {
    const pathParts = filePath.split('/');
    const architecture = {
      layer: 'unknown',
      module: 'unknown',
      responsibility: 'unknown'
    };
    
    // Infer layer based on directory structure
    if (pathParts.includes('src')) {
      architecture.layer = 'source';
    } else if (pathParts.includes('test') || pathParts.includes('tests')) {
      architecture.layer = 'test';
    } else if (pathParts.includes('docs') || pathParts.includes('documentation')) {
      architecture.layer = 'documentation';
    }
    
    // Infer module based on directory
    for (const part of pathParts) {
      if (['components', 'pages', 'services', 'utils', 'models', 'controllers'].includes(part)) {
        architecture.module = part;
        break;
      }
    }
    
    return architecture;
  }

  detectPatterns(fileInfo) {
    const patterns = [];
    const content = fileInfo.content;
    
    // Detect common patterns
    if (content.includes('useState') || content.includes('useEffect')) {
      patterns.push('react-hooks');
    }
    
    if (content.includes('async') && content.includes('await')) {
      patterns.push('async-await');
    }
    
    if (content.includes('Promise')) {
      patterns.push('promises');
    }
    
    if (content.includes('class') && content.includes('extends')) {
      patterns.push('inheritance');
    }
    
    if (content.includes('export default')) {
      patterns.push('default-export');
    }
    
    return patterns;
  }

  async generateEnhancedEmbeddings() {
    console.log('🎯 Generating enhanced embeddings with metadata...');
    
    for (const [filePath, chunks] of this.index.chunks) {
      const fileInfo = this.index.files.get(filePath);
      const context = this.index.semanticContext.get(filePath);
      
      for (const chunk of chunks) {
        // Create enhanced semantic vector
        const semanticVector = this.createSemanticVector(chunk);
        
        const embedding = {
          id: chunk.id,
          content: chunk.content,
          metadata: {
            filePath: chunk.filePath,
            language: chunk.language,
            category: chunk.category,
            startLine: chunk.startLine,
            endLine: chunk.endLine,
            tokenCount: chunk.tokenCount,
            purpose: chunk.purpose || context?.purpose || 'unknown',
            architecture: context?.architecture || {},
            patterns: context?.patterns || [],
            complexity: chunk.metadata.complexity,
            hasComments: chunk.metadata.hasComments,
            hasJSDoc: chunk.metadata.hasJSDoc,
            hasDocstrings: chunk.metadata.hasDocstrings,
            hasFunctions: chunk.metadata.hasFunctions,
            hasClasses: chunk.metadata.hasClasses,
            hasImports: chunk.metadata.hasImports,
            hasExports: chunk.metadata.hasExports,
            hasTests: chunk.metadata.hasTests,
            hasExamples: chunk.metadata.hasExamples,
            hasCrossReferences: chunk.metadata.hasCrossReferences,
            intent: chunk.metadata.intent,
            parameters: chunk.metadata.parameters,
            returns: chunk.metadata.returns,
            throws: chunk.metadata.throws,
            functions: chunk.functions,
            classes: chunk.classes,
            documentation: chunk.documentation
          },
          semanticVector: semanticVector,
          relationships: context?.relationships || [],
          dependencies: this.index.dependencyGraph.get(filePath) || {}
        };
        
        this.index.embeddings.set(chunk.id, embedding);
      }
    }
  }

  createSemanticVector(chunk) {
    const vector = {};
    const content = chunk.content.toLowerCase();
    const documentation = chunk.documentation;
    
    // Add function and class names
    chunk.functions.forEach(func => {
      vector[func] = (vector[func] || 0) + 3;
    });
    
    chunk.classes.forEach(cls => {
      vector[cls] = (vector[cls] || 0) + 4;
    });
    
    // Add documentation keywords
    documentation.comments.forEach(comment => {
      const words = comment.toLowerCase().split(/\s+/);
      words.forEach(word => {
        if (word.length > 2) {
          vector[word] = (vector[word] || 0) + 1;
        }
      });
    });
    
    // Add JSDoc keywords
    documentation.jsdoc.forEach(jsdoc => {
      const words = jsdoc.toLowerCase().split(/\s+/);
      words.forEach(word => {
        if (word.length > 2) {
          vector[word] = (vector[word] || 0) + 2;
        }
      });
    });
    
    // Add intent categories
    chunk.metadata.intent.forEach(intent => {
      vector[intent] = (vector[intent] || 0) + 2;
    });
    
    // Add purpose
    vector[chunk.purpose] = (vector[chunk.purpose] || 0) + 3;
    
    return vector;
  }

  // Enhanced search methods
  async searchSemantic(query, options = {}) {
    const results = [];
    const queryLower = query.toLowerCase();
    const queryWords = queryLower.split(/\s+/).filter(word => word.length > 2);
    
    for (const [chunkId, embedding] of this.index.embeddings) {
      let score = 0;
      
      // Exact content matches
      if (embedding.content.toLowerCase().includes(queryLower)) {
        score += 15;
      }
      
      // Semantic vector similarity
      if (embedding.semanticVector) {
        const vectorScore = this.calculateVectorSimilarity(queryWords, embedding.semanticVector);
        score += vectorScore * 10;
      }
      
      // Function/class name matches
      if (embedding.metadata.functions && embedding.metadata.functions.some(f => 
        f.toLowerCase().includes(queryLower))) {
        score += 8;
      }
      
      if (embedding.metadata.classes && embedding.metadata.classes.some(c => 
        c.toLowerCase().includes(queryLower))) {
        score += 8;
      }
      
      // Purpose and intent matches
      if (embedding.metadata.purpose && embedding.metadata.purpose.toLowerCase().includes(queryLower)) {
        score += 6;
      }
      
      if (embedding.metadata.intent && embedding.metadata.intent.some(intent => 
        intent.toLowerCase().includes(queryLower))) {
        score += 4;
      }
      
      // Documentation matches
      if (embedding.metadata.documentation) {
        const docs = embedding.metadata.documentation;
        
        // JSDoc matches
        if (docs.jsdoc && docs.jsdoc.some(jsdoc => jsdoc.toLowerCase().includes(queryLower))) {
          score += 5;
        }
        
        // Comment matches
        if (docs.comments && docs.comments.some(comment => comment.toLowerCase().includes(queryLower))) {
          score += 3;
        }
        
        // Parameter matches
        if (docs.parameters && docs.parameters.some(param => param.toLowerCase().includes(queryLower))) {
          score += 4;
        }
      }
      
      // Cross-reference matches
      if (embedding.metadata.hasCrossReferences && embedding.metadata.documentation.crossReferences) {
        if (embedding.metadata.documentation.crossReferences.some(ref => ref.toLowerCase().includes(queryLower))) {
          score += 3;
        }
      }
      
      if (score > 0) {
        results.push({
          chunkId,
          score,
          embedding,
          snippet: this.generateSnippet(embedding.content, query),
          matchType: this.determineMatchType(score, embedding, queryLower)
        });
      }
    }
    
    // Sort by score and apply filters
    results.sort((a, b) => b.score - a.score);
    
    if (options.limit) {
      results.splice(options.limit);
    }
    
    return results;
  }

  calculateVectorSimilarity(queryWords, semanticVector) {
    let similarity = 0;
    
    for (const word of queryWords) {
      if (semanticVector[word]) {
        similarity += semanticVector[word];
      }
    }
    
    return similarity;
  }

  determineMatchType(score, embedding, query) {
    if (embedding.content.toLowerCase().includes(query)) {
      return 'exact';
    } else if (embedding.metadata.functions && embedding.metadata.functions.some(f => f.toLowerCase().includes(query))) {
      return 'function';
    } else if (embedding.metadata.classes && embedding.metadata.classes.some(c => c.toLowerCase().includes(query))) {
      return 'class';
    } else if (embedding.metadata.documentation && embedding.metadata.documentation.jsdoc.some(jsdoc => jsdoc.toLowerCase().includes(query))) {
      return 'documentation';
    } else {
      return 'semantic';
    }
  }

  generateSnippet(content, query) {
    const lines = content.split('\n');
    const queryLower = query.toLowerCase();
    
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].toLowerCase().includes(queryLower)) {
        const start = Math.max(0, i - 2);
        const end = Math.min(lines.length, i + 3);
        return lines.slice(start, end).join('\n');
      }
    }
    
    return content.substring(0, 200) + '...';
  }

  // Get enhanced file information
  getFileInfo(filePath) {
    const fileInfo = this.index.files.get(filePath);
    if (!fileInfo) return null;
    
    return {
      ...fileInfo,
      context: this.index.semanticContext.get(filePath),
      dependencies: this.index.dependencyGraph.get(filePath),
      chunks: this.index.chunks.get(filePath),
      documentation: this.index.documentation.get(filePath)
    };
  }

  // Get project overview
  getProjectOverview() {
    const overview = {
      totalFiles: this.index.files.size,
      totalChunks: this.index.chunks.size,
      languages: {},
      categories: {},
      architecture: {},
      documentation: this.index.documentation.size
    };
    
    for (const [filePath, fileInfo] of this.index.files) {
      // Count languages
      overview.languages[fileInfo.language] = (overview.languages[fileInfo.language] || 0) + 1;
      
      // Count categories
      overview.categories[fileInfo.category] = (overview.categories[fileInfo.category] || 0) + 1;
    }
    
    return overview;
  }

  // Get index statistics (compatibility method)
  getIndexStats() {
    return {
      totalFiles: this.index.files.size,
      totalChunks: this.index.chunks.size,
      totalEmbeddings: this.index.embeddings.size,
      languages: this.getLanguageStats(),
      categories: this.getCategoryStats(),
      documentation: this.index.documentation.size,
      lastIndexed: this.getLastIndexedStats()
    };
  }

  // Get language statistics
  getLanguageStats() {
    const stats = {};
    for (const [filePath, fileInfo] of this.index.files) {
      stats[fileInfo.language] = (stats[fileInfo.language] || 0) + 1;
    }
    return stats;
  }

  // Get category statistics
  getCategoryStats() {
    const stats = {};
    for (const [filePath, fileInfo] of this.index.files) {
      stats[fileInfo.category] = (stats[fileInfo.category] || 0) + 1;
    }
    return stats;
  }

  // Get last indexed statistics
  getLastIndexedStats() {
    const stats = {
      totalFiles: this.index.lastIndexed.size,
      recentFiles: 0,
      oldestFile: null,
      newestFile: null
    };

    let oldestTime = Date.now();
    let newestTime = 0;

    for (const [filePath, timestamp] of this.index.lastIndexed) {
      if (timestamp < oldestTime) {
        oldestTime = timestamp;
        stats.oldestFile = filePath;
      }
      if (timestamp > newestTime) {
        newestTime = timestamp;
        stats.newestFile = filePath;
      }
      
      // Count files indexed in last hour
      if (Date.now() - timestamp < 3600000) {
        stats.recentFiles++;
      }
    }

    return stats;
  }

  // Get relevant context (compatibility method)
  async getRelevantContext(query, maxResults = 10) {
    const searchResults = await this.searchSemantic(query, { limit: maxResults });
    
    return {
      relevantChunks: searchResults.map(result => ({
        id: result.chunkId,
        content: result.embedding.content,
        filePath: result.embedding.metadata.filePath,
        startLine: result.embedding.metadata.startLine,
        endLine: result.embedding.metadata.endLine,
        score: result.score,
        snippet: result.snippet
      })),
      totalResults: searchResults.length,
      query: query
    };
  }

  // Search relevant files (compatibility method)
  async searchRelevantFiles(query, options = {}) {
    const searchResults = await this.searchSemantic(query, { limit: options.maxResults || 10 });
    
    return searchResults.map(result => ({
      filePath: result.embedding.metadata.filePath,
      content: options.includeContent ? result.embedding.content : undefined,
      score: result.score,
      snippet: result.snippet,
      metadata: result.embedding.metadata
    }));
  }

  // Update index for changed files (compatibility method)
  async updateIndexForChangedFiles(changedFiles) {
    console.log(`🔄 Updating index for ${changedFiles.length} changed files...`);
    
    for (const filePath of changedFiles) {
      const fullPath = path.join(this.workspacePath, filePath);
      
      try {
        if (await fs.pathExists(fullPath)) {
          const fileInfo = {
            fullPath,
            relativePath: filePath,
            name: path.basename(filePath),
            size: (await fs.stat(fullPath)).size,
            lastModified: (await fs.stat(fullPath)).mtime,
            isDocumentation: this.isDocumentationFile(path.basename(filePath)),
            language: this.detectLanguage(path.basename(filePath)),
            category: this.categorizeFile(filePath, path.basename(filePath))
          };
          
          await this.processFile(fileInfo);
        } else {
          // File was deleted, remove from index
          this.index.files.delete(filePath);
          this.index.chunks.delete(filePath);
          this.index.embeddings.delete(filePath);
          this.index.dependencyGraph.delete(filePath);
          this.index.semanticContext.delete(filePath);
          this.index.fileHashes.delete(filePath);
          this.index.lastIndexed.delete(filePath);
        }
      } catch (error) {
        console.warn(`⚠️ Error updating index for ${filePath}:`, error.message);
      }
    }
    
    // Rebuild dependency graph and semantic context
    await this.buildEnhancedDependencyGraph();
    await this.generateSemanticContext();
    await this.generateEnhancedEmbeddings();
    
    console.log(`✅ Index updated for ${changedFiles.length} files`);
  }

  // Update index (compatibility method for main.js)
  async updateIndex(changedFiles) {
    return this.updateIndexForChangedFiles(changedFiles);
  }

  // Detect project type and preferred language
  detectProjectType() {
    const projectType = {
      isTypeScript: false,
      isReact: false,
      isVue: false,
      isAngular: false,
      isNode: false,
      preferredLanguage: 'javascript',
      configFiles: []
    };

    // Check for TypeScript indicators
    const tsIndicators = [
      'tsconfig.json',
      'typescript.json',
      '.ts',
      '.tsx'
    ];

    // Check for React indicators
    const reactIndicators = [
      'package.json',
      'jsx',
      'react',
      'create-react-app'
    ];

    // Check for Vue indicators
    const vueIndicators = [
      'vue.config.js',
      '.vue',
      'vue'
    ];

    // Check for Angular indicators
    const angularIndicators = [
      'angular.json',
      '.angular',
      'angular'
    ];

    // Check for Node.js indicators
    const nodeIndicators = [
      'package.json',
      'node_modules',
      'npm',
      'yarn'
    ];

    // Scan files for indicators
    for (const [filePath, fileInfo] of this.index.files) {
      const fileName = fileInfo.name.toLowerCase();
      const fileContent = fileInfo.content ? fileInfo.content.toLowerCase() : '';

      // TypeScript detection
      if (tsIndicators.some(indicator => fileName.includes(indicator) || fileContent.includes(indicator))) {
        projectType.isTypeScript = true;
        projectType.preferredLanguage = 'typescript';
      }

      // React detection
      if (reactIndicators.some(indicator => fileName.includes(indicator) || fileContent.includes(indicator))) {
        projectType.isReact = true;
      }

      // Vue detection
      if (vueIndicators.some(indicator => fileName.includes(indicator) || fileContent.includes(indicator))) {
        projectType.isVue = true;
      }

      // Angular detection
      if (angularIndicators.some(indicator => fileName.includes(indicator) || fileContent.includes(indicator))) {
        projectType.isAngular = true;
      }

      // Node.js detection
      if (nodeIndicators.some(indicator => fileName.includes(indicator) || fileContent.includes(indicator))) {
        projectType.isNode = true;
      }

      // Configuration files
      if (fileName.includes('config') || fileName.includes('package.json') || fileName.includes('tsconfig')) {
        projectType.configFiles.push(filePath);
      }
    }

    // Check package.json for dependencies
    const packageJson = this.index.files.get('package.json');
    if (packageJson && packageJson.content) {
      try {
        const pkg = JSON.parse(packageJson.content);
        
        // Check for TypeScript dependencies
        if (pkg.dependencies && (pkg.dependencies.typescript || pkg.devDependencies?.typescript)) {
          projectType.isTypeScript = true;
          projectType.preferredLanguage = 'typescript';
        }

        // Check for React dependencies
        if (pkg.dependencies && (pkg.dependencies.react || pkg.dependencies['react-dom'])) {
          projectType.isReact = true;
        }

        // Check for Vue dependencies
        if (pkg.dependencies && (pkg.dependencies.vue || pkg.dependencies['@vue/cli'])) {
          projectType.isVue = true;
        }

        // Check for Angular dependencies
        if (pkg.dependencies && (pkg.dependencies['@angular/core'] || pkg.dependencies['@angular/cli'])) {
          projectType.isAngular = true;
        }
      } catch (error) {
        console.warn('Could not parse package.json for project type detection');
      }
    }

    return projectType;
  }

  // Get project structure recommendations
  getProjectStructureRecommendations() {
    const projectType = this.detectProjectType();
    const recommendations = {
      preferredLanguage: projectType.preferredLanguage,
      fileExtensions: {
        source: projectType.isTypeScript ? ['.ts', '.tsx'] : ['.js', '.jsx'],
        styles: ['.css', '.scss', '.sass', '.less'],
        tests: projectType.isTypeScript ? ['.test.ts', '.test.tsx', '.spec.ts', '.spec.tsx'] : ['.test.js', '.test.jsx', '.spec.js', '.spec.jsx'],
        config: ['.json', '.js', '.ts']
      },
      folderStructure: this.getRecommendedFolderStructure(projectType),
      namingConventions: this.getNamingConventions(projectType),
      imports: this.getImportRecommendations(projectType)
    };

    return recommendations;
  }

  // Get recommended folder structure based on project type
  getRecommendedFolderStructure(projectType) {
    if (projectType.isReact) {
      return {
        src: {
          components: 'React components',
          pages: 'Page components',
          hooks: 'Custom React hooks',
          utils: 'Utility functions',
          services: 'API services',
          types: projectType.isTypeScript ? 'TypeScript type definitions' : 'Type definitions',
          styles: 'CSS/SCSS files',
          assets: 'Images, fonts, etc.'
        },
        public: 'Static assets',
        tests: 'Test files'
      };
    } else if (projectType.isVue) {
      return {
        src: {
          components: 'Vue components',
          views: 'Page components',
          router: 'Vue router configuration',
          store: 'Vuex store',
          assets: 'Static assets',
          styles: 'CSS/SCSS files'
        },
        public: 'Public assets'
      };
    } else if (projectType.isAngular) {
      return {
        src: {
          app: 'Angular application',
          assets: 'Static assets',
          environments: 'Environment configurations'
        }
      };
    } else if (projectType.isNode) {
      return {
        src: 'Source code',
        dist: 'Compiled output',
        tests: 'Test files',
        config: 'Configuration files'
      };
    }

    return {
      src: 'Source code',
      public: 'Public assets',
      tests: 'Test files'
    };
  }

  // Get naming conventions based on project type
  getNamingConventions(projectType) {
    const conventions = {
      files: 'kebab-case',
      components: 'PascalCase',
      functions: 'camelCase',
      constants: 'UPPER_SNAKE_CASE',
      types: projectType.isTypeScript ? 'PascalCase' : 'camelCase'
    };

    if (projectType.isReact) {
      conventions.components = 'PascalCase';
      conventions.hooks = 'camelCase';
    } else if (projectType.isVue) {
      conventions.components = 'PascalCase';
      conventions.files = 'kebab-case';
    } else if (projectType.isAngular) {
      conventions.components = 'kebab-case';
      conventions.services = 'camelCase';
    }

    return conventions;
  }

  // Get import recommendations based on project type
  getImportRecommendations(projectType) {
    const recommendations = {
      preferNamedImports: true,
      useAbsoluteImports: true,
      aliasPaths: {}
    };

    if (projectType.isReact) {
      recommendations.aliasPaths = {
        '@': './src',
        '@components': './src/components',
        '@pages': './src/pages',
        '@utils': './src/utils',
        '@services': './src/services'
      };
    } else if (projectType.isVue) {
      recommendations.aliasPaths = {
        '@': './src',
        '@components': './src/components',
        '@views': './src/views'
      };
    } else if (projectType.isAngular) {
      recommendations.aliasPaths = {
        '@app': './src/app',
        '@shared': './src/app/shared',
        '@core': './src/app/core'
      };
    }

    return recommendations;
  }
}

module.exports = EnhancedCodebaseIndexer;
