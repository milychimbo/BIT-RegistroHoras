import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js';
import { gunzipSync, inflateSync, brotliDecompressSync } from 'node:zlib';
import { session, origin } from '../lib/mcp-security.js';
import { buildServer } from '../lib/mcp-tools.js';

const MAX_BODY = 1048576;
const headers = { 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer', 'X-Content-Type-Options': 'nosniff' };
function authenticationRequired(base) {
  return Response.json({ error: 'invalid_token', message: 'Reconecta Registro de Horas e inicia sesión con Microsoft.' }, {
    status: 401, headers: { ...headers, 'WWW-Authenticate': `Bearer resource_metadata="${base}/.well-known/oauth-protected-resource", scope="activities"` }
  });
}
export async function parseBody(request) {
  const reader = request.body?.getReader();
  if (!reader) throw new Error('missing_body');
  const chunks = []; let size = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_BODY) { await reader.cancel(); throw new Error('body_too_large'); }
      chunks.push(Buffer.from(value));
    }
  } finally { reader.releaseLock(); }
  let bytes = Buffer.concat(chunks);
  if (!bytes.length) throw new Error('empty_body');
  const encoding = (request.headers.get('content-encoding') || 'identity').toLowerCase();
  if (!['identity', 'gzip', 'deflate', 'br'].includes(encoding)) throw new Error('unsupported_encoding');
  // Some gateways decode the body while retaining its encoding header.
  try { return JSON.parse(bytes.toString('utf8')); } catch { /* decode below */ }
  // Preserve interoperability when a proxy removes Content-Encoding without
  // decoding the bytes. Only infer formats with an identifiable header.
  const inferred = bytes[0] === 0x1f && bytes[1] === 0x8b ? 'gzip' :
    bytes.length >= 2 && (bytes[0] & 0x0f) === 8 && (bytes[0] >> 4) <= 7 &&
      ((bytes[0] << 8) + bytes[1]) % 31 === 0 ? 'deflate' : 'identity';
  const decode = { gzip: gunzipSync, deflate: inflateSync, br: brotliDecompressSync }[encoding === 'identity' ? inferred : encoding];
  if (decode) bytes = decode(bytes, { maxOutputLength: MAX_BODY });
  return JSON.parse(bytes.toString('utf8'));
}

export async function handle(request) {
  let base;
  try { base = origin(); } catch { return Response.json({ error: 'configuration' }, { status: 503, headers }); }
  const requestOrigin = request.headers.get('origin');
  if (requestOrigin && requestOrigin !== base) return Response.json({ error: 'invalid_origin' }, { status: 403, headers });
  let body;
  if (request.method === 'POST') {
    try { body = await parseBody(request); }
    catch (error) {
      // OAuth discovery probes may have an empty/non-JSON body. Authenticate
      // before reporting a payload error, so the client can discover OAuth.
      try { await session({ headers: { authorization: request.headers.get('authorization') || '' } }); }
      catch {
        console.info(JSON.stringify({ event: 'mcp_auth_challenge', status: 401,
          body_issue: ['empty_body', 'missing_body', 'body_too_large', 'unsupported_encoding'].includes(error.message) ? error.message : 'invalid_json',
          content_type: request.headers.get('content-type') }));
        return authenticationRequired(base);
      }
      console.info(JSON.stringify({ event: 'mcp_parse_failed', status: 400, error_type: error.name }));
      return Response.json({ error: 'invalid_json' }, { status: 400, headers });
    }
  }
  const method = typeof body?.method === 'string' ? body.method.slice(0, 80) : 'unknown';
  console.info(JSON.stringify({ event: 'mcp_request', rpc_method: method, has_authorization: request.headers.has('authorization') }));
  const discovery = request.method === 'POST' && body && !Array.isArray(body) &&
    ['initialize', 'notifications/initialized', 'tools/list', 'ping'].includes(body.method);
  let identity = null;
  if (!discovery) {
    try { identity = await session({ headers: { authorization: request.headers.get('authorization') || '' } }); }
    catch {
      return authenticationRequired(base);
    }
  }
  if (request.method !== 'POST') return Response.json({ error: 'method_not_allowed' }, { status: 405, headers });
  const server = buildServer(identity);
  const transport = new WebStandardStreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
  await server.connect(transport);
  try {
    // Validate and decode the payload first, then give the SDK canonical JSON
    // headers. Some clients send JSON bytes as application/octet-stream.
    const canonicalHeaders = new Headers(request.headers);
    canonicalHeaders.set('content-type', 'application/json');
    canonicalHeaders.delete('content-encoding');
    canonicalHeaders.delete('content-length');
    const canonicalRequest = new Request(request.url, {
      method: request.method, headers: canonicalHeaders, body: JSON.stringify(body)
    });
    const response = await transport.handleRequest(canonicalRequest, { parsedBody: body });
    console.info(JSON.stringify({ event: 'mcp_response', rpc_method: method, status: response.status }));
    for (const [name, value] of Object.entries(headers)) response.headers.set(name, value);
    return response;
  } finally { await transport.close(); await server.close(); }
}

export default { fetch: handle };
