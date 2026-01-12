const fs = require('fs-extra');
const path = require('path');
const crypto = require('crypto');
const SessionManager = require('./session-manager');
const SafetyManager = require('./safety-manager');

class AIAgentSystem {
  constructor(workspacePath, codebaseIndexer) {
    this.workspacePath = workspacePath;
    this.codebaseIndexer = codebaseIndexer;
    this.sessionManager = new SessionManager();
    this.safetyManager = new SafetyManager(workspacePath);
    this.fileOperations = new Map();
    this.operationHistory = [];
    
    // Initialize session for this workspace
    this.sessionManager.createSession(workspacePath);
    
    // Initialize safety manager
    this.safetyManager.initialize().catch(error => {
      console.error('[AI Agent] Failed to initialize safety manager:', error);
    });
  }

  // Main agent method that orchestrates the entire process
  async processRequest(userRequest, currentFile = null, options = {}) {
    const startTime = Date.now();
    const operationId = this.generateOperationId();
    
    try {
      console.log(`[AI Agent] Starting operation ${operationId}: ${userRequest}`);
      
      // Step 1: Get session context for incremental prompting
      const sessionContext = this.sessionManager.getIncrementalContext(userRequest);
      console.log(`[AI Agent] Session context type: ${sessionContext?.type || 'none'}`);
      
      // Step 2: Analyze request and gather context
      const analysis = await this.analyzeRequest(userRequest, currentFile);
      
      // Step 3: Retrieve relevant codebase context (with session awareness)
      const context = await this.retrieveContext(userRequest, analysis, sessionContext);
      
      // Step 4: Generate AI response with enhanced context
      const aiResponse = await this.generateAIResponse(userRequest, context, analysis, options, sessionContext);
      
      // Step 5: Parse and validate AI response
      const parsedResponse = await this.parseAIResponse(aiResponse);
      
      // Step 6: Execute file operations with safety checks and diff tracking
      const executionResults = await this.executeOperationsWithDiff(parsedResponse.actions, context);
      
      // Step 7: Update index for changed files
      await this.updateIndexForChanges(executionResults);
      
      // Step 8: Update session with operation results
      this.sessionManager.updateSession(operationId, userRequest, parsedResponse.analysis, executionResults, context);
      
      const endTime = Date.now();
      const duration = endTime - startTime;
      
      console.log(`[AI Agent] Operation ${operationId} completed in ${duration}ms`);
      
      return {
        success: true,
        operationId,
        analysis: parsedResponse.analysis,
        actions: executionResults,
        explanation: parsedResponse.explanation,
        context: {
          filesAnalyzed: context.relevantFiles.length,
          chunksRetrieved: context.relevantChunks.length,
          dependenciesFound: context.dependencies.length,
          sessionContext: sessionContext?.type || 'none'
        },
        duration,
        timestamp: new Date().toISOString()
      };
      
    } catch (error) {
      console.error(`[AI Agent] Operation ${operationId} failed:`, error);
      return {
        success: false,
        operationId,
        error: error.message,
        timestamp: new Date().toISOString()
      };
    }
  }

  // Analyze user request to understand intent and requirements
  async analyzeRequest(userRequest, currentFile) {
    const analysis = {
      intent: this.detectIntent(userRequest),
      fileOperations: this.detectFileOperations(userRequest),
      keywords: this.extractKeywords(userRequest),
      complexity: this.assessComplexity(userRequest),
      currentFile: currentFile ? path.relative(this.workspacePath, currentFile.path) : null
    };
    
    console.log(`[AI Agent] Request analysis:`, analysis);
    return analysis;
  }

  // Detect the intent of the user request
  detectIntent(request) {
    const lowerRequest = request.toLowerCase();
    
    if (lowerRequest.includes('create') || lowerRequest.includes('add') || lowerRequest.includes('new')) {
      return 'create';
    } else if (lowerRequest.includes('edit') || lowerRequest.includes('update') || lowerRequest.includes('modify')) {
      return 'edit';
    } else if (lowerRequest.includes('delete') || lowerRequest.includes('remove')) {
      return 'delete';
    } else if (lowerRequest.includes('fix') || lowerRequest.includes('bug') || lowerRequest.includes('error')) {
      return 'fix';
    } else if (lowerRequest.includes('refactor') || lowerRequest.includes('improve')) {
      return 'refactor';
    } else {
      return 'general';
    }
  }

  // Detect what file operations might be needed
  detectFileOperations(request) {
    const operations = [];
    const lowerRequest = request.toLowerCase();
    
    if (lowerRequest.includes('component') || lowerRequest.includes('react')) {
      operations.push('create_component');
    }
    if (lowerRequest.includes('hook') || lowerRequest.includes('use')) {
      operations.push('create_hook');
    }
    if (lowerRequest.includes('style') || lowerRequest.includes('css')) {
      operations.push('create_style');
    }
    if (lowerRequest.includes('config') || lowerRequest.includes('package.json')) {
      operations.push('update_config');
    }
    if (lowerRequest.includes('test') || lowerRequest.includes('spec')) {
      operations.push('create_test');
    }
    
    return operations;
  }

