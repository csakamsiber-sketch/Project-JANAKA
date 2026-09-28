import { ApplicationEntity, VerificationDocument, VerificationProgress } from './application.entity';
import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { google, drive_v3, sheets_v4 } from 'googleapis';
import * as XLSX from 'xlsx';
import { PrismaService } from '../prisma.service';
import { SsrfValidator } from '../security/validators/ssrf.validator';
import { DependencyDetectorService } from './dependency-detector.service';
import { toJakartaDateString } from '../common/timezone';

export interface PaginatedApplications {
  items: ApplicationEntity[];
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export interface SpreadsheetData {
  applicationName?: string | undefined;
  owner?: string | undefined;
  frontendUrl?: string | undefined;
  backendUrl?: string | undefined;
  projectStartDate?: string | undefined;
  lastVerificationDate?: string | undefined;
  lastVerifier?: string | undefined;
  description?: string | undefined;
  picName?: string | undefined;
  languageFrontend?: string | undefined;
  frameworkFrontend?: string | undefined;
  languageBackend?: string | undefined;
  frameworkBackend?: string | undefined;
}

interface VerificationReadResult {
  values: number[];
  source: string;
  spreadsheetId: string;
  ranges: string[];
  totalPoints?: number;
  spreadsheetData?: SpreadsheetData;
}

@Injectable()
export class ApplicationsService implements OnApplicationBootstrap {
  private readonly logger = new Logger(ApplicationsService.name);
  private readonly applications = new Map<string, ApplicationEntity>();
  private urlCheckTimer?: NodeJS.Timeout;
  constructor(private readonly prisma?: PrismaService, private readonly dependencyDetector?: DependencyDetectorService) {}

  async onApplicationBootstrap() {
    if (process.env.VERCEL) return;
    this.scheduleNextUrlCheck();
    void this.runScheduledApplicationUrlChecks().catch((error: unknown) => {
      this.logger.error('Initial application URL check failed during startup.', error instanceof Error ? error.stack : String(error));
    });
  }
  private readonly sheetsClient?: sheets_v4.Sheets;
  private readonly driveClient?: drive_v3.Drive;
  private readonly supportedLanguages = ['TypeScript', 'JavaScript', 'Go', 'Java', 'C#', 'Python', 'PHP', 'Ruby', 'Kotlin', 'Swift'];
  private readonly supportedFrameworks = ['Next.js', 'React', 'Vite', 'NestJS', 'Express', 'Spring Boot', 'Quarkus', 'Django', 'FastAPI', 'Laravel', 'Angular', 'Vue', 'Gin', 'Fiber', 'ASP.NET Core', 'Rails', 'Vapor'];

  createApplication(input: Omit<ApplicationEntity, 'id' | 'createdAt' | 'updatedAt'> & { id?: string }): ApplicationEntity {
    const now = new Date();
    const libraries = Array.isArray(input.libraries) && input.libraries.length > 0
      ? input.libraries
      : (input.technologyStack ?? []).map((name) => ({
          name: String(name),
          version: 'unknown',
          source: 'manual' as const,
        }));

    const application: ApplicationEntity = {
      id: input.id ?? crypto.randomUUID(),
      name: input.name,
      description: input.description,
      organization: input.organization ?? 'PT Kalimasada',
      environment: 'STAGING',
      language: input.language ?? input.languageFrontend ?? 'Unknown',
      framework: input.framework ?? input.frameworkFrontend ?? 'Unknown',
      languageFrontend: input.languageFrontend ?? input.language ?? 'Unknown',
      languageBackend: input.languageBackend ?? input.language ?? 'Unknown',
      frameworkFrontend: input.frameworkFrontend ?? input.framework ?? 'Unknown',
      frameworkBackend: input.frameworkBackend ?? input.framework ?? 'Unknown',
      technologyStack: input.technologyStack ?? libraries.map((library) => library.name),
      libraries,
      projectStartDate: input.projectStartDate ?? toJakartaDateString(new Date()),
      owner: input.owner,
      picId: input.picId,
      picName: input.picName,
      developerIds: input.developerIds ?? [],
      googleSheetId: input.googleSheetId,
      spreadsheetLinks: input.spreadsheetLinks ?? [],
      verificationDocuments: input.verificationDocuments ?? [],
      frontendUrl: input.frontendUrl,
      backendUrl: input.backendUrl,
      lastVerificationDate: input.lastVerificationDate ?? input.verificationProgress?.lastVerificationDate,
      lastVerifier: input.lastVerifier ?? input.verificationProgress?.lastVerifier,
      verificationProgress: input.verificationProgress ?? {
        percent: 0,
        lastUpdated: now.toISOString(),
        lastVerifier: 'UNASSIGNED',
        status: 'NOT_STARTED',
      },
      status: input.status,
      createdAt: now,
      updatedAt: now,
    };

    this.applications.set(application.id, application);
    return application;
  }

  async createApplicationPersistent(input: Omit<ApplicationEntity, 'id' | 'createdAt' | 'updatedAt'> & { id?: string }) {
    const dependencyFiles = (input as typeof input & { dependencyFiles?: Array<{ name: string; content: string; layer?: 'frontend' | 'backend' }> }).dependencyFiles;
    const detectedLibraries = dependencyFiles?.length && this.dependencyDetector ? this.dependencyDetector.detect(dependencyFiles) : undefined;
    const hydratedInput = await this.hydrateFromSpreadsheet(detectedLibraries ? { ...input, libraries: detectedLibraries } : input);
    const googleSheetId = hydratedInput.googleSheetId ?? this.extractSpreadsheetId(hydratedInput.verificationDocuments?.[0]?.url ?? '');
    if (this.prisma && googleSheetId && await this.applicationUsesSpreadsheet(googleSheetId)) {
      throw new Error('An application already uses this spreadsheet.');
    }
    if (!this.prisma) return this.createApplication(hydratedInput);
    const application = this.createApplication({ ...hydratedInput, googleSheetId });
    await this.prisma.application.create({ data: this.toDatabaseApplication(application) });
    const librariesToPersist = detectedLibraries ?? application.libraries ?? [];
    if (detectedLibraries || librariesToPersist.length) await this.replaceApplicationLibraries(application.id, librariesToPersist);
    this.applications.delete(application.id);
    return application;
  }

