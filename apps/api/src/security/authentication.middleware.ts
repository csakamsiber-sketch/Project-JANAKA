import { Injectable, NestMiddleware } from '@nestjs/common';
import { FastifyRequest, FastifyReply } from 'fastify';
import { AUTH_COOKIE_NAME } from '../auth/auth.constants';
import { AuthService } from '../auth/auth.service';
import { getRequestAccessToken, getRequestCookies } from '../common/request-cookies';

@Injectable()
export class AuthenticationMiddleware implements NestMiddleware {
  constructor(private readonly authService: AuthService) {}

  async use(request: FastifyRequest, reply: FastifyReply, next: () => void) {
    const requestPath = [request.url, (request as FastifyRequest & { originalUrl?: string }).originalUrl, request.raw?.url]
      .filter((value): value is string => typeof value === 'string')
      .join(' ');
    const path = requestPath.split('?')[0] ?? '';
    if (request.method === 'OPTIONS' || /\/auth\/(login|login\/resend-otp|register|forgot-password|reset-password|refresh|change-password)$/.test(path) || path.endsWith('/internal/cron')) {
      next();
      return;
    }

    const cookies = getRequestCookies(request);
    const accessToken = getRequestAccessToken(request) ?? cookies[AUTH_COOKIE_NAME];
    const user = accessToken ? await this.authService.getPersistentUserBySession(accessToken) : undefined;
    if (!user) {
      const rawResponse = reply as unknown as { statusCode: number; setHeader: (name: string, value: string) => void; end: (body: string) => void };
      rawResponse.statusCode = 401;
      rawResponse.setHeader('Content-Type', 'application/json; charset=utf-8');
      rawResponse.end(JSON.stringify({ error: { code: 'AUTHENTICATION_REQUIRED', message: 'Authentication is required.', requestId: request.headers['x-request-id'] ?? 'unknown' } }));
      return;
    }

    if (user.mustChangePassword && !/\/auth\/(change-password|logout)$/.test(path)) {
      const rawResponse = reply as unknown as { statusCode: number; setHeader: (name: string, value: string) => void; end: (body: string) => void };
      rawResponse.statusCode = 403;
      rawResponse.setHeader('Content-Type', 'application/json; charset=utf-8');
      rawResponse.end(JSON.stringify({ error: { code: 'PASSWORD_CHANGE_REQUIRED', message: 'Change your temporary password before continuing.', requestId: request.headers['x-request-id'] ?? 'unknown' } }));
      return;
    }

    (request as FastifyRequest & { user?: typeof user }).user = user;
    next();
  }
}