  // Extract keywords for semantic search
  extractKeywords(request) {
    const words = request.toLowerCase()
      .replace(/[^\w\s]/g, ' ')
      .split(/\s+/)
      .filter(word => word.length > 2)
      .filter(word => !['the', 'and', 'or', 'but', 'for', 'with', 'this', 'that', 'will', 'want', 'make', 'create', 'add', 'edit', 'update'].includes(word));
    
    return [...new Set(words)];
  }

  // Assess complexity of the request
  assessComplexity(request) {
    const wordCount = request.split(/\s+/).length;
    const hasMultipleOperations = this.detectFileOperations(request).length > 1;
    const hasComplexKeywords = /component|hook|service|api|database|state|routing/i.test(request);
    
    if (wordCount > 50 || hasMultipleOperations || hasComplexKeywords) {
      return 'high';
    } else if (wordCount > 20) {
      return 'medium';
    } else {
      return 'low';
    }
  }

  // Retrieve relevant context from codebase (with session awareness)
  async retrieveContext(userRequest, analysis, sessionContext) {
    if (!this.codebaseIndexer) {
      return { relevantChunks: [], relevantFiles: [], dependencies: [] };
    }

    try {
      let relevantChunks = [];
      let relevantFiles = [];
      
      // If this is a follow-up request, prioritize recently modified files
      if (sessionContext?.type === 'follow_up' && sessionContext.lastFilesModified.length > 0) {
        console.log(`[AI Agent] Follow-up request detected. Prioritizing recently modified files:`, sessionContext.lastFilesModified);
        
        // Get chunks from recently modified files first
        for (const filePath of sessionContext.lastFilesModified) {
          const fileChunks = this.codebaseIndexer.index.chunks.get(filePath) || [];
          relevantChunks.push(...fileChunks);
        }
        
        // Then get additional context from semantic search
        const additionalContext = await this.codebaseIndexer.getRelevantContext(userRequest, 4);
        relevantChunks.push(...additionalContext.relevantChunks);
        
        // Remove duplicates
        relevantChunks = relevantChunks.filter((chunk, index, self) => 
          index === self.findIndex(c => c.id === chunk.id)
        );
      } else {
        // Enhanced semantic search for new requests
        if (this.codebaseIndexer.searchSemantic) {
          const semanticResults = await this.codebaseIndexer.searchSemantic(userRequest, { limit: 8 });
          relevantChunks = semanticResults.map(result => ({
            id: result.chunkId,
            content: result.embedding.content,
            filePath: result.embedding.metadata.filePath,
            startLine: result.embedding.metadata.startLine,
            endLine: result.embedding.metadata.endLine,
            score: result.score,
            snippet: result.snippet
          }));
        } else {
          // Fallback to original search
          const contextResult = await this.codebaseIndexer.getRelevantContext(userRequest, 8);
          relevantChunks = contextResult.relevantChunks;
        }
      }
      
      // Get unique files from chunks
      relevantFiles = [...new Set(relevantChunks.map(chunk => chunk.filePath))];
      
      // Get dependency information
      const dependencies = await this.getDependencyContext(relevantFiles);
      
      console.log(`[AI Agent] Retrieved ${relevantChunks.length} chunks from ${relevantFiles.length} files (session-aware)`);
      
      return {
        relevantChunks,
        relevantFiles,
        dependencies,
        totalFiles: this.codebaseIndexer.index.files.size,
        totalChunks: this.codebaseIndexer.index.chunks.size,
        sessionContext: sessionContext?.type || 'none'
      };
      
    } catch (error) {
      console.warn('[AI Agent] Context retrieval failed:', error);
      return { relevantChunks: [], relevantFiles: [], dependencies: [] };
    }
  }

  // Get dependency context for relevant files
  async getDependencyContext(relevantFiles) {
    if (!this.codebaseIndexer) return [];
    
    const dependencies = [];
    
    for (const filePath of relevantFiles) {
      const fileDeps = this.codebaseIndexer.index.dependencyGraph.get(filePath);
      if (fileDeps) {
        dependencies.push({
          file: filePath,
          imports: fileDeps.imports,
          exports: fileDeps.exports,
          functions: fileDeps.functions,
          classes: fileDeps.classes
        });
      }
    }
    
    return dependencies;
  }

