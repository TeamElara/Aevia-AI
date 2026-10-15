import { createHmac, timingSafeEqual } from 'node:crypto';
function checkKey(key) { if (!key || Buffer.byteLength(key) < 32) throw new Error('JWT secret must have at least 32 bytes'); }
export function issueToken(user, secret, { now = Date.now(), ttlSeconds = 3600 } = {}) {
  checkKey(secret);
  if (!user?.id || !Number.isInteger(ttlSeconds) || ttlSeconds < 1 || ttlSeconds > 3600) throw new TypeError('Invalid token parameters');
  const encode = value => Buffer.from(JSON.stringify(value)).toString('base64url');
  const data = `${encode({ alg: 'HS256', typ: 'JWT' })}.${encode({ sub: user.id, iss: 'leakshield-seed', aud: 'leakshield-gateway', iat: Math.floor(now / 1000), exp: Math.floor(now / 1000) + ttlSeconds })}`;
  return `${data}.${createHmac('sha256', secret).update(data).digest('base64url')}`;
}
export function verifyToken(token, secret, users, { now = Date.now() } = {}) {
  checkKey(secret);
  const parts = typeof token === 'string' ? token.split('.') : [];
  if (parts.length !== 3) throw new Error('Invalid JWT');
  const data = parts.slice(0, 2).join('.');
  const expected = createHmac('sha256', secret).update(data).digest();
  const actual = Buffer.from(parts[2], 'base64url');
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) throw new Error('Invalid JWT');
  const header = JSON.parse(Buffer.from(parts[0], 'base64url'));
  const claims = JSON.parse(Buffer.from(parts[1], 'base64url'));
  const seconds = Math.floor(now / 1000);
  if (header.alg !== 'HS256' || header.typ !== 'JWT' || claims.iss !== 'leakshield-seed' || claims.aud !== 'leakshield-gateway' || !Number.isInteger(claims.exp) || !Number.isInteger(claims.iat) || claims.iat > seconds || claims.exp <= seconds) throw new Error('Invalid JWT claims');
  const user = users.find(u => u.id === claims.sub);
  if (!user) throw new Error('Unknown principal');
  return structuredClone(user); // Current server-side membership, never client-supplied groups.
}
