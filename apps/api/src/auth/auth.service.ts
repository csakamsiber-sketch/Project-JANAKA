import { createHash, createHmac, randomBytes, randomInt, randomUUID, timingSafeEqual } from 'node:crypto';
import { resolveMx } from 'node:dns/promises';
import bcrypt from 'bcrypt';
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { sign, verify } from 'jsonwebtoken';
import { createClient } from 'redis';
import { AUTH_COOKIE_NAME, FINGERPRINT_PEPPER, JWT_SECRET } from './auth.constants';
import { AuthenticatedUser, AuthSession, RegistrationRequest, ResetTokenRecord, UserRecord, UserRole } from './auth.types';
import { hasPermission } from './role-permissions';
import { PrismaService } from '../prisma.service';
import { MailService } from './mail.service';
import { RedisSessionService } from './redis-session.service';

@Injectable()
export class AuthService {
  private readonly sessions = new Map<string, AuthSession>();
  private readonly users = new Map<string, UserRecord>();
  private readonly registrationRequests = new Map<string, RegistrationRequest>();
  private readonly resetTokens = new Map<string, ResetTokenRecord>();
  private readonly blacklistedTokens = new Map<string, number>();
  private readonly redis: ReturnType<typeof createClient> | undefined = process.env.REDIS_URL ? createClient({ url: process.env.REDIS_URL }) : undefined;
  private redisConnection?: Promise<void>;

