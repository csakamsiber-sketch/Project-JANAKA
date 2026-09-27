import { BadRequestException, Body, Controller, ForbiddenException, Get, HttpCode, Param, Post, Query, Req, Res, UnauthorizedException } from '@nestjs/common';
import { Patch } from '@nestjs/common';
import { FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import {
  AUTH_COOKIE_NAME,
  AUTH_COOKIE_SAME_SITE,
  REFRESH_COOKIE_PATH,
  AUTH_CSRF_COOKIE_NAME,
  AUTH_REFRESH_COOKIE_NAME,
  IS_SECURE_COOKIE,
  REFRESH_COOKIE_MAX_AGE_MS,
  CSRF_COOKIE_MAX_AGE_MS,
} from './auth.constants';
import { AuthService } from './auth.service';
import { AuthenticatedUser } from './auth.types';
import { BotProtectionService } from '../security/bot-protection.service';
import { getRequestCookies } from '../common/request-cookies';
import { getRequestAccessToken } from '../common/request-cookies';

const LoginSchema = z.object({
  email: z.string().email().max(254),
  password: z.string().min(12).max(128),
  otp: z.string().min(6).max(8).optional(),
  challengeId: z.string().uuid().optional(),
  temporaryAccessToken: z.string().length(64).optional(),
  botToken: z.string().min(1).optional(),
  fingerprint: z.string().min(8).max(256).optional(),
  role: z.enum(['SUPERADMIN', 'OVERSEER', 'VERIFICATOR', 'PIC']).optional(),
});

const RegisterSchema = z.object({
  email: z.string().email().max(254),
  firstName: z.string().min(2).max(80),
  lastName: z.string().min(2).max(80),
  role: z.enum(['SUPERADMIN', 'OVERSEER', 'VERIFICATOR', 'PIC']),
});

const ResetRequestSchema = z.object({
  email: z.string().email().max(254),
});

const ResetPasswordSchema = z.object({
  token: z.string().min(16).max(256),
  password: z.string().min(12).max(128),
});

const id = (value: string | undefined) => value ?? 'unknown';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService, private readonly botProtection: BotProtectionService) {}

  @Post('register')
  async register(@Body() body: unknown) {
    const parsed = RegisterSchema.parse(body) as { email: string; firstName: string; lastName: string; role: 'SUPERADMIN' | 'OVERSEER' | 'VERIFICATOR' | 'PIC' };
    let registrationRequest;
    try {
      registrationRequest = await this.authService.createRegistrationRequest(parsed);
    } catch (error) {
      throw new BadRequestException(error instanceof Error ? error.message : 'Unable to submit registration request.');
    }
    return { data: { registrationRequestId: registrationRequest.id, status: registrationRequest.status }, meta: {} };
  }

  @Post('approve-registration')
  async approveRegistration(@Body() body: unknown, @Req() req: FastifyRequest) {
    const accessToken = getRequestAccessToken(req) ?? getRequestCookies(req)[AUTH_COOKIE_NAME];
    const user = accessToken ? await this.authService.getPersistentUserBySession(accessToken) : undefined;
    if (!user) throw new UnauthorizedException('Authentication is required.');
    if (user.role !== 'SUPERADMIN') throw new ForbiddenException('Only SUPERADMIN can approve registrations.');
    const dto = z.object({ requestId: z.string().min(1) }).parse(body);
    const request = await this.authService.approveRegistrationRequest(dto.requestId);
    if (!request) {
      throw new UnauthorizedException('Registration request not found.');
    }

    return { data: { approved: true, email: request.email, role: request.role }, meta: {} };
  }

  @Post('login')
  @HttpCode(200)
  async login(@Body() body: unknown, @Req() req: FastifyRequest, @Res({ passthrough: true }) res: FastifyReply) {
    const parsed = LoginSchema.parse(body);
    await this.botProtection.verify(parsed.botToken, req.ip);
    const user = await this.authService.authenticateUserPersistent(parsed.email, parsed.password, parsed.otp);
    if (!user) {
      throw new UnauthorizedException('Invalid email, password, or MFA code.');
    }

    const fingerprint = (parsed.fingerprint ?? req.headers['x-fingerprint'] ?? '').toString().trim();
    const hasDevice = await this.authService.hasRegisteredDevice(user.id);
    if (fingerprint && !hasDevice) await this.authService.rememberDevice(user.id, fingerprint);
    if (fingerprint && hasDevice && await this.authService.requiresLoginOtp(user.id, fingerprint)) {
      if (!parsed.otp || !parsed.challengeId || !parsed.temporaryAccessToken || !(await this.authService.verifyLoginOtp(user.id, parsed.challengeId, parsed.temporaryAccessToken, parsed.otp, fingerprint))) {
        if (parsed.otp || parsed.challengeId || parsed.temporaryAccessToken) throw new UnauthorizedException('Invalid or expired verification code.');
        const challenge = await this.authService.issueLoginOtp(user, fingerprint);
        return { data: { requiresOtp: true, challengeId: challenge.challengeId, temporaryAccessToken: challenge.temporaryAccessToken }, meta: {} };
      }
    }
    const csrfToken = this.authService.createCsrfToken();
    const session = await this.authService.createSessionPersistent(user, fingerprint, csrfToken);

    res.setCookie(AUTH_COOKIE_NAME, session.accessToken, {
      httpOnly: true,
      secure: IS_SECURE_COOKIE,
      sameSite: AUTH_COOKIE_SAME_SITE as 'strict',
      maxAge: 15 * 60,
      path: '/',
    });
    res.setCookie(AUTH_REFRESH_COOKIE_NAME, session.refreshToken, {
      httpOnly: true,
      secure: IS_SECURE_COOKIE,
      sameSite: AUTH_COOKIE_SAME_SITE as 'strict',
      maxAge: REFRESH_COOKIE_MAX_AGE_MS / 1000,
      path: REFRESH_COOKIE_PATH,
    });

    res.setCookie(AUTH_CSRF_COOKIE_NAME, csrfToken, {
      httpOnly: false,
      secure: IS_SECURE_COOKIE,
      sameSite: AUTH_COOKIE_SAME_SITE as 'strict',
      maxAge: CSRF_COOKIE_MAX_AGE_MS / 1000,
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
      meta: { requestId: id(req.headers['x-request-id'] as string | undefined) },
    };
  }

  @Post('login/resend-otp')
  async resendLoginOtp(@Body() body: unknown, @Req() req: FastifyRequest) {
    const dto = z.object({ email: z.string().email(), password: z.string().min(1).max(128), challengeId: z.string().uuid(), temporaryAccessToken: z.string().min(32), fingerprint: z.string().min(1), botToken: z.string().min(1) }).parse(body);
    await this.botProtection.verify(dto.botToken, req.ip);
    const user = await this.authService.authenticateUserPersistent(dto.email, dto.password);
    if (!user) throw new UnauthorizedException('The sign-in credentials are invalid.');
    return { data: await this.authService.resendLoginOtp(user, dto.challengeId, dto.temporaryAccessToken, dto.fingerprint), meta: {} };
  }

  @Post('refresh')
  async refresh(@Body() body: unknown, @Req() req: FastifyRequest, @Res({ passthrough: true }) res: FastifyReply) {
    const refreshToken = getRequestCookies(req)[AUTH_REFRESH_COOKIE_NAME];
    if (!refreshToken) {
      console.warn('[auth] refresh rejected: missing refresh cookie on request');
      throw new UnauthorizedException('Missing refresh token.');
    }

    const refreshUser = await this.authService.getRefreshUser(refreshToken);
    if (!refreshUser) {
      console.warn('[auth] refresh rejected: refresh token invalid or expired for this session');
      throw new UnauthorizedException('Invalid or expired refresh token.');
    }

    const csrfToken = this.authService.createCsrfToken();
    const fingerprint = (req.headers['x-fingerprint'] ?? '').toString().trim();
    if (refreshUser.fingerprintHash && !this.authService.fingerprintMatches(refreshUser.fingerprintHash, fingerprint)) {
      console.warn('[auth] refresh rejected: fingerprint mismatch for active session');
      throw new UnauthorizedException('Invalid or expired refresh token or fingerprint mismatch.');
    }

    const updatedSession = await this.authService.refreshPersistent(refreshToken, csrfToken, fingerprint);
    if (!updatedSession) {
      throw new UnauthorizedException('Invalid or expired refresh token or fingerprint mismatch.');
    }

    res.setCookie(AUTH_COOKIE_NAME, updatedSession.accessToken, {
      httpOnly: true,
      secure: IS_SECURE_COOKIE,
      sameSite: AUTH_COOKIE_SAME_SITE as 'strict',
      maxAge: 15 * 60,
      path: '/',
    });
    res.setCookie(AUTH_REFRESH_COOKIE_NAME, updatedSession.refreshToken, {
      httpOnly: true,
      secure: IS_SECURE_COOKIE,
      sameSite: AUTH_COOKIE_SAME_SITE as 'strict',
      maxAge: REFRESH_COOKIE_MAX_AGE_MS / 1000,
      path: REFRESH_COOKIE_PATH,
    });
    res.setCookie(AUTH_CSRF_COOKIE_NAME, csrfToken, {
      httpOnly: false,
      secure: IS_SECURE_COOKIE,
      sameSite: AUTH_COOKIE_SAME_SITE as 'strict',
      maxAge: CSRF_COOKIE_MAX_AGE_MS / 1000,
      path: '/',
    });
    return {
      data: {
        rotated: true,
      },
      meta: {},
    };
  }

  @Post('forgot-password')
  forgotPassword(@Body() body: unknown) {
    const parsed = ResetRequestSchema.parse(body);
    const reset = this.authService.requestPasswordReset(parsed.email);
    return {
      data: { sent: true, token: reset.token, expiresAt: reset.expiresAt },
      meta: {},
    };
  }

  @Post('reset-password')
  resetPassword(@Body() body: unknown) {
    const parsed = ResetPasswordSchema.parse(body);
    const success = this.authService.resetPassword(parsed.token, parsed.password);
    if (!success) {
      throw new UnauthorizedException('Invalid or expired reset token.');
    }

    return { data: { reset: true }, meta: {} };
  }

  @Post('logout')
  async logout(@Req() req: FastifyRequest, @Res({ passthrough: true }) res: FastifyReply) {
    const cookies = getRequestCookies(req);
    const accessToken = getRequestAccessToken(req) ?? cookies[AUTH_COOKIE_NAME];
    if (accessToken) {
      await this.authService.revokePersistentSession(accessToken);
    }

    const refreshToken = cookies[AUTH_REFRESH_COOKIE_NAME];
    if (refreshToken) {
      this.authService.blacklistToken(refreshToken, 30 * 24 * 60 * 60 * 1000);
    }

    res.clearCookie(AUTH_COOKIE_NAME, { path: '/' });
    res.clearCookie(AUTH_REFRESH_COOKIE_NAME, { path: REFRESH_COOKIE_PATH });
    res.clearCookie(AUTH_CSRF_COOKIE_NAME, { path: '/' });
    return { data: { loggedOut: true }, meta: {} };
  }

  @Post('verify-password')
  async verifyPassword(@Body() body: unknown, @Req() req: FastifyRequest) {
    const password = z.object({ password: z.string().min(12).max(128) }).parse(body).password;
    const accessToken = getRequestAccessToken(req) ?? getRequestCookies(req)[AUTH_COOKIE_NAME];
    if (!accessToken) throw new UnauthorizedException('Authentication is required.');
    const user = await this.authService.verifyPasswordForSession(accessToken, password);
    if (!user) throw new UnauthorizedException('Password confirmation failed.');
    return { data: { verified: true, role: user.role }, meta: {} };
  }

  @Post('change-password')
  async changePassword(@Body() body: unknown, @Req() req: FastifyRequest, @Res({ passthrough: true }) res: FastifyReply) {
    const dto = z.object({ currentPassword: z.string().min(1).max(128), newPassword: z.string().min(12).max(128), confirmPassword: z.string().min(12).max(128) }).parse(body);
    if (dto.newPassword !== dto.confirmPassword) {
      throw new BadRequestException('New password and confirmation password must match.');
    }

    const accessToken = getRequestAccessToken(req) ?? getRequestCookies(req)[AUTH_COOKIE_NAME];
    if (!accessToken || !await this.authService.changePassword(accessToken, dto.currentPassword, dto.newPassword)) {
      throw new UnauthorizedException('Password change failed.');
    }

    res.clearCookie(AUTH_COOKIE_NAME, { path: '/' });
    res.clearCookie(AUTH_REFRESH_COOKIE_NAME, { path: REFRESH_COOKIE_PATH });
    res.clearCookie(AUTH_CSRF_COOKIE_NAME, { path: '/' });

    return { data: { changed: true }, meta: {} };
  }

  @Get('users')
  async getUsers(@Query('role') role?: string, @Query('page') page?: string, @Query('limit') limit?: string, @Req() req?: FastifyRequest) {
    const accessToken = req ? (getRequestAccessToken(req) ?? getRequestCookies(req)[AUTH_COOKIE_NAME]) : undefined;
    const requester = accessToken ? await this.authService.getPersistentUserBySession(accessToken) : undefined;
    if (!requester || !['SUPERADMIN', 'OVERSEER', 'VERIFICATOR'].includes(requester.role)) throw new ForbiddenException('Only authorized assurance users can list users.');
    const normalizedRole = (role ?? 'PIC') as 'SUPERADMIN' | 'OVERSEER' | 'VERIFICATOR' | 'PIC';
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

  @Get('user-management/users')
  async manageUsers(@Req() req: FastifyRequest, @Query('page') page?: string) {
    const user = await this.requireUser(req);
    this.requireManagementRole(user.role);
    return { data: await this.authService.listPersistentUsers(Number(page) || 1), meta: {} };
  }

  @Get('user-management/registrations')
  async registrationRequests(@Req() req: FastifyRequest, @Query('page') page?: string) {
    const user = await this.requireUser(req);
    this.requireManagementRole(user.role);
    return { data: await this.authService.listRegistrationRequests(Number(page) || 1), meta: {} };
  }

  @Post('user-management/registrations/:id/reject')
  async rejectRegistration(@Param('id') requestId: string, @Req() req: FastifyRequest) {
    const user = await this.requireUser(req);
    this.requireManagementRole(user.role);
    if (!await this.authService.rejectRegistrationRequest(requestId)) throw new UnauthorizedException('Registration request not found.');
    return { data: { rejected: true }, meta: {} };
  }

  @Post('user-management/actions/request-otp')
  async requestUserActionOtp(@Body() body: unknown, @Req() req: FastifyRequest) {
    const user = await this.requireUser(req);
    this.requireManagementRole(user.role);
    const dto = z.object({ targetId: z.string().uuid(), action: z.enum(['DEACTIVATE', 'PROMOTE_ADMIN']) }).parse(body);
    if (dto.action === 'PROMOTE_ADMIN' && user.role !== 'SUPERADMIN') throw new ForbiddenException('Only administrators can promote another administrator.');
    await this.authService.requestAdminActionOtp(user.id, dto.targetId, dto.action);
    return { data: { sent: true }, meta: {} };
  }

  @Post('user-management/actions/resend-otp')
  async resendUserActionOtp(@Body() body: unknown, @Req() req: FastifyRequest) {
    const user = await this.requireUser(req);
    this.requireManagementRole(user.role);
    const dto = z.object({ targetId: z.string().uuid(), action: z.enum(['DEACTIVATE', 'PROMOTE_ADMIN']) }).parse(body);
    if (dto.action === 'PROMOTE_ADMIN' && user.role !== 'SUPERADMIN') throw new ForbiddenException('Only administrators can promote another administrator.');
    return { data: await this.authService.resendAdminActionOtp(user.id, dto.targetId, dto.action), meta: {} };
  }

  @Post('user-management/actions/confirm')
  async confirmUserAction(@Body() body: unknown, @Req() req: FastifyRequest) {
    const user = await this.requireUser(req);
    this.requireManagementRole(user.role);
    const dto = z.object({ targetId: z.string().uuid(), action: z.enum(['DEACTIVATE', 'PROMOTE_ADMIN']), code: z.string().length(6) }).parse(body);
    if (dto.action === 'PROMOTE_ADMIN' && user.role !== 'SUPERADMIN') throw new ForbiddenException('Only administrators can promote another administrator.');
    const result = await this.authService.confirmAdminActionOtp(user.id, dto.targetId, dto.action, dto.code);
    if (!result.valid) {
      throw new UnauthorizedException(result.locked ? 'Verification code locked after five failed attempts. Start the action again.' : `Invalid verification code. ${result.attemptsRemaining} attempt(s) remaining.`);
    }
    return { data: { completed: true }, meta: {} };
  }

  @Get('user-management/superadmin-downgrade-approvals')
  async superadminDowngradeApprovals(@Req() req: FastifyRequest) {
    const user = await this.requireUser(req);
    if (user.role !== 'SUPERADMIN') throw new ForbiddenException('Only superadmins can approve a superadmin downgrade.');
    return { data: await this.authService.listPendingSuperadminDowngradeApprovals(user.id), meta: {} };
  }

  @Post('user-management/users/:id/downgrade')
  async requestSuperadminDowngrade(@Param('id') targetId: string, @Body() body: unknown, @Req() req: FastifyRequest) {
    const user = await this.requireUser(req);
    if (user.role !== 'SUPERADMIN') throw new ForbiddenException('Only superadmins can request a superadmin downgrade.');
    const requestedRole = z.enum(['OVERSEER', 'VERIFICATOR', 'PIC']).parse((body as { role?: unknown })?.role);
    try {
      return { data: await this.authService.requestSuperadminDowngrade(user.id, targetId, requestedRole), meta: {} };
    } catch (error) {
      throw new BadRequestException(error instanceof Error ? error.message : 'Unable to request superadmin downgrade.');
    }
  }

  @Post('user-management/superadmin-downgrade-approvals/:id/confirm')
  async confirmSuperadminDowngrade(@Param('id') requestId: string, @Body() body: unknown, @Req() req: FastifyRequest) {
    const user = await this.requireUser(req);
    if (user.role !== 'SUPERADMIN') throw new ForbiddenException('Only superadmins can approve a superadmin downgrade.');
    const code = z.object({ code: z.string().length(6) }).parse(body).code;
    const result = await this.authService.approveSuperadminDowngrade(user.id, requestId, code);
    if (!result.accepted) {
      throw new UnauthorizedException('Invalid or expired verification code.');
    }
    return { data: result, meta: {} };
  }

  @Post('user-management/superadmin-downgrade-approvals/:id/resend-otp')
  async resendSuperadminDowngradeOtp(@Param('id') requestId: string, @Req() req: FastifyRequest) {
    const user = await this.requireUser(req);
    if (user.role !== 'SUPERADMIN') throw new ForbiddenException('Only superadmins can resend this approval code.');
    return { data: await this.authService.resendSuperadminDowngradeOtp(user.id, requestId), meta: {} };
  }

  @Patch('user-management/users/:id/role')
  async changeUserRole(@Param('id') targetId: string, @Body() body: unknown, @Req() req: FastifyRequest) {
    const user = await this.requireUser(req);
    this.requireManagementRole(user.role);
    const role = z.enum(['SUPERADMIN', 'OVERSEER', 'VERIFICATOR', 'PIC']).parse((body as { role?: unknown })?.role);
    if (role === 'SUPERADMIN') throw new ForbiddenException('Promoting an administrator requires OTP verification.');
    if (role === 'OVERSEER' && user.role !== 'SUPERADMIN') throw new ForbiddenException('Only administrators can assign the overseer role.');
    try {
      await this.authService.changeUserRole(targetId, role);
    } catch (error) {
      throw new ForbiddenException(error instanceof Error ? error.message : 'Unable to update user role.');
    }
    return { data: { updated: true, role }, meta: {} };
  }

  @Get('me')
  async me(@Req() req: FastifyRequest) {
    const accessToken = getRequestAccessToken(req) ?? getRequestCookies(req)[AUTH_COOKIE_NAME];
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

  private async requireUser(req: FastifyRequest) {
    const accessToken = getRequestAccessToken(req) ?? getRequestCookies(req)[AUTH_COOKIE_NAME];
    const user = accessToken ? await this.authService.getPersistentUserBySession(accessToken) : undefined;
    if (!user) throw new UnauthorizedException('Authentication is required.');
    return user;
  }

  private requireManagementRole(role: string): void {
    if (role !== 'SUPERADMIN') throw new ForbiddenException('Only superadmins can access user management.');
  }
}