  async listApplicationsPersistent(page = 1, filters: { search?: string | undefined; sortBy?: string | undefined; sortOrder?: string | undefined } = {}): Promise<PaginatedApplications> {
    const pageSize = 10;
    if (!this.prisma) {
      const result = this.listApplications(page, pageSize) as PaginatedApplications;
      if (filters.sortBy && filters.sortOrder) {
        const sortedItems = [...result.items].sort((left, right) => {
          const leftValue = filters.sortBy === 'name' ? left.name.toLowerCase() : filters.sortBy === 'progress' ? Number(left.verificationProgress?.percent ?? 0) : filters.sortBy === 'pending' ? Number(left.verificationProgress?.pendingVerificationPercent ?? 0) : left.lastVerificationDate ?? left.verificationProgress?.lastVerificationDate ?? '';
          const rightValue = filters.sortBy === 'name' ? right.name.toLowerCase() : filters.sortBy === 'progress' ? Number(right.verificationProgress?.percent ?? 0) : filters.sortBy === 'pending' ? Number(right.verificationProgress?.pendingVerificationPercent ?? 0) : right.lastVerificationDate ?? right.verificationProgress?.lastVerificationDate ?? '';
          const comparison = typeof leftValue === 'number' && typeof rightValue === 'number' ? leftValue - rightValue : String(leftValue).localeCompare(String(rightValue));
          return filters.sortOrder === 'asc' ? comparison : -comparison;
        });
        return { ...result, items: sortedItems };
      }
      return result;
    }
    const safePage = Math.max(1, Number(page) || 1);
    const search = filters.search?.trim();
    const where = {
      ...(search ? { OR: [
        { name: { contains: search, mode: 'insensitive' as const } },
        { owner: { contains: search, mode: 'insensitive' as const } },
        { lastVerifier: { contains: search, mode: 'insensitive' as const } },
        { description: { contains: search, mode: 'insensitive' as const } },
      ] } : {}),
    };
    const items = await this.prisma.application.findMany({ where, orderBy: { createdAt: 'desc' }, include: { libraries: { include: { library: { include: { vulnerabilities: true } } } } } });
    const sortBy = ['name', 'progress', 'pending', 'lastVerification'].includes(filters.sortBy ?? '') ? filters.sortBy : undefined;
    const sortOrder = filters.sortOrder === 'asc' ? 'asc' : filters.sortOrder === 'desc' ? 'desc' : undefined;
    if (sortBy && sortOrder) {
      const value = (item: typeof items[number]): string | number => {
        if (sortBy === 'name') return item.name.toLocaleLowerCase();
        if (sortBy === 'progress') return Number((item.verificationProgress as { percent?: number } | null)?.percent ?? 0);
        if (sortBy === 'pending') return Number((item.verificationProgress as { pendingVerificationPercent?: number } | null)?.pendingVerificationPercent ?? 0);
        return item.lastVerificationDate ?? String((item.verificationProgress as { lastVerificationDate?: string } | null)?.lastVerificationDate ?? '');
      };
      items.sort((left, right) => {
        const leftValue = value(left);
        const rightValue = value(right);
        const comparison = typeof leftValue === 'number' && typeof rightValue === 'number'
          ? leftValue - rightValue
          : String(leftValue).localeCompare(String(rightValue));
        return sortOrder === 'asc' ? comparison : -comparison;
      });
    }
    const total = items.length;
    const totalPages = Math.max(1, Math.ceil(total / pageSize));
    const paginatedItems = items.slice((safePage - 1) * pageSize, safePage * pageSize);
    return { items: paginatedItems.map((item) => this.fromDatabaseApplication(item)), page: safePage, limit: pageSize, total, totalPages };
  }

  async listApplicationOptions(): Promise<Array<{ id: string; name: string }>> {
    if (!this.prisma) return Array.from(this.applications.values()).map(({ id, name }) => ({ id, name }));
    return this.prisma.application.findMany({ select: { id: true, name: true }, orderBy: { name: 'asc' } });
  }

  async getApplicationPersistent(id: string): Promise<ApplicationEntity | undefined> {
    if (!this.prisma) return this.getApplication(id);
    const application = await this.prisma.application.findUnique({ where: { id }, include: { libraries: { include: { library: { include: { vulnerabilities: true } } } } } });
    return application ? this.fromDatabaseApplication(application) : undefined;
  }

  async updateApplicationPersistent(id: string, input: Partial<Omit<ApplicationEntity, 'id' | 'createdAt' | 'updatedAt'>>): Promise<ApplicationEntity> {
    if (!this.prisma) return this.updateApplication(id, input);
    const dependencyFiles = (input as typeof input & { dependencyFiles?: Array<{ name: string; content: string; layer?: 'frontend' | 'backend' }> }).dependencyFiles;
    const detectedLibraries = dependencyFiles?.length && this.dependencyDetector ? this.dependencyDetector.detect(dependencyFiles) : undefined;
    const hydratedInput = await this.hydrateFromSpreadsheet((detectedLibraries ? { ...input, libraries: detectedLibraries } : input) as ApplicationEntity);
    const googleSheetId = hydratedInput.googleSheetId ?? this.extractSpreadsheetId(hydratedInput.verificationDocuments?.[0]?.url ?? '');
    if (googleSheetId && await this.applicationUsesSpreadsheet(googleSheetId, id)) {
      throw new Error('An application already uses this spreadsheet.');
    }
    await this.prisma.application.update({ where: { id }, data: this.toDatabaseApplication({ ...hydratedInput, googleSheetId } as ApplicationEntity) as any });
    if (detectedLibraries) {
      const detectedLayers = Array.from(new Set((dependencyFiles ?? []).map((file) => file.layer ?? 'backend')));
      await this.replaceApplicationLibraries(id, detectedLibraries, detectedLayers);
    } else if (Object.prototype.hasOwnProperty.call(input, 'libraries')) {
      await this.replaceApplicationLibraries(id, (hydratedInput.libraries ?? []) as ApplicationEntity['libraries']);
    }
    return (await this.getApplicationPersistent(id)) as ApplicationEntity;
  }

  private async applicationUsesSpreadsheet(spreadsheetId: string, excludedId?: string): Promise<boolean> {
    if (!this.prisma) return false;
    const applications = await this.prisma.application.findMany({
      ...(excludedId ? { where: { NOT: { id: excludedId } } } : {}),
      select: { googleSheetId: true, verificationDocuments: true },
    });
    return applications.some((application) => {
      if (application.googleSheetId === spreadsheetId) return true;
      const documents = Array.isArray(application.verificationDocuments) ? application.verificationDocuments : [];
      return documents.some((document) => typeof document === 'object' && document !== null && 'url' in document && this.extractSpreadsheetId(String(document.url)) === spreadsheetId);
    });
  }

