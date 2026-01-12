# 400 Error Debug Guide for tracker2-script.js

## Overview
This guide helps you identify and fix 400 errors in the tracker2-script.js file. The 400 errors are likely coming from API calls to either Gemini or OpenRouter APIs.

## Quick Debug Steps

### 1. Use the API Test Page
Open `api-test.html` in your browser to test both APIs independently:
```bash
# Open the test page
open api-test.html
```

This will help you identify which API is causing the 400 error.

### 2. Check Browser Console
Open the browser's developer tools (F12) and check the Console tab for detailed error messages. The enhanced error logging will show:
- API request details
- Response status codes
- Error response bodies
- Timestamps

### 3. Common 400 Error Causes

#### Gemini API Issues:
1. **Invalid API Key**: The API key might be expired or invalid
2. **Quota Exceeded**: You may have hit the daily/monthly quota limit
3. **Invalid Request Format**: The request body structure might be incorrect
4. **Model Not Available**: The model `gemini-1.5-flash` might not be available

#### OpenRouter API Issues:
1. **Invalid API Key**: The OpenRouter API key might be expired or invalid
2. **Insufficient Credits**: Your OpenRouter account might be out of credits
3. **Model Not Available**: The model `deepseek/deepseek-chat-v3-0324:free` might not be available
4. **Missing Headers**: Required headers might be missing or incorrect

## Detailed Debugging

### Step 1: Check API Keys
Verify your API keys are valid:

**Gemini API Key**: `AIzaSyBDA_wIQPBjWVVelfjzAToKhQfkkGYDyac`
- Check if this key is still valid in your Google Cloud Console
- Verify the API is enabled for your project

**OpenRouter API Key**: `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`
- Check your OpenRouter dashboard for credit balance
- Verify the key is active

### Step 2: Test Individual APIs
Use the test page to isolate which API is failing:

1. Click "Test Gemini API" - if this fails, the issue is with Gemini
2. Click "Test OpenRouter API" - if this fails, the issue is with OpenRouter

### Step 3: Check Error Messages
Look for specific error messages in the console:

**Common Gemini Errors:**
- `400 Bad Request`: Usually invalid request format
- `403 Forbidden`: API key issues or quota exceeded
- `429 Too Many Requests`: Rate limiting

**Common OpenRouter Errors:**
- `400 Bad Request`: Invalid request format or model
- `401 Unauthorized`: Invalid API key
- `402 Payment Required`: Insufficient credits

### Step 4: Fix Issues

#### If Gemini API is failing:
1. **Update API Key**: Get a new API key from Google Cloud Console
2. **Enable API**: Make sure the Gemini API is enabled
3. **Check Quota**: Verify you haven't exceeded the quota

#### If OpenRouter API is failing:
1. **Add Credits**: Add credits to your OpenRouter account
2. **Update API Key**: Generate a new API key
3. **Check Model**: Verify the model is available

## Enhanced Error Handling

The updated `tracker2-script.js` now includes:

1. **Comprehensive Logging**: Detailed error messages with context
2. **API Connectivity Testing**: Automatic testing on page load
3. **Fallback Mechanism**: If one API fails, it tries the other
4. **Request/Response Logging**: Full request and response details

## Manual Testing

You can also test the APIs manually using curl:

### Test Gemini API:
```bash
curl -X POST \
  "https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "contents": [{
      "parts": [{
        "text": "Hello, this is a test message."
      }]
    }],
    "generationConfig": {
      "temperature": 0.7,
      "maxOutputTokens": 100
    }
  }'
```

### Test OpenRouter API:
```bash
curl -X POST \
  "https://openrouter.ai/api/v1/chat/completions" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "HTTP-Referer: http://localhost" \
  -H "X-Title: Test" \
  -d '{
    "model": "deepseek/deepseek-chat-v3-0324:free",
    "messages": [
      {
        "role": "user",
        "content": "Hello, this is a test message."
      }
    ],
    "temperature": 0.7,
    "max_tokens": 100
  }'
```

## Troubleshooting Checklist

- [ ] API keys are valid and active
- [ ] APIs are enabled in respective dashboards
- [ ] Sufficient credits/quota available
- [ ] Models are available and accessible
- [ ] Network connectivity is working
- [ ] CORS is not blocking requests
- [ ] Request format is correct
- [ ] Headers are properly set

## Next Steps

1. Run the API test page to identify the failing API
2. Check the console for detailed error messages
3. Fix the specific API issue (key, quota, model, etc.)
4. Test again with the fixed configuration
5. If issues persist, check the network tab for additional details

## Support

If you continue to have issues:
1. Check the API provider's status page
2. Review their documentation for recent changes
3. Contact their support with the specific error messages
4. Consider using alternative models or providers

