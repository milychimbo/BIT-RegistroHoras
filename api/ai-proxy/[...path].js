import axios from 'axios';

export default async function handler(req, res) {
    // Config allow CORS
    res.setHeader('Access-Control-Allow-Credentials', true);
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
    res.setHeader(
        'Access-Control-Allow-Headers',
        'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version, api-key, Authorization'
    );

    if (req.method === 'OPTIONS') {
        res.status(200).end();
        return;
    }

    const { path } = req.query;
    if (!path) {
        return res.status(400).json({ error: 'Path not provided' });
    }

    const joinedPath = Array.isArray(path) ? path.join('/') : path;
    // Use correct Azure AI endpoint
    const targetBase = 'https://frcorregidorprompts.services.ai.azure.com';
    const targetUrl = `${targetBase}/${joinedPath}`;

    try {
        const response = await axios({
            method: req.method,
            url: targetUrl,
            params: (() => {
                const { path, ...rest } = req.query;
                return rest;
            })(),
            data: req.body,
            headers: {
                'Content-Type': req.headers['content-type'] || 'application/json',
                'api-key': req.headers['api-key'],
                'Authorization': req.headers['authorization'],
                // Strip Origin
                'Origin': undefined,
            },
            validateStatus: () => true
        });

        res.status(response.status).send(response.data);
    } catch (error) {
        console.error("AI Proxy Error:", error.message);
        res.status(500).json({ error: 'AI Proxy Request Failed', details: error.message });
    }
}
