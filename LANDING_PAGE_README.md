# Whizan Landing Page System

This document describes the new landing page system for the Whizan code editor application, which includes Firebase authentication and project management features.

## Overview

The landing page system provides a complete authentication and project management workflow:

1. **Landing Page** - Displays the Whizan logo and redirects based on authentication status
2. **Authentication Pages** - Login and signup with Firebase integration
3. **Project Page** - Main dashboard with recently opened folders and project creation
4. **Project Documentation Page** - Create new projects with templates

## File Structure

```
├── landing.html              # Main landing page
├── login.html               # User login page
├── signup.html              # User registration page
├── project.html             # Project dashboard
├── project-docs.html        # New project creation
├── auth.js                  # Firebase authentication service (legacy)
├── project-manager.js       # Project management service (legacy)
├── main-new.js             # Updated main process with landing page support
└── preload-new.js          # Updated preload script with new APIs
```

## Features

### Authentication System
- **Firebase Integration**: Uses Firebase Authentication for user management
- **Email/Password**: Traditional email and password authentication
- **Google Sign-in**: OAuth authentication with Google
- **Automatic Redirects**: Users are automatically redirected based on authentication status
- **Session Management**: Persistent login sessions

### Project Management
- **Recently Opened Folders**: Stores and displays recently accessed project folders
- **Firebase Database**: Syncs folder data across devices using Firebase Realtime Database
- **Local Storage Fallback**: Falls back to localStorage when offline
- **Folder Operations**: Open, remove, and manage recent folders

### Project Creation
- **Template System**: Pre-built project templates (React, Node.js, Python, etc.)
- **Project Documentation**: Guided project setup with documentation
- **Workspace Integration**: Seamless integration with the main editor

## Firebase Configuration

The system uses the following Firebase configuration:

```javascript
const firebaseConfig = {
    apiKey: "AIzaSyCVYdfql5aqHrChlA1v3nxRLkIbYyWMvUg",
    authDomain: "study2-7bdc7.firebaseapp.com",
    databaseURL: "https://study2-7bdc7-default-rtdb.firebaseio.com",
    projectId: "study2-7bdc7",
    storageBucket: "study2-7bdc7.firebasestorage.app",
    messagingSenderId: "320617984870",
    appId: "1:320617984870:web:04b61ea4ee88ae057e4ea7",
    measurementId: "G-VRM14GRNWG"
};
```

## User Flow

### New User
1. User opens the application
2. Landing page displays for 4 seconds
3. Redirected to login page
4. User can sign up with email/password or Google
5. After authentication, redirected to project page
6. User can create new project or open existing folder

### Returning User
1. User opens the application
2. Landing page displays for 4 seconds
3. Firebase checks authentication status
4. If authenticated, redirected directly to project page
5. User sees recently opened folders and can continue working

### Project Management
1. **Open Folder**: Click "Open a Folder" to browse and select a project
2. **Recent Folders**: Click on any recent folder to open it in the editor
3. **Create New Project**: Click "Create New Project" to start a new project with templates
4. **Remove from Recent**: Click the remove button to remove folders from recent list

## Technical Implementation

### Authentication Flow
```javascript
// Check authentication status
onAuthStateChanged(auth, (user) => {
    if (user) {
        // User is signed in
        window.location.href = 'project.html';
    } else {
        // User is signed out
        window.location.href = 'login.html';
    }
});
```

### Project Manager
```javascript
// Add folder to recent
await projectManager.addRecentFolder(folderPath, folderName);

// Get recent folders
const folders = projectManager.getRecentFolders();

// Open folder
await projectManager.openFolder(folderPath);
```

### Electron Integration
```javascript
// Select folder dialog
const folderPath = await window.electronAPI.selectFolder();

// Open folder in editor
await window.electronAPI.openFolder(folderPath);
```

## Styling and UI

The system uses a modern, clean design with:
- **Gradient backgrounds**: Purple-blue gradients for visual appeal
- **Card-based layout**: Clean card components for different sections
- **Responsive design**: Works on different screen sizes
- **Smooth animations**: Hover effects and transitions
- **Consistent branding**: Whizan logo and color scheme throughout

## Security Features

- **Firebase Security Rules**: Database access controlled by Firebase security rules
- **User-specific Data**: Each user's data is isolated by user ID
- **Secure Authentication**: Firebase handles all authentication securely
- **Input Validation**: Form validation on client side
- **Error Handling**: Comprehensive error handling and user feedback

## Dependencies

### Firebase
- Firebase App
- Firebase Authentication
- Firebase Realtime Database

### Electron
- Updated main process for landing page support
- New preload script with folder selection APIs
- IPC handlers for folder operations

## Setup Instructions

1. **Install Dependencies**:
   ```bash
   npm install firebase
   ```

2. **Update Main Process**:
   - Replace `main.js` with `main-new.js` or update existing `main.js`
   - Replace `preload.js` with `preload-new.js` or update existing `preload.js`

3. **Firebase Setup**:
   - Ensure Firebase project is configured
   - Enable Authentication (Email/Password and Google)
   - Enable Realtime Database
   - Set up security rules

4. **Run Application**:
   ```bash
   npm start
   ```

## Future Enhancements

- **Project Templates**: More project templates and customization options
- **Team Collaboration**: Multi-user project sharing
- **Cloud Sync**: Additional cloud storage options
- **Project Analytics**: Usage statistics and project insights
- **Advanced Search**: Search through recent projects and folders
- **Project Categories**: Organize projects by type or category

## Troubleshooting

### Common Issues

1. **Firebase Connection Errors**:
   - Check internet connection
   - Verify Firebase configuration
   - Check Firebase project settings

2. **Authentication Issues**:
   - Clear browser cache and cookies
   - Check Firebase Authentication settings
   - Verify Google OAuth configuration

3. **Folder Selection Issues**:
   - Ensure Electron permissions are set correctly
   - Check file system permissions
   - Verify preload script is loaded

4. **Database Sync Issues**:
   - Check Firebase Realtime Database rules
   - Verify user authentication status
   - Check network connectivity

### Debug Mode

Enable debug mode by setting:
```javascript
localStorage.setItem('whizan_debug', 'true');
```

This will show additional console logs and error information.
