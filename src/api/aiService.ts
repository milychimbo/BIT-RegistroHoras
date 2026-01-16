import axios from 'axios';

// Configuración "Espejo" a tu C# Options
const aiOptions = {
    endpoint: import.meta.env.VITE_AI_ENDPOINT, // https://frcorregidorprompts.services.ai.azure.com/
    projectId: import.meta.env.VITE_AI_PROJECT_ID,
    assistantId: import.meta.env.VITE_AI_ASSISTANT_ID,
    tenantId: import.meta.env.VITE_AI_TENANT_ID,
    clientId: import.meta.env.VITE_AI_CLIENT_ID,
    clientSecret: import.meta.env.VITE_AI_CLIENT_SECRET,
};

const API_VERSION = "2025-05-01";

// Cliente HTTP base (Usamos el proxy para saltar CORS del navegador)
const httpClient = axios.create({
    baseURL: '/api/ai-proxy', // Apunta a tu Endpoint via Proxy
});

// -------------------- Auth (Igual a GetAccessTokenAsync) --------------------
async function getAccessTokenAsync(): Promise<string> {
    const params = new URLSearchParams();
    params.append('client_id', aiOptions.clientId);
    params.append('client_secret', aiOptions.clientSecret);
    params.append('scope', 'https://ai.azure.com/.default');
    params.append('grant_type', 'client_credentials');

    // Usamos proxy para Auth también
    const response = await axios.post(
        `/api/auth-proxy/${aiOptions.tenantId}/oauth2/v2.0/token`,
        params.toString(),
        { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
    );
    return response.data.access_token;
}

// -------------------- Threads API calls (Igual a tu C#) --------------------

async function createThreadAsync(token: string): Promise<string> {
    const url = `api/projects/${aiOptions.projectId}/threads?api-version=${API_VERSION}`;
    const response = await httpClient.post(url, {}, {
        headers: { Authorization: `Bearer ${token}` }
    });
    return response.data.id;
}

async function createUserMessageAsync(token: string, threadId: string, userMessage: string): Promise<void> {
    const url = `api/projects/${aiOptions.projectId}/threads/${threadId}/messages?api-version=${API_VERSION}`;
    const payload = {
        role: "user",
        content: userMessage
    };

    await httpClient.post(url, payload, {
        headers: { Authorization: `Bearer ${token}` }
    });
}

async function createRunAsync(token: string, threadId: string): Promise<string> {
    const url = `api/projects/${aiOptions.projectId}/threads/${threadId}/runs?api-version=${API_VERSION}`;
    const payload = {
        assistant_id: aiOptions.assistantId
    };

    const response = await httpClient.post(url, payload, {
        headers: { Authorization: `Bearer ${token}` }
    });
    return response.data.id;
}

async function waitRunCompletedAsync(token: string, threadId: string, runId: string): Promise<void> {
    const url = `api/projects/${aiOptions.projectId}/threads/${threadId}/runs/${runId}?api-version=${API_VERSION}`;

    let status = "queued";
    // Polling loop (similar a tu for loop de 60 intentos)
    for (let i = 0; i < 60; i++) {
        await new Promise(r => setTimeout(r, 1000)); // Delay 1s

        const response = await httpClient.get(url, {
            headers: { Authorization: `Bearer ${token}` }
        });
        status = response.data.status;

        if (status === "completed") return;
        if (["failed", "cancelled", "expired"].includes(status)) {
            throw new Error(`El run terminó en estado: ${status}`);
        }
    }
    throw new Error("Timeout: El run no terminó a tiempo.");
}

async function getLatestAssistantTextAsync(token: string, threadId: string): Promise<string> {
    const url = `api/projects/${aiOptions.projectId}/threads/${threadId}/messages?api-version=${API_VERSION}`;

    const response = await httpClient.get(url, {
        headers: { Authorization: `Bearer ${token}` }
    });

    const messages = response.data.data;
    // Buscar el primer mensaje del assistant (Logic igual a tu C# loop)
    const assistantMsg = messages.find((m: any) => m.role === "assistant");

    if (assistantMsg && assistantMsg.content && assistantMsg.content.length > 0) {
        return assistantMsg.content[0].text.value; // Simplificado para texto
    }

    return "";
}


// -------------------- Public Method (FixPromptAsync equivalente) --------------------

export const sendMessageToAgent = async (token: string, text: string): Promise<string | null> => {
    try {
        // Token is passed from UI (MSAL)

        console.log("1. (Token recibido desde UI)");
        // const token = await getAccessTokenAsync(); // REMOVED

        console.log("2. Creando Thread...");
        const threadId = await createThreadAsync(token);

        console.log("3. Enviando Mensaje...");
        await createUserMessageAsync(token, threadId, text);

        console.log("4. Ejecutando Run...");
        const runId = await createRunAsync(token, threadId);

        console.log("5. Esperando completación...");
        await waitRunCompletedAsync(token, threadId, runId);

        console.log("6. Leyendo respuesta...");
        const responseText = await getLatestAssistantTextAsync(token, threadId);

        return responseText;

    } catch (error: any) {
        console.error("Error en AgenteService:", error);
        if (error.response) {
            console.error("Detalle Error API:", error.response.data);
        }
        throw error;
    }
};
