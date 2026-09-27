import { BadRequestException, Body, Controller, Delete, ForbiddenException, Get, Param, Post, Put, Query, Req, UnauthorizedException } from '@nestjs/common';
import { FastifyRequest } from 'fastify';
import { AUTH_COOKIE_NAME } from '../auth/auth.constants';
import { AuthService } from '../auth/auth.service';
import { z } from 'zod';
import { ApplicationsService } from './applications.service';
import { getRequestCookies } from '../common/request-cookies';
import { applyVerificationDocumentSettings } from './verification-document.config';

const SpreadsheetLinkSchema = z.object({
  type: z.enum(['WEB_FE', 'WEB_BE', 'MOBILE', 'CR_UPDATE']),
  label: z.string().min(1).max(120),
  url: z.string().url().max(2048),
});

const VerificationProgressSchema = z.object({
  percent: z.number().min(0).max(100),
  lastUpdated: z.string().min(1),
  lastVerifier: z.string().min(1).max(120),
  status: z.enum(['NOT_STARTED', 'IN_PROGRESS', 'APPROVED', 'REJECTED']),
  notes: z.string().max(2000).optional(),
  totalPoints: z.number().positive().optional(),
});

const VerificationDocumentSchema = z.object({
  type: z.enum(['MOBILE_CHECKLIST', 'WEB_CHECKLIST', 'NEW_FEATURE_BUG_FIXING', 'CUSTOM_DOCUMENT']),
  label: z.string().min(1).max(120),
  url: z.string().url().max(2048),
});

const LibrarySchema = z.object({
  name: z.string().min(1).max(120),
  version: z.string().min(1).max(120).default('unknown'),
  ecosystem: z.string().max(30).optional(),
  source: z.string().max(120).optional(),
  layer: z.enum(['frontend', 'backend']).default('backend'),
});

const DependencyFileSchema = z.object({ name: z.string().min(1).max(255), content: z.string().max(12_000_000), layer: z.enum(['frontend', 'backend']).optional() });

const ApplicationCreateSchema = z.object({
  name: z.string().min(1).max(255),
  description: z.string().max(4000).optional(),
  organization: z.string().min(1).optional(),
  environment: z.enum(['DEV', 'STAGING', 'PRODUCTION']).default('STAGING'),
  language: z.string().min(1).max(80).optional(),
  framework: z.string().min(1).max(80).optional(),
  languageFrontend: z.string().min(1).max(80).optional(),
  languageBackend: z.string().min(1).max(80).optional(),
  frameworkFrontend: z.string().min(1).max(80).optional(),
  frameworkBackend: z.string().min(1).max(80).optional(),
  technologyStack: z.array(z.string()).default([]),
  libraries: z.array(LibrarySchema).default([]),
  dependencyFiles: z.array(DependencyFileSchema).max(40).optional(),
  projectStartDate: z.string().min(1),
  owner: z.string().min(1),
  picId: z.string().optional(),
  picName: z.string().optional(),
  developerIds: z.array(z.string()).default([]),
  googleSheetId: z.string().optional(),
  spreadsheetLinks: z.array(SpreadsheetLinkSchema).default([]),
  verificationDocuments: z.array(VerificationDocumentSchema).default([]),
  frontendUrl: z.string().url().max(2048).optional(),
  backendUrl: z.string().url().max(2048).optional(),
  lastVerificationDate: z.string().min(1).optional(),
  lastVerifier: z.string().min(1).max(120).optional(),
  verificationProgress: VerificationProgressSchema.optional(),
  status: z.enum(['ACTIVE', 'PENDING', 'ARCHIVED', 'MONITORING', 'REVIEW']).optional(),
});

const ApplicationUpdateSchema = ApplicationCreateSchema.partial();

@Controller('applications')
export class ApplicationsController {
  constructor(private readonly applicationsService: ApplicationsService, private readonly authService: AuthService) {}

  private async currentUser(req: FastifyRequest) {
    const token = getRequestCookies(req)[AUTH_COOKIE_NAME];
    const user = token ? await this.authService.getPersistentUserBySession(token) : undefined;
    if (!user) throw new UnauthorizedException('Authentication is required.');
    return user;
  }

  private async requireManager(req: FastifyRequest) {
    const user = await this.currentUser(req);
    if (!['SUPERADMIN', 'OVERSEER'].includes(user.role)) throw new ForbiddenException('Only administrators and overseers can manage applications.');
    return user;
  }

  private async requireViewer(req: FastifyRequest) {
    const user = await this.currentUser(req);
    if (!['SUPERADMIN', 'OVERSEER', 'VERIFICATOR'].includes(user.role)) throw new ForbiddenException('This role cannot access application assurance data.');
    return user;
  }

