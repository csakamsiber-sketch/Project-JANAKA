import { Controller, Get, Param, Post, Req, ForbiddenException } from '@nestjs/common';
import { FastifyRequest } from 'fastify';
import { AuthService } from '../auth/auth.service';
import { AUTH_COOKIE_NAME } from '../auth/auth.constants';
import { getRequestCookies } from '../common/request-cookies';
import { SyncService } from './sync.service';

@Controller('sync')
export class SyncController {
  constructor(private readonly auth: AuthService, private readonly sync: SyncService) {}

  @Post('master-data')
  async masterDataSync(@Req() req: FastifyRequest) {
    const user = await this.user(req);
    return { data: this.sync.start(user.id, 'master-data'), meta: {} };
  }

  private async user(req: FastifyRequest) {
    const token = getRequestCookies(req)[AUTH_COOKIE_NAME];
    const user = token ? await this.auth.getPersistentUserBySession(token) : undefined;
    if (!user) throw new ForbiddenException('Authentication is required.');
    if (!['SUPERADMIN', 'OVERSEER'].includes(user.role)) throw new ForbiddenException('Only administrators can run synchronization.');
    return user;
  }

  @Post(':kind')
  async start(@Param('kind') kind: string, @Req() req: FastifyRequest) {
    const user = await this.user(req);
    if (kind !== 'applications' && kind !== 'findings') throw new ForbiddenException('Unsupported synchronization type.');
    return { data: this.sync.start(user.id, kind), meta: {} };
  }

  @Get(':jobId')
  async status(@Param('jobId') jobId: string, @Req() req: FastifyRequest) {
    const user = await this.user(req);
    return { data: this.sync.get(user.id, jobId), meta: {} };
  }
}