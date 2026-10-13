import test from 'node:test';
import assert from 'node:assert/strict';
import { Readable } from 'node:stream';
import { parseBody } from '../api/mcp.js';

test('Vercel object, string, Buffer and stream normalize identically', async () => {
  const message = { jsonrpc: '2.0', id: 1, method: 'initialize' };
  for (const body of [message, JSON.stringify(message), Buffer.from(JSON.stringify(message))]) {
    assert.deepEqual(await parseBody({ body, method: 'POST' }), message);
  }
  const stream = Readable.from([Buffer.from(JSON.stringify(message))]); stream.method = 'POST';
  assert.deepEqual(await parseBody(stream), message);
  await assert.rejects(parseBody({ body: '{', method: 'POST' }));
});
