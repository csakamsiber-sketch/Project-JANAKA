"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AuthController = void 0;
const common_1 = require("@nestjs/common");
const common_2 = require("@nestjs/common");
const zod_1 = require("zod");
const auth_constants_1 = require("./auth.constants");
const auth_service_1 = require("./auth.service");
const bot_protection_service_1 = require("../security/bot-protection.service");
const request_cookies_1 = require("../common/request-cookies");
const request_cookies_2 = require("../common/request-cookies");
const LoginSchema = zod_1.z.object({
    email: zod_1.z.string().email().max(254),
    password: zod_1.z.string().min(12).max(128),
    otp: zod_1.z.string().min(6).max(8).optional(),
    challengeId: zod_1.z.string().uuid().optional(),
    temporaryAccessToken: zod_1.z.string().length(64).optional(),
    botToken: zod_1.z.string().min(1).optional(),
    fingerprint: zod_1.z.string().min(8).max(256).optional(),
    role: zod_1.z.enum(['SUPERADMIN', 'OVERSEER', 'VERIFICATOR', 'PIC']).optional(),
});
const RegisterSchema = zod_1.z.object({
    email: zod_1.z.string().email().max(254),
    firstName: zod_1.z.string().min(2).max(80),
    lastName: zod_1.z.string().min(2).max(80),
    role: zod_1.z.enum(['SUPERADMIN', 'OVERSEER', 'VERIFICATOR', 'PIC']),
});
const ResetRequestSchema = zod_1.z.object({
    email: zod_1.z.string().email().max(254),
});
const ResetPasswordSchema = zod_1.z.object({
    token: zod_1.z.string().min(16).max(256),
    password: zod_1.z.string().min(12).max(128),
});
const id = (value) => value ?? 'unknown';
let AuthController = class AuthController {
    authService;
    botProtection;
    constructor(authService, botProtection) {
        this.authService = authService;
        this.botProtection = botProtection;
    }
    async register(body) {
        const parsed = RegisterSchema.parse(body);
        let registrationRequest;
        try {
            registrationRequest = await this.authService.createRegistrationRequest(parsed);
        }
        catch (error) {
            throw new common_1.BadRequestException(error instanceof Error ? error.message : 'Unable to submit registration request.');
        }
        return { data: { registrationRequestId: registrationRequest.id, status: registrationRequest.status }, meta: {} };
    }
    async approveRegistration(body, req) {
        const accessToken = (0, request_cookies_2.getRequestAccessToken)(req) ?? (0, request_cookies_1.getRequestCookies)(req)[auth_constants_1.AUTH_COOKIE_NAME];
        const user = accessToken ? await this.authService.getPersistentUserBySession(accessToken) : undefined;
        if (!user)
            throw new common_1.UnauthorizedException('Authentication is required.');
        if (user.role !== 'SUPERADMIN')
            throw new common_1.ForbiddenException('Only SUPERADMIN can approve registrations.');
        const dto = zod_1.z.object({ requestId: zod_1.z.string().min(1) }).parse(body);
        const request = await this.authService.approveRegistrationRequest(dto.requestId);
        if (!request) {
            throw new common_1.UnauthorizedException('Registration request not found.');
        }
        return { data: { approved: true, email: request.email, role: request.role }, meta: {} };
    }
    async login(body, req, res) {
        const parsed = LoginSchema.parse(body);
        await this.botProtection.verify(parsed.botToken, req.ip);
        const user = await this.authService.authenticateUserPersistent(parsed.email, parsed.password, parsed.otp);
        if (!user) {
            throw new common_1.UnauthorizedException('Invalid email, password, or MFA code.');
        }
        const fingerprint = (parsed.fingerprint ?? req.headers['x-fingerprint'] ?? '').toString().trim();
        const hasDevice = await this.authService.hasRegisteredDevice(user.id);
        if (fingerprint && !hasDevice)
            await this.authService.rememberDevice(user.id, fingerprint);
        if (fingerprint && hasDevice && await this.authService.requiresLoginOtp(user.id, fingerprint)) {
            if (!parsed.otp || !parsed.challengeId || !parsed.temporaryAccessToken || !(await this.authService.verifyLoginOtp(user.id, parsed.challengeId, parsed.temporaryAccessToken, parsed.otp, fingerprint))) {
                if (parsed.otp || parsed.challengeId || parsed.temporaryAccessToken)
                    throw new common_1.UnauthorizedException('Invalid or expired verification code.');
                const challenge = await this.authService.issueLoginOtp(user, fingerprint);
                return { data: { requiresOtp: true, challengeId: challenge.challengeId, temporaryAccessToken: challenge.temporaryAccessToken }, meta: {} };
            }
        }
        const csrfToken = this.authService.createCsrfToken();
        const session = await this.authService.createSessionPersistent(user, fingerprint, csrfToken);
        res.setCookie(auth_constants_1.AUTH_COOKIE_NAME, session.accessToken, {
            httpOnly: true,
            secure: auth_constants_1.IS_SECURE_COOKIE,
            sameSite: auth_constants_1.AUTH_COOKIE_SAME_SITE,
            maxAge: 15 * 60,
            path: '/',
        });
        res.setCookie(auth_constants_1.AUTH_REFRESH_COOKIE_NAME, session.refreshToken, {
            httpOnly: true,
            secure: auth_constants_1.IS_SECURE_COOKIE,
            sameSite: auth_constants_1.AUTH_COOKIE_SAME_SITE,
            maxAge: auth_constants_1.REFRESH_COOKIE_MAX_AGE_MS / 1000,
            path: auth_constants_1.REFRESH_COOKIE_PATH,
        });
        res.setCookie(auth_constants_1.AUTH_CSRF_COOKIE_NAME, csrfToken, {
            httpOnly: false,
            secure: auth_constants_1.IS_SECURE_COOKIE,
            sameSite: auth_constants_1.AUTH_COOKIE_SAME_SITE,
            maxAge: auth_constants_1.CSRF_COOKIE_MAX_AGE_MS / 1000,
            path: '/',
        });
        return {
            data: {
                user: {
                    id: user.id,
                    email: user.email,
                    role: user.role,
                    firstName: user.firstName,
                    lastName: user.lastName,
                    mustChangePassword: user.mustChangePassword,
                },
            },
            meta: { requestId: id(req.headers['x-request-id']) },
        };
    }
    async resendLoginOtp(body, req) {
        const dto = zod_1.z.object({ email: zod_1.z.string().email(), password: zod_1.z.string().min(1).max(128), challengeId: zod_1.z.string().uuid(), temporaryAccessToken: zod_1.z.string().min(32), fingerprint: zod_1.z.string().min(1), botToken: zod_1.z.string().min(1) }).parse(body);
        await this.botProtection.verify(dto.botToken, req.ip);
        const user = await this.authService.authenticateUserPersistent(dto.email, dto.password);
        if (!user)
            throw new common_1.UnauthorizedException('The sign-in credentials are invalid.');
        return { data: await this.authService.resendLoginOtp(user, dto.challengeId, dto.temporaryAccessToken, dto.fingerprint), meta: {} };
    }
    async refresh(body, req, res) {
        const refreshToken = (0, request_cookies_1.getRequestCookies)(req)[auth_constants_1.AUTH_REFRESH_COOKIE_NAME];
        if (!refreshToken) {
            console.warn('[auth] refresh rejected: missing refresh cookie on request');
            throw new common_1.UnauthorizedException('Missing refresh token.');
        }
        const refreshUser = await this.authService.getRefreshUser(refreshToken);
        if (!refreshUser) {
            console.warn('[auth] refresh rejected: refresh token invalid or expired for this session');
            throw new common_1.UnauthorizedException('Invalid or expired refresh token.');
        }
        const csrfToken = this.authService.createCsrfToken();
        const fingerprint = (req.headers['x-fingerprint'] ?? '').toString().trim();
        if (refreshUser.fingerprintHash && !this.authService.fingerprintMatches(refreshUser.fingerprintHash, fingerprint)) {
            console.warn('[auth] refresh rejected: fingerprint mismatch for active session');
            throw new common_1.UnauthorizedException('Invalid or expired refresh token or fingerprint mismatch.');
        }
        const updatedSession = await this.authService.refreshPersistent(refreshToken, csrfToken, fingerprint);
        if (!updatedSession) {
            throw new common_1.UnauthorizedException('Invalid or expired refresh token or fingerprint mismatch.');
        }
        res.setCookie(auth_constants_1.AUTH_COOKIE_NAME, updatedSession.accessToken, {
            httpOnly: true,
            secure: auth_constants_1.IS_SECURE_COOKIE,
            sameSite: auth_constants_1.AUTH_COOKIE_SAME_SITE,
            maxAge: 15 * 60,
            path: '/',
        });
        res.setCookie(auth_constants_1.AUTH_REFRESH_COOKIE_NAME, updatedSession.refreshToken, {
            httpOnly: true,
            secure: auth_constants_1.IS_SECURE_COOKIE,
            sameSite: auth_constants_1.AUTH_COOKIE_SAME_SITE,
            maxAge: auth_constants_1.REFRESH_COOKIE_MAX_AGE_MS / 1000,
            path: auth_constants_1.REFRESH_COOKIE_PATH,
        });
        res.setCookie(auth_constants_1.AUTH_CSRF_COOKIE_NAME, csrfToken, {
            httpOnly: false,
            secure: auth_constants_1.IS_SECURE_COOKIE,
            sameSite: auth_constants_1.AUTH_COOKIE_SAME_SITE,
            maxAge: auth_constants_1.CSRF_COOKIE_MAX_AGE_MS / 1000,
            path: '/',
        });
        return {
            data: {
                rotated: true,
            },
            meta: {},
        };
    }
    forgotPassword(body) {
        const parsed = ResetRequestSchema.parse(body);
        const reset = this.authService.requestPasswordReset(parsed.email);
        return {
            data: { sent: true, token: reset.token, expiresAt: reset.expiresAt },
            meta: {},
        };
    }
    resetPassword(body) {
        const parsed = ResetPasswordSchema.parse(body);
        const success = this.authService.resetPassword(parsed.token, parsed.password);
        if (!success) {
            throw new common_1.UnauthorizedException('Invalid or expired reset token.');
        }
        return { data: { reset: true }, meta: {} };
    }
    async logout(req, res) {
        const cookies = (0, request_cookies_1.getRequestCookies)(req);
        const accessToken = (0, request_cookies_2.getRequestAccessToken)(req) ?? cookies[auth_constants_1.AUTH_COOKIE_NAME];
        if (accessToken) {
            await this.authService.revokePersistentSession(accessToken);
        }
        const refreshToken = cookies[auth_constants_1.AUTH_REFRESH_COOKIE_NAME];
        if (refreshToken) {
            this.authService.blacklistToken(refreshToken, 30 * 24 * 60 * 60 * 1000);
        }
        res.clearCookie(auth_constants_1.AUTH_COOKIE_NAME, { path: '/' });
        res.clearCookie(auth_constants_1.AUTH_REFRESH_COOKIE_NAME, { path: auth_constants_1.REFRESH_COOKIE_PATH });
        res.clearCookie(auth_constants_1.AUTH_CSRF_COOKIE_NAME, { path: '/' });
        return { data: { loggedOut: true }, meta: {} };
    }
    async verifyPassword(body, req) {
        const password = zod_1.z.object({ password: zod_1.z.string().min(12).max(128) }).parse(body).password;
        const accessToken = (0, request_cookies_2.getRequestAccessToken)(req) ?? (0, request_cookies_1.getRequestCookies)(req)[auth_constants_1.AUTH_COOKIE_NAME];
        if (!accessToken)
            throw new common_1.UnauthorizedException('Authentication is required.');
        const user = await this.authService.verifyPasswordForSession(accessToken, password);
        if (!user)
            throw new common_1.UnauthorizedException('Password confirmation failed.');
        return { data: { verified: true, role: user.role }, meta: {} };
    }
    async changePassword(body, req, res) {
        const dto = zod_1.z.object({ currentPassword: zod_1.z.string().min(1).max(128), newPassword: zod_1.z.string().min(12).max(128), confirmPassword: zod_1.z.string().min(12).max(128) }).parse(body);
        if (dto.newPassword !== dto.confirmPassword) {
            throw new common_1.BadRequestException('New password and confirmation password must match.');
        }
        const accessToken = (0, request_cookies_2.getRequestAccessToken)(req) ?? (0, request_cookies_1.getRequestCookies)(req)[auth_constants_1.AUTH_COOKIE_NAME];
        if (!accessToken || !await this.authService.changePassword(accessToken, dto.currentPassword, dto.newPassword)) {
            throw new common_1.UnauthorizedException('Password change failed.');
        }
        res.clearCookie(auth_constants_1.AUTH_COOKIE_NAME, { path: '/' });
        res.clearCookie(auth_constants_1.AUTH_REFRESH_COOKIE_NAME, { path: auth_constants_1.REFRESH_COOKIE_PATH });
        res.clearCookie(auth_constants_1.AUTH_CSRF_COOKIE_NAME, { path: '/' });
        return { data: { changed: true }, meta: {} };
    }
    async getUsers(role, page, limit, req) {
        const accessToken = req ? ((0, request_cookies_2.getRequestAccessToken)(req) ?? (0, request_cookies_1.getRequestCookies)(req)[auth_constants_1.AUTH_COOKIE_NAME]) : undefined;
        const requester = accessToken ? await this.authService.getPersistentUserBySession(accessToken) : undefined;
        if (!requester || !['SUPERADMIN', 'OVERSEER', 'VERIFICATOR'].includes(requester.role))
            throw new common_1.ForbiddenException('Only authorized assurance users can list users.');
        const normalizedRole = (role ?? 'PIC');
        const safePage = Number(page) || 1;
        const safeLimit = Number(limit) || 10;
        if (!['SUPERADMIN', 'OVERSEER', 'VERIFICATOR', 'PIC'].includes(normalizedRole)) {
            return { data: { items: [], page: safePage, limit: safeLimit, total: 0, totalPages: 1 }, meta: {} };
        }
        return {
            data: await this.authService.listPersistentUsersByRole(normalizedRole, safePage, safeLimit),
            meta: {},
        };
    }
    async manageUsers(req, page) {
        const user = await this.requireUser(req);
        this.requireManagementRole(user.role);
        return { data: await this.authService.listPersistentUsers(Number(page) || 1), meta: {} };
    }
    async registrationRequests(req, page) {
        const user = await this.requireUser(req);
        this.requireManagementRole(user.role);
        return { data: await this.authService.listRegistrationRequests(Number(page) || 1), meta: {} };
    }
    async rejectRegistration(requestId, req) {
        const user = await this.requireUser(req);
        this.requireManagementRole(user.role);
        if (!await this.authService.rejectRegistrationRequest(requestId))
            throw new common_1.UnauthorizedException('Registration request not found.');
        return { data: { rejected: true }, meta: {} };
    }
    async requestUserActionOtp(body, req) {
        const user = await this.requireUser(req);
        this.requireManagementRole(user.role);
        const dto = zod_1.z.object({ targetId: zod_1.z.string().uuid(), action: zod_1.z.enum(['DEACTIVATE', 'PROMOTE_ADMIN']) }).parse(body);
        if (dto.action === 'PROMOTE_ADMIN' && user.role !== 'SUPERADMIN')
            throw new common_1.ForbiddenException('Only administrators can promote another administrator.');
        await this.authService.requestAdminActionOtp(user.id, dto.targetId, dto.action);
        return { data: { sent: true }, meta: {} };
    }
    async resendUserActionOtp(body, req) {
        const user = await this.requireUser(req);
        this.requireManagementRole(user.role);
        const dto = zod_1.z.object({ targetId: zod_1.z.string().uuid(), action: zod_1.z.enum(['DEACTIVATE', 'PROMOTE_ADMIN']) }).parse(body);
        if (dto.action === 'PROMOTE_ADMIN' && user.role !== 'SUPERADMIN')
            throw new common_1.ForbiddenException('Only administrators can promote another administrator.');
        return { data: await this.authService.resendAdminActionOtp(user.id, dto.targetId, dto.action), meta: {} };
    }
    async confirmUserAction(body, req) {
        const user = await this.requireUser(req);
        this.requireManagementRole(user.role);
        const dto = zod_1.z.object({ targetId: zod_1.z.string().uuid(), action: zod_1.z.enum(['DEACTIVATE', 'PROMOTE_ADMIN']), code: zod_1.z.string().length(6) }).parse(body);
        if (dto.action === 'PROMOTE_ADMIN' && user.role !== 'SUPERADMIN')
            throw new common_1.ForbiddenException('Only administrators can promote another administrator.');
        const result = await this.authService.confirmAdminActionOtp(user.id, dto.targetId, dto.action, dto.code);
        if (!result.valid) {
            throw new common_1.UnauthorizedException(result.locked ? 'Verification code locked after five failed attempts. Start the action again.' : `Invalid verification code. ${result.attemptsRemaining} attempt(s) remaining.`);
        }
        return { data: { completed: true }, meta: {} };
    }
    async superadminDowngradeApprovals(req) {
        const user = await this.requireUser(req);
        if (user.role !== 'SUPERADMIN')
            throw new common_1.ForbiddenException('Only superadmins can approve a superadmin downgrade.');
        return { data: await this.authService.listPendingSuperadminDowngradeApprovals(user.id), meta: {} };
    }
    async requestSuperadminDowngrade(targetId, body, req) {
        const user = await this.requireUser(req);
        if (user.role !== 'SUPERADMIN')
            throw new common_1.ForbiddenException('Only superadmins can request a superadmin downgrade.');
        const requestedRole = zod_1.z.enum(['OVERSEER', 'VERIFICATOR', 'PIC']).parse(body?.role);
        try {
            return { data: await this.authService.requestSuperadminDowngrade(user.id, targetId, requestedRole), meta: {} };
        }
        catch (error) {
            throw new common_1.BadRequestException(error instanceof Error ? error.message : 'Unable to request superadmin downgrade.');
        }
    }
    async confirmSuperadminDowngrade(requestId, body, req) {
        const user = await this.requireUser(req);
        if (user.role !== 'SUPERADMIN')
            throw new common_1.ForbiddenException('Only superadmins can approve a superadmin downgrade.');
        const code = zod_1.z.object({ code: zod_1.z.string().length(6) }).parse(body).code;
        const result = await this.authService.approveSuperadminDowngrade(user.id, requestId, code);
        if (!result.accepted) {
            throw new common_1.UnauthorizedException('Invalid or expired verification code.');
        }
        return { data: result, meta: {} };
    }
    async resendSuperadminDowngradeOtp(requestId, req) {
        const user = await this.requireUser(req);
        if (user.role !== 'SUPERADMIN')
            throw new common_1.ForbiddenException('Only superadmins can resend this approval code.');
        return { data: await this.authService.resendSuperadminDowngradeOtp(user.id, requestId), meta: {} };
    }
    async changeUserRole(targetId, body, req) {
        const user = await this.requireUser(req);
        this.requireManagementRole(user.role);
        const role = zod_1.z.enum(['SUPERADMIN', 'OVERSEER', 'VERIFICATOR', 'PIC']).parse(body?.role);
        if (role === 'SUPERADMIN')
            throw new common_1.ForbiddenException('Promoting an administrator requires OTP verification.');
        if (role === 'OVERSEER' && user.role !== 'SUPERADMIN')
            throw new common_1.ForbiddenException('Only administrators can assign the overseer role.');
        try {
            await this.authService.changeUserRole(targetId, role);
        }
        catch (error) {
            throw new common_1.ForbiddenException(error instanceof Error ? error.message : 'Unable to update user role.');
        }
        return { data: { updated: true, role }, meta: {} };
    }
    async me(req) {
        const accessToken = (0, request_cookies_2.getRequestAccessToken)(req) ?? (0, request_cookies_1.getRequestCookies)(req)[auth_constants_1.AUTH_COOKIE_NAME];
        if (!accessToken) {
            return { data: null, meta: {} };
        }
        const user = await this.authService.getPersistentUserBySession(accessToken);
        if (!user) {
            return { data: null, meta: {} };
        }
        return {
            data: {
                id: user.id,
                role: user.role,
            },
            meta: {},
        };
    }
    async requireUser(req) {
        const accessToken = (0, request_cookies_2.getRequestAccessToken)(req) ?? (0, request_cookies_1.getRequestCookies)(req)[auth_constants_1.AUTH_COOKIE_NAME];
        const user = accessToken ? await this.authService.getPersistentUserBySession(accessToken) : undefined;
        if (!user)
            throw new common_1.UnauthorizedException('Authentication is required.');
        return user;
    }
    requireManagementRole(role) {
        if (role !== 'SUPERADMIN')
            throw new common_1.ForbiddenException('Only superadmins can access user management.');
    }
};
exports.AuthController = AuthController;
__decorate([
    (0, common_1.Post)('register'),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], AuthController.prototype, "register", null);
