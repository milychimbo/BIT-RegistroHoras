import test from 'node:test';
import assert from 'node:assert/strict';
import { deflateSync, gzipSync, brotliCompressSync } from 'node:zlib';
import { parseBody, handle } from '../api/mcp.js';
const body = { jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-11-25', capabilities: {}, clientInfo: { name: 'test', version: '1' } } };
function request(bytes, encoding = 'identity') {
  return new Request('https://example.com/api/mcp', { method: 'POST', body: bytes, headers: { 'content-type': 'application/json', 'content-encoding': encoding, accept: 'application/json, text/event-stream' } });
}
test('normal and compressed JSON normalize identically with bounded decoding', async () => {
  const text = JSON.stringify(body);
  for (const [encoding, bytes] of [['identity', text], ['gzip', gzipSync(text)], ['deflate', deflateSync(text)], ['br', brotliCompressSync(text)], ['gzip', text]]) {
    assert.deepEqual(await parseBody(request(bytes, encoding)), body);
  }
  await assert.rejects(parseBody(request('{')));
  await assert.rejects(parseBody(request(gzipSync(' '.repeat(1100000)), 'gzip')));
});
test('compressed discovery works but activity calls require OAuth', async () => {
  process.env.MCP_PUBLIC_ORIGIN = 'https://example.com';
  const initialized = await handle(request(deflateSync(JSON.stringify(body)), 'deflate'));
  assert.equal(initialized.status, 200);
  assert.equal((await initialized.json()).result.serverInfo.name, 'BIT Registro de Horas');
  const binaryJson = request(JSON.stringify(body));
  binaryJson.headers.set('content-type', 'application/octet-stream');
  assert.equal((await handle(binaryJson)).status, 200);
  const list = await handle(request(JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'tools/list' })));
  assert.equal((await list.json()).result.tools.length, 5);
  const denied = await handle(request(JSON.stringify({ jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name: 'obtener_mi_actividad', arguments: { id: 1 } } })));
  assert.equal(denied.status, 401);
});
