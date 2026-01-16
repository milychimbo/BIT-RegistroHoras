# BIT Registro de Horas - AI Assistant

A Next-Gen Time Tracking application powered by Azure AI Agents and React.

## 🚀 Features
- **Natural Language Input**: "Register 2 hours on Project X" (Text/Voice)
- **Azure AI Agents**: Uses advanced LLMs to parse intent into structured JSON.
- **Azure AD Auth**: Secure login with Microsoft Entra ID (PKCE Flow).
- **Glassmorphism UI**: Premium Dark Mode aesthetic using Ant Design.

## 🛠️ Setup & Configuration

### Prerequisites
- Node.js 18+
- Azure Subscription (Entra ID, AI Foundry)

### Environment Variables (.env)
```env
# Azure AD (Authentication)
VITE_AZURE_CLIENT_ID=e489252d-...
VITE_AZURE_TENANT_ID=24884996-...

# Backend API
VITE_API_BASE_URL=https://registrohorasback.azurewebsites.net
VITE_API_SCOPE=api://e489252d-.../access_as_user

# Azure AI Foundry (LLM)
VITE_AI_ENDPOINT=https://frcorregidorprompts.services.ai.azure.com/
VITE_AI_PROJECT_ID=proj-bitpromptstudio
VITE_AI_AGENT_ID=asst_nPl4EOsqH4jCcwxSqUWjBi6o
```

## 🏃‍♂️ Running Locally (Development)

1. **Install Dependencies**
   ```bash
   npm install
   ```

2. **Start Dev Server**
   ```bash
   npm run dev
   ```
   Access at `http://localhost:5173`

> **Note on CORS**: In development, the `vite.config.ts` includes a proxy to bypass Azure CORS policies for Auth and AI endpoints.

## 🚢 Production Deployment (Vercel)

1. **Build**
   ```bash
   npm run build
   ```

2. **Environment Variables**
   Ensure all `.env` variables are added to Vercel Project Settings.

3. **Authentication Note**:
   For production, you should **NOT** use the 'Client Credentials' flow (Client Secret) in the frontend.
   - Revert `src/api/aiService.ts` to use `msalInstance.acquireTokenSilent`.
   - Ensure the User (Delegated Access) has the **Cognitive Services OpenAI User** role in Azure Portal.

## 🔒 Security
- **Tokens**: Access tokens are stored in-memory, not LocalStorage (XSS protection).
- **API Access**: All backend calls are authenticated via Bearer tokens.

## 🤖 AI Agent Logic
The Agent is expected to return JSON:
```json
{
  "titulo": "Project Name",
  "horas": 2.0,
  "observacion": "Description...",
  "fecharegistro": "YYYY-MM-DD"
}
```
