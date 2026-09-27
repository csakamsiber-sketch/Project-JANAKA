import { NestMiddleware } from '@nestjs/common';
import { FastifyRequest, FastifyReply } from 'fastify';
import { AuthService } from '../auth/auth.service';
export declare class AuthenticationMiddleware implements NestMiddleware {
    private readonly authService;
    constructor(authService: AuthService);
    use(request: FastifyRequest, reply: FastifyReply, next: () => void): Promise<void>;
}
