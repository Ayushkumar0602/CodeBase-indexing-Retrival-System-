# Cursor AI Editor - Complete Clone

A full-featured AI-powered code editor that replicates all of Cursor's capabilities, built with Electron, Monaco Editor, and comprehensive AI integration.

## 🚀 Features

### 1. AI-Driven Code Assistance

#### Intelligent Autocomplete ("Tab")
- **Multi-line predictions** based on context
- **Real-time suggestions** powered by advanced AI models
- **Context-aware completions** using codebase understanding
- **Tab to accept** suggestions with instant application

#### Advanced Code Generation
- **Natural language to code** conversion
- **Function and class generation** from descriptions
- **Support for multiple programming languages**
- **Context-aware generation** based on current file and project

#### Smart Rewrites & Multi-Line Edits
- **Automatic error correction** and optimization suggestions
- **Refactoring recommendations** with one-click application
- **Multi-line code transformations**
- **Style and best practice improvements**

### 2. Deep Codebase Understanding

#### Contextual Awareness
- **Full codebase indexing** with symbol extraction
- **Cross-file relationship mapping**
- **Import/export dependency tracking**
- **Real-time code analysis** and understanding

#### Chat Queries on Code
- **@Codebase** integration for querying your entire project
- **Semantic search** across files and functions
- **Code explanation** and documentation generation
- **Architecture analysis** and suggestions

#### Tag-Based Context (@ symbol)
- **@Codebase** - Reference entire codebase
- **@Web** - Access up-to-date web information
- **@Docs** - Integrate documentation and libraries
- **@File** - Reference specific files
- **Custom context tags** for enhanced AI understanding

### 3. Interactive Chat Interface

#### AI-Powered Chat
- **Context-aware conversations** with file and cursor awareness
- **Multiple AI model support** (DeepSeek Chat v3, Qwen 3 Coder, Gemini Flash 2.0)
- **Real-time streaming responses**
- **Chat history and session management**
- **Independent model selection** for chat and agent modes

#### Visual Context Support
- **Image drag-and-drop** for visual context (planned feature)
- **Code screenshot analysis**
- **UI/UX design discussions**

#### Web Integration
- **@Web queries** for up-to-date information
- **Real-time web search** integration
- **Documentation fetching** from official sources

### 4. Efficient Developer Actions

#### Instant Apply
- **One-click code application** from chat suggestions
- **Preview changes** before applying
- **Undo/redo support** for AI-generated changes
- **Batch operations** for multiple files

#### Cursor Navigation Prediction
- **Smart cursor positioning** after edits
- **Predictive navigation** to relevant code sections
- **Context-aware jumping** between related functions

#### Agent Mode
- **End-to-end task completion** with autonomous AI
- **Task breakdown** and step-by-step execution
- **Progress tracking** and status updates
- **Human-in-the-loop** for complex decisions
- **Model-specific agent behavior** - choose different AI models for different tasks

#### Natural Language Terminal Commands
- **Ctrl+K** to convert English to terminal commands
- **Command explanation** and safety warnings
- **Cross-platform command translation**

#### Quick Questions
- **Select code + Quick Question** for instant explanations
- **Bug detection** and analysis
- **Performance optimization** suggestions
- **Security vulnerability** identification

### 5. VS Code Compatibility & Extensions

#### Full VS Code Compatibility
- **Monaco Editor** with all VS Code features
- **Keyboard shortcuts** and key bindings
- **File explorer** with context menus
- **Integrated terminal** with multiple sessions
- **Search and replace** functionality

#### Essential Features
- **Go-to-definition** and symbol navigation
- **IntelliSense** and auto-completion
- **Syntax highlighting** for 50+ languages
- **Git integration** and version control
- **Debugging support** (extensible)

### 6. Enhanced Tooling & Safety Features

#### Internal AI Tools
- **File operations** (read, write, create, delete)
- **Directory traversal** and management
- **Text search** with regex support
- **Code analysis** and static checking
- **Web search** and information retrieval

#### Privacy & Safety
- **Privacy Mode** - code never stored remotely
- **Local processing** options
- **API key management** and rotation
- **Audit logging** for AI interactions
- **Data encryption** in transit and at rest

#### Reliability & Fallback
- **5 OpenRouter API keys** with automatic fallback for maximum uptime
- **Rate limit handling** with intelligent retry logic
- **Service redundancy** across different providers
- **Graceful degradation** when services are unavailable

