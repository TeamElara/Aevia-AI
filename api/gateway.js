import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';

const json = (res, status, code) => {
  res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
  res.end(JSON.stringify({ error: code }));
};

/** Same-origin transport only. Policy, identity, vaults and approvals remain in the gateway. */
export default async function handler(req, res) {
  if (!['GET', 'POST', 'DELETE', 'OPTIONS'].includes(req.method)) return json(res, 405, 'METHOD_NOT_ALLOWED');
  const incoming = new URL(req.url, 'https://console.invalid');
  const routes = req.query?.route !== undefined
    ? Array.isArray(req.query.route) ? req.query.route : [req.query.route]
    : incoming.searchParams.getAll('route');
  const route = routes[0];
  if (routes.length !== 1 || !/^\/(api|v1)\/(?:[A-Za-z0-9_-]+\/?)+$/.test(route ?? '') || route === '/api/gateway') return json(res, 400, 'INVALID_ROUTE');
  if (!process.env.GATEWAY_URL) return json(res, 503, 'GATEWAY_NOT_CONFIGURED');
  let upstream;
  try {
    upstream = new URL(process.env.GATEWAY_URL);
    if (upstream.protocol !== 'https:' || upstream.username || upstream.password || upstream.search || upstream.hash || upstream.pathname !== '/' || /^(localhost|127\.|0\.|10\.|192\.168\.|169\.254\.|172\.(1[6-9]|2\d|3[01])\.)/i.test(upstream.hostname) || upstream.hostname.includes(':')) throw new Error();
  } catch { return json(res, 503, 'INVALID_GATEWAY_CONFIGURATION'); }
  upstream.pathname = route;
  incoming.searchParams.delete('route');
  // Vercel expands the rewrite's :path* capture into a query parameter as well.
  // It is routing metadata, not an application query (strict gateway schemas reject it).
  incoming.searchParams.delete('path');
  upstream.search = incoming.searchParams.toString();
  const headers = {};
  for (const name of ['authorization', 'content-type', 'accept', 'origin', 'x-eval-capture', 'x-leakshield-mode']) {
    if (typeof req.headers[name] === 'string') headers[name] = req.headers[name];
  }
  // Client-supplied copies are deliberately ignored; only the server owns this credential.
  if (process.env.GATEWAY_PROXY_SECRET) headers['x-leakshield-proxy-secret'] = process.env.GATEWAY_PROXY_SECRET;
  let body;
  if (req.method !== 'GET' && req.method !== 'OPTIONS') {
    if (req.body !== undefined) body = Buffer.isBuffer(req.body) || typeof req.body === 'string' ? req.body : JSON.stringify(req.body);
    else {
      const chunks = []; let bytes = 0;
      for await (const part of req) {
        bytes += part.length;
        if (bytes > 4 * 1024 * 1024) return json(res, 413, 'FILE_TOO_LARGE');
        chunks.push(part);
      }
      body = Buffer.concat(chunks);
    }
    if (Buffer.byteLength(body) > 4 * 1024 * 1024) return json(res, 413, 'FILE_TOO_LARGE');
  }
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 280_000);
  const closed = () => controller.abort();
  res.once('close', closed);
  try {
    const response = await fetch(upstream, { method: req.method, headers, body, redirect: 'manual', signal: controller.signal });
    const returned = { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' };
    for (const name of ['content-type', 'retry-after']) if (response.headers.has(name)) returned[name] = response.headers.get(name);
    res.writeHead(response.status, returned);
    if (response.body) await pipeline(Readable.fromWeb(response.body), res);
    else res.end();
  } catch {
    // Never log request bodies, bearer tokens, URLs with credentials or upstream errors.
    if (!res.headersSent && !res.destroyed) json(res, 502, 'GATEWAY_UNREACHABLE');
    else if (!res.destroyed) res.end();
  } finally {
    clearTimeout(timeout);
    res.off('close', closed);
  }
}