  // Generate AI response with context (enhanced with session awareness)
  async generateAIResponse(userRequest, context, analysis, options, sessionContext) {
    const systemPrompt = this.buildSystemPrompt(context, analysis, options, sessionContext);
    
    // Call the AI service through the main process
    try {
      // This will be handled by the main process AI service
      const aiResponse = await this.callAIService(systemPrompt, userRequest, options);
      return aiResponse;
    } catch (error) {
      console.error('[AI Agent] AI service call failed:', error);
      // Return fallback response
      return {
        analysis: `Analyzing request: ${userRequest}`,
        actions: this.generateActions(userRequest, context, analysis),
        explanation: `Generated actions based on ${context.relevantChunks.length} code chunks`
      };
    }
  }

  // Call AI service (this would be implemented in main process)
  async callAIService(systemPrompt, userRequest, options) {
    try {
      if (options.aiService) {
        // Use the provided AI service from main process with timeout
        const timeoutPromise = new Promise((_, reject) => {
          setTimeout(() => reject(new Error('AI service timeout - response too large or slow')), 120000); // 2 minute timeout
        });
        
        const responsePromise = options.aiService(systemPrompt, userRequest, options);
        
        const response = await Promise.race([responsePromise, timeoutPromise]);
        
        // Check response size
        if (typeof response === 'string' && response.length > 50000) {
          console.warn('[AI Agent] Very large response detected:', response.length, 'characters');
        }
        
        return response;
      } else {
        // Fallback response
        return {
          analysis: `AI analysis of: ${userRequest}`,
          actions: [],
          explanation: `AI processed request with ${options.model || 'default'} model`
        };
      }
    } catch (error) {
      console.error('[AI Agent] AI service call failed:', error);
      // Return a structured fallback response
      return {
        analysis: `Failed to get AI analysis: ${error.message}`,
        actions: this.generateFallbackActions(userRequest),
        explanation: `AI service unavailable. Generated basic actions based on request analysis.`
      };
    }
  }

  // Generate fallback actions when AI service fails
  generateFallbackActions(userRequest) {
    // Return empty actions array instead of creating placeholder files
    // This prevents automatic file creation on JSON parsing failures
    console.log('[AI Agent] JSON parsing failed - no fallback files will be created');
    
    return [];
  }

  // Build comprehensive system prompt (enhanced with session context)
  buildSystemPrompt(context, analysis, options, sessionContext) {
    const relevantCode = (context.relevantChunks || []).map(chunk => 
      `// ${chunk.filePath} (lines ${chunk.startLine || 0}-${chunk.endLine || 0})\n${chunk.content || ''}`
    ).join('\n\n---\n\n');

    const dependencyInfo = (context.dependencies || []).map(dep => 
      `${dep.file}: Imports(${dep.imports?.length || 0}) Exports(${dep.exports?.length || 0}) Functions(${dep.functions?.length || 0}) Classes(${dep.classes?.length || 0})`
    ).join('\n');

    // Get project structure recommendations
    const projectRecommendations = this.getProjectStructureRecommendations();
    const projectType = this.codebaseIndexer?.detectProjectType ? this.codebaseIndexer.detectProjectType() : { preferredLanguage: 'javascript' };

    // Build project structure section
    const projectStructureSection = `
PROJECT STRUCTURE & CONVENTIONS:
- Preferred Language: ${projectRecommendations.preferredLanguage}
- Project Type: ${projectType.isTypeScript ? 'TypeScript' : 'JavaScript'}${projectType.isReact ? ' + React' : ''}${projectType.isVue ? ' + Vue' : ''}${projectType.isAngular ? ' + Angular' : ''}
- File Extensions: ${projectRecommendations.fileExtensions.source.join(', ')}
- Naming Conventions:
  * Files: ${projectRecommendations.namingConventions.files}
  * Components: ${projectRecommendations.namingConventions.components}
  * Functions: ${projectRecommendations.namingConventions.functions}
  * Constants: ${projectRecommendations.namingConventions.constants}
- Folder Structure: ${JSON.stringify(projectRecommendations.folderStructure, null, 2)}

IMPORTANT: When creating files, follow these conventions:
1. Use ${projectRecommendations.preferredLanguage} file extensions (${projectRecommendations.fileExtensions.source.join(', ')})
2. Place components in appropriate folders (src/components, src/pages, etc.)
3. Follow the naming conventions specified above
4. Use proper import/export syntax for the project type
5. Include proper type annotations if using TypeScript
6. Follow the existing project structure and patterns
`;

    // Build session context section
    let sessionContextSection = '';
    if (sessionContext?.type === 'follow_up') {
      sessionContextSection = `
SESSION CONTEXT (FOLLOW-UP REQUEST):
- Previous Request: "${sessionContext.lastRequest || 'No previous request'}"
- Recently Modified Files: ${(sessionContext.lastFilesModified || []).join(', ')}
- Session Summary: ${sessionContext.sessionSummary || 'No summary available'}

IMPORTANT: This is a follow-up request. You should:
1. Work with the CURRENT state of the recently modified files
2. Make incremental improvements rather than complete rewrites
3. Preserve existing functionality unless explicitly asked to change it
4. Consider the context of the previous request when making changes

`;
    } else if (sessionContext?.type === 'new_request') {
      sessionContextSection = `
SESSION CONTEXT (NEW REQUEST):
- Session Summary: ${sessionContext.sessionSummary || 'No summary available'}

`;
    }

    return `You are an advanced AI coding agent with comprehensive codebase understanding.

CURRENT CONTEXT:
- Intent: ${analysis.intent || 'unknown'}
- Complexity: ${analysis.complexity || 'unknown'}
- File Operations: ${(analysis.fileOperations || []).join(', ')}
- Current File: ${analysis.currentFile || 'None'}
- Session Type: ${sessionContext?.type || 'none'}

${sessionContextSection}${projectStructureSection}

RELEVANT CODE CONTEXT:
${relevantCode}

DEPENDENCY INFORMATION:
${dependencyInfo}

PROJECT STATISTICS:
- Total Files: ${context.totalFiles || 0}
- Total Chunks: ${context.totalChunks || 0}
- Relevant Files: ${(context.relevantFiles || []).length}

RESPONSE FORMAT (JSON):
{
  "analysis": "Brief analysis of the request",
  "actions": [
    {
      "type": "create_file|edit_file|delete_file|create_folder",
      "path": "relative/path/to/file",
      "content": "file content (for create/edit)",
      "reason": "why this action is needed",
      "dependencies": ["list of files this depends on"]
    }
  ],
  "explanation": "Detailed explanation of changes"
}

IMPORTANT RULES:

Return valid JSON that can be parsed without errors
1. Always provide complete, functional code
2. Follow existing project patterns and conventions
3. Include proper imports and dependencies
4. Consider file relationships and dependencies
5. Use the provided code context to make informed decisions
6. Ensure code is production-ready and follows best practices
7. For follow-up requests, make incremental changes and preserve existing functionality
8. Consider the session context when making decisions
9. VERY IMPORTANT - Keep proper JSON responses and well-formed
10. Avoid extremely large content fields - break complex files into multiple actions if needed
11. Ensure all JSON strings are properly escaped
12. Return valid JSON that can be parsed without errors

User Request: ${options.userRequest || 'No request provided'}`;
  }

