"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var ApplicationsService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.ApplicationsService = void 0;
const common_1 = require("@nestjs/common");
const googleapis_1 = require("googleapis");
const XLSX = __importStar(require("xlsx"));
const prisma_service_1 = require("../prisma.service");
const ssrf_validator_1 = require("../security/validators/ssrf.validator");
const dependency_detector_service_1 = require("./dependency-detector.service");
const timezone_1 = require("../common/timezone");
let ApplicationsService = ApplicationsService_1 = class ApplicationsService {
    prisma;
    dependencyDetector;
    logger = new common_1.Logger(ApplicationsService_1.name);
    applications = new Map();
    urlCheckTimer;
    constructor(prisma, dependencyDetector) {
        this.prisma = prisma;
        this.dependencyDetector = dependencyDetector;
    }
    async onApplicationBootstrap() {
        if (process.env.VERCEL)
            return;
        this.scheduleNextUrlCheck();
        void this.runScheduledApplicationUrlChecks().catch((error) => {
            this.logger.error('Initial application URL check failed during startup.', error instanceof Error ? error.stack : String(error));
        });
    }
    sheetsClient;
    driveClient;
    supportedLanguages = ['TypeScript', 'JavaScript', 'Go', 'Java', 'C#', 'Python', 'PHP', 'Ruby', 'Kotlin', 'Swift'];
    supportedFrameworks = ['Next.js', 'React', 'Vite', 'NestJS', 'Express', 'Spring Boot', 'Quarkus', 'Django', 'FastAPI', 'Laravel', 'Angular', 'Vue', 'Gin', 'Fiber', 'ASP.NET Core', 'Rails', 'Vapor'];
    createApplication(input) {
        const now = new Date();
        const libraries = Array.isArray(input.libraries) && input.libraries.length > 0
            ? input.libraries
            : (input.technologyStack ?? []).map((name) => ({
                name: String(name),
                version: 'unknown',
                source: 'manual',
            }));
        const application = {
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
            projectStartDate: input.projectStartDate ?? (0, timezone_1.toJakartaDateString)(new Date()),
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
    async createApplicationPersistent(input) {
        const dependencyFiles = input.dependencyFiles;
        const detectedLibraries = dependencyFiles?.length && this.dependencyDetector ? this.dependencyDetector.detect(dependencyFiles) : undefined;
        const hydratedInput = await this.hydrateFromSpreadsheet(detectedLibraries ? { ...input, libraries: detectedLibraries } : input);
        const googleSheetId = hydratedInput.googleSheetId ?? this.extractSpreadsheetId(hydratedInput.verificationDocuments?.[0]?.url ?? '');
        if (this.prisma && googleSheetId && await this.applicationUsesSpreadsheet(googleSheetId)) {
            throw new Error('An application already uses this spreadsheet.');
        }
        if (!this.prisma)
            return this.createApplication(hydratedInput);
        const application = this.createApplication({ ...hydratedInput, googleSheetId });
        await this.prisma.application.create({ data: this.toDatabaseApplication(application) });
        const librariesToPersist = detectedLibraries ?? application.libraries ?? [];
        if (detectedLibraries || librariesToPersist.length)
            await this.replaceApplicationLibraries(application.id, librariesToPersist);
        this.applications.delete(application.id);
        return application;
    }
    async listApplicationsPersistent(page = 1, filters = {}) {
        const pageSize = 10;
        if (!this.prisma) {
            const result = this.listApplications(page, pageSize);
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
                    { name: { contains: search, mode: 'insensitive' } },
                    { owner: { contains: search, mode: 'insensitive' } },
                    { lastVerifier: { contains: search, mode: 'insensitive' } },
                    { description: { contains: search, mode: 'insensitive' } },
                ] } : {}),
        };
        const items = await this.prisma.application.findMany({ where, orderBy: { createdAt: 'desc' }, include: { libraries: { include: { library: { include: { vulnerabilities: true } } } } } });
        const sortBy = ['name', 'progress', 'pending', 'lastVerification'].includes(filters.sortBy ?? '') ? filters.sortBy : undefined;
        const sortOrder = filters.sortOrder === 'asc' ? 'asc' : filters.sortOrder === 'desc' ? 'desc' : undefined;
        if (sortBy && sortOrder) {
            const value = (item) => {
                if (sortBy === 'name')
                    return item.name.toLocaleLowerCase();
                if (sortBy === 'progress')
                    return Number(item.verificationProgress?.percent ?? 0);
                if (sortBy === 'pending')
                    return Number(item.verificationProgress?.pendingVerificationPercent ?? 0);
                return item.lastVerificationDate ?? String(item.verificationProgress?.lastVerificationDate ?? '');
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
    async listApplicationOptions() {
        if (!this.prisma)
            return Array.from(this.applications.values()).map(({ id, name }) => ({ id, name }));
        return this.prisma.application.findMany({ select: { id: true, name: true }, orderBy: { name: 'asc' } });
    }
    async getApplicationPersistent(id) {
        if (!this.prisma)
            return this.getApplication(id);
        const application = await this.prisma.application.findUnique({ where: { id }, include: { libraries: { include: { library: { include: { vulnerabilities: true } } } } } });
        return application ? this.fromDatabaseApplication(application) : undefined;
    }
    async updateApplicationPersistent(id, input) {
        if (!this.prisma)
            return this.updateApplication(id, input);
        const dependencyFiles = input.dependencyFiles;
        const detectedLibraries = dependencyFiles?.length && this.dependencyDetector ? this.dependencyDetector.detect(dependencyFiles) : undefined;
        const hydratedInput = await this.hydrateFromSpreadsheet((detectedLibraries ? { ...input, libraries: detectedLibraries } : input));
        const googleSheetId = hydratedInput.googleSheetId ?? this.extractSpreadsheetId(hydratedInput.verificationDocuments?.[0]?.url ?? '');
        if (googleSheetId && await this.applicationUsesSpreadsheet(googleSheetId, id)) {
            throw new Error('An application already uses this spreadsheet.');
        }
        await this.prisma.application.update({ where: { id }, data: this.toDatabaseApplication({ ...hydratedInput, googleSheetId }) });
        if (detectedLibraries) {
            const detectedLayers = Array.from(new Set((dependencyFiles ?? []).map((file) => file.layer ?? 'backend')));
            await this.replaceApplicationLibraries(id, detectedLibraries, detectedLayers);
        }
        else if (Object.prototype.hasOwnProperty.call(input, 'libraries')) {
            await this.replaceApplicationLibraries(id, (hydratedInput.libraries ?? []));
        }
        return (await this.getApplicationPersistent(id));
    }
    async applicationUsesSpreadsheet(spreadsheetId, excludedId) {
        if (!this.prisma)
            return false;
        const applications = await this.prisma.application.findMany({
            ...(excludedId ? { where: { NOT: { id: excludedId } } } : {}),
            select: { googleSheetId: true, verificationDocuments: true },
        });
        return applications.some((application) => {
            if (application.googleSheetId === spreadsheetId)
                return true;
            const documents = Array.isArray(application.verificationDocuments) ? application.verificationDocuments : [];
            return documents.some((document) => typeof document === 'object' && document !== null && 'url' in document && this.extractSpreadsheetId(String(document.url)) === spreadsheetId);
        });
    }
    async deleteApplicationPersistent(id) {
        if (!this.prisma) {
            if (!this.applications.delete(id))
                throw new Error('Application not found.');
            return;
        }
        await this.prisma.application.delete({ where: { id } });
    }
    async hydrateFromSpreadsheet(input) {
        const document = input.verificationDocuments?.[0];
        if (!document || !['WEB_CHECKLIST', 'NEW_FEATURE_BUG_FIXING'].includes(document.type) || !document.url)
            return input;
        const preview = await this.previewVerificationProgress(document);
        const data = preview.spreadsheetData;
        if (!data)
            return input;
        const savedProgress = {
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
        };
    }
    toDatabaseApplication(application) {
        return { id: application.id, name: application.name, description: application.description, organization: application.organization, environment: application.environment, language: application.language, framework: application.framework, languageFrontend: application.languageFrontend, languageBackend: application.languageBackend, frameworkFrontend: application.frameworkFrontend, frameworkBackend: application.frameworkBackend, projectStartDate: application.projectStartDate, owner: application.owner, picId: application.picId, picName: application.picName, developerIds: application.developerIds, googleSheetId: application.googleSheetId, spreadsheetLinks: application.spreadsheetLinks, verificationDocuments: application.verificationDocuments, frontendUrl: application.frontendUrl, backendUrl: application.backendUrl, lastVerificationDate: application.lastVerificationDate, lastVerifier: application.lastVerifier, verificationProgress: application.verificationProgress, status: application.status };
    }
    fromDatabaseApplication(application) {
        const libraries = (application.libraries ?? []).map((applicationLibrary) => {
            const library = applicationLibrary.library ?? applicationLibrary;
            return { id: library.id, name: library.libraryName, version: library.version, ecosystem: library.ecosystem, layer: applicationLibrary.layer ?? 'backend', source: applicationLibrary.source ?? library.source, vulnerabilities: library.vulnerabilities ?? [] };
        });
        return { ...application, libraries, technologyStack: libraries.map((library) => library.name), spreadsheetLinks: application.spreadsheetLinks ?? [], verificationDocuments: application.verificationDocuments ?? [], developerIds: application.developerIds ?? [] };
    }
    detectLibraries(files) {
        if (!this.dependencyDetector)
            return [];
        return this.dependencyDetector.detect(files);
    }
    async replaceApplicationLibraries(applicationId, libraries = [], layersToReplace) {
        if (!this.prisma)
            return;
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
                        libraryId: sharedLibraryIds.get(`${library.name}\u0000${library.version}\u0000${library.ecosystem}`),
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
    updateApplication(id, input) {
        const application = this.applications.get(id);
        if (!application) {
            throw new Error('Application not found.');
        }
        Object.assign(application, input, { updatedAt: new Date() });
        return application;
    }
    listApplications(page, limit) {
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
    getLanguages() { return [...this.supportedLanguages]; }
    getFrameworks() { return [...this.supportedFrameworks]; }
    async checkApplicationUrls(applications = []) {
        const targets = applications.flatMap((application) => {
            const urls = [application.frontendUrl, application.backendUrl].filter((value) => Boolean(value && value.trim()));
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
            }
            catch (error) {
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
    scheduleNextUrlCheck() {
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
    getNextRunTime(from) {
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
                environment: 'STAGING',
                technologyStack: [],
                projectStartDate: (0, timezone_1.toJakartaDateString)(new Date()),
                owner: 'system',
                developerIds: [],
                spreadsheetLinks: [],
                createdAt: new Date(),
                updatedAt: new Date(),
            }));
        });
        const result = await this.checkApplicationUrls(applications);
        this.logger.log(`Scheduled application URL check finished: ${result.healthy}/${result.checked} healthy.`);
    }
    async runManualApplicationUrlChecks() {
        const snapshot = this.prisma ? await this.prisma.application.findMany({ select: { id: true, name: true, frontendUrl: true, backendUrl: true } }) : Array.from(this.applications.values()).map((application) => ({ id: application.id, name: application.name, frontendUrl: application.frontendUrl, backendUrl: application.backendUrl }));
        const applications = snapshot.flatMap((item) => [{ id: item.id, name: `${item.name} (frontend)`, frontendUrl: item.frontendUrl, backendUrl: undefined }, { id: item.id, name: `${item.name} (backend)`, frontendUrl: undefined, backendUrl: item.backendUrl }].filter((item) => item.frontendUrl || item.backendUrl));
        return this.checkApplicationUrls(applications);
    }
    async runManualApplicationSync(onProgress) {
        const snapshot = this.prisma
            ? await this.prisma.application.findMany({ select: { id: true } })
            : Array.from(this.applications.values()).map((application) => ({ id: application.id }));
        let refreshedApplications = 0;
        const refreshErrors = [];
        onProgress?.(5, `Found ${snapshot.length} application(s) to synchronize.`);
        for (let index = 0; index < snapshot.length; index += 1) {
            const applicationId = snapshot[index]?.id;
            if (!applicationId)
                continue;
            try {
                await this.refreshVerificationProgress(applicationId);
                refreshedApplications += 1;
            }
            catch (error) {
                refreshErrors.push({ applicationId, error: error instanceof Error ? error.message : 'Unable to refresh application data.' });
            }
            onProgress?.(5 + Math.round(((index + 1) / Math.max(1, snapshot.length)) * 65), `Updated application ${index + 1} of ${snapshot.length}.`);
        }
        onProgress?.(75, 'Checking application endpoints.');
        const endpointResult = await this.runManualApplicationUrlChecks();
        onProgress?.(100, 'Application synchronization completed.');
        return { ...endpointResult, refreshedApplications, failedRefreshes: refreshErrors.length, refreshErrors };
    }
    async refreshVerificationProgress(id) {
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
            .find((progress) => Boolean(progress?.lastVerificationDate || progress?.lastVerifier));
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
    async recordVerificationStart(id, verifierFirstName, date = (0, timezone_1.toJakartaDateString)(new Date())) {
        if (!this.prisma)
            return;
        const application = await this.prisma.application.findUnique({ where: { id } });
        if (!application)
            throw new Error('Application not found.');
        const document = application?.verificationDocuments && Array.isArray(application.verificationDocuments)
            ? application.verificationDocuments[0]
            : undefined;
        if (!document)
            throw new Error('Application has no verification document configured.');
        const sheets = this.getSheetsClient();
        if (!sheets)
            throw new Error('Google Sheets write access is not configured.');
        const spreadsheetId = application.googleSheetId ?? this.extractSpreadsheetId(document.url);
        if (!spreadsheetId)
            throw new Error('Unable to find a Google Spreadsheet ID for this application.');
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
    async previewVerificationProgress(document) {
        const result = await this.readVerificationValues(document);
        const progress = this.calculateProgress(result.values, result.totalPoints ?? document.totalPoints);
        return {
            ...result,
            ...progress,
        };
    }
    async readVerificationProgress(document) {
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
    calculateProgress(values, configuredTotalPoints = 310) {
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
        const keepTwoDecimals = (value) => Number(value.toFixed(2));
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
    async readVerificationValues(document) {
        this.validateSpreadsheetUrl(document.url);
        const spreadsheetId = this.extractSpreadsheetId(document.url);
        if (!spreadsheetId) {
            throw new Error(`Unable to find a Google Spreadsheet ID in ${document.url}.`);
        }
        const cells = [document.passCell, document.needToFixCell, document.waitingForReviewCell, document.uncheckCell];
        try {
            const authenticated = await this.readWithServiceAccount(spreadsheetId, document, cells);
            if (authenticated)
                return authenticated;
        }
        catch (error) {
            if (error instanceof Error && error.message === 'UNSUPPORTED_DOCUMENT') {
                if (!document.url.includes('/spreadsheets/d/'))
                    return this.readDriveDocument(spreadsheetId, document, cells);
                try {
                    return await this.readDriveDocument(spreadsheetId, document, cells);
                }
                catch {
                }
            }
            else if (!document.url.includes('/spreadsheets/d/')) {
                throw error;
            }
            else {
                try {
                    return await this.readDriveDocument(spreadsheetId, document, cells);
                }
                catch {
                }
            }
        }
        const ranges = this.getVerificationRanges(document, cells);
        try {
            const rawValues = await Promise.all(ranges.map((cell) => this.readPublicCell(spreadsheetId, document.sheetName, cell)));
            return this.buildReadResult(rawValues, ranges, document, 'public-gviz', spreadsheetId);
        }
        catch (error) {
            if (document.url.includes('/spreadsheets/d/')) {
                return this.readPublicWorkbook(document.url, spreadsheetId, document, cells);
            }
            throw error;
        }
    }
    async readPublicWorkbook(url, spreadsheetId, document, cells) {
        const exportUrl = `https://docs.google.com/spreadsheets/d/${spreadsheetId}/export?format=xlsx${this.extractSheetGid(url) ? `&gid=${this.extractSheetGid(url)}` : ''}`;
        const response = await fetch(exportUrl);
        if (!response.ok)
            throw new Error(`Google Sheets returned HTTP ${response.status}. The sheet must be shared or published for preview.`);
        const workbook = XLSX.read(Buffer.from(await response.arrayBuffer()), { type: 'buffer' });
        const firstSheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[document.sheetName] ?? (firstSheetName ? workbook.Sheets[firstSheetName] : undefined);
        if (!worksheet)
            throw new Error(`Worksheet "${document.sheetName}" was not found.`);
        const ranges = this.getVerificationRanges(document, cells);
        const rawValues = ranges.map((cell) => worksheet[cell]?.v ?? '');
        return this.buildReadResult(rawValues, ranges, document, 'public-google-export', spreadsheetId);
    }
    async readWithServiceAccount(spreadsheetId, document, cells) {
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
        }
        catch (error) {
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
    async readDriveWorkbook(spreadsheetId, document, cells) {
        const drive = this.getDriveClient();
        if (!drive) {
            throw new Error('Google Sheets authentication is not configured.');
        }
        let file;
        try {
            file = await drive.files.get({ fileId: spreadsheetId, fields: 'name,mimeType' });
        }
        catch (error) {
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
        }
        catch (error) {
            const googleMessage = error?.response?.data?.error?.message ?? error?.message ?? 'Unable to download the workbook.';
            throw new Error(`Google Drive workbook download failed: ${googleMessage}`);
        }
        const workbook = XLSX.read(Buffer.from(workbookResponse.data), { type: 'buffer' });
        const worksheet = workbook.Sheets[document.sheetName];
        if (!worksheet) {
            throw new Error(`Worksheet "${document.sheetName}" was not found. Available sheets: ${workbook.SheetNames.join(', ')}.`);
        }
        const ranges = this.getVerificationRanges(document, cells);
        const rawValues = ranges.map((cell) => worksheet[cell]?.v ?? '');
        return this.buildReadResult(rawValues, ranges, document, file.data.name ?? 'drive-workbook', spreadsheetId);
    }
    async readDriveDocument(spreadsheetId, document, cells) {
        const drive = this.getDriveClient();
        if (!drive)
            throw new Error('Google Sheets authentication is not configured.');
        let file;
        try {
            file = await drive.files.get({ fileId: spreadsheetId, fields: 'name,mimeType' });
        }
        catch (error) {
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
    async readDriveGoogleSheet(spreadsheetId, document, cells) {
        const drive = this.getDriveClient();
        if (!drive)
            throw new Error('Google Sheets authentication is not configured.');
        let workbookResponse;
        try {
            workbookResponse = await drive.files.export({
                fileId: spreadsheetId,
                mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            }, { responseType: 'arraybuffer' });
        }
        catch (error) {
            const googleMessage = error?.response?.data?.error?.message ?? error?.message ?? 'Unable to export the Google Sheet.';
            throw new Error(`Authenticated Google Sheet export failed: ${googleMessage}`);
        }
        const workbook = XLSX.read(Buffer.from(workbookResponse.data), { type: 'buffer' });
        const firstSheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[document.sheetName] ?? (firstSheetName ? workbook.Sheets[firstSheetName] : undefined);
        if (!worksheet)
            throw new Error(`Worksheet "${document.sheetName}" was not found. Available sheets: ${workbook.SheetNames.join(', ')}.`);
        const ranges = this.getVerificationRanges(document, cells);
        const rawValues = ranges.map((cell) => worksheet[cell]?.v ?? '');
        return this.buildReadResult(rawValues, ranges, document, 'service-account-google-export', spreadsheetId);
    }
    async readPublicCell(spreadsheetId, sheetName, cell) {
        const endpoint = `https://docs.google.com/spreadsheets/d/${spreadsheetId}/gviz/tq?sheet=${encodeURIComponent(sheetName)}&range=${encodeURIComponent(cell)}&tqx=out:json`;
        const response = await fetch(endpoint);
        if (!response.ok)
            throw new Error(`Google Sheets returned HTTP ${response.status}. For restricted sheets, share the document with the configured service-account email or make it publicly readable.`);
        const raw = await response.text();
        const jsonText = raw.replace(/^.*?setResponse\(/s, '').replace(/\);?\s*$/s, '');
        const payload = JSON.parse(jsonText);
        return payload.table?.rows?.[0]?.c?.[0]?.v ?? '';
    }
    buildReadResult(rawValues, ranges, document, source, spreadsheetId) {
        const values = rawValues.slice(0, 4).map((value) => this.normalizeVerificationCellValue(document.type, value));
        const result = { values, source, spreadsheetId, ranges };
        if (['WEB_CHECKLIST', 'NEW_FEATURE_BUG_FIXING'].includes(document.type)) {
            const data = rawValues.slice(4).map((value) => this.sanitizeSpreadsheetText(value));
            const [applicationName, owner, frontendUrl, backendUrl, projectStartDate, lastVerificationDate, description, picName, frontendStack, backendStack, lastVerifier] = data;
            const parseStack = (value) => {
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
            if (totalPoints > 0)
                result.totalPoints = totalPoints;
        }
        return result;
    }
    getVerificationRanges(document, cells) {
        const metadataRanges = ['B3', 'C4', 'B5', 'B6', 'C6', 'D6', 'E4', 'F8', 'D8', 'D9', 'F9'];
        const totalRanges = document.type === 'WEB_CHECKLIST' ? ['C27', 'D27', 'E27', 'F27'] : document.type === 'NEW_FEATURE_BUG_FIXING' ? ['B13'] : [];
        return ['WEB_CHECKLIST', 'NEW_FEATURE_BUG_FIXING'].includes(document.type) ? [...cells, ...metadataRanges, ...totalRanges] : cells;
    }
    validateSpreadsheetUrl(value) {
        let parsed;
        try {
            parsed = new URL(value);
        }
        catch {
            throw new Error('Spreadsheet URL is malformed.');
        }
        if (!['docs.google.com', 'drive.google.com'].includes(parsed.hostname.toLowerCase())) {
            throw new Error('Spreadsheet URL must point to Google Docs or Google Drive.');
        }
        const result = ssrf_validator_1.SsrfValidator.validateUrl({ url: value, allowedHosts: ['docs.google.com', 'drive.google.com'] });
        if (!result.valid)
            throw new Error(`Spreadsheet URL rejected: ${result.reason ?? 'unsafe target'}.`);
    }
    validateSpreadsheetMetadataUrl(value, label) {
        if (!value)
            return value;
        const result = ssrf_validator_1.SsrfValidator.validateUrl({ url: value });
        if (!result.valid)
            throw new Error(`${label} link rejected: ${result.reason ?? 'unsafe target'}.`);
        return new URL(value).toString();
    }
    sanitizeSpreadsheetText(value) {
        return String(value ?? '')
            .replace(/[\u0000-\u001F\u007F]/g, ' ')
            .replace(/\s+/g, ' ')
            .trim()
            .slice(0, 4000);
    }
    normalizeVerificationCellValue(documentType, value) {
        void documentType;
        return this.normalizeSpreadsheetNumber(value);
    }
    normalizeSpreadsheetNumber(value) {
        if (typeof value === 'number' && Number.isFinite(value))
            return value;
        const text = String(value ?? '').trim().replace(/,/g, '');
        if (!text)
            return 0;
        const isPercentage = text.endsWith('%');
        const parsed = Number(isPercentage ? text.slice(0, -1).trim() : text);
        if (!Number.isFinite(parsed))
            return 0;
        return isPercentage ? parsed / 100 : parsed;
    }
    normalizeSpreadsheetDate(value) {
        if (!value)
            return value;
        const serial = Number(value);
        if (Number.isFinite(serial) && /^\d+(\.\d+)?$/.test(value)) {
            const date = new Date(Date.UTC(1899, 11, 30) + Math.round(serial) * 24 * 60 * 60 * 1000);
            return Number.isNaN(date.getTime()) ? value : date.toISOString().slice(0, 10);
        }
        const monthDayYear = value.match(/^(\d{1,2})[-/]?(\d{1,2})[-/]?(\d{4})$/);
        if (!monthDayYear)
            return value;
        const [, month = '', day = '', year = ''] = monthDayYear;
        return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
    }
    getSheetsClient() {
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
        const auth = new googleapis_1.google.auth.GoogleAuth({
            credentials,
            scopes: ['https://www.googleapis.com/auth/spreadsheets'],
        });
        const client = googleapis_1.google.sheets({ version: 'v4', auth });
        Object.defineProperty(this, 'sheetsClient', { value: client, writable: false });
        return client;
    }
    getDriveClient() {
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
        const auth = new googleapis_1.google.auth.GoogleAuth({
            credentials,
            scopes: ['https://www.googleapis.com/auth/drive.readonly'],
        });
        const client = googleapis_1.google.drive({ version: 'v3', auth });
        Object.defineProperty(this, 'driveClient', { value: client, writable: false });
        return client;
    }
    combineProgress(documents) {
        const progress = documents.map((document) => document.progress).filter((item) => Boolean(item));
        const keepTwoDecimals = (value) => Number(value.toFixed(2));
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
    extractSpreadsheetId(url) {
        return url.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/)?.[1] ?? url.match(/[?&]id=([a-zA-Z0-9-_]+)/)?.[1];
    }
    extractSheetGid(url) {
        return url.match(/[?#&]gid=([0-9]+)/)?.[1];
    }
    getApplication(id) {
        return this.applications.get(id);
    }
    assignPic(applicationId, picId) {
        const application = this.applications.get(applicationId);
        if (!application) {
            return undefined;
        }
        application.picId = picId;
        application.updatedAt = new Date();
        return application;
    }
    async assignPicPersistent(applicationId, picId) {
        if (!this.prisma)
            return this.assignPic(applicationId, picId);
        const application = await this.prisma.application.update({ where: { id: applicationId }, data: { picId, updatedAt: new Date() } });
        return this.fromDatabaseApplication(application);
    }
};
exports.ApplicationsService = ApplicationsService;
exports.ApplicationsService = ApplicationsService = ApplicationsService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService, dependency_detector_service_1.DependencyDetectorService])
], ApplicationsService);
//# sourceMappingURL=applications.service.js.map