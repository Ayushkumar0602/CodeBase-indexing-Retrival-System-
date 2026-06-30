# Auth — Technical Documentation

## Overview
The `auth.js` module serves as the central identity management layer for the application. It wraps the Firebase Authentication SDK to provide a consistent interface for user registration, session management, and credential verification. Its primary purpose is to abstract Firebase-specific implementation details and enforce session persistence across the application via automatic redirection.

## Architecture
This module acts as a **Service Layer** within the application architecture.
*   **Role:** Centralizes authentication state and provides a programmatic API for UI components to trigger auth workflows.
*   **Dependencies:** Relies on the Firebase SDK (`firebase/app`, `firebase/auth`).
*   **Dependents:** Consumed by UI entry points, route guards, and navigation controllers that need to verify user session status or invoke login/signup actions.

## Design Principles
*   **Singleton Pattern:** Exported as a singleton instance (`authService`). This ensures a single source of truth for the `currentUser` state across the entire application lifecycle.
*   **Observer Pattern:** Implements a custom listener mechanism (`onAuthStateChanged`) allowing multiple UI components to react to session changes without direct coupling to the service.
*   **Encapsulation:** Hides the complexity of Firebase SDK initialization and event handling, exposing only clean, intent-based methods (e.g., `signInWithGoogle`).
*   **Fail-Safe Design:** Uses `try/catch` blocks within all asynchronous methods to ensure the UI layer always receives a standardized return object (`{ success, user/error }`), preventing unhandled promise rejections.

## API Reference

### `authService` (Singleton)

#### `signInWithEmail(email, password)`
*   **Description:** Authenticates a user with existing credentials.
*   **Returns:** `Promise<{success: boolean, user?: Object, error?: string}>`

#### `signUpWithEmail(email, password)`
*   **Description:** Creates a new account via email/password.
*   **Returns:** `Promise<{success: boolean, user?: Object, error?: string}>`

#### `signInWithGoogle()`
*   **Description:** Triggers the Firebase Google OAuth popup flow.
*   **Returns:** `Promise<{success: boolean, user?: Object, error?: string}>`

#### `signOut()`
*   **Description:** Invalidates the current user session.
*   **Returns:** `Promise<{success: boolean, error?: string}>`

#### `isAuthenticated()`
*   **Description:** Synchronous check for user session existence.
*   **Returns:** `boolean`

#### `onAuthStateChanged(callback)`
*   **Description:** Subscribes a callback to auth state transitions.
*   **Parameters:** `callback` (Function) - Receives the `user` object (or null) upon change.

## Internal Logic
1.  **Initialization:** Upon instantiation, the class initializes the Firebase app and sets up an `onAuthStateChanged` listener.
2.  **Redirection Guard:** The internal listener enforces security by intercepting the `window.location`. It prevents unauthorized users from reaching internal pages and prevents authenticated users from re-visiting login/signup pages.
3.  **State Synchronization:** The `currentUser` property is kept in sync with the Firebase internal auth state.
4.  **Listener Dispatch:** When Firebase reports a state change, the module loops through `authStateListeners` and invokes them, ensuring that subscribers receive the latest user data immediately.

## Data Flow
*   **Input:** UI components pass credentials or trigger actions to the `authService` methods.
*   **Processing:** Methods route requests to the Firebase SDK.
*   **State Transformation:** Firebase updates the global auth state, triggering the internal `onAuthStateChanged` hook.
*   **Output:** The service notifies subscribers and handles browser-level redirects based on the final authorization state.

## Error Handling & Edge Cases
*   **Invalid Credentials:** Errors thrown by Firebase (e.g., wrong password, user not found) are caught, and the error message is returned in the response object, allowing the UI to display user-friendly feedback.
*   **Listener Errors:** The `notifyAuthStateListeners` method uses a secondary `try/catch` to ensure that if one subscriber fails, it does not prevent others from receiving the state update.
*   **Navigation Race Conditions:** The use of `onAuthStateChanged` ensures that redirection logic is based on the verified Firebase session rather than local client state.

## Usage Example

### Triggering Authentication
```javascript
import authService from './auth.js';

async function handleLogin(email, password) {
    const response = await authService.signInWithEmail(email, password);
    if (!response.success) {
        alert("Login failed: " + response.error);
    }
}
```

### Reacting to Auth State Changes
```javascript
import authService from './auth.js';

authService.onAuthStateChanged((user) => {
    if (user) {
        console.log("User logged in:", user.email);
    } else {
        console.log("User logged out");
    }
});
```