## 🛠 Installation & Setup

### Prerequisites
- Node.js 16+ and npm
- Git for version control

### Quick Start
```bash
# Clone the repository
git clone <repository-url>
cd cursor-ai-editor

# Install dependencies
npm install

# Start the application
npm start
```

### AI Configuration
The application includes built-in API keys for OpenRouter and Gemini services with automatic fallback support:

- **OpenRouter API Keys**: 5 keys with automatic fallback for maximum reliability
- **Gemini API Keys**: Multiple keys with automatic fallback for reliability

For custom API keys, you can set environment variables:

```env
OPENROUTER_API_KEY=your_openrouter_key_here
GEMINI_API_KEY=your_gemini_key_here
```

## 🎯 Usage

### Getting Started
1. **Open a folder** - Use Ctrl+Shift+O or the folder icon
2. **Start coding** - Open or create files in the editor
3. **Enable AI features** - Chat, autocomplete, and suggestions activate automatically
4. **Explore panels** - Switch between Explorer, Search, Chat, and Agent modes

### Key Shortcuts
- **Ctrl+K** - Open command palette / AI chat
- **Ctrl+Shift+K** - Quick question about selected code
- **Ctrl+G** - Generate code from description
- **Ctrl+S** - Save current file
- **Ctrl+B** - Toggle sidebar
- **Ctrl+`** - Toggle terminal
- **Tab** - Accept AI suggestions
- **Escape** - Close overlays and suggestions

### AI Model Selection
Choose from multiple AI providers:
- **DeepSeek Chat v3** - Excellent for code generation and analysis
- **Qwen 3 Coder** - Specialized for coding tasks and development
- **Gemini Flash 2.0** - Fast and efficient for general tasks

## 🏗 Architecture

### Core Components
- **Main Process** (`main.js`) - Electron app management and AI services
- **Renderer Process** (`renderer.js`) - UI logic and Monaco integration
- **Preload Script** (`preload.js`) - Secure IPC communication
- **WebSocket Server** - Real-time AI features and streaming

### AI Integration
- **Multiple providers** with fallback support
- **Context building** from codebase analysis
- **Real-time streaming** for responsive interactions
- **Caching and optimization** for performance

### Security Model
- **Contextual isolation** between processes
- **API key encryption** and secure storage
- **Privacy controls** for sensitive code
- **Audit trails** for AI interactions

## 🔧 Development

### Project Structure
```
cursor-ai-editor/
├── main.js                 # Main Electron process
├── preload.js             # Preload script for IPC
├── package.json           # Dependencies and scripts
├── renderer/
│   ├── index.html         # Main UI structure
│   ├── renderer.js        # Frontend logic
│   └── styles.css         # Complete styling
└── README.md             # This file
```

### Adding Features
1. **AI Features** - Extend the AI service classes in `main.js`
2. **UI Components** - Add to `renderer.js` and `styles.css`
3. **IPC Handlers** - Update `preload.js` for new communications
4. **WebSocket Events** - Add handlers for real-time features

### Testing
```bash
# Run the application in development mode
npm run dev

# Build for production
npm run build

# Create distributables
npm run dist
```

## 🤝 Contributing

We welcome contributions! Please read our contributing guidelines and:

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests if applicable
5. Submit a pull request

## 📄 License

This project is licensed under the MIT License - see the LICENSE file for details.

## 🙏 Acknowledgments

- **Monaco Editor** for the excellent code editing experience
- **Electron** for cross-platform desktop application framework
- **OpenAI, Anthropic, Google** for AI model APIs
- **VS Code** for inspiration and design patterns
- **Cursor** for the original AI-powered editor concept

## 🐛 Known Issues & Roadmap

### Current Limitations
- Image drag-and-drop not yet implemented
- Extension marketplace integration pending
- Advanced debugging features in development

### Roadmap
- [ ] Extension marketplace integration
- [ ] Advanced debugging with AI assistance
- [ ] Collaborative editing features
- [ ] Mobile companion app
- [ ] Plugin ecosystem

## 📞 Support

For questions, issues, or feature requests:
- Open a GitHub issue
- Join our Discord community
- Check the documentation wiki

---

**Built with ❤️ for developers who want the future of coding today.**