// Import Firebase from CDN
import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.7.0/firebase-app.js';
import {
    getAuth,
    onAuthStateChanged
} from 'https://www.gstatic.com/firebasejs/10.7.0/firebase-auth.js';
import {
    getFirestore,
    collection,
    query,
    where,
    getDocs,
    doc,
    updateDoc
} from 'https://www.gstatic.com/firebasejs/10.7.0/firebase-firestore.js';

// Firebase Configuration
const firebaseConfig = {
    apiKey: "AIzaSyABwi4-Rzl7T1qGLyWAWIAFcUxEivSX_BE",
    authDomain: "whizan-coding--agent.firebaseapp.com",
    databaseURL: "https://whizan-coding--agent-default-rtdb.firebaseio.com",
    projectId: "whizan-coding--agent",
    storageBucket: "whizan-coding--agent.firebasestorage.app",
    messagingSenderId: "798036544047",
    appId: "1:798036544047:web:ff7f8d3c44f40087e8d4da",
    measurementId: "G-8DJEL3Q4RH"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// AI Configuration
const GEMINI_API_KEY = "AIzaSyBDA_wIQPBjWVVelfjzAToKhQfkkGYDyac";
const GEMINI_API_URL = "https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent";
const OPENROUTER_API_KEY = "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";
const OPENROUTER_API_URL = "https://openrouter.ai/api/v1/chat/completions";

// Enhanced error logging
function logError(context, error, additionalData = {}) {
    console.error(`[${context}] Error:`, {
        message: error.message,
        status: error.status || error.response?.status,
        statusText: error.statusText || error.response?.statusText,
        url: error.url || additionalData.url,
        timestamp: new Date().toISOString(),
        ...additionalData
    });
}

// Test API connectivity
async function testAPIConnectivity() {
    console.log('Testing API connectivity...');
    
    // Test Gemini API
    try {
        const testResponse = await fetch(`${GEMINI_API_URL}?key=${GEMINI_API_KEY}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                contents: [{
                    parts: [{
                        text: "Hello, this is a test message."
                    }]
                }],
                generationConfig: {
                    temperature: 0.7,
                    maxOutputTokens: 100
                }
            })
        });
        
        console.log('Gemini API Test Response:', {
            status: testResponse.status,
            statusText: testResponse.statusText,
            ok: testResponse.ok
        });
        
        if (!testResponse.ok) {
            const errorText = await testResponse.text();
            console.error('Gemini API Error Response:', errorText);
        }
    } catch (error) {
        logError('Gemini API Test', error, { url: GEMINI_API_URL });
    }
    
    // Test OpenRouter API
    try {
        const testResponse = await fetch(OPENROUTER_API_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
                'HTTP-Referer': window.location.origin,
                'X-Title': 'Whizan Project Documentation'
            },
            body: JSON.stringify({
                model: 'deepseek/deepseek-chat-v3-0324:free',
                messages: [
                    {
                        role: 'user',
                        content: "Hello, this is a test message."
                    }
                ],
                temperature: 0.7,
                max_tokens: 100
            })
        });
        
        console.log('OpenRouter API Test Response:', {
            status: testResponse.status,
            statusText: testResponse.statusText,
            ok: testResponse.ok
        });
        
        if (!testResponse.ok) {
            const errorText = await testResponse.text();
            console.error('OpenRouter API Error Response:', errorText);
        }
    } catch (error) {
        logError('OpenRouter API Test', error, { url: OPENROUTER_API_URL });
    }
}

// Global Variables
let currentProject = null;
let currentStep = 1;
let workflowData = {
    requirements: null,
    refinedRequirements: null,
    schema: null,
    pages: null,
    visualMap: null,
    folderStructure: null,
    developmentPipeline: null
};

// Get project ID from URL
const urlParams = new URLSearchParams(window.location.search);
const projectId = urlParams.get('projectId');

// Load project details
async function loadProjectDetails() {
    try {
        if (!projectId) {
            throw new Error('No project ID provided');
        }

        const user = auth.currentUser;
        if (!user) {
            throw new Error('User not authenticated');
        }

        const projectsQuery = query(
            collection(db, 'UserProjects'),
            where('userId', '==', user.uid),
            where('projectId', '==', projectId)
        );

        const querySnapshot = await getDocs(projectsQuery);

        if (querySnapshot.empty) {
            throw new Error('Project not found');
        }

        const projectDoc = querySnapshot.docs[0];
        currentProject = { id: projectDoc.id, ...projectDoc.data() };

        // Update UI with project details
        document.getElementById('projectName').textContent = currentProject.projectName;
        document.getElementById('projectFramework').textContent = currentProject.framework;
        document.getElementById('projectId').textContent = currentProject.projectId;

        // Load saved workflow data if exists
        if (currentProject.tracker2Data) {
            await loadSavedWorkflowData(currentProject.tracker2Data);
        }

        console.log('Project loaded:', currentProject);

    } catch (error) {
        console.error('Error loading project:', error);
        alert(`Failed to load project: ${error.message}`);
    }
}

// Load saved workflow data
async function loadSavedWorkflowData(savedData) {
    try {
        workflowData = {
            requirements: savedData.requirements || null,
            refinedRequirements: savedData.refinedRequirements || null,
            schema: savedData.schema || null,
            pages: savedData.pages || null,
            visualMap: savedData.visualMap || null,
            folderStructure: savedData.folderStructure || null,
            developmentPipeline: savedData.developmentPipeline || null
        };

        // Restore UI for each completed step
        if (workflowData.requirements) {
            await restoreStep1UI();
        }
        if (workflowData.refinedRequirements) {
            await restoreStep2UI();
        }
        if (workflowData.schema) {
            await restoreStep3UI();
        }
        if (workflowData.pages) {
            await restoreStep4UI();
        }
        if (workflowData.visualMap) {
            await restoreStep5UI();
        }
        if (workflowData.folderStructure) {
            await restoreStep6UI();
        }
        if (workflowData.developmentPipeline) {
            await restoreStep7UI();
        }

        console.log('Saved workflow data loaded:', workflowData);
    } catch (error) {
        console.error('Error loading saved workflow data:', error);
    }
}

// Save workflow data to Firestore
async function saveWorkflowDataToFirestore() {
    try {
        const user = auth.currentUser;
        if (!user || !currentProject) {
            throw new Error('User not authenticated or project not loaded');
        }

        const projectRef = doc(db, 'UserProjects', currentProject.id);
        
        await updateDoc(projectRef, {
            tracker2Data: workflowData,
            updatedAt: new Date().toISOString()
        });

        console.log('Workflow data saved to Firestore');
    } catch (error) {
        console.error('Error saving workflow data:', error);
        throw error;
    }
}

// Get selected AI model
function getSelectedAIModel() {
    const selectedModel = document.querySelector('input[name="aiModel"]:checked');
    return selectedModel ? selectedModel.value : 'gemini';
}

// Show/hide loading overlay
function showLoading(message = 'Processing...') {
    document.getElementById('loadingText').textContent = message;
    document.getElementById('loadingOverlay').style.display = 'flex';
}

function hideLoading() {
    document.getElementById('loadingOverlay').style.display = 'none';
}

// Create streaming display
function createStreamingDisplay(containerId) {
    const container = document.getElementById(containerId);
    // Ensure only one streaming container exists at a time
    const existing = document.getElementById('streamingOutput');
    if (existing && existing.parentElement) {
        existing.parentElement.removeChild(existing);
    }
    const streamingDiv = document.createElement('div');
    streamingDiv.id = 'streamingOutput';
    streamingDiv.style.cssText = `
        background: #1e1e1e;
        color: #00ff00;
        font-family: 'Monaco', monospace;
        padding: 1rem;
        border-radius: 8px;
        max-height: 300px;
        overflow-y: auto;
        border: 1px solid #333;
        margin: 1rem 0;
        font-size: 14px;
        line-height: 1.4;
    `;
    container.appendChild(streamingDiv);
    return streamingDiv;
}

// Update streaming display
function updateStreamingDisplay(content) {
    const streamingDiv = document.getElementById('streamingOutput');
    if (streamingDiv) {
        streamingDiv.textContent = content;
        streamingDiv.scrollTop = streamingDiv.scrollHeight;
        
        // Add a subtle animation to make it more visible
        streamingDiv.style.border = '2px solid #00ff00';
        setTimeout(() => {
            streamingDiv.style.border = '1px solid #333';
        }, 200);
    }
}

// Update step status
function updateStepStatus(stepNumber, status, isActive = false, isCompleted = false) {
    const step = document.getElementById(`step${stepNumber}`);
    const statusElement = document.getElementById(`step${stepNumber}Status`);

    step.className = 'workflow-step';
    if (isActive) step.classList.add('active');
    if (isCompleted) step.classList.add('completed');

    statusElement.textContent = status;
}

// Enable next step
function enableNextStep(stepNumber) {
    const nextStepBtn = document.getElementById(`step${stepNumber + 1}Btn`);
    if (nextStepBtn) {
        nextStepBtn.disabled = false;
    }
}

// AI API calls
async function callGeminiAPI(prompt, onTokenReceived = null) {
    try {
        console.log('Calling Gemini API with prompt length:', prompt.length);
        
        if (onTokenReceived) {
            // Use streaming API for real-time token streaming
            const requestBody = {
                contents: [{
                    parts: [{
                        text: prompt
                    }]
                }],
                generationConfig: {
                    temperature: 0.7,
                    maxOutputTokens: 4000
                }
            };
            
            console.log('Gemini API Request Body:', JSON.stringify(requestBody, null, 2));
            
            const response = await fetch(`${GEMINI_API_URL}?key=${GEMINI_API_KEY}`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(requestBody)
            });

            console.log('Gemini API Response Status:', response.status, response.statusText);
            
            if (!response.ok) {
                const errorText = await response.text();
                console.error('Gemini API Error Response:', errorText);
                throw new Error(`HTTP error! status: ${response.status} - ${errorText}`);
            }

            const reader = response.body.getReader();
            const decoder = new TextDecoder();
            let fullResponse = '';
            let buffer = '';

            while (true) {
                const { done, value } = await reader.read();
                if (done) break;

                buffer += decoder.decode(value, { stream: true });
                const lines = buffer.split('\n');
                buffer = lines.pop() || '';

                for (const line of lines) {
                    if (line.startsWith('data: ')) {
                        const data = line.slice(6);
                        if (data === '[DONE]') {
                            return fullResponse;
                        }

                        try {
                            const parsed = JSON.parse(data);
                            if (parsed.candidates && parsed.candidates[0] && parsed.candidates[0].content && parsed.candidates[0].content.parts && parsed.candidates[0].content.parts[0]) {
                                const token = parsed.candidates[0].content.parts[0].text;
                                if (token) {
                                    fullResponse += token;
                                    onTokenReceived(fullResponse);
                                }
                            }
                        } catch (e) {
                            // Ignore parsing errors for incomplete chunks
                        }
                    }
                }
            }

            return fullResponse;
        } else {
            // Non-streaming API call
            const response = await fetch(`${GEMINI_API_URL}?key=${GEMINI_API_KEY}`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    contents: [{
                        parts: [{
                            text: prompt
                        }]
                    }],
                    generationConfig: {
                        temperature: 0.7,
                        maxOutputTokens: 4000
                    }
                })
            });

            const data = await response.json();
            
            if (data.candidates && data.candidates[0] && data.candidates[0].content) {
                return data.candidates[0].content.parts[0].text.trim();
            } else {
                throw new Error('Invalid response from Gemini API');
            }
        }
    } catch (error) {
        console.error('Error calling Gemini API:', error);
        throw error;
    }
}

async function callOpenRouterAPI(prompt, model = 'deepseek/deepseek-chat-v3-0324:free', onTokenReceived = null) {
    try {
        console.log('Calling OpenRouter API with model:', model, 'prompt length:', prompt.length);
        
        if (onTokenReceived) {
            // Use streaming API for real-time token streaming
            const requestBody = {
                model: model,
                messages: [
                    {
                        role: 'user',
                        content: prompt
                    }
                ],
                temperature: 0.7,
                max_tokens: 4000,
                stream: true // Enable streaming
            };
            
            console.log('OpenRouter API Request Body:', JSON.stringify(requestBody, null, 2));
            
            const response = await fetch(OPENROUTER_API_URL, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
                    'HTTP-Referer': window.location.origin,
                    'X-Title': 'Whizan Project Documentation'
                },
                body: JSON.stringify(requestBody)
            });

            console.log('OpenRouter API Response Status:', response.status, response.statusText);
            
            if (!response.ok) {
                const errorText = await response.text();
                console.error('OpenRouter API Error Response:', errorText);
                throw new Error(`HTTP error! status: ${response.status} - ${errorText}`);
            }

            const reader = response.body.getReader();
            const decoder = new TextDecoder();
            let fullResponse = '';
            let buffer = '';

            while (true) {
                const { done, value } = await reader.read();
                if (done) break;

                buffer += decoder.decode(value, { stream: true });
                const lines = buffer.split('\n');
                buffer = lines.pop() || '';

                for (const line of lines) {
                    if (line.startsWith('data: ')) {
                        const data = line.slice(6);
                        if (data === '[DONE]') {
                            return fullResponse;
                        }

                        try {
                            const parsed = JSON.parse(data);
                            if (parsed.choices && parsed.choices[0] && parsed.choices[0].delta && parsed.choices[0].delta.content) {
                                const token = parsed.choices[0].delta.content;
                                fullResponse += token;
                                onTokenReceived(fullResponse);
                            }
                        } catch (e) {
                            // Ignore parsing errors for incomplete chunks
                        }
                    }
                }
            }

            return fullResponse;
        } else {
            // Non-streaming API call
            const response = await fetch(OPENROUTER_API_URL, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
                    'HTTP-Referer': window.location.origin,
                    'X-Title': 'Whizan Project Documentation'
                },
                body: JSON.stringify({
                    model: model,
                    messages: [
                        {
                            role: 'user',
                            content: prompt
                        }
                    ],
                    temperature: 0.7,
                    max_tokens: 4000
                })
            });

            const data = await response.json();
            
            if (data.choices && data.choices[0] && data.choices[0].message) {
                return data.choices[0].message.content.trim();
            } else {
                throw new Error('Invalid response from OpenRouter API');
            }
        }
    } catch (error) {
        console.error('Error calling OpenRouter API:', error);
        throw error;
    }
}

// Call AI API based on selected model
async function callAIAPI(prompt, onTokenReceived = null) {
    const selectedModel = getSelectedAIModel();
    
    try {
        // Only use streaming for OpenRouter; Gemini non-streaming for reliability
        if (selectedModel === 'gemini') {
            return await callGeminiAPI(prompt, null);
        } else {
            return await callOpenRouterAPI(prompt, undefined, onTokenReceived);
        }
    } catch (error) {
        logError('AI API Call', error, { 
            selectedModel, 
            promptLength: prompt.length 
        });
        
        // Try fallback to the other model
        console.log('Trying fallback to alternative model...');
        try {
            if (selectedModel === 'gemini') {
                return await callOpenRouterAPI(prompt, undefined, onTokenReceived);
            } else {
                return await callGeminiAPI(prompt, null);
            }
        } catch (fallbackError) {
            logError('AI API Fallback', fallbackError, { 
                originalModel: selectedModel,
                fallbackModel: selectedModel === 'gemini' ? 'openrouter' : 'gemini'
            });
            throw new Error(`Both AI models failed. Original error: ${error.message}. Fallback error: ${fallbackError.message}`);
        }
    }
}

// Step 1: Requirements Collection
async function startStep1() {
    const appOverview = document.getElementById('appOverview').value.trim();

    if (!appOverview) {
        alert('Please provide an application overview');
        return;
    }

    showLoading('Processing requirements...');
    updateStepStatus(1, 'Processing...', true);

    // Create streaming display
    const step1Content = document.querySelector('#step1 .step-content');
    const streamingDisplay = createStreamingDisplay('step1');
    
    // Add a label for the streaming display
    const streamingLabel = document.createElement('div');
    streamingLabel.innerHTML = '<h4 style="color: #10b981; margin: 1rem 0;">🔄 Live Generation in Progress...</h4>';
    step1Content.appendChild(streamingLabel);

    try {
        const prompt = `You are an expert Firebase developer and project architect. Analyze the following application overview and extract comprehensive requirements for a Firebase-based application.

Application Overview:
${appOverview}

Framework: ${currentProject.framework}

Please provide a detailed, structured analysis including:

1. CORE FEATURES
   - List all primary features the app should have
   - Identify user interactions and workflows
   - Specify data management requirements

2. USER TYPES & ROLES
   - Define different user categories
   - Specify permissions and access levels
   - Identify user-specific features

3. TECHNICAL REQUIREMENTS
   - Authentication requirements (Firebase Auth)
   - Data storage needs (Firestore/Realtime DB)
   - Real-time features needed
   - File storage requirements (Firebase Storage)
   - Security rules considerations

4. FIREBASE SERVICES MAPPING
   - Authentication: Which methods (email/password, Google, etc.)
   - Firestore: Collections and data structure hints
   - Realtime Database: Real-time features needed
   - Storage: File upload/download requirements
   - Functions: Server-side logic requirements
   - Hosting: Deployment considerations

5. KEY FUNCTIONALITY BREAKDOWN
   - User registration/login flows
   - Data CRUD operations
   - Real-time updates
   - File handling
   - Security and privacy features

Format the response as a clear, structured document with Firebase-specific recommendations.`;

        // Set 5-minute timeout
        const timeoutPromise = new Promise((_, reject) => {
            setTimeout(() => reject(new Error('Request timeout after 5 minutes')), 300000);
        });

        const analysisPromise = callAIAPI(prompt, (tokens) => {
            updateStreamingDisplay(tokens);
        });
        
        // Add initial streaming message
        updateStreamingDisplay('🚀 Starting requirements analysis...\n\n');

        const analysis = await Promise.race([analysisPromise, timeoutPromise]);
        workflowData.requirements = {
            overview: appOverview,
            analysis: analysis
        };

        // Display the analysis
        const requirementsPreview = document.createElement('div');
        requirementsPreview.innerHTML = `
            <h4>Requirements Analysis</h4>
            <div style="background: white; padding: 1rem; border-radius: 8px; margin: 1rem 0;">
                <pre style="white-space: pre-wrap; font-family: inherit;">${analysis}</pre>
            </div>
            <div style="display: flex; gap: 0.5rem;">
                <button onclick="editRequirements()" style="padding: 0.5rem 1rem; border: 1px solid #d1d5db; border-radius: 6px; background: white; cursor: pointer;">Edit</button>
                <button onclick="approveRequirements()" class="approve-btn" style="padding: 0.5rem 1rem; border-radius: 6px; cursor: pointer; background: #10b981; color: white; border: none;">Approve</button>
            </div>
        `;

        document.querySelector('#step1 .step-content').appendChild(requirementsPreview);

                updateStepStatus(1, 'Completed', false, true);
        enableNextStep(1);
        
        // Clean up streaming display
        const streamingDiv = document.getElementById('streamingOutput');
        if (streamingDiv) {
            streamingDiv.style.display = 'none';
        }
        
        console.log('Requirements processed:', workflowData.requirements);
        
    } catch (error) {
        console.error('Error in Step 1:', error);
        updateStepStatus(1, 'Error', false, false);
        alert(`Error processing requirements: ${error.message}`);
    } finally {
        hideLoading();
    }
}

// Requirements actions
function editRequirements() {
    const requirementsPreview = document.querySelector('#step1 .step-content > div:last-child');
    const currentAnalysis = workflowData.requirements.analysis;
    
    // Create edit interface
    const editInterface = document.createElement('div');
    editInterface.innerHTML = `
        <div style="background: #f8fafc; border: 2px solid #10b981; border-radius: 8px; padding: 1rem; margin: 1rem 0;">
            <h4 style="color: #10b981; margin-bottom: 1rem;">✏️ Edit Requirements Analysis</h4>
            <textarea id="editRequirementsText" style="width: 100%; min-height: 300px; padding: 1rem; border: 1px solid #d1d5db; border-radius: 6px; font-family: 'Monaco', monospace; font-size: 14px; resize: vertical;">${currentAnalysis}</textarea>
            <div style="display: flex; gap: 0.5rem; margin-top: 1rem;">
                <button onclick="saveRequirementsEdit()" style="padding: 0.5rem 1rem; border-radius: 6px; cursor: pointer; background: #10b981; color: white; border: none;">Save Changes</button>
                <button onclick="cancelRequirementsEdit()" style="padding: 0.5rem 1rem; border: 1px solid #d1d5db; border-radius: 6px; background: white; cursor: pointer;">Cancel</button>
            </div>
        </div>
    `;
    
    requirementsPreview.appendChild(editInterface);
}

function saveRequirementsEdit() {
    const newAnalysis = document.getElementById('editRequirementsText').value;
    if (newAnalysis) {
        workflowData.requirements.analysis = newAnalysis;
        
        // Update the display
        const requirementsPreview = document.querySelector('#step1 .step-content > div:last-child');
        requirementsPreview.innerHTML = `
            <h4>Requirements Analysis</h4>
            <div style="background: white; padding: 1rem; border-radius: 8px; margin: 1rem 0;">
                <pre style="white-space: pre-wrap; font-family: inherit;">${newAnalysis}</pre>
            </div>
            <div style="display: flex; gap: 0.5rem;">
                <button onclick="editRequirements()" style="padding: 0.5rem 1rem; border: 1px solid #d1d5db; border-radius: 6px; background: white; cursor: pointer;">Edit</button>
                <button onclick="approveRequirements()" class="approve-btn" style="padding: 0.5rem 1rem; border-radius: 6px; cursor: pointer; background: #10b981; color: white; border: none;">Approve</button>
            </div>
        `;
    }
}

function cancelRequirementsEdit() {
    const editInterface = document.querySelector('#step1 .step-content > div:last-child > div:last-child');
    if (editInterface) {
        editInterface.remove();
    }
}

async function approveRequirements() {
    updateStepStatus(1, 'Approved and ready for refinement', false, true);
    enableNextStep(1);
    
    // Hide the edit/approve buttons
    const buttons = document.querySelector('#step1 .step-content > div:last-child > div:last-child');
    if (buttons) {
        buttons.innerHTML = '<div style="color: #10b981; font-weight: 600;">✓ Requirements Approved</div>';
    }
    
    // Save to Firestore
    try {
        await saveWorkflowDataToFirestore();
        console.log('Requirements approved and saved to Firestore');
    } catch (error) {
        console.error('Error saving requirements:', error);
        alert('Requirements approved but failed to save to database. Please try again.');
    }
}

// Step 2: Conversational Refinement
async function startStep2() {
    if (!workflowData.requirements) {
        alert('Please complete Step 1 first');
        return;
    }

    showLoading('Initializing AI conversation...');
    updateStepStatus(2, 'Initializing...', true);

    try {
        // Show chat interface
        document.getElementById('chatContainer').style.display = 'block';
        document.getElementById('step2Btn').style.display = 'none';

        // Add end chat button
        const chatContainer = document.getElementById('chatContainer');
        const endChatBtn = document.createElement('button');
        endChatBtn.textContent = 'End Conversation & Generate Summary';
        endChatBtn.className = 'end-chat-btn';
        endChatBtn.style.cssText = `
            background: #10b981;
            color: white;
            border: none;
            padding: 0.5rem 1rem;
            border-radius: 6px;
            cursor: pointer;
            margin: 1rem 0;
            font-weight: 600;
        `;
        endChatBtn.onclick = endChatAndGenerateSummary;
        chatContainer.appendChild(endChatBtn);

        // Initialize conversation with structured prompt
        const initialPrompt = `You are an expert Firebase developer conducting a requirements refinement session. 

CURRENT REQUIREMENTS:
${workflowData.requirements.analysis}

FRAMEWORK: ${currentProject.framework}

TASK: Start a structured conversation to refine and clarify the requirements.

CONVERSATION GUIDELINES:
1. Ask ONE specific question at a time
2. Focus on Firebase-specific requirements
3. Be clear and professional
4. Wait for user response before asking next question

POTENTIAL AREAS TO EXPLORE:
- User authentication methods (email/password, Google, etc.)
- Data structure and relationships
- Real-time features needed
- File upload/download requirements
- Security and privacy requirements
- User roles and permissions
- Performance requirements
- Integration needs

Start with a welcoming message and ask your first specific question about the requirements.`;

        const initialResponse = await callAIAPI(initialPrompt);

        // Add AI's initial message
        addChatMessage('ai', initialResponse);

        updateStepStatus(2, 'Conversation active - Ask questions to refine requirements', false, false);

    } catch (error) {
        console.error('Error in Step 2:', error);
        updateStepStatus(2, 'Error', false, false);
        alert(`Error initializing conversation: ${error.message}`);
    } finally {
        hideLoading();
    }
}

// Chat functionality
function addChatMessage(sender, message) {
    const chatMessages = document.getElementById('chatMessages');
    const messageDiv = document.createElement('div');
    messageDiv.className = `chat-message ${sender}`;

    // Format AI messages with better structure
    if (sender === 'ai') {
        messageDiv.innerHTML = `<strong>AI Assistant:</strong><br>${message.replace(/\n/g, '<br>')}`;
    } else {
        messageDiv.innerHTML = `<strong>You:</strong><br>${message.replace(/\n/g, '<br>')}`;
    }

    chatMessages.appendChild(messageDiv);
    chatMessages.scrollTop = chatMessages.scrollHeight;
}

async function sendChatMessage() {
    const chatInput = document.getElementById('chatInput');
    const message = chatInput.value.trim();

    if (!message) return;

    // Add user message
    addChatMessage('user', message);
    chatInput.value = '';

    // Show typing indicator
    updateStepStatus(2, 'AI is analyzing your response...', true);

    try {
        const conversationPrompt = `You are continuing a Firebase requirements refinement conversation.

USER'S LATEST MESSAGE: ${message}

ORIGINAL REQUIREMENTS: ${workflowData.requirements.analysis}

FRAMEWORK: ${currentProject.framework}

RESPONSE GUIDELINES:
1. Provide a clear, helpful response
2. Ask ONE follow-up question if needed
3. If the user seems satisfied, acknowledge and ask if they want to finalize
4. Keep responses focused and professional
5. Structure your response clearly with proper formatting

Respond appropriately to the user's message. If they seem ready to finish, ask if they want to finalize the requirements and move to the next step.`;

        const response = await callAIAPI(conversationPrompt);
        addChatMessage('ai', response);

        updateStepStatus(2, 'Conversation active - Continue or end when ready', false, false);

    } catch (error) {
        console.error('Error in chat:', error);
        addChatMessage('ai', 'Sorry, I encountered an error. Please try again.');
        updateStepStatus(2, 'Error in conversation', false, false);
    }
}

// End chat and generate summary
async function endChatAndGenerateSummary() {
    showLoading('Generating final requirements summary...');
    updateStepStatus(2, 'Generating summary...', true);

    try {
        const summaryPrompt = `You are finalizing a Firebase project requirements refinement session.

ORIGINAL REQUIREMENTS: ${workflowData.requirements.analysis}

FRAMEWORK: ${currentProject.framework}

TASK: Generate a comprehensive, structured summary of the refined requirements.

REQUIRED STRUCTURE:
1. PROJECT OVERVIEW
   - Brief description of the application
   - Main purpose and goals

2. CORE FEATURES
   - List all primary features
   - Feature descriptions and requirements

3. USER TYPES & ROLES
   - Different user categories
   - Permissions and access levels

4. TECHNICAL REQUIREMENTS
   - Authentication methods
   - Database structure
   - Real-time features
   - File handling
   - Security requirements

5. FIREBASE SERVICES MAPPING
   - Authentication: [methods]
   - Firestore: [collections and structure]
   - Realtime Database: [real-time features]
   - Storage: [file requirements]
   - Functions: [server-side logic]
   - Hosting: [deployment]

6. IMPLEMENTATION CONSIDERATIONS
   - Performance requirements
   - Security considerations
   - Scalability factors

Format the response as a clear, structured document ready for development.`;

        const refinedRequirements = await callAIAPI(summaryPrompt);
        workflowData.refinedRequirements = refinedRequirements;

        // Display the refined requirements
        const chatContainer = document.getElementById('chatContainer');
        const summaryDiv = document.createElement('div');
        summaryDiv.innerHTML = `
            <div style="background: #f0fdf4; border: 1px solid #10b981; border-radius: 8px; padding: 1rem; margin: 1rem 0;">
                <h4 style="color: #10b981; margin-bottom: 1rem;">📋 Final Requirements Summary</h4>
                <pre style="white-space: pre-wrap; font-family: inherit; background: white; padding: 1rem; border-radius: 4px; max-height: 400px; overflow-y: auto;">${refinedRequirements}</pre>
                <div style="display: flex; gap: 0.5rem; margin-top: 1rem;">
                    <button onclick="editRefinedRequirements()" style="padding: 0.5rem 1rem; border: 1px solid #d1d5db; border-radius: 6px; background: white; cursor: pointer;">Edit Summary</button>
                    <button onclick="approveRefinedRequirements()" class="approve-btn" style="padding: 0.5rem 1rem; border-radius: 6px; cursor: pointer; background: #10b981; color: white; border: none;">Approve & Continue</button>
                </div>
            </div>
        `;
        chatContainer.appendChild(summaryDiv);

        updateStepStatus(2, 'Summary generated - Review and approve', false, false);

    } catch (error) {
        console.error('Error generating summary:', error);
        updateStepStatus(2, 'Error generating summary', false, false);
        alert(`Error generating summary: ${error.message}`);
    } finally {
        hideLoading();
    }
}

// Refined requirements actions
function editRefinedRequirements() {
    const currentSummary = workflowData.refinedRequirements;
    const newSummary = prompt('Edit the refined requirements summary:', currentSummary);
    if (newSummary) {
        workflowData.refinedRequirements = newSummary;
        // Update the display
        const summaryDiv = document.querySelector('#chatContainer > div:last-child');
        if (summaryDiv) {
            summaryDiv.innerHTML = `
                <div style="background: #f0fdf4; border: 1px solid #10b981; border-radius: 8px; padding: 1rem; margin: 1rem 0;">
                    <h4 style="color: #10b981; margin-bottom: 1rem;">📋 Final Requirements Summary</h4>
                    <pre style="white-space: pre-wrap; font-family: inherit; background: white; padding: 1rem; border-radius: 4px; max-height: 400px; overflow-y: auto;">${newSummary}</pre>
                    <div style="display: flex; gap: 0.5rem; margin-top: 1rem;">
                        <button onclick="editRefinedRequirements()" style="padding: 0.5rem 1rem; border: 1px solid #d1d5db; border-radius: 6px; background: white; cursor: pointer;">Edit Summary</button>
                        <button onclick="approveRefinedRequirements()" class="approve-btn" style="padding: 0.5rem 1rem; border-radius: 6px; cursor: pointer; background: #10b981; color: white; border: none;">Approve & Continue</button>
                    </div>
                </div>
            `;
        }
    }
}

async function approveRefinedRequirements() {
    updateStepStatus(2, 'Requirements refined and approved', false, true);
    enableNextStep(2);
    
    // Hide the chat interface
    document.getElementById('chatContainer').style.display = 'none';
    
    // Save to Firestore
    try {
        await saveWorkflowDataToFirestore();
        console.log('Refined requirements approved and saved to Firestore');
    } catch (error) {
        console.error('Error saving refined requirements:', error);
        alert('Requirements approved but failed to save to database. Please try again.');
    }
}

// Step 3: Database Schema Generation
async function startStep3() {
    if (!workflowData.requirements) {
        alert('Please complete previous steps first');
        return;
    }

    showLoading('Generating Firestore schema...');
    updateStepStatus(3, 'Generating...', true);

    try {
        const requirements = workflowData.refinedRequirements || workflowData.requirements.analysis;

        const prompt = `You are an expert Firebase Firestore architect. Based on the following refined requirements, design a comprehensive Firestore database schema.

REFINED REQUIREMENTS:
${requirements}

FRAMEWORK: ${currentProject.framework}

TASK: Create a detailed, structured Firestore database schema.

REQUIRED STRUCTURE:

1. COLLECTIONS OVERVIEW
   - List all main collections with purposes
   - Identify sub-collections where needed
   - Explain collection relationships

2. DETAILED COLLECTION SCHEMAS
   For each collection, provide:
   - Collection name and purpose
   - Document structure with field names
   - Data types (string, number, boolean, timestamp, array, map, reference)
   - Required vs optional fields
   - Firebase-specific fields (createdAt, updatedAt, userId, etc.)

3. RELATIONSHIPS & REFERENCES
   - How collections connect to each other
   - Foreign key relationships
   - Data access patterns
   - Query optimization considerations

4. SECURITY RULES
   - Firestore security rules for each collection
   - User access patterns
   - Data ownership and permissions
   - Authentication requirements

5. INDEXING STRATEGY
   - Composite indexes needed
   - Query optimization recommendations
   - Performance considerations

6. IMPLEMENTATION NOTES
   - Special considerations
   - Best practices
   - Scalability factors

Format the response as a clear, structured document with proper sections and subsections. Use consistent formatting and provide detailed explanations.`;

        const schema = await callAIAPI(prompt);
        workflowData.schema = schema;

        // Display schema
        const schemaPreview = document.getElementById('schemaPreview');
        const schemaContent = document.getElementById('schemaContent');
        schemaContent.innerHTML = `<pre style="white-space: pre-wrap; font-family: 'Monaco', monospace;">${schema}</pre>`;
        schemaPreview.style.display = 'block';

        updateStepStatus(3, 'Schema generated - Review and approve', false, false);
        enableNextStep(3);

    } catch (error) {
        console.error('Error in Step 3:', error);
        updateStepStatus(3, 'Error', false, false);
        alert(`Error generating schema: ${error.message}`);
    } finally {
        hideLoading();
    }
}

// Schema actions
function editSchema() {
    const schemaPreview = document.getElementById('schemaPreview');
    const currentSchema = document.getElementById('schemaContent').textContent;
    
    // Create edit interface
    const editInterface = document.createElement('div');
    editInterface.innerHTML = `
        <div style="background: #f8fafc; border: 2px solid #10b981; border-radius: 8px; padding: 1rem; margin: 1rem 0;">
            <h4 style="color: #10b981; margin-bottom: 1rem;">✏️ Edit Database Schema</h4>
            <textarea id="editSchemaText" style="width: 100%; min-height: 300px; padding: 1rem; border: 1px solid #d1d5db; border-radius: 6px; font-family: 'Monaco', monospace; font-size: 14px; resize: vertical;">${currentSchema}</textarea>
            <div style="display: flex; gap: 0.5rem; margin-top: 1rem;">
                <button onclick="saveSchemaEdit()" style="padding: 0.5rem 1rem; border-radius: 6px; cursor: pointer; background: #10b981; color: white; border: none;">Save Changes</button>
                <button onclick="cancelSchemaEdit()" style="padding: 0.5rem 1rem; border: 1px solid #d1d5db; border-radius: 6px; background: white; cursor: pointer;">Cancel</button>
            </div>
        </div>
    `;
    
    schemaPreview.appendChild(editInterface);
}

function saveSchemaEdit() {
    const newSchema = document.getElementById('editSchemaText').value;
    if (newSchema) {
        workflowData.schema = newSchema;
        document.getElementById('schemaContent').innerHTML = `<pre style="white-space: pre-wrap; font-family: 'Monaco', monospace;">${newSchema}</pre>`;
        
        // Remove edit interface
        const editInterface = document.querySelector('#schemaPreview > div:last-child');
        if (editInterface) {
            editInterface.remove();
        }
    }
}

function cancelSchemaEdit() {
    const editInterface = document.querySelector('#schemaPreview > div:last-child');
    if (editInterface) {
        editInterface.remove();
    }
}

async function approveSchema() {
    updateStepStatus(3, 'Approved', false, true);
    enableNextStep(3);
    
    // Save to Firestore
    try {
        await saveWorkflowDataToFirestore();
        console.log('Schema approved and saved to Firestore');
    } catch (error) {
        console.error('Error saving schema:', error);
        alert('Schema approved but failed to save to database. Please try again.');
    }
}

// Step 4: Page Decision
async function startStep4() {
    if (!workflowData.schema) {
        alert('Please complete Step 3 first');
        return;
    }

    showLoading('Generating application pages...');
    updateStepStatus(4, 'Generating...', true);

    try {
        const prompt = `You are an expert React/Next.js developer. Based on the requirements and database schema, determine all the pages needed for this Firebase application.

Requirements:
${workflowData.requirements.analysis}

Database Schema:
${workflowData.schema}

Framework: ${currentProject.framework}

Create a comprehensive list of application pages including:

1. AUTHENTICATION PAGES
   - Login, Register, Password Reset, etc.

2. MAIN APPLICATION PAGES
   - Dashboard, Profile, Settings, etc.
   - Data management pages
   - Feature-specific pages

3. ADMIN PAGES (if needed)
   - User management, system settings, etc.

4. UTILITY PAGES
   - 404, Error pages, Loading states

For each page, provide:
- Page name and route
- Purpose and functionality
- Key features and components
- Data requirements
- User access level

Format as a structured list with clear descriptions.`;

        const pages = await callAIAPI(prompt);
        workflowData.pages = pages;

        // Display pages
        const pagesPreview = document.getElementById('pagesPreview');
        const pagesList = document.getElementById('pagesList');
        pagesList.innerHTML = `<pre style="white-space: pre-wrap; font-family: inherit;">${pages}</pre>`;
        pagesPreview.style.display = 'block';

        updateStepStatus(4, 'Pages generated', false, false);
        enableNextStep(4);

    } catch (error) {
        console.error('Error in Step 4:', error);
        updateStepStatus(4, 'Error', false, false);
        alert(`Error generating pages: ${error.message}`);
    } finally {
        hideLoading();
    }
}

// Page actions
function editPages() {
    const pagesPreview = document.getElementById('pagesPreview');
    const currentPages = document.getElementById('pagesList').textContent;
    
    // Create edit interface
    const editInterface = document.createElement('div');
    editInterface.innerHTML = `
        <div style="background: #f8fafc; border: 2px solid #10b981; border-radius: 8px; padding: 1rem; margin: 1rem 0;">
            <h4 style="color: #10b981; margin-bottom: 1rem;">✏️ Edit Application Pages</h4>
            <textarea id="editPagesText" style="width: 100%; min-height: 300px; padding: 1rem; border: 1px solid #d1d5db; border-radius: 6px; font-family: 'Monaco', monospace; font-size: 14px; resize: vertical;">${currentPages}</textarea>
            <div style="display: flex; gap: 0.5rem; margin-top: 1rem;">
                <button onclick="savePagesEdit()" style="padding: 0.5rem 1rem; border-radius: 6px; cursor: pointer; background: #10b981; color: white; border: none;">Save Changes</button>
                <button onclick="cancelPagesEdit()" style="padding: 0.5rem 1rem; border: 1px solid #d1d5db; border-radius: 6px; background: white; cursor: pointer;">Cancel</button>
            </div>
        </div>
    `;
    
    pagesPreview.appendChild(editInterface);
}

function savePagesEdit() {
    const newPages = document.getElementById('editPagesText').value;
    if (newPages) {
        workflowData.pages = newPages;
        document.getElementById('pagesList').innerHTML = `<pre style="white-space: pre-wrap; font-family: inherit;">${newPages}</pre>`;
        
        // Remove edit interface
        const editInterface = document.querySelector('#pagesPreview > div:last-child');
        if (editInterface) {
            editInterface.remove();
        }
    }
}

function cancelPagesEdit() {
    const editInterface = document.querySelector('#pagesPreview > div:last-child');
    if (editInterface) {
        editInterface.remove();
    }
}

async function approvePages() {
    updateStepStatus(4, 'Approved', false, true);
    enableNextStep(4);
    
    // Save to Firestore
    try {
        await saveWorkflowDataToFirestore();
        console.log('Pages approved and saved to Firestore');
    } catch (error) {
        console.error('Error saving pages:', error);
        alert('Pages approved but failed to save to database. Please try again.');
    }
}

// Step 5: Visual Representation
async function startStep5() {
    if (!workflowData.pages) {
        alert('Please complete Step 4 first');
        return;
    }

    showLoading('Generating visual diagram...');
    updateStepStatus(5, 'Generating...', true);

    try {
        const prompt = `You are an expert UI/UX architect. Based on the application pages, create a visual representation of the application flow.

Pages:
${workflowData.pages}

Framework: ${currentProject.framework}

Create a detailed visual map showing:

1. PAGE HIERARCHY
   - Main navigation structure
   - Page relationships and flow
   - User journey paths

2. INTERCONNECTIONS
   - How pages link to each other
   - Data flow between pages
   - Authentication flow

3. USER FLOWS
   - Registration/login flow
   - Main user workflows
   - Admin flows (if applicable)

4. COMPONENT STRUCTURE
   - Shared components
   - Layout components
   - Feature-specific components

Format as a structured diagram description that can be visualized with D3.js or similar tools. Include node relationships and connection types.`;

        const visualMap = await callAIAPI(prompt);
        workflowData.visualMap = visualMap;

        // Display visual map
        const visualPreview = document.getElementById('visualPreview');
        const diagramContainer = document.getElementById('diagramContainer');
        diagramContainer.innerHTML = `
            <div style="background: white; padding: 1rem; border-radius: 8px; margin: 1rem 0;">
                <h4 style="color: #1f2937; margin-bottom: 1rem;">📊 Application Flow Diagram</h4>
                <pre style="white-space: pre-wrap; font-family: 'Monaco', monospace; background: #f8fafc; padding: 1rem; border-radius: 4px; max-height: 400px; overflow-y: auto; border: 1px solid #e5e7eb;">${visualMap}</pre>
            </div>
            <div style="display: flex; gap: 0.5rem; margin-top: 1rem;">
                <button onclick="editVisual()" style="padding: 0.5rem 1rem; border: 1px solid #d1d5db; border-radius: 6px; background: white; cursor: pointer;">Edit Diagram</button>
                <button onclick="approveVisual()" class="approve-btn" style="padding: 0.5rem 1rem; border-radius: 6px; cursor: pointer; background: #10b981; color: white; border: none;">Approve</button>
            </div>
        `;
        visualPreview.style.display = 'block';

        updateStepStatus(5, 'Diagram generated', false, false);
        enableNextStep(5);

    } catch (error) {
        console.error('Error in Step 5:', error);
        updateStepStatus(5, 'Error', false, false);
        alert(`Error generating diagram: ${error.message}`);
    } finally {
        hideLoading();
    }
}

// Visual actions
function editVisual() {
    const visualPreview = document.getElementById('visualPreview');
    const currentVisual = document.getElementById('diagramContainer').querySelector('pre').textContent;
    
    // Create edit interface
    const editInterface = document.createElement('div');
    editInterface.innerHTML = `
        <div style="background: #f8fafc; border: 2px solid #10b981; border-radius: 8px; padding: 1rem; margin: 1rem 0;">
            <h4 style="color: #10b981; margin-bottom: 1rem;">✏️ Edit Visual Flow Diagram</h4>
            <textarea id="editVisualText" style="width: 100%; min-height: 300px; padding: 1rem; border: 1px solid #d1d5db; border-radius: 6px; font-family: 'Monaco', monospace; font-size: 14px; resize: vertical;">${currentVisual}</textarea>
            <div style="display: flex; gap: 0.5rem; margin-top: 1rem;">
                <button onclick="saveVisualEdit()" style="padding: 0.5rem 1rem; border-radius: 6px; cursor: pointer; background: #10b981; color: white; border: none;">Save Changes</button>
                <button onclick="cancelVisualEdit()" style="padding: 0.5rem 1rem; border: 1px solid #d1d5db; border-radius: 6px; background: white; cursor: pointer;">Cancel</button>
            </div>
        </div>
    `;
    
    visualPreview.appendChild(editInterface);
}

function saveVisualEdit() {
    const newVisual = document.getElementById('editVisualText').value;
    if (newVisual) {
        workflowData.visualMap = newVisual;
        document.getElementById('diagramContainer').innerHTML = `
            <div style="background: white; padding: 1rem; border-radius: 8px; margin: 1rem 0;">
                <h4 style="color: #1f2937; margin-bottom: 1rem;">📊 Application Flow Diagram</h4>
                <pre style="white-space: pre-wrap; font-family: 'Monaco', monospace; background: #f8fafc; padding: 1rem; border-radius: 4px; max-height: 400px; overflow-y: auto; border: 1px solid #e5e7eb;">${newVisual}</pre>
            </div>
            <div style="display: flex; gap: 0.5rem; margin-top: 1rem;">
                <button onclick="editVisual()" style="padding: 0.5rem 1rem; border: 1px solid #d1d5db; border-radius: 6px; background: white; cursor: pointer;">Edit Diagram</button>
                <button onclick="approveVisual()" class="approve-btn" style="padding: 0.5rem 1rem; border-radius: 6px; cursor: pointer; background: #10b981; color: white; border: none;">Approve</button>
            </div>
        `;
        
        // Remove edit interface
        const editInterface = document.querySelector('#visualPreview > div:last-child');
        if (editInterface) {
            editInterface.remove();
        }
    }
}

function cancelVisualEdit() {
    const editInterface = document.querySelector('#visualPreview > div:last-child');
    if (editInterface) {
        editInterface.remove();
    }
}

async function approveVisual() {
    updateStepStatus(5, 'Approved', false, true);
    enableNextStep(5);
    
    // Hide the edit/approve buttons
    const buttons = document.querySelector('#visualPreview > div:last-child');
    if (buttons) {
        buttons.innerHTML = '<div style="color: #10b981; font-weight: 600;">✓ Visual Diagram Approved</div>';
    }
    
    // Save to Firestore
    try {
        await saveWorkflowDataToFirestore();
        console.log('Visual diagram approved and saved to Firestore');
    } catch (error) {
        console.error('Error saving visual diagram:', error);
        alert('Visual diagram approved but failed to save to database. Please try again.');
    }
}

// Step 6: Project Folder Structure
async function startStep6() {
    if (!workflowData.visualMap) {
        alert('Please complete Step 5 first');
        return;
    }

    showLoading('Generating folder structure...');
    updateStepStatus(6, 'Generating...', true);

    try {
        const prompt = `You are an expert React/Next.js project architect. Based on the framework, visual map, and requirements, create a MINIMAL and EFFICIENT folder structure.

Framework: ${currentProject.framework}
Visual Map: ${workflowData.visualMap}
Requirements: ${workflowData.requirements.analysis}

IMPORTANT GUIDELINES:
- Create ONLY NECESSARY files and components
- AVOID creating too many components or extra files
- Keep the structure SIMPLE and CLEAN
- Focus on essential functionality only
- Don't over-engineer the folder structure

Create a minimal folder structure following these rules:

1. ONE PAGE = ONE FILE rule
2. Dedicated firebase.ts file for Firebase config and exports
3. Minimal component structure - only essential components
4. Avoid creating separate files for every small component
5. Keep components in the same file as pages when possible
6. Minimal utility files - only if absolutely necessary
7. Simple styling approach
8. Basic asset management

For ${currentProject.framework}, include ONLY:
- Essential source code organization
- Minimal component hierarchy
- Firebase integration files
- Basic type definitions (for TypeScript)
- Simple styling structure
- Basic asset folders
- Configuration files

AVOID:
- Creating separate files for every component
- Over-complicated folder structures
- Unnecessary utility files
- Too many subdirectories

Format as a simple tree structure with brief explanations for each folder and file. Keep it minimal and practical.`;

        const folderStructure = await callAIAPI(prompt);
        workflowData.folderStructure = folderStructure;

        // Display folder structure
        const structurePreview = document.getElementById('structurePreview');
        const structureTree = document.getElementById('structureTree');
        structureTree.innerHTML = `<pre style="white-space: pre-wrap; font-family: 'Monaco', monospace;">${folderStructure}</pre>`;
        structurePreview.style.display = 'block';

        updateStepStatus(6, 'Structure generated', false, false);
        enableNextStep(6);

    } catch (error) {
        console.error('Error in Step 6:', error);
        updateStepStatus(6, 'Error', false, false);
        alert(`Error generating structure: ${error.message}`);
    } finally {
        hideLoading();
    }
}

// Structure actions
function editStructure() {
    const structurePreview = document.getElementById('structurePreview');
    const currentStructure = document.getElementById('structureTree').textContent;
    
    // Create edit interface
    const editInterface = document.createElement('div');
    editInterface.innerHTML = `
        <div style="background: #f8fafc; border: 2px solid #10b981; border-radius: 8px; padding: 1rem; margin: 1rem 0;">
            <h4 style="color: #10b981; margin-bottom: 1rem;">✏️ Edit Folder Structure</h4>
            <textarea id="editStructureText" style="width: 100%; min-height: 300px; padding: 1rem; border: 1px solid #d1d5db; border-radius: 6px; font-family: 'Monaco', monospace; font-size: 14px; resize: vertical;">${currentStructure}</textarea>
            <div style="display: flex; gap: 0.5rem; margin-top: 1rem;">
                <button onclick="saveStructureEdit()" style="padding: 0.5rem 1rem; border-radius: 6px; cursor: pointer; background: #10b981; color: white; border: none;">Save Changes</button>
                <button onclick="cancelStructureEdit()" style="padding: 0.5rem 1rem; border: 1px solid #d1d5db; border-radius: 6px; background: white; cursor: pointer;">Cancel</button>
            </div>
        </div>
    `;
    
    structurePreview.appendChild(editInterface);
}

function saveStructureEdit() {
    const newStructure = document.getElementById('editStructureText').value;
    if (newStructure) {
        workflowData.folderStructure = newStructure;
        document.getElementById('structureTree').innerHTML = `<pre style="white-space: pre-wrap; font-family: 'Monaco', monospace;">${newStructure}</pre>`;
        
        // Remove edit interface
        const editInterface = document.querySelector('#structurePreview > div:last-child');
        if (editInterface) {
            editInterface.remove();
        }
    }
}

function cancelStructureEdit() {
    const editInterface = document.querySelector('#structurePreview > div:last-child');
    if (editInterface) {
        editInterface.remove();
    }
}

async function approveStructure() {
    updateStepStatus(6, 'Approved', false, true);
    enableNextStep(6);
    
    // Save to Firestore
    try {
        await saveWorkflowDataToFirestore();
        console.log('Folder structure approved and saved to Firestore');
    } catch (error) {
        console.error('Error saving folder structure:', error);
        alert('Folder structure approved but failed to save to database. Please try again.');
    }
}

// Step 7: Development Pipeline
async function startStep7() {
    if (!workflowData.folderStructure) {
        alert('Please complete Step 6 first');
        return;
    }

    showLoading('Generating development pipeline...');
    updateStepStatus(7, 'Generating...', true);

    // Create streaming display
    const step7Content = document.querySelector('#step7 .step-content');
    const streamingDisplay = createStreamingDisplay('step7');
    
    // Add a label for the streaming display
    const selectedModel = getSelectedAIModel();
    const streamingLabel = document.createElement('div');
    const labelText = selectedModel === 'openrouter'
        ? '🔄 Live Generation in Progress...'
        : '⏳ Generating (no live tokens for this model)...';
    streamingLabel.innerHTML = `<h4 style="color: #10b981; margin: 1rem 0;">${labelText}</h4>`;
    step7Content.appendChild(streamingLabel);

    try {
        const prompt = `You are an expert Firebase developer creating a step-by-step development pipeline. Based on all previous steps, generate actionable development prompts.

Framework: ${currentProject.framework}
Requirements: ${workflowData.requirements.analysis}
Schema: ${workflowData.schema}
Pages: ${workflowData.pages}
Folder Structure: ${workflowData.folderStructure}
Create a per-file comprehensive development pipeline. Each file must be generated as a self-contained prompt in structured JSON format.
Every file prompt must follow the Per-Page Prompt Specification (atomic schema) for consistency.

1. FIREBASE SETUP

Generate prompts for:

src/firebase/firebase.ts → Firebase configuration

   * Authentication setup (email/password, Google provider if specified)

   * Firestore rules (read/write permissions)

   * Storage configuration (images, files)

2. APPLICATION ROOT (App.tsx / App.jsx)

   * Prompt for the root file including:

   * Routing setup (react-router-dom)

   * Authentication wrapper (protect routes)

   * Global providers (AuthContext, ThemeProvider, etc.)

   * Navigation structure

3. PER-PAGE IMPLEMENTATION  -  Create a detailed prompt for each page of the application.

   * For each page, create a detailed prompt containing:

   * File Location – explicit path (e.g., src/pages/LoginPage.tsx)

   * Purpose / Responsibilities – overview of what the page does

   * Exact Imports – all required imports (React, Firebase, dependencies)

   * UI + Logic Instructions – layout, elements, behaviors

   * Dependencies – other components/files used

   * Data Flow – how data moves between Firebase/Firestore/Auth/Storage

   * Navigation / Routing Context – route path, redirects

   * Edge Cases / Conditions – loading, errors, already-authenticated user, etc.

   *  CSS Styling – inline CSS only (no Tailwind)

Return as a structured JSON format for consistency.`;

        // Set 6-minute timeout
        const timeoutPromise = new Promise((_, reject) => {
            setTimeout(() => reject(new Error('Request timeout after 6 minutes')), 360000);
        });

        const pipelinePromise = callAIAPI(
            prompt,
            selectedModel === 'openrouter' ? (tokens) => { updateStreamingDisplay(tokens); } : null
        );
        
        // Add initial streaming message
        updateStreamingDisplay('🚀 Starting development pipeline generation...\n\n');

        const developmentPipeline = await Promise.race([pipelinePromise, timeoutPromise]);
        if (!developmentPipeline || developmentPipeline.trim().length === 0) {
            throw new Error('No content generated. Try switching the model or retrying.');
        }
        workflowData.developmentPipeline = developmentPipeline;

        // Display pipeline
        const pipelinePreview = document.getElementById('pipelinePreview');
        const pipelineSteps = document.getElementById('pipelineSteps');
        pipelineSteps.innerHTML = `<pre style="white-space: pre-wrap; font-family: 'Monaco', monospace;">${developmentPipeline}</pre>`;
        pipelinePreview.style.display = 'block';

                updateStepStatus(7, 'Pipeline generated', false, false);
        document.getElementById('finalActions').style.display = 'block';
        
        // Clean up streaming display
        const streamingDiv = document.getElementById('streamingOutput');
        if (streamingDiv) {
            streamingDiv.style.display = 'none';
        }
        
    } catch (error) {
        console.error('Error in Step 7:', error);
        updateStepStatus(7, 'Error', false, false);
        alert(`Error generating pipeline: ${error.message}`);
    } finally {
        hideLoading();
    }
}

// Pipeline actions
function editPipeline() {
    const pipelinePreview = document.getElementById('pipelinePreview');
    const currentPipeline = document.getElementById('pipelineSteps').textContent;
    
    // Create edit interface
    const editInterface = document.createElement('div');
    editInterface.innerHTML = `
        <div style="background: #f8fafc; border: 2px solid #10b981; border-radius: 8px; padding: 1rem; margin: 1rem 0;">
            <h4 style="color: #10b981; margin-bottom: 1rem;">✏️ Edit Development Pipeline</h4>
            <textarea id="editPipelineText" style="width: 100%; min-height: 300px; padding: 1rem; border: 1px solid #d1d5db; border-radius: 6px; font-family: 'Monaco', monospace; font-size: 14px; resize: vertical;">${currentPipeline}</textarea>
            <div style="display: flex; gap: 0.5rem; margin-top: 1rem;">
                <button onclick="savePipelineEdit()" style="padding: 0.5rem 1rem; border-radius: 6px; cursor: pointer; background: #10b981; color: white; border: none;">Save Changes</button>
                <button onclick="cancelPipelineEdit()" style="padding: 0.5rem 1rem; border: 1px solid #d1d5db; border-radius: 6px; background: white; cursor: pointer;">Cancel</button>
            </div>
        </div>
    `;
    
    pipelinePreview.appendChild(editInterface);
}

function savePipelineEdit() {
    const newPipeline = document.getElementById('editPipelineText').value;
    if (newPipeline) {
        workflowData.developmentPipeline = newPipeline;
        document.getElementById('pipelineSteps').innerHTML = `<pre style="white-space: pre-wrap; font-family: 'Monaco', monospace;">${newPipeline}</pre>`;
        
        // Remove edit interface
        const editInterface = document.querySelector('#pipelinePreview > div:last-child');
        if (editInterface) {
            editInterface.remove();
        }
    }
}

function cancelPipelineEdit() {
    const editInterface = document.querySelector('#pipelinePreview > div:last-child');
    if (editInterface) {
        editInterface.remove();
    }
}

async function approvePipeline() {
    updateStepStatus(7, 'Approved', false, true);
    
    // Save to Firestore
    try {
        await saveWorkflowDataToFirestore();
        console.log('Development pipeline approved and saved to Firestore');
    } catch (error) {
        console.error('Error saving development pipeline:', error);
        alert('Development pipeline approved but failed to save to database. Please try again.');
    }
}

// UI Restoration Functions
async function restoreStep1UI() {
    const step1Content = document.querySelector('#step1 .step-content');
    const requirementsPreview = document.createElement('div');
    requirementsPreview.innerHTML = `
        <h4>Requirements Analysis</h4>
        <div style="background: white; padding: 1rem; border-radius: 8px; margin: 1rem 0;">
            <pre style="white-space: pre-wrap; font-family: inherit;">${workflowData.requirements.analysis}</pre>
        </div>
        <div style="display: flex; gap: 0.5rem;">
            <button onclick="editRequirements()" style="padding: 0.5rem 1rem; border: 1px solid #d1d5db; border-radius: 6px; background: white; cursor: pointer;">Edit</button>
            <div style="color: #10b981; font-weight: 600;">✓ Requirements Approved</div>
        </div>
    `;
    step1Content.appendChild(requirementsPreview);
    updateStepStatus(1, 'Approved and ready for refinement', false, true);
    enableNextStep(1);
}

async function restoreStep2UI() {
    updateStepStatus(2, 'Requirements refined and approved', false, true);
    enableNextStep(2);
}

async function restoreStep3UI() {
    const schemaPreview = document.getElementById('schemaPreview');
    const schemaContent = document.getElementById('schemaContent');
    schemaContent.innerHTML = `<pre style="white-space: pre-wrap; font-family: 'Monaco', monospace;">${workflowData.schema}</pre>`;
    schemaPreview.style.display = 'block';
    updateStepStatus(3, 'Approved', false, true);
    enableNextStep(3);
}

async function restoreStep4UI() {
    const pagesPreview = document.getElementById('pagesPreview');
    const pagesList = document.getElementById('pagesList');
    pagesList.innerHTML = `<pre style="white-space: pre-wrap; font-family: inherit;">${workflowData.pages}</pre>`;
    pagesPreview.style.display = 'block';
    updateStepStatus(4, 'Approved', false, true);
    enableNextStep(4);
}

async function restoreStep5UI() {
    const visualPreview = document.getElementById('visualPreview');
    const diagramContainer = document.getElementById('diagramContainer');
    diagramContainer.innerHTML = `
        <div style="background: white; padding: 1rem; border-radius: 8px; margin: 1rem 0;">
            <h4 style="color: #1f2937; margin-bottom: 1rem;">📊 Application Flow Diagram</h4>
            <pre style="white-space: pre-wrap; font-family: 'Monaco', monospace; background: #f8fafc; padding: 1rem; border-radius: 4px; max-height: 400px; overflow-y: auto; border: 1px solid #e5e7eb;">${workflowData.visualMap}</pre>
        </div>
        <div style="color: #10b981; font-weight: 600;">✓ Visual Diagram Approved</div>
    `;
    visualPreview.style.display = 'block';
    updateStepStatus(5, 'Approved', false, true);
    enableNextStep(5);
}

async function restoreStep6UI() {
    const structurePreview = document.getElementById('structurePreview');
    const structureTree = document.getElementById('structureTree');
    structureTree.innerHTML = `<pre style="white-space: pre-wrap; font-family: 'Monaco', monospace;">${workflowData.folderStructure}</pre>`;
    structurePreview.style.display = 'block';
    updateStepStatus(6, 'Approved', false, true);
    enableNextStep(6);
}

async function restoreStep7UI() {
    const pipelinePreview = document.getElementById('pipelinePreview');
    const pipelineSteps = document.getElementById('pipelineSteps');
    pipelineSteps.innerHTML = `<pre style="white-space: pre-wrap; font-family: 'Monaco', monospace;">${workflowData.developmentPipeline}</pre>`;
    pipelinePreview.style.display = 'block';
    updateStepStatus(7, 'Approved', false, true);
    document.getElementById('finalActions').style.display = 'block';
}

// Complete documentation
async function completeDocumentation() {
    if (!workflowData.developmentPipeline) {
        alert('Please complete all steps first');
        return;
    }

    showLoading('Saving documentation to Firestore...');

    try {
        const user = auth.currentUser;
        if (!user) {
            throw new Error('User not authenticated');
        }

        // Save all workflow data to Firestore
        const projectRef = doc(db, 'UserProjects', currentProject.id);
        
        await updateDoc(projectRef, {
            tracker2Data: {
                requirements: workflowData.requirements,
                refinedRequirements: workflowData.refinedRequirements,
                schema: workflowData.schema,
                pages: workflowData.pages,
                visualMap: workflowData.visualMap,
                folderStructure: workflowData.folderStructure,
                developmentPipeline: workflowData.developmentPipeline
            },
            status: 'tracker2_completed',
            updatedAt: new Date().toISOString()
        });

        hideLoading();
        alert('Documentation completed successfully!');
        
        // Redirect to project page
        setTimeout(() => {
            window.location.href = 'project.html';
        }, 2000);

    } catch (error) {
        console.error('Error completing documentation:', error);
        hideLoading();
        alert(`Error saving documentation: ${error.message}`);
    }
}

// Initialize page
async function initializePage() {
    try {
        console.log('Initializing page...');
        
        // Test API connectivity first
        await testAPIConnectivity();
        
        await loadProjectDetails();
    } catch (error) {
        console.error('Failed to initialize page:', error);
        logError('Page Initialization', error);
    }
}

// Listen for auth state changes
onAuthStateChanged(auth, (user) => {
    console.log('Auth state changed:', user ? user.email : 'No user');
    if (user) {
        initializePage();
    }
});

// Initialize if user is already authenticated
if (auth.currentUser) {
    initializePage();
}

// Export functions for HTML onclick handlers
window.startStep1 = startStep1;
window.startStep2 = startStep2;
window.startStep3 = startStep3;
window.startStep4 = startStep4;
window.startStep5 = startStep5;
window.startStep6 = startStep6;
window.startStep7 = startStep7;
window.sendChatMessage = sendChatMessage;
window.endChatAndGenerateSummary = endChatAndGenerateSummary;
window.editRefinedRequirements = editRefinedRequirements;
window.approveRefinedRequirements = approveRefinedRequirements;
window.editRequirements = editRequirements;
window.saveRequirementsEdit = saveRequirementsEdit;
window.cancelRequirementsEdit = cancelRequirementsEdit;
window.approveRequirements = approveRequirements;
window.editSchema = editSchema;
window.saveSchemaEdit = saveSchemaEdit;
window.cancelSchemaEdit = cancelSchemaEdit;
window.approveSchema = approveSchema;
window.editPages = editPages;
window.savePagesEdit = savePagesEdit;
window.cancelPagesEdit = cancelPagesEdit;
window.approvePages = approvePages;
window.editVisual = editVisual;
window.saveVisualEdit = saveVisualEdit;
window.cancelVisualEdit = cancelVisualEdit;
window.approveVisual = approveVisual;
window.editStructure = editStructure;
window.saveStructureEdit = saveStructureEdit;
window.cancelStructureEdit = cancelStructureEdit;
window.approveStructure = approveStructure;
window.editPipeline = editPipeline;
window.savePipelineEdit = savePipelineEdit;
window.cancelPipelineEdit = cancelPipelineEdit;
window.approvePipeline = approvePipeline;
window.completeDocumentation = completeDocumentation;