  private readonly emailRegex = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9-]+(?:\.[a-zA-Z0-9-]+)*$/;

  private getSeedAdminEmail(): string {
    return (process.env.ADMIN_EMAIL ?? 'csakamsiber@gmail.com').trim().toLowerCase();
  }

  constructor(private readonly prisma?: PrismaService, private readonly mailService?: MailService, private readonly redisSession?: RedisSessionService) {
    this.redis?.on('error', () => undefined);
    this.users.set('admin@janus.local', {
      id: randomUUID(),
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

  private validateEmail(email: string): void {
    if (!email || !this.emailRegex.test(email.trim()) || email.trim().length > 254) {
      throw new Error('A valid email address is required before creating a registration request.');
    }
  }

  private validatePassword(password: string): void {
    if (password.length < 12 || password.length > 128) {
      throw new Error('Password must be between 12 and 128 characters.');
    }

    if (!/[A-Z]/.test(password) || !/[a-z]/.test(password) || !/[0-9]/.test(password) || !/[^A-Za-z0-9]/.test(password)) {
      throw new Error('Password must include uppercase, lowercase, number, and symbol.');
    }
  }

  private hashPassword(password: string): string {
    return bcrypt.hashSync(password, 12);
  }

  private matchesPassword(storedHash: string | null | undefined, password: string): boolean {
    return Boolean(storedHash && bcrypt.compareSync(password, storedHash));
  }

  private async hashPasswordAsync(password: string): Promise<string> {
    return bcrypt.hash(password, 12);
  }

  private async matchesPasswordAsync(storedHash: string | null | undefined, password: string): Promise<boolean> {
    return Boolean(storedHash && await bcrypt.compare(password, storedHash));
  }

  createUser(input: {
    id: string;
    email: string;
    password: string;
    firstName: string;
    lastName: string;
    role: UserRole;
  }): UserRecord {
    this.validateEmail(input.email);
    this.validatePassword(input.password);

    const email = input.email.trim().toLowerCase();
    const user: UserRecord = {
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

  async createRegistrationRequest(input: {
    email: string;
    password?: string;
    firstName: string;
    lastName: string;
    role: UserRole;
  }): Promise<RegistrationRequest> {
    this.validateEmail(input.email);
    const request: RegistrationRequest = {
      id: randomUUID(),
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
    if (pendingRequest) throw new Error('Email ini sudah mengajukan permintaan akun sebelumnya. Silahkan tunggu 1x24 jam setelah pendaftaran.');
    await this.validateEmailDomain(request.email);
    const stored = await this.storeRegistrationRequest(request);
    if (!stored) this.registrationRequests.set(request.id, request);
    return request;
  }

  async approveRegistrationRequest(requestId: string): Promise<RegistrationRequest | undefined> {
    const request = await this.getRegistrationRequest(requestId);
    if (!request) {
      return undefined;
    }

    request.status = 'APPROVED';
    const temporaryPassword = this.generateTemporaryPassword();
    if (this.prisma) {
      const existing = await this.prisma.user.findUnique({ where: { email: request.email } });
      if (existing) throw new Error('A user with this email already exists.');
      await this.prisma.user.create({
        data: {
          id: randomUUID(),
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
      id: randomUUID(),
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

  private generateTemporaryPassword(): string {
    const required = ['A', 'a', '2', '!'];
    const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%';
    const randomCharacters = Array.from(randomBytes(8), (byte) => alphabet[byte % alphabet.length]);
    return [...required, ...randomCharacters].sort(() => (randomBytes(1)[0] ?? 0) - 128).join('');
  }

  async changePassword(accessToken: string, currentPassword: string, newPassword: string): Promise<boolean> {
    const user = await this.getPersistentUserBySession(accessToken);
    if (!user) return false;
    this.validatePassword(newPassword);
    if (this.prisma) {
      const record = await this.prisma.user.findUnique({ where: { id: user.id } });
      if (!record || !await this.matchesPasswordAsync(record.passwordHash, currentPassword)) return false;
      await this.prisma.$transaction(async (transaction) => {
        await transaction.user.update({ where: { id: user.id }, data: { passwordHash: await this.hashPasswordAsync(newPassword), mustChangePassword: false } });
        await transaction.session.updateMany({ where: { userId: user.id, revoked: false }, data: { revoked: true } });
      });
      await this.mailService?.sendPasswordChangedNotification(record.email);
      return true;
    }
    const record = this.getUserById(user.id);
    if (!record || !this.matchesPassword(record.passwordHash, currentPassword)) return false;
    record.passwordHash = this.hashPassword(newPassword);
    record.mustChangePassword = false;
    for (const [sessionId, session] of this.sessions) {
      if (session.userId !== user.id) continue;
      this.blacklistToken(session.accessToken, Math.max(session.expiresAt - Date.now(), 0));
      this.blacklistToken(session.refreshToken, Math.max(session.refreshExpiresAt - Date.now(), 0));
      this.sessions.delete(sessionId);
    }
    await this.mailService?.sendPasswordChangedNotification(user.email);
    return true;
  }

  private async validateEmailDomain(email: string): Promise<void> {
    const domain = email.split('@')[1];
    if (!domain) throw new Error('A valid email address is required before creating a registration request.');
    try {
      const records = await resolveMx(domain);
      if (!records.length) throw new Error('The email domain does not accept email.');
    } catch {
      throw new Error('The email address domain could not be verified.');
    }
  }

  private async ensureRedis(): Promise<ReturnType<typeof createClient> | undefined> {
    if (!this.redis) {
      if (process.env.NODE_ENV === 'production') throw new Error('Redis is not configured. Set REDIS_URL before accepting registrations.');
      return undefined;
    }
    if (!this.redis.isOpen) {
      this.redisConnection ??= this.redis.connect().then(() => undefined);
      await this.redisConnection;
    }
    return this.redis;
  }

  private registrationKey(id: string): string { return `janus:registration:${id}`; }
  private registrationEmailKey(email: string): string { return `janus:registration-email:${email}`; }

  private async storeRegistrationRequest(request: RegistrationRequest): Promise<boolean> {
    const redis = await this.ensureRedis();
    if (!redis) return false;
    const accepted = await redis.set(this.registrationEmailKey(request.email), request.id, { EX: 60 * 60 * 24, NX: true });
    if (accepted !== 'OK') throw new Error('Email ini sudah mengajukan permintaan akun sebelumnya. Silahkan tunggu 1x24 jam setelah pendaftaran.');
    await redis.set(this.registrationKey(request.id), JSON.stringify(request), { EX: 60 * 60 * 24 });
    return true;
  }

  private async getRegistrationRequest(id: string): Promise<RegistrationRequest | undefined> {
    const redis = await this.ensureRedis();
    const value = redis ? await redis.get(this.registrationKey(id)) : undefined;
    if (value) return JSON.parse(value) as RegistrationRequest;
    return this.registrationRequests.get(id);
  }

  private async deleteRegistrationRequest(id: string): Promise<void> {
    const redis = await this.ensureRedis();
    if (redis) {
      const value = await redis.get(this.registrationKey(id));
      await redis.del(this.registrationKey(id));
      if (value) await redis.del(this.registrationEmailKey((JSON.parse(value) as RegistrationRequest).email));
    }
    this.registrationRequests.delete(id);
  }

  async listPersistentUsers(page = 1) {
    const pageSize = 20;
    if (!this.prisma) return this.listUsers(page, pageSize);
    const safePage = Math.max(1, Number(page) || 1);
    const [total, users] = await Promise.all([
      this.prisma.user.count(),
      this.prisma.user.findMany({ skip: (safePage - 1) * pageSize, take: pageSize, orderBy: { email: 'asc' } }),
    ]);
    return { items: users.map((user) => ({ id: user.id, email: user.email, firstName: user.firstName, lastName: user.lastName, role: user.role, isActive: user.isActive, createdAt: user.createdAt })), page: safePage, limit: pageSize, total, totalPages: Math.max(1, Math.ceil(total / pageSize)) };
  }

  async listRegistrationRequests(page = 1): Promise<{ items: RegistrationRequest[]; page: number; limit: number; total: number; totalPages: number }> {
    const pageSize = 20;
    const redis = await this.ensureRedis();
    if (!redis) {
      const requests = Array.from(this.registrationRequests.values()).sort((left, right) => right.createdAt.localeCompare(left.createdAt));
      return { items: requests.slice((page - 1) * pageSize, page * pageSize), page, limit: pageSize, total: requests.length, totalPages: Math.max(1, Math.ceil(requests.length / pageSize)) };
    }
    const keys = await redis.keys('janus:registration:*');
    const values = await Promise.all(keys.filter((key) => !key.startsWith('janus:registration-email:')).map((key) => redis.get(key)));
    const requests = values.filter(Boolean).map((value) => JSON.parse(value as string) as RegistrationRequest).sort((left, right) => right.createdAt.localeCompare(left.createdAt));
    return { items: requests.slice((page - 1) * pageSize, page * pageSize), page, limit: pageSize, total: requests.length, totalPages: Math.max(1, Math.ceil(requests.length / pageSize)) };
  }

  async rejectRegistrationRequest(requestId: string): Promise<boolean> {
    const request = await this.getRegistrationRequest(requestId);
    if (!request) return false;
    request.status = 'REJECTED';
    await this.deleteRegistrationRequest(requestId);
    return true;
  }

  async requestAdminActionOtp(actorId: string, targetId: string, action: 'DEACTIVATE' | 'PROMOTE_ADMIN'): Promise<void> {
    if (!this.prisma || !this.mailService) throw new Error('User action OTP is not configured.');
    const target = await this.prisma.user.findUnique({ where: { id: targetId } });
    if (!target) throw new Error('User not found.');
    const code = String(randomInt(100000, 1000000));
    await this.prisma.adminActionChallenge.updateMany({ where: { actorId, targetId, action, consumed: false }, data: { consumed: true } });
    await this.prisma.adminActionChallenge.create({ data: { actorId, targetId, action, codeHash: this.hashSecret(code), expiresAt: new Date(Date.now() + 10 * 60 * 1000), resendAvailableAt: new Date(Date.now() + 2 * 60 * 1000) } });
    const actor = await this.prisma.user.findUniqueOrThrow({ where: { id: actorId } });
    await this.mailService.sendAdminActionOtp(actor.email, code, action);
  }

  async resendAdminActionOtp(actorId: string, targetId: string, action: 'DEACTIVATE' | 'PROMOTE_ADMIN'): Promise<{ sent: true; retryAfterSeconds: number }> {
    if (!this.prisma || !this.mailService) throw new Error('User action OTP is not configured.');
    const now = new Date();
    const waitMinutes = [2, 5, 10, 30, 60];
    const code = String(randomInt(100000, 1000000));
    const challenge = await this.prisma.$transaction(async (transaction) => {
      await transaction.$executeRawUnsafe('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', `${actorId}:${targetId}:${action}`);
      const current = await transaction.adminActionChallenge.findFirst({ where: { actorId, targetId, action, consumed: false }, orderBy: { createdAt: 'desc' } });
      if (!current || current.expiresAt <= now) throw new UnauthorizedException('The verification code has expired. Request a new action.');
      if (current.attempts >= 5) throw new UnauthorizedException('This verification code is locked after five failed attempts. Start the action again.');
      if (current.resendAvailableAt && current.resendAvailableAt > now) {
        const retryAfterSeconds = Math.ceil((current.resendAvailableAt.getTime() - now.getTime()) / 1000);
        throw new UnauthorizedException(`Please wait ${Math.ceil(retryAfterSeconds / 60)} minute(s) before requesting another code.`);
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

  async confirmAdminActionOtp(actorId: string, targetId: string, action: 'DEACTIVATE' | 'PROMOTE_ADMIN', code: string): Promise<{ valid: boolean; locked: boolean; attemptsRemaining: number }> {
    if (!this.prisma) return { valid: false, locked: false, attemptsRemaining: 0 };
    const challenge = await this.prisma.adminActionChallenge.findFirst({ where: { actorId, targetId, action, consumed: false }, orderBy: { createdAt: 'desc' } });
    const attempts = challenge?.attempts ?? 0;
    if (!challenge || challenge.expiresAt <= new Date() || attempts >= 5) return { valid: false, locked: attempts >= 5, attemptsRemaining: 0 };
    const matches = this.constantTimeHashMatch(challenge.codeHash, code);
    const nextAttempts = attempts + 1;
    await this.prisma.adminActionChallenge.update({ where: { id: challenge.id }, data: { attempts: { increment: 1 }, ...(matches ? { consumed: true } : {}), ...(!matches && nextAttempts >= 5 ? { consumed: true } : {}) } });
    if (!matches) return { valid: false, locked: nextAttempts >= 5, attemptsRemaining: Math.max(0, 5 - nextAttempts) };
    await this.prisma.user.update({ where: { id: targetId }, data: action === 'DEACTIVATE' ? { isActive: false } : { role: 'SUPERADMIN' } });
    if (action === 'DEACTIVATE') await this.prisma.session.updateMany({ where: { userId: targetId, revoked: false }, data: { revoked: true } });
    return { valid: true, locked: false, attemptsRemaining: 5 };
  }


  async requestSuperadminDowngrade(requestedById: string, targetId: string, requestedRole: UserRole) {
    if (!this.prisma || !this.mailService) throw new Error('Superadmin downgrade approval is not configured.');
    const target = await this.prisma.user.findUnique({ where: { id: targetId } });
    if (!target || !target.isActive || target.role !== 'SUPERADMIN') throw new Error('The target must be an active superadmin.');
    const approvers = await this.prisma.user.findMany({ where: { role: 'SUPERADMIN', isActive: true, id: { not: targetId } }, select: { id: true, email: true } });
    if (!approvers.length) throw new Error('At least one other active superadmin must approve this change.');
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000);
    const codes = approvers.map((approver) => ({ approver, code: String(randomInt(100000, 1000000)) }));
    const request = await this.prisma.$transaction(async (transaction) => {
      await transaction.superadminDowngradeRequest.updateMany({ where: { targetId, status: 'PENDING' }, data: { status: 'EXPIRED' } });
      const created = await transaction.superadminDowngradeRequest.create({ data: { targetId, requestedById, requestedRole, expiresAt } });
      await transaction.superadminDowngradeApproval.createMany({ data: codes.map(({ approver, code }) => ({ requestId: created.id, approverId: approver.id, codeHash: this.hashSecret(code), expiresAt, resendAvailableAt: new Date(Date.now() + 2 * 60 * 1000) })) });
      return created;
    });
    await Promise.all(codes.map(({ approver, code }) => this.mailService!.sendAdminActionOtp(approver.email, code, 'SUPERADMIN DOWNGRADE APPROVAL')));
    return { id: request.id, targetId, requestedRole, requiredApprovals: approvers.length, expiresAt: request.expiresAt };
  }

  async listPendingSuperadminDowngradeApprovals(approverId: string) {
    if (!this.prisma) return [];
    const approvals = await this.prisma.superadminDowngradeApproval.findMany({
      where: { approverId, consumed: false, expiresAt: { gt: new Date() }, request: { status: 'PENDING' } },
      include: { request: { include: { target: { select: { id: true, email: true, firstName: true, lastName: true } }, requestedBy: { select: { email: true } } } } },
      orderBy: { createdAt: 'desc' },
    });
    return approvals.map((approval) => ({ id: approval.id, requestId: approval.requestId, target: approval.request.target, requestedBy: approval.request.requestedBy.email, requestedRole: approval.request.requestedRole, expiresAt: approval.expiresAt }));
  }

  async approveSuperadminDowngrade(approverId: string, requestId: string, code: string): Promise<{ accepted: boolean; completed: boolean }> {
    if (!this.prisma) return { accepted: false, completed: false };
    const now = new Date();
    return this.prisma.$transaction(async (transaction) => {
      await transaction.$queryRaw`SELECT "id" FROM "SuperadminDowngradeRequest" WHERE "id" = ${requestId} FOR UPDATE`;
      const approval = await transaction.superadminDowngradeApproval.findUnique({ where: { requestId_approverId: { requestId, approverId } }, include: { request: true } });
      if (!approval || approval.consumed || approval.expiresAt <= now || approval.request.status !== 'PENDING' || approval.attempts >= 5) return { accepted: false, completed: false };
      const matches = this.constantTimeHashMatch(approval.codeHash, code);
      await transaction.superadminDowngradeApproval.update({ where: { id: approval.id }, data: { attempts: { increment: 1 }, ...(matches ? { consumed: true, approvedAt: now } : {}), ...(!matches && approval.attempts + 1 >= 5 ? { consumed: true } : {}) } });
      if (!matches) return { accepted: false, completed: false };
      const remaining = await transaction.superadminDowngradeApproval.count({ where: { requestId, consumed: false, expiresAt: { gt: now } } });
      if (remaining > 0) return { accepted: true, completed: false };
      const completed = await transaction.superadminDowngradeRequest.updateMany({ where: { id: requestId, status: 'PENDING' }, data: { status: 'COMPLETED', completedAt: now } });
      if (!completed.count) return { accepted: false, completed: false };
      const request = await transaction.superadminDowngradeRequest.findUniqueOrThrow({ where: { id: requestId } });
      await transaction.user.update({ where: { id: request.targetId, role: 'SUPERADMIN' }, data: { role: request.requestedRole } });
      return { accepted: true, completed: true };
    });
  }

  async resendSuperadminDowngradeOtp(approverId: string, requestId: string): Promise<{ sent: true; retryAfterSeconds: number }> {
    if (!this.prisma || !this.mailService) throw new Error('Superadmin downgrade approval is not configured.');
    const now = new Date();
    const code = String(randomInt(100000, 1000000));
    const waitMinutes = [2, 5, 10, 30, 60];
    const approval = await this.prisma.$transaction(async (transaction) => {
      await transaction.$executeRawUnsafe('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', `${requestId}:${approverId}`);
      const current = await transaction.superadminDowngradeApproval.findUnique({ where: { requestId_approverId: { requestId, approverId } }, include: { request: true } });
      if (!current || current.consumed || current.expiresAt <= now || current.request.status !== 'PENDING') throw new UnauthorizedException('The approval challenge is invalid or expired.');
      if (current.attempts >= 5) throw new UnauthorizedException('This verification code is locked after five failed attempts.');
      if (current.resendAvailableAt && current.resendAvailableAt > now) throw new UnauthorizedException(`Please wait ${Math.ceil((current.resendAvailableAt.getTime() - now.getTime()) / 60000)} minute(s) before requesting another code.`);
      const nextCount = (current.resendCount ?? 0) + 1;
      const delay = waitMinutes[Math.min(nextCount, waitMinutes.length - 1)] ?? 60;
      return transaction.superadminDowngradeApproval.update({ where: { id: current.id }, data: { codeHash: this.hashSecret(code), expiresAt: new Date(now.getTime() + 10 * 60 * 1000), resendCount: nextCount, resendAvailableAt: new Date(now.getTime() + delay * 60 * 1000), attempts: 0 }, include: { approver: true } });
    });
    await this.mailService.sendAdminActionOtp(approval.approver.email, code, 'SUPERADMIN DOWNGRADE APPROVAL');
    return { sent: true, retryAfterSeconds: Math.ceil(((approval.resendAvailableAt?.getTime() ?? now.getTime()) - now.getTime()) / 1000) };
  }

  async changeUserRole(targetId: string, role: UserRole): Promise<boolean> {
    if (!this.prisma) return false;
    const target = await this.prisma.user.findUnique({ where: { id: targetId }, select: { role: true } });
    if (!target) return false;
    if (target.role === 'SUPERADMIN' && role !== 'SUPERADMIN') throw new Error('Downgrading a superadmin requires approval from every other active superadmin.');
    await this.prisma.user.update({ where: { id: targetId }, data: { role } });
    return true;
  }

  private listUsers(page = 1, limit = 20) {
    const users = Array.from(this.users.values());
    const safePage = Math.max(1, Number(page) || 1);
    const safeLimit = Math.max(1, Number(limit) || 20);
    return { items: users.slice((safePage - 1) * safeLimit, safePage * safeLimit), page: safePage, limit: safeLimit, total: users.length, totalPages: Math.max(1, Math.ceil(users.length / safeLimit)) };
  }

  requestPasswordReset(email: string): { token: string; expiresAt: number } {
    this.validateEmail(email);
    const token = randomBytes(32).toString('hex');
    this.resetTokens.set(token, {
      email: email.trim().toLowerCase(),
      expiresAt: Date.now() + 15 * 60 * 1000,
    });

    return { token, expiresAt: Date.now() + 15 * 60 * 1000 };
  }

  resetPassword(token: string, newPassword: string): boolean {
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

  blacklistToken(token: string, expiresInMs: number): void {
    this.blacklistedTokens.set(token, Date.now() + expiresInMs);
  }

  isTokenBlacklisted(token: string): boolean {
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

  buildAccessToken(user: AuthenticatedUser, sessionId?: string): string {
    return sign({ sub: user.id, email: user.email, role: user.role, ...(sessionId ? { jti: sessionId } : {}) }, JWT_SECRET, {
      expiresIn: '15m',
      issuer: 'jamus-kalimasada',
      audience: 'janus-web',
    });
  }

  buildRefreshToken(user: AuthenticatedUser, sessionId?: string): string {
    return `${sessionId ?? randomUUID()}.${randomBytes(32).toString('hex')}`;
  }

  createSession(user: AuthenticatedUser, fingerprintHash?: string): AuthSession {
    for (const session of this.sessions.values()) {
      if (session.userId === user.id) {
        this.revokeSession(session.sessionId);
      }
    }

    const sessionId = randomUUID();
    const accessToken = this.buildAccessToken(user, sessionId);
    const refreshToken = this.buildRefreshToken(user, sessionId);
    const session: AuthSession = {
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

  async authenticateUserPersistent(email: string, password: string, otp?: string): Promise<AuthenticatedUser | undefined> {
    if (!this.prisma) return this.authenticateUser(email, password, otp);
    await this.ensureSeedAdmin();
    const user = await this.prisma.user.findUnique({ where: { email: email.trim().toLowerCase() } });
    if (!user || !user.isActive || !await this.matchesPasswordAsync(user.passwordHash, password)) return undefined;
    return this.toAuthenticatedUser(user);
  }

  async verifyPasswordForSession(accessToken: string, password: string): Promise<AuthenticatedUser | undefined> {
    const user = await this.getPersistentUserBySession(accessToken);
    return user ? this.authenticateUserPersistent(user.email, password) : undefined;
  }

  async createSessionPersistent(user: AuthenticatedUser, fingerprintHash: string | undefined, csrfToken: string): Promise<AuthSession> {
    if (this.redisSession?.enabled) {
      if (!fingerprintHash) throw new UnauthorizedException('A device fingerprint is required.');
      const sessionId = randomUUID();
      const accessToken = this.buildAccessToken(user, sessionId);
      const refreshToken = this.buildRefreshToken(user, sessionId);
      await this.redisSession.createSession({ sessionId, user, refreshToken, csrfToken, fingerprint: fingerprintHash }, 7 * 24 * 60 * 60);
      const now = Date.now();
      return { sessionId, userId: user.id, role: user.role, expiresAt: now + 15 * 60 * 1000, refreshExpiresAt: now + 7 * 24 * 60 * 60 * 1000, accessToken, refreshToken, csrfToken, fingerprintHash };
    }
    if (!this.prisma) return this.createSession(user, fingerprintHash);
    const sessionId = randomUUID();
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

  async requiresLoginOtp(userId: string, fingerprint: string | undefined): Promise<boolean> {
    if (!this.prisma || !fingerprint) return false;
    const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { deviceFingerprintHash: true } });
    return Boolean(user?.deviceFingerprintHash && !this.matchesFingerprint(user.deviceFingerprintHash, fingerprint));
  }

  async hasRegisteredDevice(userId: string): Promise<boolean> {
    if (!this.prisma) return false;
    const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { deviceFingerprintHash: true } });
    return Boolean(user?.deviceFingerprintHash);
  }

  async rememberDevice(userId: string, fingerprint: string): Promise<void> {
    if (this.prisma) await this.prisma.user.update({ where: { id: userId }, data: { deviceFingerprintHash: this.hashFingerprint(fingerprint) } });
  }

  async issueLoginOtp(user: AuthenticatedUser, fingerprint: string): Promise<{ challengeId: string; temporaryAccessToken: string }> {
    if (!this.prisma || !this.mailService) throw new Error('OTP login is not configured.');
    const now = new Date();
    const current = await this.prisma.loginChallenge.findFirst({ where: { userId: user.id, status: { in: ['ACTIVE', 'LOCKED'] } }, orderBy: { createdAt: 'desc' } });
    if (current?.status === 'LOCKED' && current.cooldownUntil && current.cooldownUntil > now) {
      throw new UnauthorizedException('Too many OTP attempts. Try again in five minutes.');
    }
    if (current?.status === 'ACTIVE' && current.expiresAt > now && current.temporaryExpiresAt && current.temporaryExpiresAt > now) {
      throw new UnauthorizedException('A verification code is already active. Use the code already sent or wait for it to expire.');
    }
    if (current) await this.prisma.loginChallenge.update({ where: { id: current.id }, data: { status: 'SUPERSEDED', consumed: true, invalidatedAt: now } });
    const code = String(randomInt(100000, 1000000));
    const temporaryAccessToken = randomBytes(32).toString('hex');
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
    } catch (error) {
      await this.prisma.loginChallenge.update({ where: { id: challenge.id }, data: { status: 'MAIL_FAILED', consumed: true, invalidatedAt: new Date() } });
      throw error;
    }
    return { challengeId: challenge.id, temporaryAccessToken };
  }

  async verifyLoginOtp(userId: string, challengeId: string, temporaryAccessToken: string, code: string, fingerprint: string): Promise<boolean> {
    if (!this.prisma) return false;
    const challenge = await this.prisma.loginChallenge.findFirst({ where: { id: challengeId, userId, consumed: false, status: 'ACTIVE' } });
    if (!challenge || challenge.expiresAt <= new Date() || !challenge.temporaryExpiresAt || challenge.temporaryExpiresAt <= new Date() || !challenge.temporaryTokenHash || !this.constantTimeHashMatch(challenge.temporaryTokenHash, temporaryAccessToken)) return false;
    if (challenge.attempts >= 5) {
      await this.prisma.loginChallenge.update({ where: { id: challenge.id }, data: { status: 'LOCKED', consumed: true, cooldownUntil: new Date(Date.now() + 5 * 60 * 1000), invalidatedAt: new Date() } });
      return false;
    }
    await this.prisma.loginChallenge.update({ where: { id: challenge.id }, data: { attempts: { increment: 1 }, lastAttemptAt: new Date() } });
    const codeMatches = this.constantTimeHashMatch(challenge.codeHash, code);
    const fingerprintMatches = this.matchesFingerprint(challenge.fingerprintHash, fingerprint);
    if (!codeMatches || !fingerprintMatches) {
      if (challenge.attempts + 1 >= 5) await this.prisma.loginChallenge.update({ where: { id: challenge.id }, data: { status: 'LOCKED', consumed: true, cooldownUntil: new Date(Date.now() + 5 * 60 * 1000), invalidatedAt: new Date() } });
      return false;
    }
    await this.prisma.$transaction([
      this.prisma.loginChallenge.update({ where: { id: challenge.id }, data: { status: 'USED', consumed: true, consumedAt: new Date(), temporaryTokenHash: null } }),
      this.prisma.user.update({ where: { id: userId }, data: { deviceFingerprintHash: challenge.fingerprintHash } }),
    ]);
    return true;
  }

  async resendLoginOtp(user: AuthenticatedUser, challengeId: string, temporaryAccessToken: string, fingerprint: string): Promise<{ sent: true; retryAfterSeconds: number }> {
    if (!this.prisma || !this.mailService) throw new Error('OTP login is not configured.');
    const now = new Date();
    const waitMinutes = [2, 5, 10, 30, 60];
    const code = String(randomInt(100000, 1000000));
    const challenge = await this.prisma.$transaction(async (transaction) => {
      await transaction.$executeRawUnsafe('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', user.id);
      const current = await transaction.loginChallenge.findFirst({ where: { id: challengeId, userId: user.id, consumed: false, status: 'ACTIVE' } });
      if (!current || current.expiresAt <= now || !current.temporaryExpiresAt || current.temporaryExpiresAt <= now || !current.temporaryTokenHash || !this.constantTimeHashMatch(current.temporaryTokenHash, temporaryAccessToken) || !this.matchesFingerprint(current.fingerprintHash, fingerprint)) throw new UnauthorizedException('The verification challenge is invalid or expired. Sign in again.');
      const attempts = current.attempts ?? 0;
      if (attempts >= 5) throw new UnauthorizedException('This verification code is locked after five failed attempts. Sign in again.');
      if (current.resendAvailableAt && current.resendAvailableAt > now) throw new UnauthorizedException(`Please wait ${Math.ceil((current.resendAvailableAt.getTime() - now.getTime()) / 60000)} minute(s) before requesting another code.`);
      const nextCount = (current.resendCount ?? 0) + 1;
      const resendDelayMinutes = waitMinutes[Math.min(nextCount, waitMinutes.length - 1)] ?? 60;
      return transaction.loginChallenge.update({ where: { id: current.id }, data: { codeHash: this.hashSecret(code), expiresAt: new Date(now.getTime() + 10 * 60 * 1000), resendCount: nextCount, resendAvailableAt: new Date(now.getTime() + resendDelayMinutes * 60 * 1000), attempts: 0 } });
    });
    await this.mailService.sendLoginOtp(user.email, code);
    return { sent: true, retryAfterSeconds: Math.ceil(((challenge.resendAvailableAt?.getTime() ?? now.getTime()) - now.getTime()) / 1000) };
  }

  async refreshPersistent(refreshToken: string, csrfToken: string, fingerprint: string | undefined): Promise<AuthSession | undefined> {
    if (this.redisSession?.enabled) {
      if (!fingerprint) return undefined;
      const sessionId = this.findSessionIdFromRefreshToken(refreshToken);
      if (!sessionId) return undefined;
      const record = await this.redisSession.getBySessionId(sessionId);
      if (!record) return undefined;
      if (await this.redisSession.getActiveSessionId(record.userId) !== sessionId) return undefined;
      const user = await this.getPersistentUserById(record.userId);
      if (!user) return undefined;
      const nextRefreshToken = this.buildRefreshToken(user, sessionId);
      if (!await this.redisSession.rotateSession({ sessionId, refreshToken, nextRefreshToken, nextCsrfToken: csrfToken, fingerprint }, 7 * 24 * 60 * 60)) return undefined;
      const now = Date.now();
      return { sessionId, userId: user.id, role: user.role, expiresAt: now + 15 * 60 * 1000, refreshExpiresAt: now + 7 * 24 * 60 * 60 * 1000, accessToken: this.buildAccessToken(user, sessionId), refreshToken: nextRefreshToken, csrfToken };
    }
    if (!this.prisma) {
      const session = this.getSessionByRefreshToken(refreshToken);
      if (!session || session.refreshExpiresAt <= Date.now()) return undefined;
      if (!this.matchesFingerprint(session.fingerprintHash, fingerprint)) return undefined;
      return this.refreshSession(session.sessionId);
    }
    const existing = await this.prisma.session.findUnique({ where: { refreshTokenHash: this.hashSecret(refreshToken) }, include: { user: true } });
    if (!existing || existing.revoked || existing.refreshExpiresAt <= new Date() || !existing.user.isActive || !this.matchesFingerprint(existing.fingerprintHash, fingerprint)) return undefined;
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
    if (consumed.count !== 1) return undefined;
    return { sessionId: existing.id, userId: user.id, role: user.role, expiresAt: now + 15 * 60 * 1000, refreshExpiresAt: existing.refreshExpiresAt.getTime(), accessToken, refreshToken: rotatedRefreshToken, csrfToken };
  }

  async getRefreshUser(refreshToken: string): Promise<{ user: AuthenticatedUser; fingerprintHash: string | null } | undefined> {
    if (this.redisSession?.enabled) {
      const sessionId = this.findSessionIdFromRefreshToken(refreshToken);
      if (!sessionId) return undefined;
      const record = await this.redisSession.getBySessionId(sessionId);
      const activeSessionId = record ? await this.redisSession.getActiveSessionId(record.userId) : undefined;
      const user = record && activeSessionId === sessionId ? await this.getPersistentUserById(record.userId) : undefined;
      if (!record || !user) return undefined;
      return { user, fingerprintHash: record.fingerprint };
    }
    if (!this.prisma) return undefined;
    const session = await this.prisma.session.findUnique({ where: { refreshTokenHash: this.hashSecret(refreshToken) }, include: { user: true } });
    if (!session || session.revoked || session.refreshExpiresAt <= new Date() || !session.user.isActive) return undefined;
    return { user: this.toAuthenticatedUser(session.user), fingerprintHash: session.fingerprintHash };
  }

  fingerprintMatches(storedHash: string | null | undefined, fingerprint: string | undefined): boolean {
    return this.matchesFingerprint(storedHash, fingerprint);
  }

  async consumeCsrfToken(accessToken: string, cookieToken: string | undefined, headerToken: string | undefined, replacementToken: string): Promise<boolean> {
    if (!cookieToken || !headerToken || cookieToken !== headerToken) return false;
    if (this.redisSession?.enabled) {
      try {
        const payload = verify(accessToken, JWT_SECRET, { issuer: 'jamus-kalimasada', audience: 'janus-web' });
        const sessionId = RedisSessionService.sessionIdFromAccessToken(payload);
        return Boolean(sessionId && await this.redisSession.consumeCsrf(sessionId, cookieToken, headerToken, replacementToken));
      } catch {
        return false;
      }
    }
    if (!this.prisma) return true;
    const session = this.isValidAccessToken(accessToken)
      ? await this.prisma.session.findUnique({ where: { tokenHash: this.hashSecret(accessToken) } })
      : undefined;
    if (!session || session.revoked || session.expiresAt <= new Date() || session.csrfTokenHash !== this.hashSecret(headerToken)) return false;
    const consumed = await this.prisma.session.updateMany({ where: { id: session.id, csrfTokenHash: session.csrfTokenHash, revoked: false, expiresAt: { gt: new Date() } }, data: { csrfTokenHash: this.hashSecret(replacementToken) } });
    return consumed.count === 1;
  }

  private isValidAccessToken(token: string): boolean {
    try {
      verify(token, JWT_SECRET, { issuer: 'jamus-kalimasada', audience: 'janus-web' });
      return true;
    } catch {
      return false;
    }
  }

  async getPersistentUserBySession(accessToken: string): Promise<AuthenticatedUser | undefined> {
    try {
      verify(accessToken, JWT_SECRET, { issuer: 'jamus-kalimasada', audience: 'janus-web' });
    } catch {
      return undefined;
    }

    if (this.redisSession?.enabled) {
      const payload = verify(accessToken, JWT_SECRET, { issuer: 'jamus-kalimasada', audience: 'janus-web' });
      const sessionId = RedisSessionService.sessionIdFromAccessToken(payload);
      if (!sessionId) return undefined;
      const record = await this.redisSession.getBySessionId(sessionId);
      return record && await this.redisSession.getActiveSessionId(record.userId) === sessionId ? this.getPersistentUserById(record.userId) : undefined;
    }
    if (!this.prisma) {
      const session = this.getSessionByAccessToken(accessToken);
      return session ? this.getUserById(session.userId) : undefined;
    }
    const session = await this.prisma.session.findUnique({ where: { tokenHash: this.hashSecret(accessToken) }, include: { user: true } });
    if (!session || session.revoked || session.expiresAt <= new Date() || !session.user.isActive) return undefined;
    return this.toAuthenticatedUser(session.user);
  }

  async revokePersistentSession(accessToken: string): Promise<void> {
    if (this.redisSession?.enabled) {
      try {
        const payload = verify(accessToken, JWT_SECRET, { issuer: 'jamus-kalimasada', audience: 'janus-web' });
        const sessionId = RedisSessionService.sessionIdFromAccessToken(payload);
        if (sessionId) await this.redisSession.revokeSession(sessionId);
      } catch { /* already invalid */ }
      return;
    }
    if (!this.prisma) {
      const session = this.getSessionByAccessToken(accessToken);
      if (session) this.revokeSession(session.sessionId);
      return;
    }
    await this.prisma.session.updateMany({ where: { tokenHash: this.hashSecret(accessToken) }, data: { revoked: true } });
  }

  async listPersistentUsersByRole(role: UserRole, page = 1, limit = 10) {
    if (!this.prisma) return this.listUsersByRole(role, page, limit);
    const safePage = Math.max(1, Number(page) || 1);
    const safeLimit = Math.max(1, Number(limit) || 10);
    const where = { role, isActive: true };
    const [total, users] = await Promise.all([this.prisma.user.count({ where }), this.prisma.user.findMany({ where, skip: (safePage - 1) * safeLimit, take: safeLimit, orderBy: { email: 'asc' } })]);
    return { items: users.map((user) => this.toUserRecord(user)), page: safePage, limit: safeLimit, total, totalPages: Math.max(1, Math.ceil(total / safeLimit)) };
  }

  private hashSecret(value: string): string { return createHash('sha256').update(value).digest('hex'); }

  private findSessionIdFromRefreshToken(refreshToken: string): string | undefined {
    const separator = refreshToken.indexOf('.');
    return separator > 0 ? refreshToken.slice(0, separator) : undefined;
  }

  private async getPersistentUserById(userId: string): Promise<AuthenticatedUser | undefined> {
    if (!this.prisma) return this.getUserById(userId);
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    return user && user.isActive ? this.toAuthenticatedUser(user) : undefined;
  }

  private constantTimeHashMatch(storedHash: string, value: string): boolean {
    const currentHash = this.hashSecret(value);
    return storedHash.length === currentHash.length && timingSafeEqual(Buffer.from(storedHash), Buffer.from(currentHash));
  }

  private hashFingerprint(value: string): string {
    return createHmac('sha256', FINGERPRINT_PEPPER).update(value.trim()).digest('hex');
  }

  private matchesFingerprint(storedHash: string | null | undefined, fingerprint: string | undefined): boolean {
    if (!storedHash) {
      return !fingerprint || fingerprint.trim().length === 0;
    }
    if (!fingerprint) {
      return false;
    }
    const currentHash = this.hashFingerprint(fingerprint);
    return storedHash.length === currentHash.length && timingSafeEqual(Buffer.from(storedHash), Buffer.from(currentHash));
  }

  private toUserRecord(user: { id: string; email: string; passwordHash: string | null; firstName: string | null; lastName: string | null; role: string; isActive: boolean; createdAt: Date; updatedAt: Date }): UserRecord {
    return { id: user.id, email: user.email, passwordHash: user.passwordHash ?? '', firstName: user.firstName ?? '', lastName: user.lastName ?? '', role: user.role as UserRole, isActive: user.isActive, createdAt: user.createdAt, updatedAt: user.updatedAt };
  }

  private toAuthenticatedUser(user: { id: string; email: string; firstName: string | null; lastName: string | null; role: string; isActive: boolean; mustChangePassword?: boolean }): AuthenticatedUser {
    return { id: user.id, email: user.email, role: user.role as UserRole, isActive: user.isActive, mustChangePassword: user.mustChangePassword ?? false, ...(user.firstName ? { firstName: user.firstName } : {}), ...(user.lastName ? { lastName: user.lastName } : {}) };
  }

  private async ensureSeedAdmin(): Promise<void> {
    if (!this.prisma) return;
    const email = this.getSeedAdminEmail();
    const existing = await this.prisma.user.findUnique({ where: { email } });
    if (existing) return;

    const legacy = await this.prisma.user.findUnique({ where: { email: 'admin@janus.local' } });
    if (legacy) {
      await this.prisma.user.update({ where: { id: legacy.id }, data: { email } });
      return;
    }

    await this.prisma.user.create({ data: { id: randomUUID(), email, passwordHash: await this.hashPasswordAsync('P@ssw0rd12345'), firstName: 'System', lastName: 'Administrator', role: 'SUPERADMIN', isActive: true, mustChangePassword: false } });
  }

  getSession(sessionId: string): AuthSession | undefined {
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

  revokeSession(sessionId: string): void {
    const session = this.sessions.get(sessionId);
    if (session?.accessToken) {
      this.blacklistToken(session.accessToken, Math.max(session.expiresAt - Date.now(), 0));
    }
    this.sessions.delete(sessionId);
  }

  authorize(user: AuthenticatedUser, permission: string): boolean {
    if (!user.isActive) {
      return false;
    }
    return hasPermission(user.role, permission);
  }

  requireRole(user: AuthenticatedUser, allowed: UserRole[]): boolean {
    return allowed.includes(user.role);
  }

  getUserByEmail(email: string): UserRecord | undefined {
    return this.users.get(email.trim().toLowerCase());
  }

  getUserById(id: string): UserRecord | undefined {
    for (const user of this.users.values()) {
      if (user.id === id) {
        return user;
      }
    }
    return undefined;
  }

  listUsersByRole(role: UserRole, page = 1, limit = 10): { items: UserRecord[]; page: number; limit: number; total: number; totalPages: number } {
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

  authenticateUser(email: string, password: string, otp?: string): AuthenticatedUser | undefined {
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

  createCsrfToken(): string {
    return randomBytes(32).toString('hex');
  }

  verifyAccessToken(token: string): AuthenticatedUser | undefined {
    if (this.isTokenBlacklisted(token)) {
      return undefined;
    }

    try {
      const decoded = verify(token, JWT_SECRET) as { sub?: string; email?: string; role?: UserRole };
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
    } catch {
      return undefined;
    }
  }

  validateSessionCookie(sessionId: string): boolean {
    const session = this.getSession(sessionId);
    if (!session) {
      return false;
    }

    return !this.isTokenBlacklisted(session.accessToken);
  }

  getSessionByAccessToken(token: string): AuthSession | undefined {
    for (const session of this.sessions.values()) {
      if (session.accessToken === token) {
        return session;
      }
    }
    return undefined;
  }

  getSessionByRefreshToken(token: string): AuthSession | undefined {
    for (const session of this.sessions.values()) {
      if (session.refreshToken === token) {
        return session;
      }
    }
    return undefined;
  }

  refreshSession(sessionId: string): AuthSession | undefined {
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
    const rotatedSessionId = randomUUID();
    session.accessToken = newAccessToken;
    session.expiresAt = Date.now() + 15 * 60 * 1000;
    session.refreshToken = this.buildRefreshToken({ id: session.userId, email: '', role: session.role, isActive: true });
    this.sessions.delete(sessionId);
    session.sessionId = rotatedSessionId;
    this.sessions.set(rotatedSessionId, session);
    return session;
  }
}
