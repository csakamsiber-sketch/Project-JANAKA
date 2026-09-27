import { Request, Response, NextFunction } from 'express';
import { randomBytes } from 'node:crypto';

export function SecurityHeadersMiddleware(req: Request, res: Response, next: NextFunction) {
  const origin = typeof req.headers.origin === 'string' ? req.headers.origin : undefined;
  const allowedOrigins = (process.env.CORS_ALLOWED_ORIGINS ?? 'http://localhost:3000,http://localhost:3110,http://127.0.0.1:3000,http://127.0.0.1:3110,https://appurl.example.com,https://project-janaka-web.vercel.app').split(',').map((value) => value.trim()).filter(Boolean);
  const nonce = randomBytes(16).toString('base64');

  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  res.setHeader('Content-Type', 'application/json; charset=utf-8');

  if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method) && Number(req.headers['content-length'] ?? 0) > 0) {
    const contentType = typeof req.headers['content-type'] === 'string' ? req.headers['content-type'] : '';
    if (!/^application\/json(?:\s*;\s*charset=utf-8)?$/i.test(contentType)) {
      const rawResponse = res as Response & { statusCode?: number; end?: (body: string) => void };
      rawResponse.statusCode = 415;
      rawResponse.setHeader('Content-Type', 'application/json; charset=utf-8');
      rawResponse.end?.(JSON.stringify({ error: { code: 'UNSUPPORTED_MEDIA_TYPE', message: 'API request bodies must use application/json; charset=utf-8.' } }));
      return;
    }
  }

  if (origin && allowedOrigins.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader('Vary', 'Origin');
  }

  res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  res.setHeader(
    'Content-Security-Policy',
    `default-src 'self'; object-src 'none'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'; script-src 'self' 'nonce-${nonce}'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self' https://api.github.com; font-src 'self' data:;`
  );
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'geolocation=(), microphone=(), camera=()');
  res.setHeader('X-Frame-Options', 'DENY');
  next();
}
