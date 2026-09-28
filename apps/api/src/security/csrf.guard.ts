import { Injectable } from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import { AUTH_CSRF_COOKIE_NAME, AUTH_COOKIE_SAME_SITE, CSRF_COOKIE_MAX_AGE_MS, IS_SECURE_COOKIE } from '../auth/auth.constants';
import { AuthService } from '../auth/auth.service';
import { getRequestAccessToken, getRequestCookies } from '../common/request-cookies';
import { AUTH_COOKIE_NAME } from '../auth/auth.constants';
import { getAllowedOrigins, isAllowedRequestOrigin } from './request-origin';

@Injectable()
export class CSRFGuard {
  constructor(private readonly authService: AuthService) {}

  async use(req: any, res: any, next: any) {
  const origin = typeof req.headers.origin === 'string' ? req.headers.origin : undefined;
  const referer = typeof req.headers.referer === 'string' ? req.headers.referer : undefined;
  const forwardedHost = this.firstHeaderValue(req.headers['x-forwarded-host']);
  const requestHost = forwardedHost ?? req.hostname ?? this.firstHeaderValue(req.headers.host);
  const forwardedProtocol = this.firstHeaderValue(req.headers['x-forwarded-proto']);
  const requestProtocol = forwardedProtocol ?? req.protocol ?? (req.raw?.socket?.encrypted ? 'https' : 'http');
  const requestOrigin = requestHost ? `${requestProtocol.split(',')[0]}://${requestHost}` : undefined;
  const allowedOrigins = getAllowedOrigins();
  const isAllowedOrigin = isAllowedRequestOrigin(origin, referer, requestOrigin, allowedOrigins);

  if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) {
    const requestPath = [req.url, req.originalUrl, req.raw?.url, req.routerPath, req.routeOptions?.url]
      .filter((value): value is string => typeof value === 'string')
      .join(' ');
    const csrfExempt = /\/auth\/(login|login\/resend-otp|refresh|register|forgot-password|reset-password)(?:[/?]|$)/.test(requestPath);
    if (csrfExempt) {
      return next();
    }

    const cookies = (req.cookies as Record<string, string> | undefined) ?? {};
    const csrfCookie = cookies[AUTH_CSRF_COOKIE_NAME] ?? this.readCookie(req.headers.cookie, AUTH_CSRF_COOKIE_NAME);
    const csrfHeader = typeof req.headers['x-csrf-token'] === 'string' ? req.headers['x-csrf-token'] : undefined;
    const accessToken = getRequestAccessToken(req) ?? getRequestCookies(req)[AUTH_COOKIE_NAME];
    const replacementToken = this.createToken();
    const consumed = accessToken && await this.authService.consumeCsrfToken(accessToken, csrfCookie, csrfHeader, replacementToken);

    if (!consumed) {
      res.statusCode = 403;
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      return res.end(JSON.stringify({ error: { code: 'CSRF_TOKEN_INVALID', message: 'A valid CSRF token header is required.', requestId: req.headers['x-request-id'] ?? 'unknown' } }));
    }

    this.setCsrfCookie(res, replacementToken);

    if (!isAllowedOrigin) {
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Vary', 'Origin');
      res.statusCode = 403;
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      return res.end(
        JSON.stringify({
          error: {
            code: 'CSRF_FORBIDDEN',
            message: 'Cross-site request rejected.',
            requestId: req.headers['x-request-id'] ?? 'unknown',
          },
        })
      );
    }

    if (origin && isAllowedOrigin) {
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader('Access-Control-Allow-Credentials', 'true');
      res.setHeader('Vary', 'Origin');
    }
  }

  if (req.method === 'OPTIONS') {
    if (origin && isAllowedOrigin) res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With, X-CSRF-Token, X-Fingerprint');
    res.statusCode = 204;
    return res.end();
  }

  next();
}

  private firstHeaderValue(value: unknown): string | undefined {
    if (typeof value === 'string') return value.split(',')[0]?.trim();
    if (Array.isArray(value) && typeof value[0] === 'string') return value[0].split(',')[0]?.trim();
    return undefined;
  }

  private createToken(): string {
    return randomBytes(32).toString('hex');
  }

  private readCookie(header: unknown, name: string): string | undefined {
    if (typeof header !== 'string') return undefined;
    return header.split(';').map((part) => part.trim()).find((part) => part.startsWith(`${name}=`))?.slice(name.length + 1);
  }

  private setCsrfCookie(res: any, token: string): void {
    if (typeof res.setCookie === 'function') {
      res.setCookie(AUTH_CSRF_COOKIE_NAME, token, {
        httpOnly: false,
        secure: IS_SECURE_COOKIE,
        sameSite: AUTH_COOKIE_SAME_SITE,
        maxAge: CSRF_COOKIE_MAX_AGE_MS / 1000,
        path: '/',
      });
      return;
    }

    const cookie = [
      `${AUTH_CSRF_COOKIE_NAME}=${encodeURIComponent(token)}`,
      `Max-Age=${Math.floor(CSRF_COOKIE_MAX_AGE_MS / 1000)}`,
      'Path=/',
      `SameSite=${AUTH_COOKIE_SAME_SITE}`,
      ...(IS_SECURE_COOKIE ? ['Secure'] : []),
    ].join('; ');
    const existing = res.getHeader?.('Set-Cookie');
    const setCookie = Array.isArray(existing) ? [...existing, cookie] : existing ? [String(existing), cookie] : [cookie];
    res.setHeader('Set-Cookie', setCookie);
  }
}
