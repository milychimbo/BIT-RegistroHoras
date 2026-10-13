import test from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { buildServer, filterActivities } from '../lib/mcp-tools.js';
import { encrypt, decrypt, equal, digest, opaque } from '../lib/mcp-security.js';

test('encrypted token cannot be read or modified', () => {
  process.env.MCP_ENCRYPTION_KEY = randomBytes(32).toString('base64');
  const encrypted = encrypt({ token: 'private-test-token', email: 'me@example.com' });
  assert.equal(decrypt(encrypted).token, 'private-test-token');
  assert.equal(encrypted.includes('private-test-token'), false);
  const bytes = Buffer.from(encrypted, 'base64'); bytes[bytes.length - 1] ^= 1;
  assert.throws(() => decrypt(bytes.toString('base64')));
  assert.equal(equal('', ''), false);
  assert.equal(equal('abc', 'abc'), true);
  assert.match(opaque(), /^[A-Za-z0-9_-]{43}$/);
  assert.equal(digest('dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk'), 'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM');
});
test('inclusive work dates, filtering and invalid ranges', () => {
  const rows = [{ id: 1, titulo: 'MINSUR', fecharegistro: '2026-10-12T00:00:00', estado: null }, { id: 2, titulo: 'Otro', fecharegistro: '2026-10-13' }];
  assert.equal(filterActivities(rows, '2026-10-12', '2026-10-12', 'minsur').length, 1);
  assert.equal(filterActivities(rows, '2026-10-12', '2026-10-12', '', 'Pendiente').length, 0);
  assert.throws(() => filterActivities(rows, '2026-10-13', '2026-10-12'));
});
test('MCP discovery, pagination, summary, write guard and user isolation', async () => {
  const identity = { token: 'fake', email: 'me@example.com' };
  let rows = [{ id: 1, creadopor: identity.email, titulo: 'MINSUR', horas: 3.5, fecharegistro: '2026-10-12' }, { id: 2, creadopor: identity.email, titulo: 'MINSUR', horas: 0.5, fecharegistro: '2026-10-12' }];
  const fetchMock = async () => new Response(JSON.stringify(rows));
  const server = buildServer(identity, fetchMock);
  const [a, b] = InMemoryTransport.createLinkedPair();
  await server.connect(a);
  const client = new Client({ name: 'test', version: '1' }); await client.connect(b);
  try {
    assert.equal((await client.listTools()).tools.length, 5);
    const listed = await client.callTool({ name: 'listar_mis_actividades', arguments: { desde: '2026-10-12', hasta: '2026-10-12', limite: 1 } });
    const data = JSON.parse(listed.content[0].text); assert.equal(data.total, 2); assert.equal(data.siguiente_offset, 1);
    const sum = await client.callTool({ name: 'resumir_mis_horas', arguments: { desde: '2026-10-12', hasta: '2026-10-12' } });
    assert.equal(JSON.parse(sum.content[0].text).horas, 4);
    process.env.MCP_ENABLE_WRITES = 'false';
    const write = await client.callTool({ name: 'crear_actividad', arguments: { titulo: 'MINSUR', horas: 1, observacion: 'Trabajo', fecharegistro: '2026-10-12', proyecto_guid: '03e75f9e-205b-f111-9ac0-e8fb1cc071c2' } });
    assert.equal(write.isError, true);
    rows = [{ ...rows[0], creadopor: 'other@example.com' }];
    const denied = await client.callTool({ name: 'obtener_mi_actividad', arguments: { id: 1 } });
    assert.equal(denied.isError, true);
  } finally { await client.close(); await server.close(); }
});