  async deleteApplicationPersistent(id: string): Promise<void> {
    if (!this.prisma) {
      if (!this.applications.delete(id)) throw new Error('Application not found.');
      return;
    }
    await this.prisma.application.delete({ where: { id } });
  }

  private async hydrateFromSpreadsheet<T extends Partial<ApplicationEntity>>(input: T): Promise<T> {
    const document = input.verificationDocuments?.[0];
    if (!document || !['WEB_CHECKLIST', 'NEW_FEATURE_BUG_FIXING'].includes(document.type) || !document.url) return input;

    const preview = await this.previewVerificationProgress(document);
    const data = preview.spreadsheetData;
    if (!data) return input;

    const savedProgress: VerificationProgress = {
      percent: preview.percent,
      totalPoints: preview.totalPoints,
      passPoints: preview.passPoints,
      needToFixPoints: preview.needToFixPoints,
      waitingForReviewPoints: preview.waitingForReviewPoints,
      uncheckPoints: preview.uncheckPoints,
      checkingPercent: preview.checkingPercent,
      pendingVerificationPercent: preview.pendingVerificationPercent,
      lastUpdated: new Date().toISOString(),
      lastVerifier: data.lastVerifier || 'GOOGLE_SHEETS',
      lastVerificationDate: data.lastVerificationDate,
      status: preview.status,
    };

    return {
      ...input,
      name: data.applicationName || input.name,
      description: data.description || input.description,
      owner: data.owner || input.owner,
      projectStartDate: data.projectStartDate || input.projectStartDate,
      lastVerificationDate: data.lastVerificationDate || input.lastVerificationDate,
      lastVerifier: data.lastVerifier || input.lastVerifier,
      frontendUrl: data.frontendUrl || input.frontendUrl,
      backendUrl: data.backendUrl || input.backendUrl,
      picName: data.picName || input.picName,
      languageFrontend: data.languageFrontend || input.languageFrontend,
      frameworkFrontend: data.frameworkFrontend || input.frameworkFrontend,
      languageBackend: data.languageBackend || input.languageBackend,
      frameworkBackend: data.frameworkBackend || input.frameworkBackend,
      language: data.languageFrontend || input.language,
      framework: data.frameworkFrontend || input.framework,
      verificationDocuments: input.verificationDocuments?.map((item, index) => index === 0 ? { ...item, progress: savedProgress } : item),
      verificationProgress: savedProgress,
    } as T;
  }

  private toDatabaseApplication(application: ApplicationEntity): any {
    return { id: application.id, name: application.name, description: application.description, organization: application.organization, environment: application.environment, language: application.language, framework: application.framework, languageFrontend: application.languageFrontend, languageBackend: application.languageBackend, frameworkFrontend: application.frameworkFrontend, frameworkBackend: application.frameworkBackend, projectStartDate: application.projectStartDate, owner: application.owner, picId: application.picId, picName: application.picName, developerIds: application.developerIds, googleSheetId: application.googleSheetId, spreadsheetLinks: application.spreadsheetLinks, verificationDocuments: application.verificationDocuments, frontendUrl: application.frontendUrl, backendUrl: application.backendUrl, lastVerificationDate: application.lastVerificationDate, lastVerifier: application.lastVerifier, verificationProgress: application.verificationProgress, status: application.status };
  }

  private fromDatabaseApplication(application: any): ApplicationEntity {
    const libraries = (application.libraries ?? []).map((applicationLibrary: any) => {
      const library = applicationLibrary.library ?? applicationLibrary;
      return { id: library.id, name: library.libraryName, version: library.version, ecosystem: library.ecosystem, layer: applicationLibrary.layer ?? 'backend', source: applicationLibrary.source ?? library.source, vulnerabilities: library.vulnerabilities ?? [] };
    });
    return { ...application, libraries, technologyStack: libraries.map((library: { name: string }) => library.name), spreadsheetLinks: application.spreadsheetLinks ?? [], verificationDocuments: application.verificationDocuments ?? [], developerIds: application.developerIds ?? [] };
  }

  detectLibraries(files: Array<{ name: string; content: string }>) {
    if (!this.dependencyDetector) return [];
    return this.dependencyDetector.detect(files);
  }

  private async replaceApplicationLibraries(applicationId: string, libraries: ApplicationEntity['libraries'] = [], layersToReplace?: string[]): Promise<void> {
    if (!this.prisma) return;
    await this.prisma.$transaction(async (transaction) => {
      const previousLinks = await transaction.applicationLibrary.findMany({
        where: { applicationId, ...(layersToReplace?.length ? { layer: { in: layersToReplace } } : {}) },
        select: { libraryId: true },
      });
      await transaction.applicationLibrary.deleteMany({ where: { applicationId, ...(layersToReplace?.length ? { layer: { in: layersToReplace } } : {}) } });
      const uniqueLibraries = Array.from(new Map((libraries ?? []).map((library) => {
        const ecosystem = library.ecosystem ?? 'unknown';
        const layer = library.layer ?? 'backend';
        return [`${library.name}\u0000${library.version}\u0000${ecosystem}\u0000${layer}`, { ...library, ecosystem, layer }];
      })).values());
      if (uniqueLibraries.length) {
        await transaction.library.createMany({
          data: uniqueLibraries.map((library) => ({ libraryName: library.name, version: library.version, ecosystem: library.ecosystem ?? 'unknown' })),
          skipDuplicates: true,
        });
        const sharedLibraries = await transaction.library.findMany({
          where: { OR: uniqueLibraries.map((library) => ({ libraryName: library.name, version: library.version, ecosystem: library.ecosystem ?? 'unknown' })) },
          select: { id: true, libraryName: true, version: true, ecosystem: true },
        });
        const sharedLibraryIds = new Map(sharedLibraries.map((library) => [`${library.libraryName}\u0000${library.version}\u0000${library.ecosystem}`, library.id]));
        await transaction.applicationLibrary.createMany({
          data: uniqueLibraries.map((library) => ({
            applicationId,
            libraryId: sharedLibraryIds.get(`${library.name}\u0000${library.version}\u0000${library.ecosystem}`) as string,
            layer: library.layer ?? 'backend',
            source: library.source ?? null,
          })),
          skipDuplicates: true,
        });
      }
      if (previousLinks.length) {
        await transaction.library.deleteMany({
          where: { id: { in: previousLinks.map((link) => link.libraryId) }, applications: { none: {} } },
        });
      }
    });
  }