  // Generate actions based on request and context
  generateActions(userRequest, context, analysis) {
    const actions = [];
    
    // This is a simplified action generator
    // In a real implementation, this would be handled by the AI model
    
    if (analysis.intent === 'create') {
      actions.push({
        type: 'create_file',
        path: 'src/components/NewComponent.jsx',
        content: '// New component content',
        reason: 'Creating new component as requested',
        dependencies: []
      });
    }
    
    return actions;
  }

  // Parse AI response and validate
  async parseAIResponse(aiResponse) {
    try {
      // If response is already parsed, return it
      if (typeof aiResponse === 'object' && aiResponse.analysis) {
        return aiResponse;
      }
      
      // Try to extract JSON from response
      let jsonText = aiResponse;
      if (typeof aiResponse === 'string') {
        console.log(`[AI Agent] Raw AI response length: ${aiResponse.length} characters`);
        console.log('[AI Agent] Raw AI response preview:', aiResponse.substring(0, 500) + '...');
        
        // Check for very large responses that might be truncated
        if (aiResponse.length > 15000) {
          console.log('[AI Agent] Large response detected, using streaming-aware parsing...');
        }
        
        // Extract JSON from markdown code blocks
        const jsonMatch = aiResponse.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
        if (jsonMatch) {
          jsonText = jsonMatch[1];
          console.log('[AI Agent] Extracted JSON from code block, length:', jsonText.length);
        }
        
        // Try to find JSON object in the text
        const objectMatch = aiResponse.match(/\{[\s\S]*\}/);
        if (objectMatch) {
          jsonText = objectMatch[0];
          console.log('[AI Agent] Extracted JSON object, length:', jsonText.length);
        }
        
        // Try multiple parsing strategies
        let parsed = null;
        const strategies = [
          () => JSON.parse(jsonText), // Try original
          () => JSON.parse(this.cleanJsonString(jsonText)), // Try cleaned
          () => this.parseJsonWithContentFix(jsonText), // Try with content fix
          () => this.parseLargeJsonResponse(jsonText), // Try large response parser
          () => this.parseMalformedJson(jsonText), // Try malformed JSON fixer
        ];
        
        for (let i = 0; i < strategies.length; i++) {
          try {
            parsed = strategies[i]();
            console.log(`[AI Agent] JSON parsed successfully with strategy ${i + 1}`);
            break;
          } catch (strategyError) {
            console.log(`[AI Agent] Strategy ${i + 1} failed:`, strategyError.message);
            if (i === strategies.length - 1) {
              throw strategyError; // Re-throw the last error
            }
          }
        }
        
        // Validate required fields
        if (!parsed.analysis) {
          throw new Error('Missing analysis field in AI response');
        }
        
        if (!Array.isArray(parsed.actions)) {
          throw new Error('Missing or invalid actions array in AI response');
        }
        
        // Validate each action
        for (const action of parsed.actions) {
          if (!action.type || !action.path) {
            throw new Error('Invalid action: missing type or path');
          }
          
          if (['create_file', 'edit_file'].includes(action.type) && !action.content) {
            throw new Error(`Invalid action: ${action.type} requires content`);
          }
        }
        
        return parsed;
      }
      
    } catch (error) {
      console.error('[AI Agent] Failed to parse AI response:', error);
      console.error('[AI Agent] Raw response length:', typeof aiResponse === 'string' ? aiResponse.length : 'N/A');
      console.error('[AI Agent] Raw response preview:', typeof aiResponse === 'string' ? aiResponse.substring(0, 1000) : aiResponse);
      
      // Return a fallback response with no actions instead of creating placeholder files
      return {
        analysis: `Failed to parse AI response: ${error.message}. The AI response contained malformed JSON that could not be parsed.`,
        actions: this.generateFallbackActions(typeof aiResponse === 'string' ? aiResponse : 'Unknown request'),
        explanation: 'AI response parsing failed due to malformed JSON. No files will be created automatically. Please try your request again or rephrase it.'
      };
    }
  }

