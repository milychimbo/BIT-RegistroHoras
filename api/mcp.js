import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { session, origin, securityHeaders } from '../lib/mcp-security.js';
import { buildServer } from '../lib/mcp-tools.js';

export default async function handler(req, res) {
  securityHeaders(res);
  let identity;
  try {
    const base = origin();
    if (req.headers.origin && req.headers.origin !== base) return res.status(403).json({ error: 'invalid_origin' });
    identity = await session(req);
  } catch {
    const base = process.env.MCP_PUBLIC_ORIGIN;
    if (base) res.setHeader('WWW-Authenticate', `Bearer resource_metadata="${base}/.well-known/oauth-protected-resource", error="invalid_token"`);
    return res.status(401).json({ error: 'invalid_token', message: 'Reconecta Registro de Horas e inicia sesión con Microsoft.' });
  }
  if (req.method !== 'POST') return res.status(405).json({ error: 'method_not_allowed' });
  const server = buildServer(identity);
  const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
  res.on('close', () => { transport.close(); server.close(); });
  await server.connect(transport);
  await transport.handleRequest(req, res, req.body);
}
