import { Injectable, NestMiddleware } from '@nestjs/common';
import { FastifyRequest, FastifyReply } from 'fastify';

type Bucket = { count: number; resetAt: number };

@Injectable()
export class RateLimitMiddleware implements NestMiddleware {
  private readonly buckets = new Map<string, Bucket>();

  use(request: FastifyRequest, reply: FastifyReply, next: () => void) {
    const now = Date.now();
    const ip = request.ip ?? 'unknown';
    const requestPath = [request.url, (request as FastifyRequest & { originalUrl?: string }).originalUrl, request.raw?.url]
      .filter((value): value is string => typeof value === 'string')
      .join(' ');
    const isPublicAuth = /\/auth\/(login|register|forgot-password|reset-password|refresh)(?:[/?]|$)/.test(requestPath);
    const windowMs = 60 * 1000;
    const maxRequests = isPublicAuth ? 20 : 100;
    const effectiveWindowMs = windowMs;
    const key = `${isPublicAuth ? 'public' : 'api'}:${ip}`;
    const current = this.buckets.get(key);
    const bucket = !current || current.resetAt <= now ? { count: 0, resetAt: now + effectiveWindowMs } : current;

    bucket.count += 1;
    this.buckets.set(key, bucket);
    if (bucket.count > maxRequests) {
      const rawResponse = reply as unknown as { statusCode: number; setHeader: (name: string, value: number | string) => void; end: (body: string) => void };
      rawResponse.setHeader('Retry-After', Math.ceil((bucket.resetAt - now) / 1000));
      rawResponse.statusCode = 429;
      rawResponse.setHeader('Content-Type', 'application/json; charset=utf-8');
      rawResponse.end(JSON.stringify({ error: { code: 'RATE_LIMITED', message: 'Too many requests. Try again later.' } }));
      return;
    }

    if (this.buckets.size > 10000) {
      for (const [bucketKey, value] of this.buckets) {
        if (value.resetAt <= now) this.buckets.delete(bucketKey);
      }
    }

    next();
  }
}