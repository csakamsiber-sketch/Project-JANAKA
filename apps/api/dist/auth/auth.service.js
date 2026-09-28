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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AuthService = void 0;
const node_crypto_1 = require("node:crypto");
const promises_1 = require("node:dns/promises");
const bcrypt_1 = __importDefault(require("bcrypt"));
const common_1 = require("@nestjs/common");
const jsonwebtoken_1 = require("jsonwebtoken");
const redis_1 = require("redis");
const auth_constants_1 = require("./auth.constants");
const role_permissions_1 = require("./role-permissions");
const prisma_service_1 = require("../prisma.service");
const mail_service_1 = require("./mail.service");
const redis_session_service_1 = require("./redis-session.service");
let AuthService = class AuthService {
    prisma;
    mailService;
    redisSession;
    sessions = new Map();
    users = new Map();
    registrationRequests = new Map();
    resetTokens = new Map();
    blacklistedTokens = new Map();
    redis = process.env.REDIS_URL ? (0, redis_1.createClient)({ url: process.env.REDIS_URL }) : undefined;
    redisConnection;
    emailRegex = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9-]+(?:\.[a-zA-Z0-9-]+)*$/;
    getSeedAdminEmail() {
        return (process.env.ADMIN_EMAIL ?? 'csakamsiber@gmail.com').trim().toLowerCase();
    }
    constructor(prisma, mailService, redisSession) {
        this.prisma = prisma;
        this.mailService = mailService;
        this.redisSession = redisSession;
        this.redis?.on('error', () => undefined);
        this.users.set('admin@janus.local', {
            id: (0, node_crypto_1.randomUUID)(),
            email: 'admin@janus.local',
            passwordHash: '$2b$12$fEbGulOfbQoqvPwAczRzU.JTIrPfuGU3CyhZIBOnTLFYS0rvNUbAa',
            role: 'SUPERADMIN',
            firstName: 'System',
            lastName: 'Administrator',
            isActive: true,
            createdAt: new Date(),
            updatedAt: new Date(),
        });
    }
    validateEmail(email) {
        if (!email || !this.emailRegex.test(email.trim()) || email.trim().length > 254) {
            throw new Error('A valid email address is required before creating a registration request.');
        }
    }
    validatePassword(password) {
        if (password.length < 12 || password.length > 128) {
            throw new Error('Password must be between 12 and 128 characters.');
        }
        if (!/[A-Z]/.test(password) || !/[a-z]/.test(password) || !/[0-9]/.test(password) || !/[^A-Za-z0-9]/.test(password)) {
            throw new Error('Password must include uppercase, lowercase, number, and symbol.');
        }
    }
    hashPassword(password) {
        return bcrypt_1.default.hashSync(password, 12);
    }
    matchesPassword(storedHash, password) {
        return Boolean(storedHash && bcrypt_1.default.compareSync(password, storedHash));
    }
    async hashPasswordAsync(password) {
        return bcrypt_1.default.hash(password, 12);
    }
    async matchesPasswordAsync(storedHash, password) {
        return Boolean(storedHash && await bcrypt_1.default.compare(password, storedHash));
    }
    createUser(input) {
        this.validateEmail(input.email);
        this.validatePassword(input.password);
        const email = input.email.trim().toLowerCase();
        const user = {
            id: input.id,
            email,
            passwordHash: this.hashPassword(input.password),
            role: input.role,
            firstName: input.firstName.trim(),
            lastName: input.lastName.trim(),
            isActive: true,
            createdAt: new Date(),
            updatedAt: new Date(),
        };
        this.users.set(email, user);
        return user;
    }
    async createRegistrationRequest(input) {
        this.validateEmail(input.email);
        const request = {
            id: (0, node_crypto_1.randomUUID)(),
            email: input.email.trim().toLowerCase(),
            firstName: input.firstName.trim(),
            lastName: input.lastName.trim(),
            role: input.role,
            status: 'PENDING',
            createdAt: new Date().toISOString(),
        };
        if (this.prisma && await this.prisma.user.findUnique({ where: { email: request.email }, select: { id: true } })) {
            throw new Error('Email ini sudah memiliki akun.');
        }
        const pendingRequest = Array.from(this.registrationRequests.values()).find((item) => item.email === request.email && item.status === 'PENDING');
        if (pendingRequest)
            throw new Error('Email ini sudah mengajukan permintaan akun sebelumnya. Silahkan tunggu 1x24 jam setelah pendaftaran.');
        await this.validateEmailDomain(request.email);
        const stored = await this.storeRegistrationRequest(request);
        if (!stored)
            this.registrationRequests.set(request.id, request);
        return request;
    }
    async approveRegistrationRequest(requestId) {
        const request = await this.getRegistrationRequest(requestId);
        if (!request) {
            return undefined;
        }
        request.status = 'APPROVED';
        const temporaryPassword = this.generateTemporaryPassword();
        if (this.prisma) {
            const existing = await this.prisma.user.findUnique({ where: { email: request.email } });
            if (existing)
                throw new Error('A user with this email already exists.');
            await this.prisma.user.create({
                data: {
                    id: (0, node_crypto_1.randomUUID)(),
                    email: request.email,
                    passwordHash: await this.hashPasswordAsync(temporaryPassword),
                    mustChangePassword: true,
                    firstName: request.firstName,
                    lastName: request.lastName,
                    role: request.role,
                    isActive: true,
                },
            });
            await this.mailService?.sendRegistrationApproval(request.email, temporaryPassword);
            await this.deleteRegistrationRequest(requestId);
            return request;
        }
        const user = this.createUser({
            id: (0, node_crypto_1.randomUUID)(),
            email: request.email,
            password: temporaryPassword,
            firstName: request.firstName,
            lastName: request.lastName,
            role: request.role,
        });
        await this.mailService?.sendRegistrationApproval(request.email, temporaryPassword);
        await this.deleteRegistrationRequest(requestId);
        return request;
    }
    generateTemporaryPassword() {
        const required = ['A', 'a', '2', '!'];
        const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%';
        const randomCharacters = Array.from((0, node_crypto_1.randomBytes)(8), (byte) => alphabet[byte % alphabet.length]);
        return [...required, ...randomCharacters].sort(() => ((0, node_crypto_1.randomBytes)(1)[0] ?? 0) - 128).join('');
    }
    async changePassword(accessToken, currentPassword, newPassword) {
        const user = await this.getPersistentUserBySession(accessToken);
        if (!user)
            return false;
        this.validatePassword(newPassword);
        if (this.prisma) {
            const record = await this.prisma.user.findUnique({ where: { id: user.id } });
            if (!record || !await this.matchesPasswordAsync(record.passwordHash, currentPassword))
                return false;
            await this.prisma.$transaction(async (transaction) => {
                await transaction.user.update({ where: { id: user.id }, data: { passwordHash: await this.hashPasswordAsync(newPassword), mustChangePassword: false } });
                await transaction.session.updateMany({ where: { userId: user.id, revoked: false }, data: { revoked: true } });
            });
            await this.mailService?.sendPasswordChangedNotification(record.email);
            return true;
        }
        const record = this.getUserById(user.id);
        if (!record || !this.matchesPassword(record.passwordHash, currentPassword))
            return false;
        record.passwordHash = this.hashPassword(newPassword);
        record.mustChangePassword = false;
        for (const [sessionId, session] of this.sessions) {
            if (session.userId !== user.id)
                continue;
            this.blacklistToken(session.accessToken, Math.max(session.expiresAt - Date.now(), 0));
            this.blacklistToken(session.refreshToken, Math.max(session.refreshExpiresAt - Date.now(), 0));
            this.sessions.delete(sessionId);
        }
        await this.mailService?.sendPasswordChangedNotification(user.email);
        return true;
    }
    async validateEmailDomain(email) {
        const domain = email.split('@')[1];
        if (!domain)
            throw new Error('A valid email address is required before creating a registration request.');
        try {
            const records = await (0, promises_1.resolveMx)(domain);
            if (!records.length)
                throw new Error('The email domain does not accept email.');
        }
        catch {
            throw new Error('The email address domain could not be verified.');
        }
    }
    async ensureRedis() {
        if (!this.redis) {
            if (process.env.NODE_ENV === 'production')
                throw new Error('Redis is not configured. Set REDIS_URL before accepting registrations.');
            return undefined;
        }
        if (!this.redis.isOpen) {
            this.redisConnection ??= this.redis.connect().then(() => undefined);
            await this.redisConnection;
        }
        return this.redis;
    }
    registrationKey(id) { return `janus:registration:${id}`; }
    registrationEmailKey(email) { return `janus:registration-email:${email}`; }
    async storeRegistrationRequest(request) {
        const redis = await this.ensureRedis();
        if (!redis)
            return false;
        const accepted = await redis.set(this.registrationEmailKey(request.email), request.id, { EX: 60 * 60 * 24, NX: true });
        if (accepted !== 'OK')
            throw new Error('Email ini sudah mengajukan permintaan akun sebelumnya. Silahkan tunggu 1x24 jam setelah pendaftaran.');
        await redis.set(this.registrationKey(request.id), JSON.stringify(request), { EX: 60 * 60 * 24 });
        return true;
    }
    async getRegistrationRequest(id) {
        const redis = await this.ensureRedis();
        const value = redis ? await redis.get(this.registrationKey(id)) : undefined;
        if (value)
            return JSON.parse(value);
        return this.registrationRequests.get(id);
    }
    async deleteRegistrationRequest(id) {
        const redis = await this.ensureRedis();
        if (redis) {
            const value = await redis.get(this.registrationKey(id));
            await redis.del(this.registrationKey(id));
            if (value)
                await redis.del(this.registrationEmailKey(JSON.parse(value).email));
        }
        this.registrationRequests.delete(id);
    }
    async listPersistentUsers(page = 1) {
        const pageSize = 20;
        if (!this.prisma)
            return this.listUsers(page, pageSize);
        const safePage = Math.max(1, Number(page) || 1);
        const [total, users] = await Promise.all([
            this.prisma.user.count(),
            this.prisma.user.findMany({ skip: (safePage - 1) * pageSize, take: pageSize, orderBy: { email: 'asc' } }),
        ]);
        return { items: users.map((user) => ({ id: user.id, email: user.email, firstName: user.firstName, lastName: user.lastName, role: user.role, isActive: user.isActive, createdAt: user.createdAt })), page: safePage, limit: pageSize, total, totalPages: Math.max(1, Math.ceil(total / pageSize)) };
    }
    async listRegistrationRequests(page = 1) {
        const pageSize = 20;
        const redis = await this.ensureRedis();
        if (!redis) {
            const requests = Array.from(this.registrationRequests.values()).sort((left, right) => right.createdAt.localeCompare(left.createdAt));
            return { items: requests.slice((page - 1) * pageSize, page * pageSize), page, limit: pageSize, total: requests.length, totalPages: Math.max(1, Math.ceil(requests.length / pageSize)) };
        }
        const keys = await redis.keys('janus:registration:*');
        const values = await Promise.all(keys.filter((key) => !key.startsWith('janus:registration-email:')).map((key) => redis.get(key)));
        const requests = values.filter(Boolean).map((value) => JSON.parse(value)).sort((left, right) => right.createdAt.localeCompare(left.createdAt));
        return { items: requests.slice((page - 1) * pageSize, page * pageSize), page, limit: pageSize, total: requests.length, totalPages: Math.max(1, Math.ceil(requests.length / pageSize)) };
    }
    async rejectRegistrationRequest(requestId) {
        const request = await this.getRegistrationRequest(requestId);
        if (!request)
            return false;
        request.status = 'REJECTED';
        await this.deleteRegistrationRequest(requestId);
        return true;
    }
    async requestAdminActionOtp(actorId, targetId, action) {
        if (!this.prisma || !this.mailService)
            throw new Error('User action OTP is not configured.');
        const target = await this.prisma.user.findUnique({ where: { id: targetId } });
        if (!target)
            throw new Error('User not found.');
        const code = String((0, node_crypto_1.randomInt)(100000, 1000000));
        await this.prisma.adminActionChallenge.updateMany({ where: { actorId, targetId, action, consumed: false }, data: { consumed: true } });
        await this.prisma.adminActionChallenge.create({ data: { actorId, targetId, action, codeHash: this.hashSecret(code), expiresAt: new Date(Date.now() + 10 * 60 * 1000), resendAvailableAt: new Date(Date.now() + 2 * 60 * 1000) } });
        const actor = await this.prisma.user.findUniqueOrThrow({ where: { id: actorId } });
        await this.mailService.sendAdminActionOtp(actor.email, code, action);
    }
    async resendAdminActionOtp(actorId, targetId, action) {
        if (!this.prisma || !this.mailService)
            throw new Error('User action OTP is not configured.');
        const now = new Date();
        const waitMinutes = [2, 5, 10, 30, 60];
        const code = String((0, node_crypto_1.randomInt)(100000, 1000000));
        const challenge = await this.prisma.$transaction(async (transaction) => {
            await transaction.$executeRawUnsafe('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', `${actorId}:${targetId}:${action}`);
            const current = await transaction.adminActionChallenge.findFirst({ where: { actorId, targetId, action, consumed: false }, orderBy: { createdAt: 'desc' } });
            if (!current || current.expiresAt <= now)
                throw new common_1.UnauthorizedException('The verification code has expired. Request a new action.');
            if (current.attempts >= 5)
                throw new common_1.UnauthorizedException('This verification code is locked after five failed attempts. Start the action again.');
            if (current.resendAvailableAt && current.resendAvailableAt > now) {
                const retryAfterSeconds = Math.ceil((current.resendAvailableAt.getTime() - now.getTime()) / 1000);
                throw new common_1.UnauthorizedException(`Please wait ${Math.ceil(retryAfterSeconds / 60)} minute(s) before requesting another code.`);
            }
            const nextCount = current.resendCount + 1;
            const resendDelayMinutes = waitMinutes[Math.min(nextCount, waitMinutes.length - 1)] ?? 60;
            const resendAvailableAt = new Date(now.getTime() + resendDelayMinutes * 60 * 1000);
            return transaction.adminActionChallenge.update({ where: { id: current.id }, data: { codeHash: this.hashSecret(code), expiresAt: new Date(now.getTime() + 10 * 60 * 1000), resendCount: nextCount, resendAvailableAt, attempts: 0 } });
        });
        const actor = await this.prisma.user.findUniqueOrThrow({ where: { id: actorId } });
        await this.mailService.sendAdminActionOtp(actor.email, code, action);
        return { sent: true, retryAfterSeconds: Math.ceil(((challenge.resendAvailableAt?.getTime() ?? now.getTime()) - now.getTime()) / 1000) };
    }
    async confirmAdminActionOtp(actorId, targetId, action, code) {
        if (!this.prisma)
            return { valid: false, locked: false, attemptsRemaining: 0 };
        const challenge = await this.prisma.adminActionChallenge.findFirst({ where: { actorId, targetId, action, consumed: false }, orderBy: { createdAt: 'desc' } });
        const attempts = challenge?.attempts ?? 0;
        if (!challenge || challenge.expiresAt <= new Date() || attempts >= 5)
            return { valid: false, locked: attempts >= 5, attemptsRemaining: 0 };
        const matches = this.constantTimeHashMatch(challenge.codeHash, code);
        const nextAttempts = attempts + 1;
        await this.prisma.adminActionChallenge.update({ where: { id: challenge.id }, data: { attempts: { increment: 1 }, ...(matches ? { consumed: true } : {}), ...(!matches && nextAttempts >= 5 ? { consumed: true } : {}) } });
        if (!matches)
            return { valid: false, locked: nextAttempts >= 5, attemptsRemaining: Math.max(0, 5 - nextAttempts) };
        await this.prisma.user.update({ where: { id: targetId }, data: action === 'DEACTIVATE' ? { isActive: false } : { role: 'SUPERADMIN' } });
        if (action === 'DEACTIVATE')
            await this.prisma.session.updateMany({ where: { userId: targetId, revoked: false }, data: { revoked: true } });
        return { valid: true, locked: false, attemptsRemaining: 5 };
    }
    async requestSuperadminDowngrade(requestedById, targetId, requestedRole) {
        if (!this.prisma || !this.mailService)
            throw new Error('Superadmin downgrade approval is not configured.');
        const target = await this.prisma.user.findUnique({ where: { id: targetId } });
        if (!target || !target.isActive || target.role !== 'SUPERADMIN')
            throw new Error('The target must be an active superadmin.');
        const approvers = await this.prisma.user.findMany({ where: { role: 'SUPERADMIN', isActive: true, id: { not: targetId } }, select: { id: true, email: true } });
        if (!approvers.length)
            throw new Error('At least one other active superadmin must approve this change.');
        const expiresAt = new Date(Date.now() + 10 * 60 * 1000);
        const codes = approvers.map((approver) => ({ approver, code: String((0, node_crypto_1.randomInt)(100000, 1000000)) }));
        const request = await this.prisma.$transaction(async (transaction) => {
            await transaction.superadminDowngradeRequest.updateMany({ where: { targetId, status: 'PENDING' }, data: { status: 'EXPIRED' } });
            const created = await transaction.superadminDowngradeRequest.create({ data: { targetId, requestedById, requestedRole, expiresAt } });
            await transaction.superadminDowngradeApproval.createMany({ data: codes.map(({ approver, code }) => ({ requestId: created.id, approverId: approver.id, codeHash: this.hashSecret(code), expiresAt, resendAvailableAt: new Date(Date.now() + 2 * 60 * 1000) })) });
            return created;
        });
        await Promise.all(codes.map(({ approver, code }) => this.mailService.sendAdminActionOtp(approver.email, code, 'SUPERADMIN DOWNGRADE APPROVAL')));
        return { id: request.id, targetId, requestedRole, requiredApprovals: approvers.length, expiresAt: request.expiresAt };
    }
    async listPendingSuperadminDowngradeApprovals(approverId) {
        if (!this.prisma)
            return [];
        const approvals = await this.prisma.superadminDowngradeApproval.findMany({
            where: { approverId, consumed: false, expiresAt: { gt: new Date() }, request: { status: 'PENDING' } },
            include: { request: { include: { target: { select: { id: true, email: true, firstName: true, lastName: true } }, requestedBy: { select: { email: true } } } } },
            orderBy: { createdAt: 'desc' },
        });
        return approvals.map((approval) => ({ id: approval.id, requestId: approval.requestId, target: approval.request.target, requestedBy: approval.request.requestedBy.email, requestedRole: approval.request.requestedRole, expiresAt: approval.expiresAt }));
    }
    async approveSuperadminDowngrade(approverId, requestId, code) {
        if (!this.prisma)
            return { accepted: false, completed: false };
        const now = new Date();
        return this.prisma.$transaction(async (transaction) => {
            await transaction.$queryRaw `SELECT "id" FROM "SuperadminDowngradeRequest" WHERE "id" = ${requestId} FOR UPDATE`;
            const approval = await transaction.superadminDowngradeApproval.findUnique({ where: { requestId_approverId: { requestId, approverId } }, include: { request: true } });
            if (!approval || approval.consumed || approval.expiresAt <= now || approval.request.status !== 'PENDING' || approval.attempts >= 5)
                return { accepted: false, completed: false };
            const matches = this.constantTimeHashMatch(approval.codeHash, code);
            await transaction.superadminDowngradeApproval.update({ where: { id: approval.id }, data: { attempts: { increment: 1 }, ...(matches ? { consumed: true, approvedAt: now } : {}), ...(!matches && approval.attempts + 1 >= 5 ? { consumed: true } : {}) } });
            if (!matches)
                return { accepted: false, completed: false };
            const remaining = await transaction.superadminDowngradeApproval.count({ where: { requestId, consumed: false, expiresAt: { gt: now } } });
            if (remaining > 0)
                return { accepted: true, completed: false };
            const completed = await transaction.superadminDowngradeRequest.updateMany({ where: { id: requestId, status: 'PENDING' }, data: { status: 'COMPLETED', completedAt: now } });
            if (!completed.count)
                return { accepted: false, completed: false };
            const request = await transaction.superadminDowngradeRequest.findUniqueOrThrow({ where: { id: requestId } });
            await transaction.user.update({ where: { id: request.targetId, role: 'SUPERADMIN' }, data: { role: request.requestedRole } });
            return { accepted: true, completed: true };
        });
    }
    async resendSuperadminDowngradeOtp(approverId, requestId) {
        if (!this.prisma || !this.mailService)
            throw new Error('Superadmin downgrade approval is not configured.');
        const now = new Date();
        const code = String((0, node_crypto_1.randomInt)(100000, 1000000));
        const waitMinutes = [2, 5, 10, 30, 60];
        const approval = await this.prisma.$transaction(async (transaction) => {
            await transaction.$executeRawUnsafe('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', `${requestId}:${approverId}`);
            const current = await transaction.superadminDowngradeApproval.findUnique({ where: { requestId_approverId: { requestId, approverId } }, include: { request: true } });
            if (!current || current.consumed || current.expiresAt <= now || current.request.status !== 'PENDING')
                throw new common_1.UnauthorizedException('The approval challenge is invalid or expired.');
            if (current.attempts >= 5)
                throw new common_1.UnauthorizedException('This verification code is locked after five failed attempts.');
            if (current.resendAvailableAt && current.resendAvailableAt > now)
                throw new common_1.UnauthorizedException(`Please wait ${Math.ceil((current.resendAvailableAt.getTime() - now.getTime()) / 60000)} minute(s) before requesting another code.`);
            const nextCount = (current.resendCount ?? 0) + 1;
            const delay = waitMinutes[Math.min(nextCount, waitMinutes.length - 1)] ?? 60;
            return transaction.superadminDowngradeApproval.update({ where: { id: current.id }, data: { codeHash: this.hashSecret(code), expiresAt: new Date(now.getTime() + 10 * 60 * 1000), resendCount: nextCount, resendAvailableAt: new Date(now.getTime() + delay * 60 * 1000), attempts: 0 }, include: { approver: true } });
        });
        await this.mailService.sendAdminActionOtp(approval.approver.email, code, 'SUPERADMIN DOWNGRADE APPROVAL');
        return { sent: true, retryAfterSeconds: Math.ceil(((approval.resendAvailableAt?.getTime() ?? now.getTime()) - now.getTime()) / 1000) };
    }
    async changeUserRole(targetId, role) {
        if (!this.prisma)
            return false;
        const target = await this.prisma.user.findUnique({ where: { id: targetId }, select: { role: true } });
        if (!target)
            return false;
        if (target.role === 'SUPERADMIN' && role !== 'SUPERADMIN')
            throw new Error('Downgrading a superadmin requires approval from every other active superadmin.');
        await this.prisma.user.update({ where: { id: targetId }, data: { role } });
        return true;
    }
    listUsers(page = 1, limit = 20) {
        const users = Array.from(this.users.values());
        const safePage = Math.max(1, Number(page) || 1);
        const safeLimit = Math.max(1, Number(limit) || 20);
        return { items: users.slice((safePage - 1) * safeLimit, safePage * safeLimit), page: safePage, limit: safeLimit, total: users.length, totalPages: Math.max(1, Math.ceil(users.length / safeLimit)) };
    }
    requestPasswordReset(email) {
        this.validateEmail(email);
        const token = (0, node_crypto_1.randomBytes)(32).toString('hex');
        this.resetTokens.set(token, {
            email: email.trim().toLowerCase(),
            expiresAt: Date.now() + 15 * 60 * 1000,
        });
        return { token, expiresAt: Date.now() + 15 * 60 * 1000 };
    }
    resetPassword(token, newPassword) {
        this.validatePassword(newPassword);
        const record = this.resetTokens.get(token);
        if (!record || record.expiresAt < Date.now()) {
            return false;
        }
        const user = this.users.get(record.email);
        if (!user) {
            return false;
        }
        user.passwordHash = this.hashPassword(newPassword);
        user.updatedAt = new Date();
        this.resetTokens.delete(token);
        return true;
    }
    blacklistToken(token, expiresInMs) {
        this.blacklistedTokens.set(token, Date.now() + expiresInMs);
    }
    isTokenBlacklisted(token) {
        const expiresAt = this.blacklistedTokens.get(token);
        if (!expiresAt) {
            return false;
        }
        if (expiresAt <= Date.now()) {
            this.blacklistedTokens.delete(token);
            return false;
        }
        return true;
    }
    buildAccessToken(user, sessionId) {
        return (0, jsonwebtoken_1.sign)({ sub: user.id, email: user.email, role: user.role, ...(sessionId ? { jti: sessionId } : {}) }, auth_constants_1.JWT_SECRET, {
            expiresIn: '15m',
            issuer: 'jamus-kalimasada',
            audience: 'janus-web',
        });
    }
    buildRefreshToken(user, sessionId) {
        return `${sessionId ?? (0, node_crypto_1.randomUUID)()}.${(0, node_crypto_1.randomBytes)(32).toString('hex')}`;
    }
    createSession(user, fingerprintHash) {
        for (const session of this.sessions.values()) {
            if (session.userId === user.id) {
                this.revokeSession(session.sessionId);
            }
        }
        const sessionId = (0, node_crypto_1.randomUUID)();
        const accessToken = this.buildAccessToken(user, sessionId);
        const refreshToken = this.buildRefreshToken(user, sessionId);
        const session = {
            sessionId,
            userId: user.id,
            role: user.role,
            expiresAt: Date.now() + 15 * 60 * 1000,
            refreshExpiresAt: Date.now() + 8 * 60 * 60 * 1000,
            accessToken,
            refreshToken,
            ...(fingerprintHash ? { fingerprintHash: this.hashFingerprint(fingerprintHash) } : {}),
        };
        this.sessions.set(sessionId, session);
        return session;
    }
    async authenticateUserPersistent(email, password, otp) {
        if (!this.prisma)
            return this.authenticateUser(email, password, otp);
        await this.ensureSeedAdmin();
        const user = await this.prisma.user.findUnique({ where: { email: email.trim().toLowerCase() } });
        if (!user || !user.isActive || !await this.matchesPasswordAsync(user.passwordHash, password))
            return undefined;
        return this.toAuthenticatedUser(user);
    }
    async verifyPasswordForSession(accessToken, password) {
        const user = await this.getPersistentUserBySession(accessToken);
        return user ? this.authenticateUserPersistent(user.email, password) : undefined;
    }
    async createSessionPersistent(user, fingerprintHash, csrfToken) {
        if (this.redisSession?.enabled) {
            if (!fingerprintHash)
                throw new common_1.UnauthorizedException('A device fingerprint is required.');
            const sessionId = (0, node_crypto_1.randomUUID)();
            const accessToken = this.buildAccessToken(user, sessionId);
            const refreshToken = this.buildRefreshToken(user, sessionId);
            await this.redisSession.createSession({ sessionId, user, refreshToken, csrfToken, fingerprint: fingerprintHash }, 7 * 24 * 60 * 60);
            const now = Date.now();
            return { sessionId, userId: user.id, role: user.role, expiresAt: now + 15 * 60 * 1000, refreshExpiresAt: now + 7 * 24 * 60 * 60 * 1000, accessToken, refreshToken, csrfToken, fingerprintHash };
        }
        if (!this.prisma)
            return this.createSession(user, fingerprintHash);
        const sessionId = (0, node_crypto_1.randomUUID)();
        const accessToken = this.buildAccessToken(user, sessionId);
        const refreshToken = this.buildRefreshToken(user, sessionId);
        const now = Date.now();
        await this.prisma.$transaction(async (transaction) => {
            await transaction.$executeRawUnsafe('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', user.id);
            await transaction.session.updateMany({ where: { userId: user.id, revoked: false }, data: { revoked: true } });
            await transaction.session.create({
                data: {
                    id: sessionId,
                    userId: user.id,
                    tokenHash: this.hashSecret(accessToken),
                    refreshTokenHash: this.hashSecret(refreshToken),
                    csrfTokenHash: this.hashSecret(csrfToken),
                    expiresAt: new Date(now + 15 * 60 * 1000),
                    refreshExpiresAt: new Date(now + 8 * 60 * 60 * 1000),
                    fingerprintHash: fingerprintHash ? this.hashFingerprint(fingerprintHash) : null,
                },
            });
        });
        return { sessionId, userId: user.id, role: user.role, expiresAt: now + 15 * 60 * 1000, refreshExpiresAt: now + 8 * 60 * 60 * 1000, accessToken, refreshToken, ...(fingerprintHash ? { fingerprintHash } : {}) };
    }
    async requiresLoginOtp(userId, fingerprint) {
        if (!this.prisma || !fingerprint)
            return false;
        const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { deviceFingerprintHash: true } });
        return Boolean(user?.deviceFingerprintHash && !this.matchesFingerprint(user.deviceFingerprintHash, fingerprint));
    }
    async hasRegisteredDevice(userId) {
        if (!this.prisma)
            return false;
        const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { deviceFingerprintHash: true } });
        return Boolean(user?.deviceFingerprintHash);
    }
    async rememberDevice(userId, fingerprint) {
        if (this.prisma)
            await this.prisma.user.update({ where: { id: userId }, data: { deviceFingerprintHash: this.hashFingerprint(fingerprint) } });
    }
    async issueLoginOtp(user, fingerprint) {
        if (!this.prisma || !this.mailService)
            throw new Error('OTP login is not configured.');
        const now = new Date();
        const current = await this.prisma.loginChallenge.findFirst({ where: { userId: user.id, status: { in: ['ACTIVE', 'LOCKED'] } }, orderBy: { createdAt: 'desc' } });
        if (current?.status === 'LOCKED' && current.cooldownUntil && current.cooldownUntil > now) {
            throw new common_1.UnauthorizedException('Too many OTP attempts. Try again in five minutes.');
        }
        if (current?.status === 'ACTIVE' && current.expiresAt > now && current.temporaryExpiresAt && current.temporaryExpiresAt > now) {
            throw new common_1.UnauthorizedException('A verification code is already active. Use the code already sent or wait for it to expire.');
        }
        if (current)
            await this.prisma.loginChallenge.update({ where: { id: current.id }, data: { status: 'SUPERSEDED', consumed: true, invalidatedAt: now } });
        const code = String((0, node_crypto_1.randomInt)(100000, 1000000));
        const temporaryAccessToken = (0, node_crypto_1.randomBytes)(32).toString('hex');
        const challenge = await this.prisma.loginChallenge.create({
            data: {
                userId: user.id,
                codeHash: this.hashSecret(code),
                fingerprintHash: this.hashFingerprint(fingerprint),
                expiresAt: new Date(Date.now() + 10 * 60 * 1000),
                resendAvailableAt: new Date(Date.now() + 2 * 60 * 1000),
                temporaryTokenHash: this.hashSecret(temporaryAccessToken),
                temporaryExpiresAt: new Date(Date.now() + 15 * 60 * 1000),
            },
        });
        try {
            await this.mailService.sendLoginOtp(user.email, code);
        }
        catch (error) {
            await this.prisma.loginChallenge.update({ where: { id: challenge.id }, data: { status: 'MAIL_FAILED', consumed: true, invalidatedAt: new Date() } });
            throw error;
        }
        return { challengeId: challenge.id, temporaryAccessToken };
    }
    async verifyLoginOtp(userId, challengeId, temporaryAccessToken, code, fingerprint) {
        if (!this.prisma)
            return false;
        const challenge = await this.prisma.loginChallenge.findFirst({ where: { id: challengeId, userId, consumed: false, status: 'ACTIVE' } });
        if (!challenge || challenge.expiresAt <= new Date() || !challenge.temporaryExpiresAt || challenge.temporaryExpiresAt <= new Date() || !challenge.temporaryTokenHash || !this.constantTimeHashMatch(challenge.temporaryTokenHash, temporaryAccessToken))
            return false;
        if (challenge.attempts >= 5) {
            await this.prisma.loginChallenge.update({ where: { id: challenge.id }, data: { status: 'LOCKED', consumed: true, cooldownUntil: new Date(Date.now() + 5 * 60 * 1000), invalidatedAt: new Date() } });
            return false;
        }
        await this.prisma.loginChallenge.update({ where: { id: challenge.id }, data: { attempts: { increment: 1 }, lastAttemptAt: new Date() } });
        const codeMatches = this.constantTimeHashMatch(challenge.codeHash, code);
        const fingerprintMatches = this.matchesFingerprint(challenge.fingerprintHash, fingerprint);
        if (!codeMatches || !fingerprintMatches) {
            if (challenge.attempts + 1 >= 5)
                await this.prisma.loginChallenge.update({ where: { id: challenge.id }, data: { status: 'LOCKED', consumed: true, cooldownUntil: new Date(Date.now() + 5 * 60 * 1000), invalidatedAt: new Date() } });
            return false;
        }
        await this.prisma.$transaction([
            this.prisma.loginChallenge.update({ where: { id: challenge.id }, data: { status: 'USED', consumed: true, consumedAt: new Date(), temporaryTokenHash: null } }),
            this.prisma.user.update({ where: { id: userId }, data: { deviceFingerprintHash: challenge.fingerprintHash } }),
        ]);
        return true;
    }
    async resendLoginOtp(user, challengeId, temporaryAccessToken, fingerprint) {
        if (!this.prisma || !this.mailService)
            throw new Error('OTP login is not configured.');
        const now = new Date();
        const waitMinutes = [2, 5, 10, 30, 60];
        const code = String((0, node_crypto_1.randomInt)(100000, 1000000));
        const challenge = await this.prisma.$transaction(async (transaction) => {
            await transaction.$executeRawUnsafe('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', user.id);
            const current = await transaction.loginChallenge.findFirst({ where: { id: challengeId, userId: user.id, consumed: false, status: 'ACTIVE' } });
            if (!current || current.expiresAt <= now || !current.temporaryExpiresAt || current.temporaryExpiresAt <= now || !current.temporaryTokenHash || !this.constantTimeHashMatch(current.temporaryTokenHash, temporaryAccessToken) || !this.matchesFingerprint(current.fingerprintHash, fingerprint))
                throw new common_1.UnauthorizedException('The verification challenge is invalid or expired. Sign in again.');
            const attempts = current.attempts ?? 0;
            if (attempts >= 5)
                throw new common_1.UnauthorizedException('This verification code is locked after five failed attempts. Sign in again.');
            if (current.resendAvailableAt && current.resendAvailableAt > now)
                throw new common_1.UnauthorizedException(`Please wait ${Math.ceil((current.resendAvailableAt.getTime() - now.getTime()) / 60000)} minute(s) before requesting another code.`);
            const nextCount = (current.resendCount ?? 0) + 1;
            const resendDelayMinutes = waitMinutes[Math.min(nextCount, waitMinutes.length - 1)] ?? 60;
            return transaction.loginChallenge.update({ where: { id: current.id }, data: { codeHash: this.hashSecret(code), expiresAt: new Date(now.getTime() + 10 * 60 * 1000), resendCount: nextCount, resendAvailableAt: new Date(now.getTime() + resendDelayMinutes * 60 * 1000), attempts: 0 } });
        });
        await this.mailService.sendLoginOtp(user.email, code);
        return { sent: true, retryAfterSeconds: Math.ceil(((challenge.resendAvailableAt?.getTime() ?? now.getTime()) - now.getTime()) / 1000) };
    }
    async refreshPersistent(refreshToken, csrfToken, fingerprint) {
        if (this.redisSession?.enabled) {
            if (!fingerprint)
                return undefined;
            const sessionId = this.findSessionIdFromRefreshToken(refreshToken);
            if (!sessionId)
                return undefined;
            const record = await this.redisSession.getBySessionId(sessionId);
            if (!record)
                return undefined;
            if (await this.redisSession.getActiveSessionId(record.userId) !== sessionId)
                return undefined;
            const user = await this.getPersistentUserById(record.userId);
            if (!user)
                return undefined;
            const nextRefreshToken = this.buildRefreshToken(user, sessionId);
            if (!await this.redisSession.rotateSession({ sessionId, refreshToken, nextRefreshToken, nextCsrfToken: csrfToken, fingerprint }, 7 * 24 * 60 * 60))
                return undefined;
            const now = Date.now();
            return { sessionId, userId: user.id, role: user.role, expiresAt: now + 15 * 60 * 1000, refreshExpiresAt: now + 7 * 24 * 60 * 60 * 1000, accessToken: this.buildAccessToken(user, sessionId), refreshToken: nextRefreshToken, csrfToken };
        }
        if (!this.prisma) {
            const session = this.getSessionByRefreshToken(refreshToken);
            if (!session || session.refreshExpiresAt <= Date.now())
                return undefined;
            if (!this.matchesFingerprint(session.fingerprintHash, fingerprint))
                return undefined;
            return this.refreshSession(session.sessionId);
        }
        const existing = await this.prisma.session.findUnique({ where: { refreshTokenHash: this.hashSecret(refreshToken) }, include: { user: true } });
        if (!existing || existing.revoked || existing.refreshExpiresAt <= new Date() || !existing.user.isActive || !this.matchesFingerprint(existing.fingerprintHash, fingerprint))
            return undefined;
        const user = this.toAuthenticatedUser(existing.user);
        const accessToken = this.buildAccessToken(user);
        const rotatedRefreshToken = this.buildRefreshToken(user);
        const now = Date.now();
        const consumed = await this.prisma.session.updateMany({
            where: {
                id: existing.id,
                refreshTokenHash: this.hashSecret(refreshToken),
                revoked: false,
                refreshExpiresAt: { gt: new Date() },
            },
            data: {
                tokenHash: this.hashSecret(accessToken),
                refreshTokenHash: this.hashSecret(rotatedRefreshToken),
                csrfTokenHash: this.hashSecret(csrfToken),
                expiresAt: new Date(now + 15 * 60 * 1000),
            },
        });
        if (consumed.count !== 1)
            return undefined;
        return { sessionId: existing.id, userId: user.id, role: user.role, expiresAt: now + 15 * 60 * 1000, refreshExpiresAt: existing.refreshExpiresAt.getTime(), accessToken, refreshToken: rotatedRefreshToken, csrfToken };
    }
    async getRefreshUser(refreshToken) {
        if (this.redisSession?.enabled) {
            const sessionId = this.findSessionIdFromRefreshToken(refreshToken);
            if (!sessionId)
                return undefined;
            const record = await this.redisSession.getBySessionId(sessionId);
            const activeSessionId = record ? await this.redisSession.getActiveSessionId(record.userId) : undefined;
            const user = record && activeSessionId === sessionId ? await this.getPersistentUserById(record.userId) : undefined;
            if (!record || !user)
                return undefined;
            return { user, fingerprintHash: record.fingerprint };
        }
        if (!this.prisma)
            return undefined;
        const session = await this.prisma.session.findUnique({ where: { refreshTokenHash: this.hashSecret(refreshToken) }, include: { user: true } });
        if (!session || session.revoked || session.refreshExpiresAt <= new Date() || !session.user.isActive)
            return undefined;
        return { user: this.toAuthenticatedUser(session.user), fingerprintHash: session.fingerprintHash };
    }
    fingerprintMatches(storedHash, fingerprint) {
        return this.matchesFingerprint(storedHash, fingerprint);
    }
    async consumeCsrfToken(accessToken, cookieToken, headerToken, replacementToken) {
        if (!cookieToken || !headerToken || cookieToken !== headerToken)
            return false;
        if (this.redisSession?.enabled) {
            try {
                const payload = (0, jsonwebtoken_1.verify)(accessToken, auth_constants_1.JWT_SECRET, { issuer: 'jamus-kalimasada', audience: 'janus-web' });
                const sessionId = redis_session_service_1.RedisSessionService.sessionIdFromAccessToken(payload);
                return Boolean(sessionId && await this.redisSession.consumeCsrf(sessionId, cookieToken, headerToken, replacementToken));
            }
            catch {
                return false;
            }
        }
        if (!this.prisma)
            return true;
        const session = this.isValidAccessToken(accessToken)
            ? await this.prisma.session.findUnique({ where: { tokenHash: this.hashSecret(accessToken) } })
            : undefined;
        if (!session || session.revoked || session.expiresAt <= new Date() || session.csrfTokenHash !== this.hashSecret(headerToken))
            return false;
        const consumed = await this.prisma.session.updateMany({ where: { id: session.id, csrfTokenHash: session.csrfTokenHash, revoked: false, expiresAt: { gt: new Date() } }, data: { csrfTokenHash: this.hashSecret(replacementToken) } });
        return consumed.count === 1;
    }
    isValidAccessToken(token) {
        try {
            (0, jsonwebtoken_1.verify)(token, auth_constants_1.JWT_SECRET, { issuer: 'jamus-kalimasada', audience: 'janus-web' });
            return true;
        }
        catch {
            return false;
        }
    }
    async getPersistentUserBySession(accessToken) {
        try {
            (0, jsonwebtoken_1.verify)(accessToken, auth_constants_1.JWT_SECRET, { issuer: 'jamus-kalimasada', audience: 'janus-web' });
        }
        catch {
            return undefined;
        }
        if (this.redisSession?.enabled) {
            const payload = (0, jsonwebtoken_1.verify)(accessToken, auth_constants_1.JWT_SECRET, { issuer: 'jamus-kalimasada', audience: 'janus-web' });
            const sessionId = redis_session_service_1.RedisSessionService.sessionIdFromAccessToken(payload);
            if (!sessionId)
                return undefined;
            const record = await this.redisSession.getBySessionId(sessionId);
            return record && await this.redisSession.getActiveSessionId(record.userId) === sessionId ? this.getPersistentUserById(record.userId) : undefined;
        }
        if (!this.prisma) {
            const session = this.getSessionByAccessToken(accessToken);
            return session ? this.getUserById(session.userId) : undefined;
        }
        const session = await this.prisma.session.findUnique({ where: { tokenHash: this.hashSecret(accessToken) }, include: { user: true } });
        if (!session || session.revoked || session.expiresAt <= new Date() || !session.user.isActive)
            return undefined;
        return this.toAuthenticatedUser(session.user);
    }
    async revokePersistentSession(accessToken) {
        if (this.redisSession?.enabled) {
            try {
                const payload = (0, jsonwebtoken_1.verify)(accessToken, auth_constants_1.JWT_SECRET, { issuer: 'jamus-kalimasada', audience: 'janus-web' });
                const sessionId = redis_session_service_1.RedisSessionService.sessionIdFromAccessToken(payload);
                if (sessionId)
                    await this.redisSession.revokeSession(sessionId);
            }
            catch { }
            return;
        }
        if (!this.prisma) {
            const session = this.getSessionByAccessToken(accessToken);
            if (session)
                this.revokeSession(session.sessionId);
            return;
        }
        await this.prisma.session.updateMany({ where: { tokenHash: this.hashSecret(accessToken) }, data: { revoked: true } });
    }
    async listPersistentUsersByRole(role, page = 1, limit = 10) {
        if (!this.prisma)
            return this.listUsersByRole(role, page, limit);
        const safePage = Math.max(1, Number(page) || 1);
        const safeLimit = Math.max(1, Number(limit) || 10);
        const where = { role, isActive: true };
        const [total, users] = await Promise.all([this.prisma.user.count({ where }), this.prisma.user.findMany({ where, skip: (safePage - 1) * safeLimit, take: safeLimit, orderBy: { email: 'asc' } })]);
        return { items: users.map((user) => this.toUserRecord(user)), page: safePage, limit: safeLimit, total, totalPages: Math.max(1, Math.ceil(total / safeLimit)) };
    }
    hashSecret(value) { return (0, node_crypto_1.createHash)('sha256').update(value).digest('hex'); }
    findSessionIdFromRefreshToken(refreshToken) {
        const separator = refreshToken.indexOf('.');
        return separator > 0 ? refreshToken.slice(0, separator) : undefined;
    }
    async getPersistentUserById(userId) {
        if (!this.prisma)
            return this.getUserById(userId);
        const user = await this.prisma.user.findUnique({ where: { id: userId } });
        return user && user.isActive ? this.toAuthenticatedUser(user) : undefined;
    }
    constantTimeHashMatch(storedHash, value) {
        const currentHash = this.hashSecret(value);
        return storedHash.length === currentHash.length && (0, node_crypto_1.timingSafeEqual)(Buffer.from(storedHash), Buffer.from(currentHash));
    }
    hashFingerprint(value) {
        return (0, node_crypto_1.createHmac)('sha256', auth_constants_1.FINGERPRINT_PEPPER).update(value.trim()).digest('hex');
    }
    matchesFingerprint(storedHash, fingerprint) {
        if (!storedHash) {
            return !fingerprint || fingerprint.trim().length === 0;
        }
        if (!fingerprint) {
            return false;
        }
        const currentHash = this.hashFingerprint(fingerprint);
        return storedHash.length === currentHash.length && (0, node_crypto_1.timingSafeEqual)(Buffer.from(storedHash), Buffer.from(currentHash));
    }
    toUserRecord(user) {
        return { id: user.id, email: user.email, passwordHash: user.passwordHash ?? '', firstName: user.firstName ?? '', lastName: user.lastName ?? '', role: user.role, isActive: user.isActive, createdAt: user.createdAt, updatedAt: user.updatedAt };
    }
    toAuthenticatedUser(user) {
        return { id: user.id, email: user.email, role: user.role, isActive: user.isActive, mustChangePassword: user.mustChangePassword ?? false, ...(user.firstName ? { firstName: user.firstName } : {}), ...(user.lastName ? { lastName: user.lastName } : {}) };
    }
    async ensureSeedAdmin() {
        if (!this.prisma)
            return;
        const email = this.getSeedAdminEmail();
        const existing = await this.prisma.user.findUnique({ where: { email } });
        if (existing)
            return;
        const legacy = await this.prisma.user.findUnique({ where: { email: 'admin@janus.local' } });
        if (legacy) {
            await this.prisma.user.update({ where: { id: legacy.id }, data: { email } });
            return;
        }
        await this.prisma.user.create({ data: { id: (0, node_crypto_1.randomUUID)(), email, passwordHash: await this.hashPasswordAsync('P@ssw0rd12345'), firstName: 'System', lastName: 'Administrator', role: 'SUPERADMIN', isActive: true, mustChangePassword: false } });
    }
    getSession(sessionId) {
        const session = this.sessions.get(sessionId);
        if (!session) {
            return undefined;
        }
        if (session.expiresAt < Date.now()) {
            this.sessions.delete(sessionId);
            return undefined;
        }
        return session;
    }
    revokeSession(sessionId) {
        const session = this.sessions.get(sessionId);
        if (session?.accessToken) {
            this.blacklistToken(session.accessToken, Math.max(session.expiresAt - Date.now(), 0));
        }
        this.sessions.delete(sessionId);
    }
    authorize(user, permission) {
        if (!user.isActive) {
            return false;
        }
        return (0, role_permissions_1.hasPermission)(user.role, permission);
    }
    requireRole(user, allowed) {
        return allowed.includes(user.role);
    }
    getUserByEmail(email) {
        return this.users.get(email.trim().toLowerCase());
    }
    getUserById(id) {
        for (const user of this.users.values()) {
            if (user.id === id) {
                return user;
            }
        }
        return undefined;
    }
    listUsersByRole(role, page = 1, limit = 10) {
        const users = Array.from(this.users.values()).filter((user) => user.role === role && user.isActive);
        const safePage = Math.max(1, Number(page) || 1);
        const safeLimit = Math.max(1, Number(limit) || 10);
        const total = users.length;
        const totalPages = Math.max(1, Math.ceil(total / safeLimit));
        const normalizedPage = Math.min(safePage, totalPages);
        const startIndex = (normalizedPage - 1) * safeLimit;
        return {
            items: users.slice(startIndex, startIndex + safeLimit),
            page: normalizedPage,
            limit: safeLimit,
            total,
            totalPages,
        };
    }
    authenticateUser(email, password, otp) {
        const user = this.getUserByEmail(email);
        if (!user || !user.isActive) {
            return undefined;
        }
        if (!this.matchesPassword(user.passwordHash, password)) {
            return undefined;
        }
        if (otp && user.isMfaEnabled && user.mfaSecret) {
            const token = otp.trim();
            if (!token || token.length < 6 || token.length > 8) {
                return undefined;
            }
        }
        return {
            id: user.id,
            email: user.email,
            role: user.role,
            isActive: user.isActive,
            ...(user.firstName ? { firstName: user.firstName } : {}),
            ...(user.lastName ? { lastName: user.lastName } : {}),
            ...(user.isMfaEnabled !== undefined ? { isMfaEnabled: user.isMfaEnabled } : {}),
            ...(user.mfaSecret ? { mfaSecret: user.mfaSecret } : {}),
        };
    }
    createCsrfToken() {
        return (0, node_crypto_1.randomBytes)(32).toString('hex');
    }
    verifyAccessToken(token) {
        if (this.isTokenBlacklisted(token)) {
            return undefined;
        }
        try {
            const decoded = (0, jsonwebtoken_1.verify)(token, auth_constants_1.JWT_SECRET);
            const user = this.users.get(decoded.email ?? '');
            if (!user) {
                return undefined;
            }
            return {
                id: user.id,
                email: user.email,
                role: user.role,
                isActive: user.isActive,
                ...(user.firstName ? { firstName: user.firstName } : {}),
                ...(user.lastName ? { lastName: user.lastName } : {}),
                ...(user.isMfaEnabled !== undefined ? { isMfaEnabled: user.isMfaEnabled } : {}),
                ...(user.mfaSecret ? { mfaSecret: user.mfaSecret } : {}),
            };
        }
        catch {
            return undefined;
        }
    }
    validateSessionCookie(sessionId) {
        const session = this.getSession(sessionId);
        if (!session) {
            return false;
        }
        return !this.isTokenBlacklisted(session.accessToken);
    }
    getSessionByAccessToken(token) {
        for (const session of this.sessions.values()) {
            if (session.accessToken === token) {
                return session;
            }
        }
        return undefined;
    }
    getSessionByRefreshToken(token) {
        for (const session of this.sessions.values()) {
            if (session.refreshToken === token) {
                return session;
            }
        }
        return undefined;
    }
    refreshSession(sessionId) {
        const session = this.getSession(sessionId);
        if (!session) {
            return undefined;
        }
        const newAccessToken = this.buildAccessToken({
            id: session.userId,
            email: this.getUserByEmail(session.userId)?.email ?? '',
            role: session.role,
            isActive: true,
        });
        const rotatedSessionId = (0, node_crypto_1.randomUUID)();
        session.accessToken = newAccessToken;
        session.expiresAt = Date.now() + 15 * 60 * 1000;
        session.refreshToken = this.buildRefreshToken({ id: session.userId, email: '', role: session.role, isActive: true });
        this.sessions.delete(sessionId);
        session.sessionId = rotatedSessionId;
        this.sessions.set(rotatedSessionId, session);
        return session;
    }
};
exports.AuthService = AuthService;
exports.AuthService = AuthService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService, mail_service_1.MailService, redis_session_service_1.RedisSessionService])
], AuthService);
//# sourceMappingURL=auth.service.js.map