import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { session, origin, securityHeaders } from '../lib/mcp-security.js';
import { buildServer } from '../lib/mcp-tools.js';

export async function parseBody(req) {
  let body = req.body;
  if (body == null && req.method === 'POST') {
    const chunks = []; let size = 0;
    for await (const chunk of req) {
      size += chunk.length;
      if (size > 1048576) throw new Error('request_too_large');
      chunks.push(chunk);
    }
    body = Buffer.concat(chunks).toString('utf8');
  }
  if (Buffer.isBuffer(body)) body = body.toString('utf8');
  if (typeof body === 'string') body = JSON.parse(body);
  return body;
}

export default async function handler(req, res) {
  securityHeaders(res);
  let body;
  try { body = await parseBody(req); }
  catch { return res.status(400).json({ error: 'invalid_json' }); }
  // Protocol diagnostics only: never emit headers, params, tokens or user data.
  const method = typeof body?.method === 'string' ? body.method.slice(0, 80) : 'unknown';
  console.info(JSON.stringify({ event: 'mcp_request', rpc_method: method, body_type: typeof req.body, has_authorization: Boolean(req.headers.authorization) }));
  let identity;
  try {
    const base = origin();
    if (req.headers.origin && req.headers.origin !== base) return res.status(403).json({ error: 'invalid_origin' });
    // Only protocol discovery is public; every tools/call still authenticates.
    const discovery = req.method === 'POST' && body && !Array.isArray(body) &&
      ['initialize', 'notifications/initialized', 'tools/list', 'ping'].includes(body.method);
    identity = discovery ? null : await session(req);
  } catch {
    const base = process.env.MCP_PUBLIC_ORIGIN;
    if (base) res.setHeader('WWW-Authenticate', `Bearer resource_metadata="${base}/.well-known/oauth-protected-resource", scope="activities", error="invalid_token"`);
    return res.status(401).json({ error: 'invalid_token', message: 'Reconecta Registro de Horas e inicia sesión con Microsoft.' });
  }
  if (req.method !== 'POST') return res.status(405).json({ error: 'method_not_allowed' });
  const server = buildServer(identity);
  const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
  res.on('close', () => { transport.close(); server.close(); });
  await server.connect(transport);
  await transport.handleRequest(req, res, body);
}