  updateApplication(id: string, input: Partial<Omit<ApplicationEntity, 'id' | 'createdAt' | 'updatedAt'>>): ApplicationEntity {
    const application = this.applications.get(id);
    if (!application) {
      throw new Error('Application not found.');
    }

    Object.assign(application, input, { updatedAt: new Date() });
    return application;
  }

  listApplications(page?: number, limit?: number): ApplicationEntity[] | PaginatedApplications {
    const items = Array.from(this.applications.values());

    if (page === undefined && limit === undefined) {
      return items;
    }

    const safePage = Math.max(1, Number(page) || 1);
    const safeLimit = Math.max(1, Number(limit) || 10);
    const total = items.length;
    const totalPages = Math.max(1, Math.ceil(total / safeLimit));
    const normalizedPage = Math.min(safePage, totalPages);
    const startIndex = (normalizedPage - 1) * safeLimit;
    const paginatedItems = items.slice(startIndex, startIndex + safeLimit);

    return {
      items: paginatedItems,
      page: normalizedPage,
      limit: safeLimit,
      total,
      totalPages,
    };
  }

  getLanguages(): string[] { return [...this.supportedLanguages]; }

  getFrameworks(): string[] { return [...this.supportedFrameworks]; }

  async checkApplicationUrls(applications: ApplicationEntity[] = []): Promise<{ checked: number; healthy: number; failed: number; results: Array<{ applicationId: string; applicationName: string; url: string; ok: boolean; status: number | null; error?: string }> }> {
    const targets = applications.flatMap((application) => {
      const urls = [application.frontendUrl, application.backendUrl].filter((value): value is string => Boolean(value && value.trim()));
      return urls.map((url) => ({ applicationId: application.id, applicationName: application.name, url }));
    });

    const results = await Promise.all(targets.map(async ({ applicationId, applicationName, url }) => {
      try {
        const response = await fetch(url, {
          method: 'GET',
          redirect: 'follow',
          headers: { 'User-Agent': 'JANUS-Application-Scanner/1.0' },
        });
        return { applicationId, applicationName, url, ok: response.ok, status: response.status };
      } catch (error) {
        return { applicationId, applicationName, url, ok: false, status: null, error: error instanceof Error ? error.message : 'Unknown error' };
      }
    }));

    const healthy = results.filter((entry) => entry.ok).length;
    return {
      checked: results.length,
      healthy,
      failed: results.length - healthy,
      results,
    };
  }

  private scheduleNextUrlCheck() {
    if (this.urlCheckTimer) {
      clearTimeout(this.urlCheckTimer);
    }

    const now = new Date();
    const nextRun = this.getNextRunTime(now);
    const delay = Math.max(0, nextRun.getTime() - now.getTime());

    this.logger.log(`Next application URL health check scheduled for ${nextRun.toISOString()}.`);
    this.urlCheckTimer = setTimeout(() => {
      void this.runScheduledApplicationUrlChecks();
      this.scheduleNextUrlCheck();
    }, delay);
  }

  private getNextRunTime(from: Date): Date {
    const candidateHours = [6, 18];
    const nextRun = new Date(from);
    nextRun.setSeconds(0, 0);
    nextRun.setMinutes(0);

    for (const hour of candidateHours) {
      const candidate = new Date(nextRun);
      candidate.setHours(hour, 0, 0, 0);
      if (candidate.getTime() > from.getTime()) {
        return candidate;
      }
    }

    const dayAfter = new Date(nextRun);
    dayAfter.setDate(dayAfter.getDate() + 1);
    dayAfter.setHours(6, 0, 0, 0);
    return dayAfter;
  }

  async runScheduledApplicationUrlChecks() {
    const snapshot = this.prisma ? await this.prisma.application.findMany({ select: { id: true, name: true, frontendUrl: true, backendUrl: true } }) : Array.from(this.applications.values()).map((application) => ({ id: application.id, name: application.name, frontendUrl: application.frontendUrl, backendUrl: application.backendUrl }));
    const applications = snapshot.flatMap((item) => {
      const urls = [{ url: item.frontendUrl, label: 'frontend' }, { url: item.backendUrl, label: 'backend' }];
      return urls.filter((entry) => entry.url).map((entry) => ({
        id: item.id,
        name: `${item.name} (${entry.label})`,
        frontendUrl: entry.label === 'frontend' ? entry.url : undefined,
        backendUrl: entry.label === 'backend' ? entry.url : undefined,
        description: '',
        organization: 'PT Kalimasada',
        environment: 'STAGING' as const,
        technologyStack: [],
        projectStartDate: toJakartaDateString(new Date()),
        owner: 'system',
        developerIds: [],
        spreadsheetLinks: [],
        createdAt: new Date(),
        updatedAt: new Date(),
      }));
    });

    const result = await this.checkApplicationUrls(applications as ApplicationEntity[]);
    this.logger.log(`Scheduled application URL check finished: ${result.healthy}/${result.checked} healthy.`);
  }

  async runManualApplicationUrlChecks() {
    const snapshot = this.prisma ? await this.prisma.application.findMany({ select: { id: true, name: true, frontendUrl: true, backendUrl: true } }) : Array.from(this.applications.values()).map((application) => ({ id: application.id, name: application.name, frontendUrl: application.frontendUrl, backendUrl: application.backendUrl }));
    const applications = snapshot.flatMap((item) => [{ id: item.id, name: `${item.name} (frontend)`, frontendUrl: item.frontendUrl, backendUrl: undefined }, { id: item.id, name: `${item.name} (backend)`, frontendUrl: undefined, backendUrl: item.backendUrl }].filter((item) => item.frontendUrl || item.backendUrl));
    return this.checkApplicationUrls(applications as ApplicationEntity[]);
  }

  async runManualApplicationSync(onProgress?: (progress: number, message: string) => void) {
    const snapshot = this.prisma
      ? await this.prisma.application.findMany({ select: { id: true } })
      : Array.from(this.applications.values()).map((application) => ({ id: application.id }));
    let refreshedApplications = 0;
    const refreshErrors: Array<{ applicationId: string; error: string }> = [];
    onProgress?.(5, `Found ${snapshot.length} application(s) to synchronize.`);

    for (let index = 0; index < snapshot.length; index += 1) {
      const applicationId = snapshot[index]?.id;
      if (!applicationId) continue;
      try {
        await this.refreshVerificationProgress(applicationId);
        refreshedApplications += 1;
      } catch (error) {
        refreshErrors.push({ applicationId, error: error instanceof Error ? error.message : 'Unable to refresh application data.' });
      }
      onProgress?.(5 + Math.round(((index + 1) / Math.max(1, snapshot.length)) * 65), `Updated application ${index + 1} of ${snapshot.length}.`);
    }

    onProgress?.(75, 'Checking application endpoints.');
    const endpointResult = await this.runManualApplicationUrlChecks();
    onProgress?.(100, 'Application synchronization completed.');
    return { ...endpointResult, refreshedApplications, failedRefreshes: refreshErrors.length, refreshErrors };
  }

