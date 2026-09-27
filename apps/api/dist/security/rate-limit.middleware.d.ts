import { NestMiddleware } from '@nestjs/common';
import { FastifyRequest, FastifyReply } from 'fastify';
export declare class RateLimitMiddleware implements NestMiddleware {
    private readonly buckets;
    use(request: FastifyRequest, reply: FastifyReply, next: () => void): void;
}
