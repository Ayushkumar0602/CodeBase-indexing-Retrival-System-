// Firebase Authentication Service
import { initializeApp } from 'firebase/app';
import { 
    getAuth, 
    signInWithEmailAndPassword, 
    createUserWithEmailAndPassword,
    signOut,
    onAuthStateChanged,
    GoogleAuthProvider,
    signInWithPopup
} from 'firebase/auth';

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
const auth = getAuth(app);
const googleProvider = new GoogleAuthProvider();

class AuthService {
    constructor() {
        this.currentUser = null;
        this.authStateListeners = [];
        this.initializeAuthState();
    }

    // Initialize auth state listener
    initializeAuthState() {
        onAuthStateChanged(auth, (user) => {
            this.currentUser = user;
            this.notifyAuthStateListeners(user);
            
            // Redirect based on auth state
            if (user) {
                // User is signed in
                if (window.location.pathname.includes('login.html') || 
                    window.location.pathname.includes('signup.html') ||
                    window.location.pathname.includes('landing.html')) {
                    window.location.href = 'project.html';
                }
            } else {
                // User is signed out
                if (!window.location.pathname.includes('login.html') && 
                    !window.location.pathname.includes('signup.html') &&
                    !window.location.pathname.includes('landing.html')) {
                    window.location.href = 'login.html';
                }
            }
        });
    }

    // Sign in with email and password
    async signInWithEmail(email, password) {
        try {
            const userCredential = await signInWithEmailAndPassword(auth, email, password);
            return { success: true, user: userCredential.user };
        } catch (error) {
            return { success: false, error: error.message };
        }
    }

    // Sign up with email and password
    async signUpWithEmail(email, password) {
        try {
            const userCredential = await createUserWithEmailAndPassword(auth, email, password);
            return { success: true, user: userCredential.user };
        } catch (error) {
            return { success: false, error: error.message };
        }
    }

    // Sign in with Google
    async signInWithGoogle() {
        try {
            const result = await signInWithPopup(auth, googleProvider);
            return { success: true, user: result.user };
        } catch (error) {
            return { success: false, error: error.message };
        }
    }

    // Sign out
    async signOut() {
        try {
            await signOut(auth);
            return { success: true };
        } catch (error) {
            return { success: false, error: error.message };
        }
    }

    // Get current user
    getCurrentUser() {
        return this.currentUser;
    }

    // Check if user is authenticated
    isAuthenticated() {
        return !!this.currentUser;
    }

    // Add auth state listener
    onAuthStateChanged(callback) {
        this.authStateListeners.push(callback);
        // Call immediately if user is already available
        if (this.currentUser !== null) {
            callback(this.currentUser);
        }
    }

    // Notify all auth state listeners
    notifyAuthStateListeners(user) {
        this.authStateListeners.forEach(callback => {
            try {
                callback(user);
            } catch (error) {
                console.error('Error in auth state listener:', error);
            }
        });
    }

    // Remove auth state listener
    removeAuthStateListener(callback) {
        const index = this.authStateListeners.indexOf(callback);
        if (index > -1) {
            this.authStateListeners.splice(index, 1);
        }
    }
}

// Create and export singleton instance
const authService = new AuthService();
export default authService;
