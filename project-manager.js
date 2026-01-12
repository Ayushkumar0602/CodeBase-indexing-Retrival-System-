// Project Manager Service
import { initializeApp } from 'firebase/app';
import { getDatabase, ref, set, get, push, remove } from 'firebase/database';
import authService from './auth.js';

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

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const database = getDatabase(app);

class ProjectManager {
    constructor() {
        this.recentFolders = [];
        this.maxRecentFolders = 10;
        this.loadRecentFolders();
    }

    // Get user-specific database reference
    getUserRef() {
        const user = authService.getCurrentUser();
        if (!user) {
            throw new Error('User not authenticated');
        }
        return ref(database, `users/${user.uid}/recentFolders`);
    }

    // Load recent folders from Firebase
    async loadRecentFolders() {
        try {
            const user = authService.getCurrentUser();
            if (!user) {
                // Fallback to localStorage if not authenticated
                this.recentFolders = this.loadFromLocalStorage();
                return;
            }

            const userRef = this.getUserRef();
            const snapshot = await get(userRef);
            
            if (snapshot.exists()) {
                this.recentFolders = Object.values(snapshot.val());
            } else {
                this.recentFolders = [];
            }
        } catch (error) {
            console.error('Error loading recent folders:', error);
            // Fallback to localStorage
            this.recentFolders = this.loadFromLocalStorage();
        }
    }

    // Add a folder to recent folders
    async addRecentFolder(folderPath, folderName = null) {
        try {
            const folderInfo = {
                path: folderPath,
                name: folderName || this.getFolderName(folderPath),
                lastOpened: new Date().toISOString(),
                id: this.generateId()
            };

            // Remove if already exists
            this.recentFolders = this.recentFolders.filter(folder => folder.path !== folderPath);
            
            // Add to beginning
            this.recentFolders.unshift(folderInfo);
            
            // Keep only max number of folders
            if (this.recentFolders.length > this.maxRecentFolders) {
                this.recentFolders = this.recentFolders.slice(0, this.maxRecentFolders);
            }

            // Save to Firebase
            const user = authService.getCurrentUser();
            if (user) {
                const userRef = this.getUserRef();
                await set(userRef, this.recentFolders);
            }

            // Also save to localStorage as backup
            this.saveToLocalStorage();

            return folderInfo;
        } catch (error) {
            console.error('Error adding recent folder:', error);
            // Fallback to localStorage only
            this.addToLocalStorage(folderPath, folderName);
        }
    }

    // Remove a folder from recent folders
    async removeRecentFolder(folderPath) {
        try {
            this.recentFolders = this.recentFolders.filter(folder => folder.path !== folderPath);
            
            // Update Firebase
            const user = authService.getCurrentUser();
            if (user) {
                const userRef = this.getUserRef();
                await set(userRef, this.recentFolders);
            }

            // Update localStorage
            this.saveToLocalStorage();
        } catch (error) {
            console.error('Error removing recent folder:', error);
            // Fallback to localStorage only
            this.removeFromLocalStorage(folderPath);
        }
    }

    // Get all recent folders
    getRecentFolders() {
        return [...this.recentFolders];
    }

    // Clear all recent folders
    async clearRecentFolders() {
        try {
            this.recentFolders = [];
            
            // Update Firebase
            const user = authService.getCurrentUser();
            if (user) {
                const userRef = this.getUserRef();
                await set(userRef, []);
            }

            // Update localStorage
            this.saveToLocalStorage();
        } catch (error) {
            console.error('Error clearing recent folders:', error);
            // Fallback to localStorage only
            this.clearLocalStorage();
        }
    }

    // Open a folder (this will be called by the main app)
    async openFolder(folderPath) {
        try {
            // Add to recent folders
            await this.addRecentFolder(folderPath);
            
            // Notify the main app to open the folder
            if (window.electronAPI) {
                window.electronAPI.openFolder(folderPath);
            } else {
                // Fallback for web version
                console.log('Opening folder:', folderPath);
                // You can implement web-specific folder opening logic here
            }
        } catch (error) {
            console.error('Error opening folder:', error);
        }
    }

    // Create a new project
    async createNewProject() {
        try {
            // Redirect to project documentation page
            window.location.href = 'project-docs.html';
        } catch (error) {
            console.error('Error creating new project:', error);
        }
    }

    // Helper methods for localStorage fallback
    loadFromLocalStorage() {
        try {
            const stored = localStorage.getItem('whizan_recent_folders');
            return stored ? JSON.parse(stored) : [];
        } catch (error) {
            console.error('Error loading from localStorage:', error);
            return [];
        }
    }

    saveToLocalStorage() {
        try {
            localStorage.setItem('whizan_recent_folders', JSON.stringify(this.recentFolders));
        } catch (error) {
            console.error('Error saving to localStorage:', error);
        }
    }

    addToLocalStorage(folderPath, folderName) {
        const folderInfo = {
            path: folderPath,
            name: folderName || this.getFolderName(folderPath),
            lastOpened: new Date().toISOString(),
            id: this.generateId()
        };

        let folders = this.loadFromLocalStorage();
        folders = folders.filter(folder => folder.path !== folderPath);
        folders.unshift(folderInfo);
        
        if (folders.length > this.maxRecentFolders) {
            folders = folders.slice(0, this.maxRecentFolders);
        }

        this.recentFolders = folders;
        this.saveToLocalStorage();
    }

    removeFromLocalStorage(folderPath) {
        let folders = this.loadFromLocalStorage();
        folders = folders.filter(folder => folder.path !== folderPath);
        this.recentFolders = folders;
        this.saveToLocalStorage();
    }

    clearLocalStorage() {
        this.recentFolders = [];
        this.saveToLocalStorage();
    }

    // Helper methods
    getFolderName(path) {
        return path.split(/[/\\]/).pop() || path;
    }

    generateId() {
        return Date.now().toString(36) + Math.random().toString(36).substr(2);
    }

    // Format date for display
    formatDate(dateString) {
        const date = new Date(dateString);
        const now = new Date();
        const diffInHours = (now - date) / (1000 * 60 * 60);

        if (diffInHours < 1) {
            return 'Just now';
        } else if (diffInHours < 24) {
            const hours = Math.floor(diffInHours);
            return `${hours} hour${hours > 1 ? 's' : ''} ago`;
        } else if (diffInHours < 168) { // 7 days
            const days = Math.floor(diffInHours / 24);
            return `${days} day${days > 1 ? 's' : ''} ago`;
        } else {
            return date.toLocaleDateString();
        }
    }
}

// Create and export singleton instance
const projectManager = new ProjectManager();
export default projectManager;
