import { FastifyReply, FastifyRequest } from 'fastify';
import { AuthService } from './auth.service';
import { BotProtectionService } from '../security/bot-protection.service';
export declare class AuthController {
    private readonly authService;
    private readonly botProtection;
    constructor(authService: AuthService, botProtection: BotProtectionService);
    register(body: unknown): Promise<{
        data: {
            registrationRequestId: any;
            status: any;
        };
        meta: {};
    }>;
    approveRegistration(body: unknown, req: FastifyRequest): Promise<{
        data: {
            approved: boolean;
            email: string;
            role: import("./auth.types").UserRole;
        };
        meta: {};
    }>;
    login(body: unknown, req: FastifyRequest, res: FastifyReply): Promise<{
        data: {
            requiresOtp: boolean;
            challengeId: string;
            temporaryAccessToken: string;
            user?: undefined;
        };
        meta: {
            requestId?: undefined;
        };
    } | {
        data: {
            user: {
                id: string;
                email: string;
                role: import("./auth.types").UserRole;
                firstName: string;
                lastName: string;
                mustChangePassword: boolean;
            };
            requiresOtp?: undefined;
            challengeId?: undefined;
            temporaryAccessToken?: undefined;
        };
        meta: {
            requestId: string;
        };
    }>;
    resendLoginOtp(body: unknown, req: FastifyRequest): Promise<{
        data: {
            sent: true;
            retryAfterSeconds: number;
        };
        meta: {};
    }>;
    refresh(body: unknown, req: FastifyRequest, res: FastifyReply): Promise<{
        data: {
            rotated: boolean;
        };
        meta: {};
    }>;
    forgotPassword(body: unknown): {
        data: {
            sent: boolean;
            token: string;
            expiresAt: number;
        };
        meta: {};
    };
    resetPassword(body: unknown): {
        data: {
            reset: boolean;
        };
        meta: {};
    };
    logout(req: FastifyRequest, res: FastifyReply): Promise<{
        data: {
            loggedOut: boolean;
        };
        meta: {};
    }>;
    verifyPassword(body: unknown, req: FastifyRequest): Promise<{
        data: {
            verified: boolean;
            role: import("./auth.types").UserRole;
        };
        meta: {};
    }>;
    changePassword(body: unknown, req: FastifyRequest, res: FastifyReply): Promise<{
        data: {
            changed: boolean;
        };
        meta: {};
    }>;
    getUsers(role?: string, page?: string, limit?: string, req?: FastifyRequest): Promise<{
        data: {
            items: import("./auth.types").UserRecord[];
            page: number;
            limit: number;
            total: number;
            totalPages: number;
        };
        meta: {};
    }>;
    manageUsers(req: FastifyRequest, page?: string): Promise<{
        data: {
            items: import("./auth.types").UserRecord[];
            page: number;
            limit: number;
            total: number;
            totalPages: number;
        } | {
            items: {
                id: string;
                email: string;
                firstName: string;
                lastName: string;
                role: string;
                isActive: boolean;
                createdAt: Date;
            }[];
            page: number;
            limit: number;
            total: number;
            totalPages: number;
        };
        meta: {};
    }>;
    registrationRequests(req: FastifyRequest, page?: string): Promise<{
        data: {
            items: import("./auth.types").RegistrationRequest[];
            page: number;
            limit: number;
            total: number;
            totalPages: number;
        };
        meta: {};
    }>;
    rejectRegistration(requestId: string, req: FastifyRequest): Promise<{
        data: {
            rejected: boolean;
        };
        meta: {};
    }>;
    requestUserActionOtp(body: unknown, req: FastifyRequest): Promise<{
        data: {
            sent: boolean;
        };
        meta: {};
    }>;
    resendUserActionOtp(body: unknown, req: FastifyRequest): Promise<{
        data: {
            sent: true;
            retryAfterSeconds: number;
        };
        meta: {};
    }>;
    confirmUserAction(body: unknown, req: FastifyRequest): Promise<{
        data: {
            completed: boolean;
        };
        meta: {};
    }>;
    superadminDowngradeApprovals(req: FastifyRequest): Promise<{
        data: {
            id: string;
            requestId: string;
            target: {
                email: string;
                id: string;
                firstName: string;
                lastName: string;
            };
            requestedBy: string;
            requestedRole: string;
            expiresAt: Date;
        }[];
        meta: {};
    }>;
    requestSuperadminDowngrade(targetId: string, body: unknown, req: FastifyRequest): Promise<{
        data: {
            id: string;
            targetId: string;
            requestedRole: import("./auth.types").UserRole;
            requiredApprovals: number;
            expiresAt: Date;
        };
        meta: {};
    }>;
    confirmSuperadminDowngrade(requestId: string, body: unknown, req: FastifyRequest): Promise<{
        data: {
            accepted: boolean;
            completed: boolean;
        };
        meta: {};
    }>;
    resendSuperadminDowngradeOtp(requestId: string, req: FastifyRequest): Promise<{
        data: {
            sent: true;
            retryAfterSeconds: number;
        };
        meta: {};
    }>;
    changeUserRole(targetId: string, body: unknown, req: FastifyRequest): Promise<{
        data: {
            updated: boolean;
            role: "OVERSEER" | "VERIFICATOR" | "PIC";
        };
        meta: {};
    }>;
    me(req: FastifyRequest): Promise<{
        data: {
            id: string;
            role: import("./auth.types").UserRole;
        };
        meta: {};
    }>;
    private requireUser;
    private requireManagementRole;
}
