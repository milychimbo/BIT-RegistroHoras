import { createCipheriv, createDecipheriv, randomBytes, createHash, timingSafeEqual } from 'node:crypto';
import { Redis } from '@upstash/redis';
import { createRemoteJWKSet, jwtVerify } from 'jose';

export const TENANT = '24884996-6863-4925-a1ba-f1a160b581e2';
export const AUDIENCE = 'api://e489252d-25e0-4a9d-abb8-eeb1edf8b09f';
export const opaque = () => randomBytes(32).toString('base64url');
export const digest = value => createHash('sha256').update(value).digest('base64url');
export function equal(a, b) {
  const x = Buffer.from(a || ''), y = Buffer.from(b || '');
  return x.length === y.length && x.length > 0 && timingSafeEqual(x, y);
}
export function origin() {
  const value = process.env.MCP_PUBLIC_ORIGIN;
  if (!value || new URL(value).protocol !== 'https:' || new URL(value).origin !== value) throw new Error('configuration');
  return value;
}
export function redis() {
  const url = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;
  if (!url || !token) throw new Error('configuration');
  return new Redis({ url, token });
}
function key() {
  const k = Buffer.from(process.env.MCP_ENCRYPTION_KEY || '', 'base64');
  if (k.length !== 32) throw new Error('configuration');
  return k;
}
export function encrypt(value) {
  const iv = randomBytes(12), cipher = createCipheriv('aes-256-gcm', key(), iv);
  const bytes = Buffer.concat([cipher.update(JSON.stringify(value), 'utf8'), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), bytes]).toString('base64');
}
export function decrypt(value) {
  const bytes = Buffer.from(value, 'base64'), cipher = createDecipheriv('aes-256-gcm', key(), bytes.subarray(0, 12));
  cipher.setAuthTag(bytes.subarray(12, 28));
  return JSON.parse(Buffer.concat([cipher.update(bytes.subarray(28)), cipher.final()]).toString('utf8'));
}
const jwks = createRemoteJWKSet(new URL(`https://login.microsoftonline.com/${TENANT}/discovery/v2.0/keys`));
export async function validateMicrosoftToken(token) {
  const { payload } = await jwtVerify(token, jwks, {
    audience: [AUDIENCE, AUDIENCE.slice(6)],
    issuer: [`https://sts.windows.net/${TENANT}/`, `https://login.microsoftonline.com/${TENANT}/v2.0`],
    algorithms: ['RS256'], requiredClaims: ['exp', 'tid', 'oid', 'scp']
  });
  const email = String(payload.preferred_username || payload.upn || payload.unique_name || '').toLowerCase();
  if (payload.tid !== TENANT || !String(payload.scp).split(' ').includes('access_as_user') ||
      !process.env.MCP_ALLOWED_EMAIL || email !== process.env.MCP_ALLOWED_EMAIL.toLowerCase()) throw new Error('invalid_token');
  if (payload.exp * 1000 < Date.now() + 60000) throw new Error('expired_token');
  return { token, email, oid: payload.oid, expires: payload.exp };
}
export function securityHeaders(res) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('X-Content-Type-Options', 'nosniff');
}
export async function session(req) {
  const header = req.headers.authorization || '';
  if (!header.startsWith('Bearer ')) throw new Error('invalid_token');
  const record = await redis().get('mcp:access:' + digest(header.slice(7)));
  if (!record) throw new Error('invalid_token');
  const value = decrypt(record);
  if (value.expires * 1000 <= Date.now()) throw new Error('expired_token');
  return value;
}
