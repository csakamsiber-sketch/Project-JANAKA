"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.RateLimitMiddleware = void 0;
const common_1 = require("@nestjs/common");
let RateLimitMiddleware = class RateLimitMiddleware {
    buckets = new Map();
    use(request, reply, next) {
        const now = Date.now();
        const ip = request.ip ?? 'unknown';
        const requestPath = [request.url, request.originalUrl, request.raw?.url]
            .filter((value) => typeof value === 'string')
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
            const rawResponse = reply;
            rawResponse.setHeader('Retry-After', Math.ceil((bucket.resetAt - now) / 1000));
            rawResponse.statusCode = 429;
            rawResponse.setHeader('Content-Type', 'application/json; charset=utf-8');
            rawResponse.end(JSON.stringify({ error: { code: 'RATE_LIMITED', message: 'Too many requests. Try again later.' } }));
            return;
        }
        if (this.buckets.size > 10000) {
            for (const [bucketKey, value] of this.buckets) {
                if (value.resetAt <= now)
                    this.buckets.delete(bucketKey);
            }
        }
        next();
    }
};
exports.RateLimitMiddleware = RateLimitMiddleware;
exports.RateLimitMiddleware = RateLimitMiddleware = __decorate([
    (0, common_1.Injectable)()
], RateLimitMiddleware);
//# sourceMappingURL=rate-limit.middleware.js.map