__decorate([
    (0, common_1.Post)('approve-registration'),
    __param(0, (0, common_1.Body)()),
    __param(1, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", Promise)
], AuthController.prototype, "approveRegistration", null);
__decorate([
    (0, common_1.Post)('login'),
    (0, common_1.HttpCode)(200),
    __param(0, (0, common_1.Body)()),
    __param(1, (0, common_1.Req)()),
    __param(2, (0, common_1.Res)({ passthrough: true })),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object, Object]),
    __metadata("design:returntype", Promise)
], AuthController.prototype, "login", null);
__decorate([
    (0, common_1.Post)('login/resend-otp'),
    __param(0, (0, common_1.Body)()),
    __param(1, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", Promise)
], AuthController.prototype, "resendLoginOtp", null);
__decorate([
    (0, common_1.Post)('refresh'),
    __param(0, (0, common_1.Body)()),
    __param(1, (0, common_1.Req)()),
    __param(2, (0, common_1.Res)({ passthrough: true })),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object, Object]),
    __metadata("design:returntype", Promise)
], AuthController.prototype, "refresh", null);
__decorate([
    (0, common_1.Post)('forgot-password'),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", void 0)
], AuthController.prototype, "forgotPassword", null);
__decorate([
    (0, common_1.Post)('reset-password'),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", void 0)
], AuthController.prototype, "resetPassword", null);
__decorate([
    (0, common_1.Post)('logout'),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Res)({ passthrough: true })),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", Promise)
], AuthController.prototype, "logout", null);
__decorate([
    (0, common_1.Post)('verify-password'),
    __param(0, (0, common_1.Body)()),
    __param(1, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", Promise)
], AuthController.prototype, "verifyPassword", null);
__decorate([
    (0, common_1.Post)('change-password'),
    __param(0, (0, common_1.Body)()),
    __param(1, (0, common_1.Req)()),
    __param(2, (0, common_1.Res)({ passthrough: true })),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object, Object]),
    __metadata("design:returntype", Promise)
], AuthController.prototype, "changePassword", null);
__decorate([
    (0, common_1.Get)('users'),
    __param(0, (0, common_1.Query)('role')),
    __param(1, (0, common_1.Query)('page')),
    __param(2, (0, common_1.Query)('limit')),
    __param(3, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, String, Object]),
    __metadata("design:returntype", Promise)
], AuthController.prototype, "getUsers", null);
__decorate([
    (0, common_1.Get)('user-management/users'),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Query)('page')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", Promise)
], AuthController.prototype, "manageUsers", null);
__decorate([
    (0, common_1.Get)('user-management/registrations'),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Query)('page')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", Promise)
], AuthController.prototype, "registrationRequests", null);
__decorate([
    (0, common_1.Post)('user-management/registrations/:id/reject'),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", Promise)
], AuthController.prototype, "rejectRegistration", null);
__decorate([
    (0, common_1.Post)('user-management/actions/request-otp'),
    __param(0, (0, common_1.Body)()),
    __param(1, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", Promise)
], AuthController.prototype, "requestUserActionOtp", null);
__decorate([
    (0, common_1.Post)('user-management/actions/resend-otp'),
    __param(0, (0, common_1.Body)()),
    __param(1, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", Promise)
], AuthController.prototype, "resendUserActionOtp", null);
__decorate([
    (0, common_1.Post)('user-management/actions/confirm'),
    __param(0, (0, common_1.Body)()),
    __param(1, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", Promise)
], AuthController.prototype, "confirmUserAction", null);
__decorate([
    (0, common_1.Get)('user-management/superadmin-downgrade-approvals'),
    __param(0, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], AuthController.prototype, "superadminDowngradeApprovals", null);
__decorate([
    (0, common_1.Post)('user-management/users/:id/downgrade'),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, common_1.Body)()),
    __param(2, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object, Object]),
    __metadata("design:returntype", Promise)
], AuthController.prototype, "requestSuperadminDowngrade", null);
__decorate([
    (0, common_1.Post)('user-management/superadmin-downgrade-approvals/:id/confirm'),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, common_1.Body)()),
    __param(2, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object, Object]),
    __metadata("design:returntype", Promise)
], AuthController.prototype, "confirmSuperadminDowngrade", null);
__decorate([
    (0, common_1.Post)('user-management/superadmin-downgrade-approvals/:id/resend-otp'),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", Promise)
], AuthController.prototype, "resendSuperadminDowngradeOtp", null);
__decorate([
    (0, common_2.Patch)('user-management/users/:id/role'),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, common_1.Body)()),
    __param(2, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object, Object]),
    __metadata("design:returntype", Promise)
], AuthController.prototype, "changeUserRole", null);
__decorate([
    (0, common_1.Get)('me'),
    __param(0, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], AuthController.prototype, "me", null);
exports.AuthController = AuthController = __decorate([
    (0, common_1.Controller)('auth'),
    __metadata("design:paramtypes", [auth_service_1.AuthService, bot_protection_service_1.BotProtectionService])
], AuthController);
//# sourceMappingURL=auth.controller.js.map