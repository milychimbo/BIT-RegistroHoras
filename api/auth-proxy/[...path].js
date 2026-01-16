import axios from 'axios';

export default async function handler(req, res) {
    // Config allow CORS for the Vercel endpoint itself if needed
    res.setHeader('Access-Control-Allow-Credentials', true);
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
    res.setHeader(
        'Access-Control-Allow-Headers',
        'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version'
    );

    if (req.method === 'OPTIONS') {
        res.status(200).end();
        return;
    }

    const { path } = req.query;
    // If path is missing, return error
    if (!path) {
        return res.status(400).json({ error: 'Path not provided' });
    }

    // Vercel gives 'path' as an array for [...path]
    const joinedPath = Array.isArray(path) ? path.join('/') : path;

    // Target URL
    const targetUrl = `https://login.microsoftonline.com/${joinedPath}`;

    try {
        const response = await axios({
            method: req.method,
            url: targetUrl,
            // Forward query parameters, excluding the 'path' param used by Vercel
            params: (() => {
                const { path, ...rest } = req.query;
                return rest;
            })(),
            data: req.body,
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                // CRITICAL: Do NOT send the Origin header to Azure AD.
                // This makes Azure think it's a server-to-server call.
                'Origin': undefined,
                'Host': 'login.microsoftonline.com'
            },
            validateStatus: () => true // Handle 4xx/5xx manually
        });

        // Validar y enviar respuesta
        res.status(response.status).send(response.data);
    } catch (error) {
        console.error("Auth Proxy Error:", error.message);
        res.status(500).json({ error: 'Proxy Request Failed', details: error.message });
    }
}
