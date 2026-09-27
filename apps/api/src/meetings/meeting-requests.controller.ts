import { Body, Controller, Delete, Get, Param, Patch, Post, Query, Req, ForbiddenException } from '@nestjs/common';
import { FastifyRequest } from 'fastify';
import { z } from 'zod';
import { MeetingRequestsService } from './meeting-requests.service';
import { AuthService } from '../auth/auth.service';
import { AUTH_COOKIE_NAME } from '../auth/auth.constants';
import { getRequestCookies } from '../common/request-cookies';

const MeetingRequestSchema = z.object({
  id: z.string().min(1),
  applicationId: z.string().min(1),
  requestedBy: z.string().min(1),
  verificatorId: z.string().optional().transform((value) => value ?? undefined),
  title: z.string().min(1),
  agenda: z.string().min(1),
  proposedStart: z.string().min(1),
  proposedEnd: z.string().min(1),
  status: z.enum(['PENDING', 'APPROVED', 'REJECTED', 'CANCELLED', 'RESCHEDULED']).default('PENDING'),
  notes: z.string().optional().transform((value) => value ?? undefined),
});

@Controller('meetings')
export class MeetingRequestsController {
  constructor(private readonly meetingRequestsService: MeetingRequestsService, private readonly authService: AuthService) {}

  private async currentUser(req: FastifyRequest) {
    const accessToken = getRequestCookies(req)[AUTH_COOKIE_NAME];
    const user = accessToken ? await this.authService.getPersistentUserBySession(accessToken) : undefined;
    if (!user) throw new ForbiddenException('Authentication is required.');
    return user;
  }

  @Get('schedules')
  async listSchedules(@Query('period') period: string | undefined, @Query('verificatorId') verificatorId: string | undefined, @Query('page') page: string | undefined, @Query('limit') limit: string | undefined, @Req() req: FastifyRequest) {
    const user = await this.currentUser(req);
    const dto = z.object({
      period: z.enum(['today', 'week', 'month', 'all']).default('today'),
      verificatorId: z.string().uuid().optional(),
      page: z.coerce.number().int().min(1).default(1),
      limit: z.coerce.number().int().min(1).max(50).default(10),
    }).parse({ period, verificatorId, page, limit }) as { period: 'today' | 'week' | 'month' | 'all'; verificatorId?: string; page: number; limit: number };
    return this.meetingRequestsService.listSchedules(user.id, user.role, dto);
  }

  @Get('schedules/options')
  async listScheduleOptions(@Req() req: FastifyRequest) {
    const user = await this.currentUser(req);
    if (!['SUPERADMIN', 'OVERSEER'].includes(user.role)) throw new ForbiddenException('Only administrators and overseers can view scheduling options.');
    return this.meetingRequestsService.listScheduleOptions();
  }

  @Post('schedules')
  async createSchedule(@Body() body: unknown, @Req() req: FastifyRequest) {
    const user = await this.currentUser(req);
    if (!['SUPERADMIN', 'OVERSEER'].includes(user.role)) throw new ForbiddenException('Only administrators and overseers can schedule meetings.');
    const dto = z.object({ applicationId: z.string().uuid(), verificatorId: z.string().uuid(), startAt: z.string().datetime(), endAt: z.string().datetime(), purpose: z.string().min(1).max(500), timezone: z.string().max(80).optional(), forceConflictOverride: z.boolean().optional() }).parse(body) as { applicationId: string; verificatorId: string; startAt: string; endAt: string; purpose: string; timezone?: string; forceConflictOverride?: boolean };
    return this.meetingRequestsService.createSchedule({ ...dto, ...(dto.timezone ? { timezone: dto.timezone } : {}), createdById: user.id } as any);
  }

  @Patch('schedules/:id')
  async updateSchedule(@Param('id') id: string, @Body() body: unknown, @Req() req: FastifyRequest) {
    const user = await this.currentUser(req);
    if (!['SUPERADMIN', 'OVERSEER'].includes(user.role)) throw new ForbiddenException('Only administrators and overseers can edit meetings.');
    const dto = z.object({ applicationId: z.string().uuid().optional(), verificatorId: z.string().uuid().optional(), startAt: z.string().datetime().optional(), endAt: z.string().datetime().optional(), purpose: z.string().min(1).max(500).optional(), timezone: z.string().max(80).optional(), forceConflictOverride: z.boolean().optional() }).parse(body ?? {});
    return this.meetingRequestsService.updateSchedule(id, dto);
  }

  @Delete('schedules/:id')
  async deleteSchedule(@Param('id') id: string, @Req() req: FastifyRequest) {
    const user = await this.currentUser(req);
    if (!['SUPERADMIN', 'OVERSEER'].includes(user.role)) throw new ForbiddenException('Only administrators and overseers can delete meetings.');
    return this.meetingRequestsService.deleteSchedule(id);
  }

  @Post('schedules/:id/start')
  async startSchedule(@Param('id') id: string, @Req() req: FastifyRequest) {
    const user = await this.currentUser(req);
    return this.meetingRequestsService.startSchedule(id, user.id, user.role);
  }

  @Post('schedules/:id/finish')
  async finishSchedule(@Param('id') id: string, @Body() body: unknown, @Req() req: FastifyRequest) {
    const user = await this.currentUser(req);
    const dto = z.object({ notes: z.string().max(4000).optional() }).parse(body ?? {});
    return this.meetingRequestsService.finishSchedule(id, user.id, user.role, dto.notes);
  }

  @Get('application/:applicationId/results')
  listApplicationResults(@Param('applicationId') applicationId: string) {
    return this.meetingRequestsService.listApplicationResults(applicationId);
  }

  @Get('reports')
  async report(@Query('month') month: string, @Query('year') year: string, @Req() req: FastifyRequest) {
    const user = await this.currentUser(req);
    const parsed = z.object({ month: z.coerce.number().int().min(1).max(12), year: z.coerce.number().int().min(2000).max(2100) }).parse({ month, year });
    return this.meetingRequestsService.generateReport(user.id, user.role, parsed.month, parsed.year);
  }

  @Get('requests')
  listRequests() {
    return this.meetingRequestsService.listRequests();
  }

  @Post('requests')
  async createRequest(@Body() body: unknown, @Req() req: FastifyRequest) {
    const user = await this.currentUser(req);
    if (!['PIC', 'VERIFICATOR', 'SUPERADMIN', 'OVERSEER'].includes(user.role)) throw new ForbiddenException('This role cannot request meetings.');
    const dto = MeetingRequestSchema.parse(body) as {
      id: string;
      applicationId: string;
      requestedBy: string;
      verificatorId?: string;
      title: string;
      agenda: string;
      proposedStart: string;
      proposedEnd: string;
      status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'CANCELLED' | 'RESCHEDULED';
      notes?: string;
    };
    return this.meetingRequestsService.createRequest(dto as any);
  }

  @Patch('requests/:id')
  async updateRequest(@Param('id') id: string, @Body() body: unknown, @Req() req: FastifyRequest) {
    const user = await this.currentUser(req);
    if (!['SUPERADMIN', 'OVERSEER'].includes(user.role)) throw new ForbiddenException('Only administrators and overseers can update meeting requests.');
    const dto = z.object({ status: z.enum(['PENDING', 'APPROVED', 'REJECTED', 'CANCELLED', 'RESCHEDULED']), notes: z.string().optional() }).parse(body);
    return this.meetingRequestsService.updateRequest(id, dto.status, dto.notes);
  }
}
