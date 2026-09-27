import { OnModuleDestroy } from '@nestjs/common';
import { AuthenticatedUser, UserRole } from './auth.types';
type RedisSessionRecord = {
    sessionId: string;
    userId: string;
    role: UserRole;
    email: string;
    refreshTokenHash: string;
    fingerprint: string;
    csrfTokenHash: string;
};
export declare class RedisSessionService implements OnModuleDestroy {
    private readonly client;
    private connection?;
    readonly enabled: boolean;
    constructor();
    onModuleDestroy(): Promise<void>;
    private connect;
    private activeKey;
    private sessionKey;
    private hash;
    private fingerprintHash;
    private equalHash;
    createSession(input: {
        sessionId: string;
        user: AuthenticatedUser;
        refreshToken: string;
        csrfToken: string;
        fingerprint: string;
    }, ttlSeconds: number): Promise<void>;
    getBySessionId(sessionId: string): Promise<RedisSessionRecord | undefined>;
    getActiveSessionId(userId: string): Promise<string | undefined>;
    rotateSession(input: {
        sessionId: string;
        refreshToken: string;
        nextRefreshToken: string;
        nextCsrfToken: string;
        fingerprint: string;
    }, ttlSeconds: number): Promise<boolean>;
    revokeSession(sessionId: string, userId?: string): Promise<void>;
    consumeCsrf(sessionId: string, cookieToken: string, headerToken: string, replacementToken: string): Promise<boolean>;
    isFingerprintValid(sessionId: string, fingerprint: string): Promise<boolean>;
    static sessionIdFromAccessToken(payload: unknown): string | undefined;
}
export {};