  async refreshVerificationProgress(id: string): Promise<ApplicationEntity> {
    const application = this.prisma ? await this.getApplicationPersistent(id) : this.applications.get(id);
    if (!application) {
      throw new Error('Application not found.');
    }

    const hydratedApplication = await this.hydrateFromSpreadsheet(application);
    Object.assign(application, hydratedApplication);
    const documents = application.verificationDocuments ?? [];
    const refreshedDocuments = await Promise.all(documents.map(async (document) => ({
      ...document,
      progress: await this.readVerificationProgress(document),
    })));
    application.verificationDocuments = refreshedDocuments;
    application.verificationProgress = refreshedDocuments.length > 0
      ? this.combineProgress(refreshedDocuments)
      : application.verificationProgress;
    const latestProgress = refreshedDocuments
      .map((document) => document.progress)
      .find((progress): progress is VerificationProgress => Boolean(progress?.lastVerificationDate || progress?.lastVerifier));
    if (latestProgress) {
      application.lastVerificationDate = latestProgress.lastVerificationDate;
      application.lastVerifier = latestProgress.lastVerifier;
      const currentProgress = application.verificationProgress;
      application.verificationProgress = currentProgress
        ? { ...currentProgress, lastVerificationDate: latestProgress.lastVerificationDate, lastVerifier: latestProgress.lastVerifier }
        : latestProgress;
    }
    application.updatedAt = new Date();
    if (this.prisma) {
      await this.prisma.application.update({ where: { id }, data: this.toDatabaseApplication(application) });
    }
    return application;
  }

  async recordVerificationStart(id: string, verifierFirstName: string, date = toJakartaDateString(new Date())): Promise<void> {
    if (!this.prisma) return;
    const application = await this.prisma.application.findUnique({ where: { id } });
    if (!application) throw new Error('Application not found.');
    const document = application?.verificationDocuments && Array.isArray(application.verificationDocuments)
      ? application.verificationDocuments[0] as VerificationDocument | undefined
      : undefined;
    if (!document) throw new Error('Application has no verification document configured.');

    const sheets = this.getSheetsClient();
    if (!sheets) throw new Error('Google Sheets write access is not configured.');
    const spreadsheetId = application.googleSheetId ?? this.extractSpreadsheetId(document.url);
    if (!spreadsheetId) throw new Error('Unable to find a Google Spreadsheet ID for this application.');

    await sheets.spreadsheets.values.batchUpdate({
      spreadsheetId,
      requestBody: {
        valueInputOption: 'USER_ENTERED',
        data: [
          { range: `'${document.sheetName.replace(/'/g, "''")}'!D6`, values: [[date]] },
          { range: `'${document.sheetName.replace(/'/g, "''")}'!F9`, values: [[verifierFirstName]] },
        ],
      },
    });
  }

  async previewVerificationProgress(document: VerificationDocument) {
    const result = await this.readVerificationValues(document);
    const progress = this.calculateProgress(result.values, result.totalPoints ?? document.totalPoints);
    return {
      ...result,
      ...progress,
    };
  }

  private async readVerificationProgress(document: VerificationDocument): Promise<VerificationProgress> {
    const result = await this.readVerificationValues(document);
    const { values } = result;
    const [pass = 0, needToFix = 0, waitingForReview = 0, uncheck = 0] = values.map((value) => Number.isFinite(value) ? value : 0);
    const progress = this.calculateProgress(values, result.totalPoints ?? document.totalPoints);

    return {
      percent: progress.percent,
      totalPoints: progress.totalPoints,
      passPoints: progress.passPoints,
      needToFixPoints: progress.needToFixPoints,
      waitingForReviewPoints: progress.waitingForReviewPoints,
      uncheckPoints: progress.uncheckPoints,
      checkingPercent: progress.checkingPercent,
      pendingVerificationPercent: progress.pendingVerificationPercent,
      lastUpdated: new Date().toISOString(),
      lastVerifier: result.spreadsheetData?.lastVerifier || 'GOOGLE_SHEETS',
      lastVerificationDate: result.spreadsheetData?.lastVerificationDate,
      status: progress.status,
      notes: `${document.label}: Pass ${pass}, Need to Fix ${needToFix}, Waiting for Review ${waitingForReview}, Uncheck ${uncheck}.`,
    };
  }

  private calculateProgress(values: number[], configuredTotalPoints = 310): {
    percent: number;
    status: VerificationProgress['status'];
    totalPoints: number;
    passPoints: number;
    needToFixPoints: number;
    waitingForReviewPoints: number;
    uncheckPoints: number;
    checkingPercent: number;
    pendingVerificationPercent: number;
  } {
    const [pass = 0, needToFix = 0, waitingForReview = 0, uncheck = 0] = values;
    const numericValues = [pass, needToFix, waitingForReview, uncheck].map((value) => Number.isFinite(value) ? value : 0);
    const isDecimalRatio = numericValues.every((value) => value >= 0 && value <= 1);
    const totalPoints = configuredTotalPoints && configuredTotalPoints > 0
      ? configuredTotalPoints
      : numericValues.reduce((sum, value) => sum + value, 0);
    const pointValues = isDecimalRatio
      ? numericValues.map((value) => Math.round(value * totalPoints))
      : numericValues.map((value) => Math.round(value));
    const [passPoints = 0, needToFixPoints = 0, waitingForReviewPoints = 0, uncheckPoints = 0] = pointValues;
    const keepTwoDecimals = (value: number) => Number(value.toFixed(2));

    if (isDecimalRatio) {
      const percent = keepTwoDecimals((pass ?? 0) * 100);
      return {
        percent,
        status: percent >= 100 ? 'APPROVED' : percent > 0 ? 'IN_PROGRESS' : 'NOT_STARTED',
        totalPoints,
        passPoints,
        needToFixPoints,
        waitingForReviewPoints,
        uncheckPoints,
        checkingPercent: keepTwoDecimals((1 - (uncheck ?? 0)) * 100),
        pendingVerificationPercent: keepTwoDecimals(((uncheck ?? 0) + (waitingForReview ?? 0)) * 100),
      };
    }

    const percent = totalPoints > 0 ? keepTwoDecimals(((pass ?? 0) / totalPoints) * 100) : 0;
    return {
      percent,
      status: percent >= 100 ? 'APPROVED' : totalPoints > 0 ? 'IN_PROGRESS' : 'NOT_STARTED',
      totalPoints,
      passPoints,
      needToFixPoints,
      waitingForReviewPoints,
      uncheckPoints,
      checkingPercent: totalPoints > 0 ? keepTwoDecimals(((totalPoints - uncheckPoints) / totalPoints) * 100) : 0,
      pendingVerificationPercent: totalPoints > 0 ? keepTwoDecimals(((uncheckPoints + waitingForReviewPoints) / totalPoints) * 100) : 0,
    };
  }

