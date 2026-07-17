import type { RequestHandler } from 'express';

const DEFAULT_ORIGINS = ['http://localhost:5173', 'http://127.0.0.1:5173', 'http://localhost:4173', 'http://127.0.0.1:4173'];

export class AllowedOriginsError extends Error {
  readonly code = 'CONFIG_ALLOWED_ORIGINS_INVALID';
  constructor() { super('CONFIG_ALLOWED_ORIGINS_INVALID'); }
}

export function parseAllowedOrigins(raw = ''): ReadonlySet<string> {
  const origins = new Set(DEFAULT_ORIGINS);
  for (const entry of raw.split(',').map((value) => value.trim()).filter(Boolean)) {
    let parsed: URL;
    try { parsed = new URL(entry); } catch { throw new AllowedOriginsError(); }
    const loopback = ['localhost', '127.0.0.1', '[::1]'].includes(parsed.hostname);
    if (entry === '*' || parsed.protocol !== 'http:' || !loopback || !parsed.port || parsed.username || parsed.password || parsed.pathname !== '/' || parsed.search || parsed.hash) {
      throw new AllowedOriginsError();
    }
    origins.add(parsed.origin);
  }
  return origins;
}

export function createApiOriginPolicy(allowed: ReadonlySet<string>): RequestHandler {
  return (req, res, next) => {
    const origin = req.get('origin');
    if (origin && !allowed.has(origin)) {
      res.status(403).json({ success: false, error: { code: 'CONFIG_ORIGIN_REJECTED', message: '请求来源不受信任' } });
      return;
    }
    if (origin) {
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader('Vary', 'Origin');
      res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    }
    if (req.method === 'OPTIONS') return void res.status(204).end();
    next();
  };
}
