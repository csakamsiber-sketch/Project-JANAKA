import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { createClient, type RedisClientType } from 'redis';
import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import { FINGERPRINT_PEPPER } from './auth.constants';
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

@Injectable()
export class RedisSessionService implements OnModuleDestroy {
  private readonly client: RedisClientType;
  private connection?: Promise<void>;
  readonly enabled = Boolean(process.env.REDIS_URL);

  constructor() {
    if (process.env.NODE_ENV === 'production' && !this.enabled) throw new Error('REDIS_URL is required in production.');
    this.client = createClient({ url: process.env.REDIS_URL ?? 'redis://localhost:6379' });
    this.client.on('error', () => undefined);
  }

  async onModuleDestroy(): Promise<void> {
    if (this.client.isOpen) await this.client.quit();
  }

  private async connect(): Promise<void> {
    if (!this.enabled) throw new Error('REDIS_URL is required for Redis-backed sessions.');
    this.connection ??= this.client.connect().then(() => undefined);
    await this.connection;
  }

  private activeKey(userId: string): string { return `user:active_session:${userId}`; }
  private sessionKey(sessionId: string): string { return `session:${sessionId}`; }
  private hash(value: string): string { return createHash('sha256').update(value).digest('hex'); }
  private fingerprintHash(value: string): string { return createHmac('sha256', FINGERPRINT_PEPPER).update(value.trim()).digest('hex'); }
  private equalHash(stored: string | undefined, value: string): boolean {
    if (!stored) return false;
    const current = this.fingerprintHash(value);
    return stored.length === current.length && timingSafeEqual(Buffer.from(stored), Buffer.from(current));
  }

  async createSession(input: { sessionId: string; user: AuthenticatedUser; refreshToken: string; csrfToken: string; fingerprint: string }, ttlSeconds: number): Promise<void> {
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
      if (previousSessionId) transaction.del(this.sessionKey(previousSessionId));
      transaction.hSet(sessionKey, record);
      transaction.expire(sessionKey, ttlSeconds);
      transaction.set(activeKey, input.sessionId, { EX: ttlSeconds });
      const result = await transaction.exec();
      if (!result) throw new Error('Concurrent session replacement detected.');
    } finally {
      await this.client.unwatch();
    }
  }

  async getBySessionId(sessionId: string): Promise<RedisSessionRecord | undefined> {
    await this.connect();
    const values = await this.client.hGetAll(this.sessionKey(sessionId));
    if (!values.user_id || !values.role || !values.email || !values.refresh_token_hash || !values.fingerprint || !values.csrf_token_hash) return undefined;
    return { sessionId, userId: values.user_id, role: values.role as UserRole, email: values.email, refreshTokenHash: values.refresh_token_hash, fingerprint: values.fingerprint, csrfTokenHash: values.csrf_token_hash };
  }

  async getActiveSessionId(userId: string): Promise<string | undefined> {
    await this.connect();
    return (await this.client.get(this.activeKey(userId))) ?? undefined;
  }

  async rotateSession(input: { sessionId: string; refreshToken: string; nextRefreshToken: string; nextCsrfToken: string; fingerprint: string }, ttlSeconds: number): Promise<boolean> {
    await this.connect();
    const sessionKey = this.sessionKey(input.sessionId);
    await this.client.watch(sessionKey);
    try {
      const record = await this.getBySessionId(input.sessionId);
      if (!record || record.refreshTokenHash !== this.hash(input.refreshToken) || !this.equalHash(record.fingerprint, input.fingerprint)) return false;
      const transaction = this.client.multi();
      transaction.hSet(sessionKey, { refresh_token_hash: this.hash(input.nextRefreshToken), csrf_token_hash: this.hash(input.nextCsrfToken) });
      transaction.expire(sessionKey, ttlSeconds);
      transaction.expire(this.activeKey(record.userId), ttlSeconds);
      return Boolean(await transaction.exec());
    } finally {
      await this.client.unwatch();
    }
  }

  async revokeSession(sessionId: string, userId?: string): Promise<void> {
    await this.connect();
    const record = userId ? undefined : await this.getBySessionId(sessionId);
    const resolvedUserId = userId ?? record?.userId;
    const transaction = this.client.multi();
    transaction.del(this.sessionKey(sessionId));
    if (resolvedUserId) transaction.del(this.activeKey(resolvedUserId));
    await transaction.exec();
  }

  async consumeCsrf(sessionId: string, cookieToken: string, headerToken: string, replacementToken: string): Promise<boolean> {
    await this.connect();
    const sessionKey = this.sessionKey(sessionId);
    await this.client.watch(sessionKey);
    try {
      const record = await this.getBySessionId(sessionId);
      if (!record || cookieToken !== headerToken || record.csrfTokenHash !== this.hash(headerToken)) return false;
      const transaction = this.client.multi();
      transaction.hSet(sessionKey, { csrf_token_hash: this.hash(replacementToken) });
      return Boolean(await transaction.exec());
    } finally {
      await this.client.unwatch();
    }
  }

  async isFingerprintValid(sessionId: string, fingerprint: string): Promise<boolean> {
    const record = await this.getBySessionId(sessionId);
    return Boolean(record && this.equalHash(record.fingerprint, fingerprint));
  }

  static sessionIdFromAccessToken(payload: unknown): string | undefined {
    return typeof payload === 'object' && payload !== null && 'jti' in payload && typeof payload.jti === 'string' ? payload.jti : undefined;
  }
}