  private async readVerificationValues(document: VerificationDocument): Promise<VerificationReadResult> {
    this.validateSpreadsheetUrl(document.url);
    const spreadsheetId = this.extractSpreadsheetId(document.url);
    if (!spreadsheetId) {
      throw new Error(`Unable to find a Google Spreadsheet ID in ${document.url}.`);
    }

    const cells = [document.passCell, document.needToFixCell, document.waitingForReviewCell, document.uncheckCell];
    try {
      const authenticated = await this.readWithServiceAccount(spreadsheetId, document, cells);
      if (authenticated) return authenticated;
    } catch (error) {
      if (error instanceof Error && error.message === 'UNSUPPORTED_DOCUMENT') {
        if (!document.url.includes('/spreadsheets/d/')) return this.readDriveDocument(spreadsheetId, document, cells);
        try {
          return await this.readDriveDocument(spreadsheetId, document, cells);
        } catch {
          // Continue to public access below for sheets shared publicly.
        }
      } else if (!document.url.includes('/spreadsheets/d/')) {
        throw error;
      } else {
        try {
          return await this.readDriveDocument(spreadsheetId, document, cells);
        } catch {
          // Continue to public access below for sheets shared publicly.
        }
      }
    }

    const ranges = this.getVerificationRanges(document, cells);
    try {
      const rawValues = await Promise.all(ranges.map((cell) => this.readPublicCell(spreadsheetId, document.sheetName, cell)));
      return this.buildReadResult(rawValues, ranges, document, 'public-gviz', spreadsheetId);
    } catch (error) {
      if (document.url.includes('/spreadsheets/d/')) {
        return this.readPublicWorkbook(document.url, spreadsheetId, document, cells);
      }
      throw error;
    }
  }

  private async readPublicWorkbook(url: string, spreadsheetId: string, document: VerificationDocument, cells: string[]) {
    const exportUrl = `https://docs.google.com/spreadsheets/d/${spreadsheetId}/export?format=xlsx${this.extractSheetGid(url) ? `&gid=${this.extractSheetGid(url)}` : ''}`;
    const response = await fetch(exportUrl);
    if (!response.ok) throw new Error(`Google Sheets returned HTTP ${response.status}. The sheet must be shared or published for preview.`);
    const workbook = XLSX.read(Buffer.from(await response.arrayBuffer()), { type: 'buffer' });
    const firstSheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[document.sheetName] ?? (firstSheetName ? workbook.Sheets[firstSheetName] : undefined);
    if (!worksheet) throw new Error(`Worksheet "${document.sheetName}" was not found.`);
    const ranges = this.getVerificationRanges(document, cells);
    const rawValues = ranges.map((cell) => worksheet[cell]?.v ?? '');
    return this.buildReadResult(rawValues, ranges, document, 'public-google-export', spreadsheetId);
  }

  private async readWithServiceAccount(spreadsheetId: string, document: VerificationDocument, cells: string[]): Promise<VerificationReadResult | undefined> {
    const sheets = this.getSheetsClient();
    if (!sheets) {
      return undefined;
    }

    let response;
    try {
      response = await sheets.spreadsheets.values.batchGet({
        spreadsheetId,
        ranges: cells.map((cell) => `'${document.sheetName.replace(/'/g, "''")}'!${cell}`),
        majorDimension: 'ROWS',
      });
    } catch (error: any) {
      const googleMessage = error?.response?.data?.error?.message ?? error?.message ?? 'Unknown Google Sheets error.';
      if (googleMessage.toLowerCase().includes('not supported for this document')) {
        throw new Error('UNSUPPORTED_DOCUMENT');
      }
      throw new Error(`Authenticated Google Sheets read failed: ${googleMessage}`);
    }

    const ranges = this.getVerificationRanges(document, cells);
    if (ranges.length !== cells.length) {
      response = await sheets.spreadsheets.values.batchGet({
        spreadsheetId,
        ranges: ranges.map((cell) => `'${document.sheetName.replace(/'/g, "''")}'!${cell}`),
        majorDimension: 'ROWS',
      });
    }
    const rawValues = (response.data.valueRanges ?? []).map((valueRange) => valueRange.values?.[0]?.[0] ?? '');
    return this.buildReadResult(rawValues, ranges, document, 'service-account', spreadsheetId);
  }

