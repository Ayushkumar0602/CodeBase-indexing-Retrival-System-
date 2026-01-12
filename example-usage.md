# Example: Building a React Todo App with AI Agent

This example demonstrates how to use Whizan's AI agent to automatically generate a full-stack React todo application.

## Step 1: Open Whizan and Create a Workspace

1. Start Whizan: `npm start`
2. Click the folder icon to open a new workspace
3. Create a new folder for your project (e.g., `react-todo-app`)

## Step 2: Use the AI Agent

1. Click the lightbulb icon in the activity bar to open the AI Agent
2. Enter this prompt in the text area:

```
Create a React todo app with the following features:
- Add new todos
- Mark todos as complete/incomplete
- Delete todos
- Filter todos (all, active, completed)
- Local storage persistence
- Clean, modern UI with Tailwind CSS
- Responsive design
```

3. Click "Generate Project Plan"

## Step 3: Review the Generated Plan

The AI will generate a detailed plan including:

### Project Overview
A React-based todo application with full CRUD operations, filtering, and local storage persistence.

### Technology Stack
- **Frontend**: React, Tailwind CSS, React Icons
- **Build Tools**: Vite
- **State Management**: React Hooks
- **Storage**: Local Storage API

### Project Structure
```
react-todo-app/
├── src/
│   ├── components/
│   │   ├── TodoList.jsx
│   │   ├── TodoItem.jsx
│   │   ├── TodoForm.jsx
│   │   └── TodoFilter.jsx
│   ├── hooks/
│   │   └── useLocalStorage.js
│   ├── App.jsx
│   ├── main.jsx
│   └── index.css
├── public/
│   └── index.html
├── package.json
├── vite.config.js
└── tailwind.config.js
```

### Implementation Steps
1. Set up React project with Vite
2. Install and configure Tailwind CSS
3. Create custom hooks for local storage
4. Build todo components (form, list, item, filter)
5. Implement CRUD operations
6. Add filtering functionality
7. Style with Tailwind CSS
8. Test and optimize

## Step 4: Approve and Build

1. Click "Approve & Build"
2. Watch the AI agent automatically:
   - Create the project structure
   - Install dependencies (React, Vite, Tailwind CSS)
   - Generate all code files
   - Set up configuration files

## Step 5: Run the Application

Once the build is complete:

1. Open the terminal in Whizan
2. Navigate to the project directory
3. Run: `npm run dev`
4. Open the application in your browser

## Generated Code Examples

### App.jsx
```jsx
import React, { useState, useEffect } from 'react';
import TodoList from './components/TodoList';
import TodoForm from './components/TodoForm';
import TodoFilter from './components/TodoFilter';
import { useLocalStorage } from './hooks/useLocalStorage';
import './index.css';

function App() {
  const [todos, setTodos] = useLocalStorage('todos', []);
  const [filter, setFilter] = useState('all');

  const addTodo = (text) => {
    const newTodo = {
      id: Date.now(),
      text,
      completed: false,
      createdAt: new Date().toISOString()
    };
    setTodos([...todos, newTodo]);
  };

  const toggleTodo = (id) => {
    setTodos(todos.map(todo =>
      todo.id === id ? { ...todo, completed: !todo.completed } : todo
    ));
  };

  const deleteTodo = (id) => {
    setTodos(todos.filter(todo => todo.id !== id));
  };

  const filteredTodos = todos.filter(todo => {
    if (filter === 'active') return !todo.completed;
    if (filter === 'completed') return todo.completed;
    return true;
  });

  return (
    <div className="min-h-screen bg-gray-100 py-8">
      <div className="max-w-md mx-auto bg-white rounded-lg shadow-lg p-6">
        <h1 className="text-3xl font-bold text-center text-gray-800 mb-8">
          Todo App
        </h1>
        <TodoForm onAdd={addTodo} />
        <TodoFilter filter={filter} onFilterChange={setFilter} />
        <TodoList
          todos={filteredTodos}
          onToggle={toggleTodo}
          onDelete={deleteTodo}
        />
      </div>
    </div>
  );
}

export default App;
```

### TodoForm.jsx
```jsx
import React, { useState } from 'react';
import { FiPlus } from 'react-icons/fi';

function TodoForm({ onAdd }) {
  const [text, setText] = useState('');

  const handleSubmit = (e) => {
    e.preventDefault();
    if (text.trim()) {
      onAdd(text.trim());
      setText('');
    }
  };

  return (
    <form onSubmit={handleSubmit} className="mb-6">
      <div className="flex gap-2">
        <input
          type="text"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Add a new todo..."
          className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        <button
          type="submit"
          className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <FiPlus className="w-5 h-5" />
        </button>
      </div>
    </form>
  );
}

export default TodoForm;
```

## Benefits of AI Agent

1. **Time Saving**: No need to manually set up project structure
2. **Best Practices**: AI follows modern development patterns
3. **Consistency**: Generated code follows consistent patterns
4. **Learning**: See how experienced developers structure projects
5. **Rapid Prototyping**: Quickly test ideas and concepts

## Customization

You can customize the AI agent's behavior by:

1. **Modifying Prompts**: Be more specific about requirements
2. **Adding Constraints**: Specify exact technologies or patterns
3. **Iterating**: Regenerate plans until satisfied
4. **Manual Edits**: Modify generated code as needed

## Next Steps

After the AI generates your project:

1. **Review Code**: Check the generated code for any issues
2. **Add Features**: Extend the application with additional functionality
3. **Customize Styling**: Modify the Tailwind classes for your design
4. **Add Tests**: Implement unit and integration tests
5. **Deploy**: Deploy to platforms like Vercel or Netlify

The AI agent makes it possible to go from idea to working application in minutes, not hours!
