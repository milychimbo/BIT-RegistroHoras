import axios from 'axios';
import { PublicClientApplication, InteractionRequiredAuthError } from '@azure/msal-browser';
import { msalConfig, loginRequest } from '../auth/authConfig';

// export const api = axios.create({
//     baseURL: import.meta.env.VITE_API_BASE_URL,
// });
export const api = axios.create({
    baseURL: '/api/backend-proxy',
});

const msalInstance = new PublicClientApplication(msalConfig);
let isMsalInitialized = false;

const getAccessToken = async () => {
    if (!isMsalInitialized) {
        await msalInstance.initialize();
        isMsalInitialized = true;
    }

    const accounts = msalInstance.getAllAccounts();
    if (accounts.length > 0) {
        const request = {
            ...loginRequest,
            account: accounts[0],
        };

        try {
            const response = await msalInstance.acquireTokenSilent(request);
            return response.accessToken;
        } catch (error) {
            if (error instanceof InteractionRequiredAuthError) {
                // If silent token acquisition fails, we need to prompt for interaction
                // Ideally this should be handled by the UI, but for Axios we might just reject
                // and let the UI handle the 401/error state
                throw error;
            } else {
                console.error(error);
                throw error;
            }
        }
    }
    return null;
};

api.interceptors.request.use(async (config) => {
    try {
        console.log("Interceptor: Getting token...");
        const token = await getAccessToken();
        console.log("Interceptor: Token acquired?", !!token);

        if (token) {
            config.headers.Authorization = `Bearer ${token}`;

            // Add User Email header if available from accounts
            const accounts = msalInstance.getAllAccounts();
            if (accounts.length > 0 && accounts[0].username) {
                config.headers['X-User-Email'] = accounts[0].username;
            }
        } else {
            console.warn("Interceptor: No token available!");
        }
    } catch (error) {
        console.error("Token acquisition failed", error);
    }
    return config;
}, (error) => {
    return Promise.reject(error);
});
