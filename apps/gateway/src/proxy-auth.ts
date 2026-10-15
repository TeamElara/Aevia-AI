import { timingSafeEqual } from 'node:crypto';
import type { RequestHandler } from 'express';

/** Protect the direct cloud origin behind the authenticated Vercel deployment. */
export function proxyAuth(secret?: string): RequestHandler {
  const expected = secret ? Buffer.from(secret) : undefined;
  return (req, res, next) => {
    if (!expected || (req.method === 'GET' && ['/health', '/ready'].includes(req.path))) return next();
    const supplied = req.headers['x-leakshield-proxy-secret'];
    if (typeof supplied !== 'string' || Buffer.byteLength(supplied) !== expected.length || !timingSafeEqual(Buffer.from(supplied), expected)) {
      return res.status(401).json({ error: 'PROXY_AUTH_REQUIRED' });
    }
    next();
  };
}