  private async readDriveWorkbook(spreadsheetId: string, document: VerificationDocument, cells: string[]) {
    const drive = this.getDriveClient();
    if (!drive) {
      throw new Error('Google Sheets authentication is not configured.');
    }

    let file;
    try {
      file = await drive.files.get({ fileId: spreadsheetId, fields: 'name,mimeType' });
    } catch (error: any) {
      const googleMessage = error?.response?.data?.error?.message ?? error?.message ?? 'Unable to inspect the Google Drive file.';
      throw new Error(`Google Drive access failed: ${googleMessage}`);
    }

    const mimeType = file.data.mimeType ?? '';
    if (!['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'application/vnd.ms-excel'].includes(mimeType)) {
      throw new Error(`Google Sheets rejected this document (${file.data.name ?? mimeType}). It is not a native Google Sheet or a supported Excel workbook.`);
    }

    let workbookResponse;
    try {
      workbookResponse = await drive.files.get({ fileId: spreadsheetId, alt: 'media' }, { responseType: 'arraybuffer' });
    } catch (error: any) {
      const googleMessage = error?.response?.data?.error?.message ?? error?.message ?? 'Unable to download the workbook.';
      throw new Error(`Google Drive workbook download failed: ${googleMessage}`);
    }

    const workbook = XLSX.read(Buffer.from(workbookResponse.data as ArrayBuffer), { type: 'buffer' });
    const worksheet = workbook.Sheets[document.sheetName];
    if (!worksheet) {
      throw new Error(`Worksheet "${document.sheetName}" was not found. Available sheets: ${workbook.SheetNames.join(', ')}.`);
    }

    const ranges = this.getVerificationRanges(document, cells);
    const rawValues = ranges.map((cell) => worksheet[cell]?.v ?? '');
    return this.buildReadResult(rawValues, ranges, document, file.data.name ?? 'drive-workbook', spreadsheetId);
  }

  private async readDriveDocument(spreadsheetId: string, document: VerificationDocument, cells: string[]) {
    const drive = this.getDriveClient();
    if (!drive) throw new Error('Google Sheets authentication is not configured.');

    let file;
    try {
      file = await drive.files.get({ fileId: spreadsheetId, fields: 'name,mimeType' });
    } catch (error: any) {
      const googleMessage = error?.response?.data?.error?.message ?? error?.message ?? 'Unable to inspect the Drive document.';
      throw new Error(`Google Drive access failed: ${googleMessage}`);
    }

    const excelMimeTypes = ['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'application/vnd.ms-excel'];
    if (excelMimeTypes.includes(file.data.mimeType ?? '')) {
      return this.readDriveWorkbook(spreadsheetId, document, cells);
    }
    if (file.data.mimeType === 'application/vnd.google-apps.spreadsheet') {
      return this.readDriveGoogleSheet(spreadsheetId, document, cells);
    }
    throw new Error(`Unsupported spreadsheet document type: ${file.data.name ?? file.data.mimeType ?? 'unknown'}.`);
  }

  private async readDriveGoogleSheet(spreadsheetId: string, document: VerificationDocument, cells: string[]) {
    const drive = this.getDriveClient();
    if (!drive) throw new Error('Google Sheets authentication is not configured.');

    let workbookResponse;
    try {
      workbookResponse = await drive.files.export({
        fileId: spreadsheetId,
        mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      }, { responseType: 'arraybuffer' });
    } catch (error: any) {
      const googleMessage = error?.response?.data?.error?.message ?? error?.message ?? 'Unable to export the Google Sheet.';
      throw new Error(`Authenticated Google Sheet export failed: ${googleMessage}`);
    }

    const workbook = XLSX.read(Buffer.from(workbookResponse.data as ArrayBuffer), { type: 'buffer' });
    const firstSheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[document.sheetName] ?? (firstSheetName ? workbook.Sheets[firstSheetName] : undefined);
    if (!worksheet) throw new Error(`Worksheet "${document.sheetName}" was not found. Available sheets: ${workbook.SheetNames.join(', ')}.`);

    const ranges = this.getVerificationRanges(document, cells);
    const rawValues = ranges.map((cell) => worksheet[cell]?.v ?? '');
    return this.buildReadResult(rawValues, ranges, document, 'service-account-google-export', spreadsheetId);
  }

  private async readPublicCell(spreadsheetId: string, sheetName: string, cell: string): Promise<unknown> {
    const endpoint = `https://docs.google.com/spreadsheets/d/${spreadsheetId}/gviz/tq?sheet=${encodeURIComponent(sheetName)}&range=${encodeURIComponent(cell)}&tqx=out:json`;
    const response = await fetch(endpoint);
    if (!response.ok) throw new Error(`Google Sheets returned HTTP ${response.status}. For restricted sheets, share the document with the configured service-account email or make it publicly readable.`);
    const raw = await response.text();
    const jsonText = raw.replace(/^.*?setResponse\(/s, '').replace(/\);?\s*$/s, '');
    const payload = JSON.parse(jsonText) as { table?: { rows?: Array<{ c?: Array<{ v?: unknown }> }> } };
    return payload.table?.rows?.[0]?.c?.[0]?.v ?? '';
  }

  private buildReadResult(rawValues: unknown[], ranges: string[], document: VerificationDocument, source: string, spreadsheetId: string): VerificationReadResult {
    const values = rawValues.slice(0, 4).map((value) => this.normalizeVerificationCellValue(document.type, value));
    const result: VerificationReadResult = { values, source, spreadsheetId, ranges };
    if (['WEB_CHECKLIST', 'NEW_FEATURE_BUG_FIXING'].includes(document.type)) {
      const data = rawValues.slice(4).map((value) => this.sanitizeSpreadsheetText(value));
      const [applicationName, owner, frontendUrl, backendUrl, projectStartDate, lastVerificationDate, description, picName, frontendStack, backendStack, lastVerifier] = data;
      const parseStack = (value: string | undefined) => {
        const [language, framework] = (value ?? '').split(/\s+-\s+/, 2).map((part) => part.trim());
        return { language, framework };
      };
      const frontend = parseStack(frontendStack);
      const backend = parseStack(backendStack);
      result.spreadsheetData = { applicationName, owner, frontendUrl: this.validateSpreadsheetMetadataUrl(frontendUrl, 'Frontend API'), backendUrl: this.validateSpreadsheetMetadataUrl(backendUrl, 'Backend API'), projectStartDate: this.normalizeSpreadsheetDate(projectStartDate), lastVerificationDate: this.normalizeSpreadsheetDate(lastVerificationDate), lastVerifier, description, picName, languageFrontend: frontend.language, frameworkFrontend: frontend.framework, languageBackend: backend.language, frameworkBackend: backend.framework };
    }
    const totalPointCells = document.type === 'WEB_CHECKLIST' ? ['C27', 'D27', 'E27', 'F27'] : document.type === 'NEW_FEATURE_BUG_FIXING' ? ['B13'] : [];
    if (totalPointCells.length) {
      const totalPoints = totalPointCells.reduce((total, cell) => total + this.normalizeSpreadsheetNumber(rawValues[ranges.indexOf(cell)]), 0);
      if (totalPoints > 0) result.totalPoints = totalPoints;
    }
    return result;
  }

  private getVerificationRanges(document: VerificationDocument, cells: string[]): string[] {
    const metadataRanges = ['B3', 'C4', 'B5', 'B6', 'C6', 'D6', 'E4', 'F8', 'D8', 'D9', 'F9'];
    const totalRanges = document.type === 'WEB_CHECKLIST' ? ['C27', 'D27', 'E27', 'F27'] : document.type === 'NEW_FEATURE_BUG_FIXING' ? ['B13'] : [];
    return ['WEB_CHECKLIST', 'NEW_FEATURE_BUG_FIXING'].includes(document.type) ? [...cells, ...metadataRanges, ...totalRanges] : cells;
  }

  private validateSpreadsheetUrl(value: string): void {
    let parsed: URL;
    try {
      parsed = new URL(value);
    } catch {
      throw new Error('Spreadsheet URL is malformed.');
    }

    if (!['docs.google.com', 'drive.google.com'].includes(parsed.hostname.toLowerCase())) {
      throw new Error('Spreadsheet URL must point to Google Docs or Google Drive.');
    }

    const result = SsrfValidator.validateUrl({ url: value, allowedHosts: ['docs.google.com', 'drive.google.com'] });
    if (!result.valid) throw new Error(`Spreadsheet URL rejected: ${result.reason ?? 'unsafe target'}.`);
  }

  private validateSpreadsheetMetadataUrl(value: string | undefined, label: string): string | undefined {
    if (!value) return value;
    const result = SsrfValidator.validateUrl({ url: value });
    if (!result.valid) throw new Error(`${label} link rejected: ${result.reason ?? 'unsafe target'}.`);
    return new URL(value).toString();
  }

  private sanitizeSpreadsheetText(value: unknown): string {
    return String(value ?? '')
      .replace(/[\u0000-\u001F\u007F]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 4000);
  }

  private normalizeVerificationCellValue(documentType: VerificationDocument['type'], value: unknown): number {
    void documentType;
    return this.normalizeSpreadsheetNumber(value);
  }

  private normalizeSpreadsheetNumber(value: unknown): number {
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    const text = String(value ?? '').trim().replace(/,/g, '');
    if (!text) return 0;
    const isPercentage = text.endsWith('%');
    const parsed = Number(isPercentage ? text.slice(0, -1).trim() : text);
    if (!Number.isFinite(parsed)) return 0;
    return isPercentage ? parsed / 100 : parsed;
  }

  private normalizeSpreadsheetDate(value: string | undefined): string | undefined {
    if (!value) return value;
    const serial = Number(value);
    if (Number.isFinite(serial) && /^\d+(\.\d+)?$/.test(value)) {
      const date = new Date(Date.UTC(1899, 11, 30) + Math.round(serial) * 24 * 60 * 60 * 1000);
      return Number.isNaN(date.getTime()) ? value : date.toISOString().slice(0, 10);
    }
    const monthDayYear = value.match(/^(\d{1,2})[-/]?(\d{1,2})[-/]?(\d{4})$/);
    if (!monthDayYear) return value;
    const [, month = '', day = '', year = ''] = monthDayYear;
    return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
  }

  private getSheetsClient(): sheets_v4.Sheets | undefined {
    if (this.sheetsClient) {
      return this.sheetsClient;
    }

    const jsonCredentials = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
    const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
    const privateKey = process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY?.replace(/\\n/g, '\n');
    if (!jsonCredentials && (!email || !privateKey)) {
      return undefined;
    }

    const credentials = jsonCredentials
      ? JSON.parse(jsonCredentials)
      : { client_email: email, private_key: privateKey };
    const auth = new google.auth.GoogleAuth({
      credentials,
      scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    });
    const client = google.sheets({ version: 'v4', auth });
    Object.defineProperty(this, 'sheetsClient', { value: client, writable: false });
    return client;
  }

  private getDriveClient(): drive_v3.Drive | undefined {
    if (this.driveClient) {
      return this.driveClient;
    }

    const sheets = this.getSheetsClient();
    if (!sheets) {
      return undefined;
    }

    const jsonCredentials = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
    const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
    const privateKey = process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY?.replace(/\\n/g, '\n');
    const credentials = jsonCredentials
      ? JSON.parse(jsonCredentials)
      : { client_email: email, private_key: privateKey };
    const auth = new google.auth.GoogleAuth({
      credentials,
      scopes: ['https://www.googleapis.com/auth/drive.readonly'],
    });
    const client = google.drive({ version: 'v3', auth });
    Object.defineProperty(this, 'driveClient', { value: client, writable: false });
    return client;
  }

  private combineProgress(documents: VerificationDocument[]): VerificationProgress {
    const progress = documents.map((document) => document.progress).filter((item): item is VerificationProgress => Boolean(item));
    const keepTwoDecimals = (value: number) => Number(value.toFixed(2));
    const percent = progress.length > 0 ? keepTwoDecimals(progress.reduce((total, item) => total + item.percent, 0) / progress.length) : 0;
    const totalPoints = progress.reduce((total, item) => total + (item.totalPoints ?? 0), 0);
    const uncheckPoints = progress.reduce((total, item) => total + (item.uncheckPoints ?? 0), 0);
    const waitingForReviewPoints = progress.reduce((total, item) => total + (item.waitingForReviewPoints ?? 0), 0);
    return {
      percent,
      totalPoints,
      passPoints: progress.reduce((total, item) => total + (item.passPoints ?? 0), 0),
      needToFixPoints: progress.reduce((total, item) => total + (item.needToFixPoints ?? 0), 0),
      waitingForReviewPoints,
      uncheckPoints,
      checkingPercent: totalPoints > 0 ? keepTwoDecimals(((totalPoints - uncheckPoints) / totalPoints) * 100) : 0,
      pendingVerificationPercent: totalPoints > 0 ? keepTwoDecimals(((uncheckPoints + waitingForReviewPoints) / totalPoints) * 100) : 0,
      lastUpdated: new Date().toISOString(),
      lastVerifier: progress.find((item) => item.lastVerifier)?.lastVerifier ?? 'GOOGLE_SHEETS',
      lastVerificationDate: progress.find((item) => item.lastVerificationDate)?.lastVerificationDate,
      status: percent >= 100 ? 'APPROVED' : percent > 0 ? 'IN_PROGRESS' : 'NOT_STARTED',
      notes: `Combined progress from ${progress.length} verification document(s).`,
    };
  }

  private extractSpreadsheetId(url: string): string | undefined {
    return url.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/)?.[1] ?? url.match(/[?&]id=([a-zA-Z0-9-_]+)/)?.[1];
  }

  private extractSheetGid(url: string): string | undefined {
    return url.match(/[?#&]gid=([0-9]+)/)?.[1];
  }

  getApplication(id: string): ApplicationEntity | undefined {
    return this.applications.get(id);
  }

  assignPic(applicationId: string, picId: string): ApplicationEntity | undefined {
    const application = this.applications.get(applicationId);
    if (!application) {
      return undefined;
    }

    application.picId = picId;
    application.updatedAt = new Date();
    return application;
  }

  async assignPicPersistent(applicationId: string, picId: string): Promise<ApplicationEntity | undefined> {
    if (!this.prisma) return this.assignPic(applicationId, picId);
    const application = await this.prisma.application.update({ where: { id: applicationId }, data: { picId, updatedAt: new Date() } });
    return this.fromDatabaseApplication(application);
  }
}
