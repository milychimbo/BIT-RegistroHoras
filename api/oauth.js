import { opaque, digest, equal, redis, encrypt, validateMicrosoftToken, origin, securityHeaders } from '../lib/mcp-security.js';

export default async function handler(req, res) {
  securityHeaders(res);
  try {
    const base = origin(), action = req.query.action;
    const metadata = {
      issuer: base, authorization_endpoint: base + '/api/oauth?action=authorize',
      token_endpoint: base + '/api/oauth?action=token',
      response_types_supported: ['code'], grant_types_supported: ['authorization_code'],
      code_challenge_methods_supported: ['S256'], token_endpoint_auth_methods_supported: ['client_secret_post', 'client_secret_basic'],
      scopes_supported: ['activities']
    };
    if (action === 'metadata' && req.method === 'GET') return res.json(metadata);
    if (action === 'resource' && req.method === 'GET') return res.json({
      resource: base + '/api/mcp', authorization_servers: [base], scopes_supported: ['activities'], bearer_methods_supported: ['header']
    });
    const db = redis();
    if (action === 'authorize' && req.method === 'GET') {
      const q = req.query;
      const redirects = (process.env.MCP_OAUTH_REDIRECT_URIS || '').split(',').map(x => x.trim());
      if (!equal(q.client_id, process.env.MCP_OAUTH_CLIENT_ID) || !redirects.includes(q.redirect_uri) ||
          q.response_type !== 'code' || q.code_challenge_method !== 'S256' || !/^[A-Za-z0-9_-]{43}$/.test(q.code_challenge || '') ||
          !q.state || (q.scope && q.scope !== 'activities') || (q.resource && q.resource !== base + '/api/mcp')) {
        return res.status(400).json({ error: 'invalid_request' });
      }
      const ticket = opaque(), browser = opaque();
      await db.set('mcp:pending:' + digest(ticket), {
        client: q.client_id, redirect: q.redirect_uri, state: q.state, challenge: q.code_challenge,
        browserHash: digest(browser)
      }, { ex: 600 });
      res.setHeader('Set-Cookie', `mcp_browser=${browser}; Path=/api/oauth; HttpOnly; Secure; SameSite=Strict; Max-Age=600`);
      return res.redirect(302, base + '/?mcp_connect=' + ticket);
    }
    if (action === 'link' && req.method === 'POST') {
      if (req.headers.origin !== base) return res.status(403).json({ error: 'invalid_origin' });
      const body = req.body || {}, ticket = body.ticket;
      if (!/^[A-Za-z0-9_-]{43}$/.test(ticket || '')) return res.status(400).json({ error: 'invalid_request' });
      const pendingKey = 'mcp:pending:' + digest(ticket);
      const pending = await db.get(pendingKey);
      const cookie = (req.headers.cookie || '').split(';').map(x => x.trim()).find(x => x.startsWith('mcp_browser='))?.slice(12);
      if (!pending || !cookie || !equal(pending.browserHash, digest(cookie))) return res.status(400).json({ error: 'expired_link' });
      const identity = await validateMicrosoftToken(body.accessToken);
      // Verify possession against the actual API, without forwarding to arbitrary hosts.
      const check = await fetch('https://registrohorasback.azurewebsites.net/api/Actividad/getactivitybyuser/' + encodeURIComponent(identity.email), {
        headers: { Authorization: 'Bearer ' + identity.token }, signal: AbortSignal.timeout(20000), redirect: 'error'
      });
      if (!check.ok) return res.status(401).json({ error: 'upstream_rejected' });
      // Atomic one-time consumption prevents two browsers/exchanges reusing one ticket.
      const consumed = await db.getdel(pendingKey);
      if (!consumed) return res.status(400).json({ error: 'expired_link' });
      const code = opaque();
      await db.set('mcp:code:' + digest(code), encrypt({ ...pending, identity }), { ex: 120 });
      const next = new URL(pending.redirect);
      next.searchParams.set('code', code); next.searchParams.set('state', pending.state);
      res.setHeader('Set-Cookie', 'mcp_browser=; Path=/api/oauth; HttpOnly; Secure; SameSite=Strict; Max-Age=0');
      return res.json({ redirect: next.toString() });
    }
    if (action === 'token' && req.method === 'POST') {
      const b = typeof req.body === 'string' ? Object.fromEntries(new URLSearchParams(req.body)) : req.body || {};
      let client = b.client_id, secret = b.client_secret;
      if (req.headers.authorization?.startsWith('Basic ')) {
        const pair = Buffer.from(req.headers.authorization.slice(6), 'base64').toString('utf8');
        const i = pair.indexOf(':'); client = decodeURIComponent(pair.slice(0, i)); secret = decodeURIComponent(pair.slice(i + 1));
      }
      if (!equal(client, process.env.MCP_OAUTH_CLIENT_ID) || !equal(secret, process.env.MCP_OAUTH_CLIENT_SECRET)) return res.status(401).json({ error: 'invalid_client' });
      if (b.grant_type !== 'authorization_code') return res.status(400).json({ error: 'unsupported_grant_type' });
      if (!/^[A-Za-z0-9_-]{43}$/.test(b.code || '') || !/^[A-Za-z0-9._~-]{43,128}$/.test(b.code_verifier || '')) return res.status(400).json({ error: 'invalid_grant' });
      const record = await db.getdel('mcp:code:' + digest(b.code));
      if (!record) return res.status(400).json({ error: 'invalid_grant' });
      const { identity, ...pending } = (await import('../lib/mcp-security.js')).decrypt(record);
      if (pending.client !== client || pending.redirect !== b.redirect_uri || !equal(pending.challenge, digest(b.code_verifier)) ||
          (b.resource && b.resource !== base + '/api/mcp')) return res.status(400).json({ error: 'invalid_grant' });
      const ttl = Math.floor(identity.expires - Date.now() / 1000 - 30);
      if (ttl <= 0) return res.status(400).json({ error: 'invalid_grant' });
      const access = opaque();
      await db.set('mcp:access:' + digest(access), encrypt({ ...identity, expires: identity.expires - 30 }), { ex: ttl });
      return res.json({ access_token: access, token_type: 'Bearer', expires_in: ttl, scope: 'activities' });
    }
    return res.status(404).json({ error: 'not_found' });
  } catch {
    return res.status(400).json({ error: 'connection_failed', message: 'No se pudo vincular. Reintenta el inicio de sesión; si persiste, revisa la configuración del servidor.' });
  }
}