  @Get()
  async list(@Query('page') page?: string, @Query('search') search?: string, @Query('sortBy') sortBy?: string, @Query('sortOrder') sortOrder?: string, @Req() req?: FastifyRequest) {
    if (req) await this.requireViewer(req);
    return this.applicationsService.listApplicationsPersistent(Number(page) || 1, { search, sortBy, sortOrder });
  }

  @Get('metadata/languages')
  getLanguages() {
    return {
      data: this.applicationsService.getLanguages(),
      meta: {},
    };
  }

  @Get('options')
  async options(@Req() req: FastifyRequest) {
    await this.requireViewer(req);
    return { data: await this.applicationsService.listApplicationOptions(), meta: {} };
  }

  @Get('metadata/frameworks')
  getFrameworks() {
    return {
      data: this.applicationsService.getFrameworks(),
      meta: {},
    };
  }

  @Get(':id')
  async get(@Param('id') id: string, @Req() req: FastifyRequest) {
    await this.requireViewer(req);
    return this.applicationsService.getApplicationPersistent(id);
  }

  @Get(':id/verification-progress')
  async refreshVerificationProgress(@Param('id') id: string, @Req() req: FastifyRequest) {
    await this.requireViewer(req);
    return this.applicationsService.refreshVerificationProgress(id);
  }

  @Post('verification-preview')
  async previewVerification(@Body() body: unknown, @Req() req: FastifyRequest) {
    await this.currentUser(req);
    const document = applyVerificationDocumentSettings(VerificationDocumentSchema.parse(body) as any);
    try {
      return await this.applicationsService.previewVerificationProgress(document);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Google Sheets preview failed.';
      throw new BadRequestException(message);
    }
  }

  @Post('detect-libraries')
  async detectLibraries(@Body() body: unknown, @Req() req: FastifyRequest) {
    await this.currentUser(req);
    const parsed = z.object({ files: z.array(DependencyFileSchema).min(1).max(40) }).parse(body) as { files: Array<{ name: string; content: string; layer?: 'frontend' | 'backend' }> };
    const libraries = this.applicationsService.detectLibraries(parsed.files as Array<{ name: string; content: string }>);
    return { data: { detected: libraries.length > 0, libraries }, meta: {} };
  }

  @Post()
  async create(@Body() body: unknown, @Req() req: FastifyRequest) {
    await this.requireManager(req);
    const dto = ApplicationCreateSchema.parse(body);
    const { dependencyFiles, ...application } = dto;
    try {
      return await this.applicationsService.createApplicationPersistent({
        ...application,
        ...(dependencyFiles ? { dependencyFiles } : {}),
        verificationDocuments: dto.verificationDocuments.map(applyVerificationDocumentSettings),
        id: crypto.randomUUID(),
        createdAt: undefined as never,
        updatedAt: undefined as never,
      } as any);
    } catch (error) {
      const requestId = req.headers['x-request-id'] ?? 'unknown';
      console.error(JSON.stringify({
        level: 'error',
        type: 'application_create_failed',
        requestId,
        error: error instanceof Error ? error.message : String(error),
      }));
      throw new BadRequestException(error instanceof Error ? error.message : 'Unable to create application.');
    }
  }

  @Put(':id')
  async update(@Param('id') id: string, @Body() body: unknown, @Req() req: FastifyRequest) {
    await this.requireManager(req);
    const dto = ApplicationUpdateSchema.parse(body);
    const { dependencyFiles, ...application } = dto;
    return this.applicationsService.updateApplicationPersistent(id, {
      ...application,
      ...(dependencyFiles ? { dependencyFiles } : {}),
      ...(dto.verificationDocuments ? { verificationDocuments: dto.verificationDocuments.map(applyVerificationDocumentSettings) } : {}),
    } as any);
  }

  @Delete(':id')
  async remove(@Param('id') id: string, @Body() body: unknown, @Req() req: FastifyRequest) {
    const accessToken = (req.cookies as Record<string, string> | undefined)?.[AUTH_COOKIE_NAME];
    const user = accessToken ? await this.authService.getPersistentUserBySession(accessToken) : undefined;
    if (!user) throw new UnauthorizedException('Authentication is required.');
    if (!accessToken) throw new UnauthorizedException('Authentication is required.');
    if (!['SUPERADMIN', 'OVERSEER'].includes(user.role)) throw new ForbiddenException('Only administrators and overseers can delete applications.');
    const password = z.object({ password: z.string().min(12).max(128) }).parse(body).password;
    const verified = await this.authService.verifyPasswordForSession(accessToken, password);
    if (!verified) throw new UnauthorizedException('Password confirmation failed.');
    await this.applicationsService.deleteApplicationPersistent(id);
    return { data: { deleted: true, id }, meta: {} };
  }

  @Put(':id/pic')
  async assignPic(@Param('id') id: string, @Body() body: unknown, @Req() req: FastifyRequest) {
    await this.requireManager(req);
    const dto = z.object({ picId: z.string() }).parse(body);
    return this.applicationsService.assignPicPersistent(id, dto.picId);
  }
}
