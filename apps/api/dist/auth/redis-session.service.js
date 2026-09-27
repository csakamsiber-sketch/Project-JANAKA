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
Object.defineProperty(exports, "__esModule", { value: true });
exports.RedisSessionService = void 0;
const common_1 = require("@nestjs/common");
const redis_1 = require("redis");
const node_crypto_1 = require("node:crypto");
const auth_constants_1 = require("./auth.constants");
let RedisSessionService = class RedisSessionService {
    client;
    connection;
    enabled = Boolean(process.env.REDIS_URL);
    constructor() {
        if (process.env.NODE_ENV === 'production' && !this.enabled)
            throw new Error('REDIS_URL is required in production.');
        this.client = (0, redis_1.createClient)({ url: process.env.REDIS_URL ?? 'redis://localhost:6379' });
        this.client.on('error', () => undefined);
    }
    async onModuleDestroy() {
        if (this.client.isOpen)
            await this.client.quit();
    }
    async connect() {
        if (!this.enabled)
            throw new Error('REDIS_URL is required for Redis-backed sessions.');
        this.connection ??= this.client.connect().then(() => undefined);
        await this.connection;
    }
    activeKey(userId) { return `user:active_session:${userId}`; }
    sessionKey(sessionId) { return `session:${sessionId}`; }
    hash(value) { return (0, node_crypto_1.createHash)('sha256').update(value).digest('hex'); }
    fingerprintHash(value) { return (0, node_crypto_1.createHmac)('sha256', auth_constants_1.FINGERPRINT_PEPPER).update(value.trim()).digest('hex'); }
    equalHash(stored, value) {
        if (!stored)
            return false;
        const current = this.fingerprintHash(value);
        return stored.length === current.length && (0, node_crypto_1.timingSafeEqual)(Buffer.from(stored), Buffer.from(current));
    }
    async createSession(input, ttlSeconds) {
        await this.connect();
        const activeKey = this.activeKey(input.user.id);
        const sessionKey = this.sessionKey(input.sessionId);
        const record = {
            user_id: input.user.id,
            role: input.user.role,
            email: input.user.email,
            refresh_token_hash: this.hash(input.refreshToken),
            fingerprint: this.fingerprintHash(input.fingerprint),
            csrf_token_hash: this.hash(input.csrfToken),
        };
        await this.client.watch(activeKey);
        try {
            const previousSessionId = await this.client.get(activeKey);
            const transaction = this.client.multi();
            if (previousSessionId)
                transaction.del(this.sessionKey(previousSessionId));
            transaction.hSet(sessionKey, record);
            transaction.expire(sessionKey, ttlSeconds);
            transaction.set(activeKey, input.sessionId, { EX: ttlSeconds });
            const result = await transaction.exec();
            if (!result)
                throw new Error('Concurrent session replacement detected.');
        }
        finally {
            await this.client.unwatch();
        }
    }
    async getBySessionId(sessionId) {
        await this.connect();
        const values = await this.client.hGetAll(this.sessionKey(sessionId));
        if (!values.user_id || !values.role || !values.email || !values.refresh_token_hash || !values.fingerprint || !values.csrf_token_hash)
            return undefined;
        return { sessionId, userId: values.user_id, role: values.role, email: values.email, refreshTokenHash: values.refresh_token_hash, fingerprint: values.fingerprint, csrfTokenHash: values.csrf_token_hash };
    }
    async getActiveSessionId(userId) {
        await this.connect();
        return (await this.client.get(this.activeKey(userId))) ?? undefined;
    }
    async rotateSession(input, ttlSeconds) {
        await this.connect();
        const sessionKey = this.sessionKey(input.sessionId);
        await this.client.watch(sessionKey);
        try {
            const record = await this.getBySessionId(input.sessionId);
            if (!record || record.refreshTokenHash !== this.hash(input.refreshToken) || !this.equalHash(record.fingerprint, input.fingerprint))
                return false;
            const transaction = this.client.multi();
            transaction.hSet(sessionKey, { refresh_token_hash: this.hash(input.nextRefreshToken), csrf_token_hash: this.hash(input.nextCsrfToken) });
            transaction.expire(sessionKey, ttlSeconds);
            transaction.expire(this.activeKey(record.userId), ttlSeconds);
            return Boolean(await transaction.exec());
        }
        finally {
            await this.client.unwatch();
        }
    }
    async revokeSession(sessionId, userId) {
        await this.connect();
        const record = userId ? undefined : await this.getBySessionId(sessionId);
        const resolvedUserId = userId ?? record?.userId;
        const transaction = this.client.multi();
        transaction.del(this.sessionKey(sessionId));
        if (resolvedUserId)
            transaction.del(this.activeKey(resolvedUserId));
        await transaction.exec();
    }
    async consumeCsrf(sessionId, cookieToken, headerToken, replacementToken) {
        await this.connect();
        const sessionKey = this.sessionKey(sessionId);
        await this.client.watch(sessionKey);
        try {
            const record = await this.getBySessionId(sessionId);
            if (!record || cookieToken !== headerToken || record.csrfTokenHash !== this.hash(headerToken))
                return false;
            const transaction = this.client.multi();
            transaction.hSet(sessionKey, { csrf_token_hash: this.hash(replacementToken) });
            return Boolean(await transaction.exec());
        }
        finally {
            await this.client.unwatch();
        }
    }
    async isFingerprintValid(sessionId, fingerprint) {
        const record = await this.getBySessionId(sessionId);
        return Boolean(record && this.equalHash(record.fingerprint, fingerprint));
    }
    static sessionIdFromAccessToken(payload) {
        return typeof payload === 'object' && payload !== null && 'jti' in payload && typeof payload.jti === 'string' ? payload.jti : undefined;
    }
};
exports.RedisSessionService = RedisSessionService;
exports.RedisSessionService = RedisSessionService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [])
], RedisSessionService);
//# sourceMappingURL=redis-session.service.js.map