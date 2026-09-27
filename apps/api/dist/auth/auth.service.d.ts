import { AuthenticatedUser, AuthSession, RegistrationRequest, UserRecord, UserRole } from './auth.types';
import { PrismaService } from '../prisma.service';
import { MailService } from './mail.service';
import { RedisSessionService } from './redis-session.service';
export declare class AuthService {
    private readonly prisma?;
    private readonly mailService?;
    private readonly redisSession?;
    private readonly sessions;
    private readonly users;
    private readonly registrationRequests;
    private readonly resetTokens;
    private readonly blacklistedTokens;
    private readonly redis;
    private redisConnection?;
    private readonly emailRegex;
    private getSeedAdminEmail;
    constructor(prisma?: PrismaService | undefined, mailService?: MailService | undefined, redisSession?: RedisSessionService | undefined);
    private validateEmail;
    private validatePassword;
    private hashPassword;
    private matchesPassword;
    private hashPasswordAsync;
    private matchesPasswordAsync;
    createUser(input: {
        id: string;
        email: string;
        password: string;
        firstName: string;
        lastName: string;
        role: UserRole;
    }): UserRecord;
    createRegistrationRequest(input: {
        email: string;
        password?: string;
        firstName: string;
        lastName: string;
        role: UserRole;
    }): Promise<RegistrationRequest>;
    approveRegistrationRequest(requestId: string): Promise<RegistrationRequest | undefined>;
    private generateTemporaryPassword;
    changePassword(accessToken: string, currentPassword: string, newPassword: string): Promise<boolean>;
    private validateEmailDomain;
    private ensureRedis;
    private registrationKey;
    private registrationEmailKey;
    private storeRegistrationRequest;
    private getRegistrationRequest;
    private deleteRegistrationRequest;
    listPersistentUsers(page?: number): Promise<{
        items: UserRecord[];
        page: number;
        limit: number;
        total: number;
        totalPages: number;
    } | {
        items: {
            id: string;
            email: string;
            firstName: string | null;
            lastName: string | null;
            role: string;
            isActive: boolean;
            createdAt: Date;
        }[];
        page: number;
        limit: number;
        total: number;
        totalPages: number;
    }>;
    listRegistrationRequests(page?: number): Promise<{
        items: RegistrationRequest[];
        page: number;
        limit: number;
        total: number;
        totalPages: number;
    }>;
    rejectRegistrationRequest(requestId: string): Promise<boolean>;
    requestAdminActionOtp(actorId: string, targetId: string, action: 'DEACTIVATE' | 'PROMOTE_ADMIN'): Promise<void>;
    resendAdminActionOtp(actorId: string, targetId: string, action: 'DEACTIVATE' | 'PROMOTE_ADMIN'): Promise<{
        sent: true;
        retryAfterSeconds: number;
    }>;
    confirmAdminActionOtp(actorId: string, targetId: string, action: 'DEACTIVATE' | 'PROMOTE_ADMIN', code: string): Promise<{
        valid: boolean;
        locked: boolean;
        attemptsRemaining: number;
    }>;
    requestSuperadminDowngrade(requestedById: string, targetId: string, requestedRole: UserRole): Promise<{
        id: string;
        targetId: string;
        requestedRole: UserRole;
        requiredApprovals: number;
        expiresAt: Date;
    }>;
    listPendingSuperadminDowngradeApprovals(approverId: string): Promise<{
        id: string;
        requestId: string;
        target: {
            email: string;
            id: string;
            firstName: string | null;
            lastName: string | null;
        };
        requestedBy: string;
        requestedRole: string;
        expiresAt: Date;
    }[]>;
    approveSuperadminDowngrade(approverId: string, requestId: string, code: string): Promise<{
        accepted: boolean;
        completed: boolean;
    }>;
    resendSuperadminDowngradeOtp(approverId: string, requestId: string): Promise<{
        sent: true;
        retryAfterSeconds: number;
    }>;
    changeUserRole(targetId: string, role: UserRole): Promise<boolean>;
    private listUsers;
    requestPasswordReset(email: string): {
        token: string;
        expiresAt: number;
    };
    resetPassword(token: string, newPassword: string): boolean;
    blacklistToken(token: string, expiresInMs: number): void;
    isTokenBlacklisted(token: string): boolean;
    buildAccessToken(user: AuthenticatedUser, sessionId?: string): string;
    buildRefreshToken(user: AuthenticatedUser, sessionId?: string): string;
    createSession(user: AuthenticatedUser, fingerprintHash?: string): AuthSession;
    authenticateUserPersistent(email: string, password: string, otp?: string): Promise<AuthenticatedUser | undefined>;
    verifyPasswordForSession(accessToken: string, password: string): Promise<AuthenticatedUser | undefined>;
    createSessionPersistent(user: AuthenticatedUser, fingerprintHash: string | undefined, csrfToken: string): Promise<AuthSession>;
    requiresLoginOtp(userId: string, fingerprint: string | undefined): Promise<boolean>;
    hasRegisteredDevice(userId: string): Promise<boolean>;
    rememberDevice(userId: string, fingerprint: string): Promise<void>;
    issueLoginOtp(user: AuthenticatedUser, fingerprint: string): Promise<{
        challengeId: string;
        temporaryAccessToken: string;
    }>;
    verifyLoginOtp(userId: string, challengeId: string, temporaryAccessToken: string, code: string, fingerprint: string): Promise<boolean>;
    resendLoginOtp(user: AuthenticatedUser, challengeId: string, temporaryAccessToken: string, fingerprint: string): Promise<{
        sent: true;
        retryAfterSeconds: number;
    }>;
    refreshPersistent(refreshToken: string, csrfToken: string, fingerprint: string | undefined): Promise<AuthSession | undefined>;
    getRefreshUser(refreshToken: string): Promise<{
        user: AuthenticatedUser;
        fingerprintHash: string | null;
    } | undefined>;
    fingerprintMatches(storedHash: string | null | undefined, fingerprint: string | undefined): boolean;
    consumeCsrfToken(accessToken: string, cookieToken: string | undefined, headerToken: string | undefined, replacementToken: string): Promise<boolean>;
    private isValidAccessToken;
    getPersistentUserBySession(accessToken: string): Promise<AuthenticatedUser | undefined>;
    revokePersistentSession(accessToken: string): Promise<void>;
    listPersistentUsersByRole(role: UserRole, page?: number, limit?: number): Promise<{
        items: UserRecord[];
        page: number;
        limit: number;
        total: number;
        totalPages: number;
    }>;
    private hashSecret;
    private findSessionIdFromRefreshToken;
    private getPersistentUserById;
    private constantTimeHashMatch;
    private hashFingerprint;
    private matchesFingerprint;
    private toUserRecord;
    private toAuthenticatedUser;
    private ensureSeedAdmin;
    getSession(sessionId: string): AuthSession | undefined;
    revokeSession(sessionId: string): void;
    authorize(user: AuthenticatedUser, permission: string): boolean;
    requireRole(user: AuthenticatedUser, allowed: UserRole[]): boolean;
    getUserByEmail(email: string): UserRecord | undefined;
    getUserById(id: string): UserRecord | undefined;
    listUsersByRole(role: UserRole, page?: number, limit?: number): {
        items: UserRecord[];
        page: number;
        limit: number;
        total: number;
        totalPages: number;
    };
    authenticateUser(email: string, password: string, otp?: string): AuthenticatedUser | undefined;
    createCsrfToken(): string;
    verifyAccessToken(token: string): AuthenticatedUser | undefined;
    validateSessionCookie(sessionId: string): boolean;
    getSessionByAccessToken(token: string): AuthSession | undefined;
    getSessionByRefreshToken(token: string): AuthSession | undefined;
    refreshSession(sessionId: string): AuthSession | undefined;
}
