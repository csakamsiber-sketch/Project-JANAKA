import { Body, Controller, ForbiddenException, Get, Param, Patch, Post, Query, Req, UnauthorizedException } from '@nestjs/common';
import { FastifyRequest } from 'fastify';
import { z } from 'zod';
import { FindingsService } from './findings.service';
import { AuthService } from '../auth/auth.service';
import { AUTH_COOKIE_NAME } from '../auth/auth.constants';
import { getRequestCookies } from '../common/request-cookies';

const FindingCreateSchema = z.object({
  applicationId: z.string().min(1),
  verificationPeriodId: z.string().min(1),
  source: z.string().min(1),
  title: z.string().min(1),
  description: z.string().min(1),
  severity: z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL', 'INFO']),
  status: z.enum(['OPEN', 'UNDER_REVIEW', 'MITIGATED', 'FIXED', 'FALSE_POSITIVE', 'ACCEPTED_RISK']).default('OPEN'),
  affectedComponent: z.string().min(1),
  cve: z.string().optional().transform((value) => value ?? undefined),
  evidence: z.string().optional().transform((value) => value ?? undefined),
  recommendation: z.string().optional().transform((value) => value ?? undefined),
  createdBy: z.string().min(1),
});

const FindingCheckCveSchema = z.object({
  applicationId: z.string().min(1),
  verificationPeriodId: z.string().optional().transform((value) => value ?? 'system'),
  title: z.string().min(1),
  description: z.string().min(1),
  severity: z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL', 'INFO']),
  affectedComponent: z.string().min(1),
  source: z.string().min(1).default('OSV_CHECK'),
  createdBy: z.string().min(1),
  packageName: z.string().optional().transform((value) => value ?? undefined),
  version: z.string().optional().transform((value) => value ?? undefined),
});

@Controller('findings')
export class FindingsController {
  constructor(private readonly findingsService: FindingsService, private readonly authService: AuthService) {}

  private async requireUser(req: FastifyRequest) {
    const token = getRequestCookies(req)[AUTH_COOKIE_NAME];
    const user = token ? await this.authService.getPersistentUserBySession(token) : undefined;
    if (!user) throw new UnauthorizedException('Authentication is required.');
    return user;
  }

  @Get()
  list(@Query('page') page?: string, @Query('limit') limit?: string, @Query('applicationId') applicationId?: string, @Query('severity') severity?: string) {
    const payload: { page?: number | undefined; limit?: number | undefined; applicationId?: string | undefined; severity?: string | undefined } = {
      page: page && Number(page) > 0 ? Number(page) : 1,
      limit: limit && Number(limit) > 0 ? Number(limit) : 10,
    };

    const sanitizedApplicationId = applicationId?.trim();
    const sanitizedSeverity = severity?.trim();

    if (sanitizedApplicationId) payload.applicationId = sanitizedApplicationId;
    if (sanitizedSeverity) payload.severity = sanitizedSeverity.toUpperCase();
    
    return this.findingsService.listFindings(payload);
  }

  @Post('check-cve')
  async checkCve(@Body() body: unknown, @Req() req: FastifyRequest) {
    const user = await this.requireUser(req);
    if (!['SUPERADMIN', 'OVERSEER', 'VERIFICATOR'].includes(user.role)) throw new ForbiddenException('This role cannot check CVEs.');
    const dto = FindingCheckCveSchema.parse(body);
    const payload: {
      applicationId: string;
      verificationPeriodId: string;
      title: string;
      description: string;
      severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL' | 'INFO';
      affectedComponent: string;
      source: string;
      createdBy: string;
      packageName?: string | undefined;
      version?: string | undefined;
    } = {
      applicationId: dto.applicationId,
      verificationPeriodId: dto.verificationPeriodId,
      title: dto.title,
      description: dto.description,
      severity: dto.severity,
      affectedComponent: dto.affectedComponent,
      source: dto.source,
      createdBy: dto.createdBy,
    };
    if (dto.packageName) payload.packageName = dto.packageName;
    if (dto.version) payload.version = dto.version;
    return this.findingsService.checkCve(payload);
  }

  @Post()
  async create(@Body() body: unknown, @Req() req: FastifyRequest) {
    const user = await this.requireUser(req);
    if (!['SUPERADMIN', 'OVERSEER', 'VERIFICATOR'].includes(user.role)) throw new ForbiddenException('This role cannot create findings.');
    const dto = FindingCreateSchema.parse(body) as any;
    return this.findingsService.createFinding(dto);
  }

  @Patch(':id/status')
  async updateStatus(@Param('id') id: string, @Body() body: unknown, @Req() req: FastifyRequest) {
    const user = await this.requireUser(req);
    if (!['SUPERADMIN', 'OVERSEER', 'VERIFICATOR'].includes(user.role)) throw new ForbiddenException('This role cannot update findings.');
    const dto = z.object({ status: z.enum(['OPEN', 'UNDER_REVIEW', 'MITIGATED', 'FIXED', 'FALSE_POSITIVE', 'ACCEPTED_RISK']) }).parse(body);
    return this.findingsService.updateStatus(id, dto.status);
  }
}