  // Parse JSON with special handling for content fields that may have unescaped quotes
  parseJsonWithContentFix(jsonText) {
    // This function specifically handles the case where content fields have unescaped quotes
    // It uses a regex-based approach to fix the content before parsing
    
    // Find all content fields and properly escape their quotes
    const contentRegex = /"content":\s*"([^"]*(?:\\"[^"]*)*)"/g;
    let fixedJson = jsonText;
    let match;
    
    while ((match = contentRegex.exec(jsonText)) !== null) {
      const originalContent = match[1];
      const escapedContent = originalContent.replace(/"/g, '\\"');
      const originalMatch = match[0];
      const fixedMatch = `"content": "${escapedContent}"`;
      fixedJson = fixedJson.replace(originalMatch, fixedMatch);
    }
    
    // Clean up other common issues
    fixedJson = this.cleanJsonString(fixedJson);
    
    return JSON.parse(fixedJson);
  }

  // Parse large JSON responses that might be truncated or have streaming issues
  parseLargeJsonResponse(jsonText) {
    console.log('[AI Agent] Attempting to parse large JSON response...');
    
    // Check if the JSON appears to be truncated
    const lastChar = jsonText.trim().slice(-1);
    if (lastChar !== '}') {
      console.log('[AI Agent] JSON appears to be truncated, attempting to complete...');
      
      // Try to find the last complete object or array
      let fixedJson = jsonText;
      
      // Count braces to see if we need to close objects
      let braceCount = 0;
      let bracketCount = 0;
      let inString = false;
      let escapeNext = false;
      
      for (let i = 0; i < jsonText.length; i++) {
        const char = jsonText[i];
        
        if (escapeNext) {
          escapeNext = false;
          continue;
        }
        
        if (char === '\\') {
          escapeNext = true;
          continue;
        }
        
        if (char === '"' && !escapeNext) {
          inString = !inString;
          continue;
        }
        
        if (!inString) {
          if (char === '{') braceCount++;
          if (char === '}') braceCount--;
          if (char === '[') bracketCount++;
          if (char === ']') bracketCount--;
        }
      }
      
      // Add missing closing braces/brackets
      while (bracketCount > 0) {
        fixedJson += ']';
        bracketCount--;
      }
      
      while (braceCount > 0) {
        fixedJson += '}';
        braceCount--;
      }
      
      console.log(`[AI Agent] Fixed JSON by adding ${fixedJson.length - jsonText.length} characters`);
      jsonText = fixedJson;
    }
    
    // Try to clean and parse
    const cleanedJson = this.cleanJsonString(jsonText);
    
    // Additional cleaning for large responses
    const finalJson = cleanedJson
      .replace(/,\s*([}\]])/g, '$1') // Remove trailing commas
      .replace(/[\u0000-\u001F\u007F-\u009F]/g, '') // Remove control characters
      .trim();
    
    return JSON.parse(finalJson);
  }

  // Parse malformed JSON with aggressive fixing
  parseMalformedJson(jsonText) {
    console.log('[AI Agent] Attempting to parse malformed JSON...');
    
    let fixedJson = jsonText;
    
    // Fix common malformed JSON issues
    // 1. Fix missing quotes around property names
    fixedJson = fixedJson.replace(/([{,]\s*)([a-zA-Z_][a-zA-Z0-9_]*)\s*:/g, '$1"$2":');
    
    // 2. Fix missing quotes around string values
    fixedJson = fixedJson.replace(/:\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*([,}])/g, ':"$1"$2');
    
    // 3. Fix missing commas between array elements
    fixedJson = fixedJson.replace(/}\s*{/g, '},{');
    fixedJson = fixedJson.replace(/]\s*\[/g, '],[');
    
    // 4. Fix missing commas between object properties
    fixedJson = fixedJson.replace(/"\s*"/g, '","');
    
    // 5. Fix specific array element issues (like the one in the error)
    // This handles cases where array elements are missing commas or have malformed structure
    fixedJson = fixedJson.replace(/"\s*"type":/g, '", "type":');
    fixedJson = fixedJson.replace(/"\s*"path":/g, '", "path":');
    fixedJson = fixedJson.replace(/"\s*"content":/g, '", "content":');
    
    // 6. Fix unescaped quotes in content fields
    const contentRegex = /"content":\s*"([^"]*(?:\\"[^"]*)*)"/g;
    let match;
    while ((match = contentRegex.exec(fixedJson)) !== null) {
      const originalContent = match[1];
      const escapedContent = originalContent
        .replace(/\\"/g, '"') // First unescape existing escaped quotes
        .replace(/"/g, '\\"') // Then escape all quotes
        .replace(/\\n/g, '\\n') // Preserve newlines
        .replace(/\\t/g, '\\t') // Preserve tabs
        .replace(/\\\\/g, '\\\\'); // Preserve backslashes
      
      const originalMatch = match[0];
      const fixedMatch = `"content": "${escapedContent}"`;
      fixedJson = fixedJson.replace(originalMatch, fixedMatch);
    }
    
    // 6.5. Additional fix for content fields that might have been missed
    // This handles cases where the content field wasn't properly quoted
    fixedJson = fixedJson.replace(/"content":\s*([^"][^,}]*[^",\s])\s*([,}])/g, '"content": "$1"$2');
    
    // 7. Remove trailing commas
    fixedJson = fixedJson.replace(/,\s*([}\]])/g, '$1');
    
    // 8. Fix missing closing braces/brackets
    let braceCount = 0;
    let bracketCount = 0;
    let inString = false;
    let escapeNext = false;
    
    for (let i = 0; i < fixedJson.length; i++) {
      const char = fixedJson[i];
      
      if (escapeNext) {
        escapeNext = false;
        continue;
      }
      
      if (char === '\\') {
        escapeNext = true;
        continue;
      }
      
      if (char === '"' && !escapeNext) {
        inString = !inString;
        continue;
      }
      
      if (!inString) {
        if (char === '{') braceCount++;
        if (char === '}') braceCount--;
        if (char === '[') bracketCount++;
        if (char === ']') bracketCount--;
      }
    }
    
    // Add missing closing braces/brackets
    while (bracketCount > 0) {
      fixedJson += ']';
      bracketCount--;
    }
    
    while (braceCount > 0) {
      fixedJson += '}';
      braceCount--;
    }
    
    console.log('[AI Agent] Fixed malformed JSON structure');
    return JSON.parse(fixedJson);
  }

  // Clean JSON string to fix common issues
  cleanJsonString(jsonText) {
    // First, let's try to fix the most common issue: unescaped quotes in content
    // This is a more sophisticated approach that handles nested quotes properly
    let cleaned = jsonText;
    
    // Remove trailing commas
    cleaned = cleaned.replace(/,\s*}/g, '}');
    cleaned = cleaned.replace(/,\s*]/g, ']');
    
    // Remove control characters
    cleaned = cleaned.replace(/[\u0000-\u001F\u007F-\u009F]/g, '');
    
    // Handle escaped quotes more carefully - only fix them if they're not already properly escaped
    // This is a more conservative approach
    cleaned = cleaned.trim();
    
    return cleaned;
  }

  // Execute file operations with safety checks and diff tracking
  async executeOperationsWithDiff(actions, context = null) {
    try {
      // Use safety manager to execute actions safely
      const results = await this.safetyManager.executeActionsSafely(actions, context);
      
      // Log results
      for (const result of results) {
        if (result.executed) {
          console.log(`[AI Agent] ✅ ${result.type}: ${result.path}`);
        } else {
          console.error(`[AI Agent] ❌ ${result.type}: ${result.path} - ${result.error}`);
        }
      }
      
      return results;
    } catch (error) {
      console.error('[AI Agent] Failed to execute operations safely:', error);
      
      // Return error results for all actions
      return actions.map(action => ({
        ...action,
        executed: false,
        error: error.message,
        timestamp: new Date().toISOString()
      }));
    }
  }

  // Execute individual action with diff tracking
  async executeActionWithDiff(action) {
    const fullPath = path.join(this.workspacePath, action.path);
    
    try {
      switch (action.type) {
        case 'create_file':
          // Get project structure recommendations for file creation
          const recommendations = this.getProjectStructureRecommendations();
          const adjustedPath = this.adjustFilePathForProjectType(action.path, recommendations);
          
          // Use adjusted path if different from original
          const finalPath = adjustedPath !== action.path ? adjustedPath : action.path;
          const finalFullPath = path.join(this.workspacePath, finalPath);
          
          await fs.ensureFile(finalFullPath);
          await fs.writeFile(finalFullPath, action.content, 'utf8');
          
          // Store file state for future diff tracking
          this.sessionManager.storeFileState(finalPath, action.content);
          
          return { 
            success: true, 
            diff: { type: 'created', content: action.content },
            adjustedPath: finalPath !== action.path ? finalPath : undefined
          };
          
        case 'edit_file':
          // Read existing content for diff
          let existingContent = '';
          try {
            existingContent = await fs.readFile(fullPath, 'utf8');
          } catch (readError) {
            // File doesn't exist, treat as create
            existingContent = '';
          }
          
          // Generate diff
          const diff = this.sessionManager.getFileDiff(action.path, action.content);
          
          // Write new content
          await fs.writeFile(fullPath, action.content, 'utf8');
          
          // Store new file state
          this.sessionManager.storeFileState(action.path, action.content);
          
          return { 
            success: true, 
            diff: diff || { type: 'modified', oldContent: existingContent, newContent: action.content }
          };
          
        case 'delete_file':
          // Read content before deletion for diff
          let deletedContent = '';
          try {
            deletedContent = await fs.readFile(fullPath, 'utf8');
          } catch (readError) {
            // File doesn't exist
          }
          
          await fs.remove(fullPath);
          
          return { 
            success: true, 
            diff: { type: 'deleted', content: deletedContent }
          };
          
        case 'create_folder':
          await fs.ensureDir(fullPath);
          return { 
            success: true, 
            diff: { type: 'folder_created' }
          };
          
        default:
          throw new Error(`Unknown action type: ${action.type}`);
      }
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  // Update index for changed files
  async updateIndexForChanges(executionResults) {
    if (!this.codebaseIndexer) return;
    
    const changedFiles = executionResults
      .filter(result => result.executed && ['create_file', 'edit_file'].includes(result.type))
      .map(result => result.path)
      .filter(path => path); // Filter out undefined paths
    
    if (changedFiles.length > 0) {
      try {
        await this.codebaseIndexer.updateIndex(changedFiles);
        console.log(`[AI Agent] Updated index for ${changedFiles.length} changed files`);
      } catch (error) {
        console.warn('[AI Agent] Failed to update index:', error);
      }
    }
  }

  // Get project structure recommendations from the enhanced indexer
  getProjectStructureRecommendations() {
    if (!this.codebaseIndexer || !this.codebaseIndexer.getProjectStructureRecommendations) {
      return {
        preferredLanguage: 'javascript',
        fileExtensions: {
          source: ['.js', '.jsx'],
          styles: ['.css', '.scss', '.sass', '.less'],
          tests: ['.test.js', '.test.jsx', '.spec.js', '.spec.jsx'],
          config: ['.json', '.js']
        },
        folderStructure: {
          src: 'Source code',
          public: 'Public assets',
          tests: 'Test files'
        },
        namingConventions: {
          files: 'kebab-case',
          components: 'PascalCase',
          functions: 'camelCase',
          constants: 'UPPER_SNAKE_CASE',
          types: 'camelCase'
        }
      };
    }
    
    return this.codebaseIndexer.getProjectStructureRecommendations();
  }

  // Adjust file path based on project type and structure
  adjustFilePathForProjectType(filePath, recommendations) {
    const fileName = path.basename(filePath);
    const dirName = path.dirname(filePath);
    const ext = path.extname(fileName);
    const nameWithoutExt = path.basename(fileName, ext);
    
    // Check if this is a source file that needs extension adjustment
    const isSourceFile = this.isSourceFile(fileName, recommendations);
    const isComponentFile = this.isComponentFile(fileName, recommendations);
    const isTestFile = this.isTestFile(fileName, recommendations);
    
    let newExt = ext;
    let newName = nameWithoutExt;
    
    // Adjust extension based on project type
    if (isSourceFile && recommendations.preferredLanguage === 'typescript') {
      if (ext === '.js' || ext === '.jsx') {
        newExt = ext === '.jsx' ? '.tsx' : '.ts';
      }
    } else if (isSourceFile && recommendations.preferredLanguage === 'javascript') {
      if (ext === '.ts' || ext === '.tsx') {
        newExt = ext === '.tsx' ? '.jsx' : '.js';
      }
    }
    
    // Adjust naming convention
    if (isComponentFile) {
      newName = this.applyNamingConvention(nameWithoutExt, recommendations.namingConventions.components);
    } else if (isTestFile) {
      newName = this.applyNamingConvention(nameWithoutExt, recommendations.namingConventions.files);
    } else {
      newName = this.applyNamingConvention(nameWithoutExt, recommendations.namingConventions.files);
    }
    
    // Adjust directory structure if needed
    let newDir = dirName;
    if (isComponentFile && !dirName.includes('components') && !dirName.includes('src')) {
      newDir = path.join('src', 'components');
    } else if (isTestFile && !dirName.includes('test') && !dirName.includes('tests')) {
      newDir = path.join('tests');
    } else if (isSourceFile && !dirName.includes('src') && !dirName.includes('public')) {
      newDir = path.join('src');
    }
    
    const newPath = path.join(newDir, newName + newExt);
    
    // Only return adjusted path if it's different from original
    return newPath !== filePath ? newPath : filePath;
  }

  // Check if file is a source file
  isSourceFile(fileName, recommendations) {
    const ext = path.extname(fileName);
    return recommendations.fileExtensions.source.includes(ext);
  }

  // Check if file is a component file
  isComponentFile(fileName, recommendations) {
    const name = path.basename(fileName, path.extname(fileName));
    return name.includes('Component') || 
           name.includes('Page') || 
           name.includes('View') || 
           name.includes('Screen') ||
           name.includes('Widget') ||
           name.includes('Modal') ||
           name.includes('Dialog');
  }

  // Check if file is a test file
  isTestFile(fileName, recommendations) {
    const name = path.basename(fileName, path.extname(fileName));
    return name.includes('test') || 
           name.includes('spec') || 
           name.includes('Test') || 
           name.includes('Spec');
  }

  // Apply naming convention to a string
  applyNamingConvention(str, convention) {
    switch (convention) {
      case 'camelCase':
        return str.charAt(0).toLowerCase() + str.slice(1);
      case 'PascalCase':
        return str.charAt(0).toUpperCase() + str.slice(1);
      case 'kebab-case':
        return str.replace(/([a-z])([A-Z])/g, '$1-$2').toLowerCase();
      case 'snake_case':
        return str.replace(/([a-z])([A-Z])/g, '$1_$2').toLowerCase();
      case 'UPPER_SNAKE_CASE':
        return str.replace(/([a-z])([A-Z])/g, '$1_$2').toUpperCase();
      default:
        return str;
    }
  }

  // Generate unique operation ID
  generateOperationId() {
    return `op_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  // Get operation history
  getOperationHistory() {
    return this.operationHistory;
  }

  // Clear operation history
  clearOperationHistory() {
    this.operationHistory = [];
  }

  // Get session statistics
  getSessionStats() {
    return this.sessionManager.getSessionStats();
  }

  // Get session context
  getSessionContext() {
    return this.sessionManager.getSessionContext();
  }

  // Clear session
  clearSession() {
    this.sessionManager.clearSession();
  }

  // Safety and undo methods
  getUndoStackInfo() {
    return this.safetyManager.getUndoStackInfo();
  }

  getUndoStackDetails() {
    return this.safetyManager.getUndoStackDetails();
  }

  async undoLastAction() {
    try {
      const result = await this.safetyManager.undoLastAction();
      console.log('[AI Agent] Undo successful:', result);
      return { success: true, result };
    } catch (error) {
      console.error('[AI Agent] Undo failed:', error);
      return { success: false, error: error.message };
    }
  }

  async undoActionByIndex(index) {
    try {
      const result = await this.safetyManager.undoActionByIndex(index);
      console.log('[AI Agent] Undo by index successful:', result);
      return { success: true, result };
    } catch (error) {
      console.error('[AI Agent] Undo by index failed:', error);
      return { success: false, error: error.message };
    }
  }

  async undoMultipleActions(indices) {
    try {
      const results = await this.safetyManager.undoMultipleActions(indices);
      console.log('[AI Agent] Multiple undo successful:', results);
      return { success: true, results };
    } catch (error) {
      console.error('[AI Agent] Multiple undo failed:', error);
      return { success: false, error: error.message };
    }
  }

  clearUndoStack() {
    this.safetyManager.clearUndoStack();
    return { success: true };
  }

  async cleanupBackups() {
    try {
      await this.safetyManager.cleanupOldBackups();
      return { success: true };
    } catch (error) {
      console.error('[AI Agent] Backup cleanup failed:', error);
      return { success: false, error: error.message };
    }
  }

  // Confirm pending actions (called from main process)
  confirmPendingActions(approved) {
    this.safetyManager.confirmActions(approved);
  }

  // Get pending actions for confirmation
  getPendingActions() {
    return this.safetyManager.pendingActions;
  }
}

module.exports = AIAgentSystem;
