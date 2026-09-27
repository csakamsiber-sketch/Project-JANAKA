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
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ApplicationsController = void 0;
const common_1 = require("@nestjs/common");
const auth_constants_1 = require("../auth/auth.constants");
const auth_service_1 = require("../auth/auth.service");
const zod_1 = require("zod");
const applications_service_1 = require("./applications.service");
const request_cookies_1 = require("../common/request-cookies");
const verification_document_config_1 = require("./verification-document.config");
const SpreadsheetLinkSchema = zod_1.z.object({
    type: zod_1.z.enum(['WEB_FE', 'WEB_BE', 'MOBILE', 'CR_UPDATE']),
    label: zod_1.z.string().min(1).max(120),
    url: zod_1.z.string().url().max(2048),
});
const VerificationProgressSchema = zod_1.z.object({
    percent: zod_1.z.number().min(0).max(100),
    lastUpdated: zod_1.z.string().min(1),
    lastVerifier: zod_1.z.string().min(1).max(120),
    status: zod_1.z.enum(['NOT_STARTED', 'IN_PROGRESS', 'APPROVED', 'REJECTED']),
    notes: zod_1.z.string().max(2000).optional(),
    totalPoints: zod_1.z.number().positive().optional(),
});
const VerificationDocumentSchema = zod_1.z.object({
    type: zod_1.z.enum(['MOBILE_CHECKLIST', 'WEB_CHECKLIST', 'NEW_FEATURE_BUG_FIXING', 'CUSTOM_DOCUMENT']),
    label: zod_1.z.string().min(1).max(120),
    url: zod_1.z.string().url().max(2048),
});
const LibrarySchema = zod_1.z.object({
    name: zod_1.z.string().min(1).max(120),
    version: zod_1.z.string().min(1).max(120).default('unknown'),
    ecosystem: zod_1.z.string().max(30).optional(),
    source: zod_1.z.string().max(120).optional(),
    layer: zod_1.z.enum(['frontend', 'backend']).default('backend'),
});
const DependencyFileSchema = zod_1.z.object({ name: zod_1.z.string().min(1).max(255), content: zod_1.z.string().max(12_000_000), layer: zod_1.z.enum(['frontend', 'backend']).optional() });
const ApplicationCreateSchema = zod_1.z.object({
    name: zod_1.z.string().min(1).max(255),
    description: zod_1.z.string().max(4000).optional(),
    organization: zod_1.z.string().min(1).optional(),
    environment: zod_1.z.enum(['DEV', 'STAGING', 'PRODUCTION']).default('STAGING'),
    language: zod_1.z.string().min(1).max(80).optional(),
    framework: zod_1.z.string().min(1).max(80).optional(),
    languageFrontend: zod_1.z.string().min(1).max(80).optional(),
    languageBackend: zod_1.z.string().min(1).max(80).optional(),
    frameworkFrontend: zod_1.z.string().min(1).max(80).optional(),
    frameworkBackend: zod_1.z.string().min(1).max(80).optional(),
    technologyStack: zod_1.z.array(zod_1.z.string()).default([]),
    libraries: zod_1.z.array(LibrarySchema).default([]),
    dependencyFiles: zod_1.z.array(DependencyFileSchema).max(40).optional(),
    projectStartDate: zod_1.z.string().min(1),
    owner: zod_1.z.string().min(1),
    picId: zod_1.z.string().optional(),
    picName: zod_1.z.string().optional(),
    developerIds: zod_1.z.array(zod_1.z.string()).default([]),
    googleSheetId: zod_1.z.string().optional(),
    spreadsheetLinks: zod_1.z.array(SpreadsheetLinkSchema).default([]),
    verificationDocuments: zod_1.z.array(VerificationDocumentSchema).default([]),
    frontendUrl: zod_1.z.string().url().max(2048).optional(),
    backendUrl: zod_1.z.string().url().max(2048).optional(),
    lastVerificationDate: zod_1.z.string().min(1).optional(),
    lastVerifier: zod_1.z.string().min(1).max(120).optional(),
    verificationProgress: VerificationProgressSchema.optional(),
    status: zod_1.z.enum(['ACTIVE', 'PENDING', 'ARCHIVED', 'MONITORING', 'REVIEW']).optional(),
});
const ApplicationUpdateSchema = ApplicationCreateSchema.partial();
let ApplicationsController = class ApplicationsController {
    applicationsService;
    authService;
    constructor(applicationsService, authService) {
        this.applicationsService = applicationsService;
        this.authService = authService;
    }
    async currentUser(req) {
        const token = (0, request_cookies_1.getRequestCookies)(req)[auth_constants_1.AUTH_COOKIE_NAME];
        const user = token ? await this.authService.getPersistentUserBySession(token) : undefined;
        if (!user)
            throw new common_1.UnauthorizedException('Authentication is required.');
        return user;
    }
    async requireManager(req) {
        const user = await this.currentUser(req);
        if (!['SUPERADMIN', 'OVERSEER'].includes(user.role))
            throw new common_1.ForbiddenException('Only administrators and overseers can manage applications.');
        return user;
    }
    async requireViewer(req) {
        const user = await this.currentUser(req);
        if (!['SUPERADMIN', 'OVERSEER', 'VERIFICATOR'].includes(user.role))
            throw new common_1.ForbiddenException('This role cannot access application assurance data.');
        return user;
    }
    async list(page, search, sortBy, sortOrder, req) {
        if (req)
            await this.requireViewer(req);
        return this.applicationsService.listApplicationsPersistent(Number(page) || 1, { search, sortBy, sortOrder });
    }
    getLanguages() {
        return {
            data: this.applicationsService.getLanguages(),
            meta: {},
        };
    }
    async options(req) {
        await this.requireViewer(req);
        return { data: await this.applicationsService.listApplicationOptions(), meta: {} };
    }
    getFrameworks() {
        return {
            data: this.applicationsService.getFrameworks(),
            meta: {},
        };
    }
    async get(id, req) {
        await this.requireViewer(req);
        return this.applicationsService.getApplicationPersistent(id);
    }
    async refreshVerificationProgress(id, req) {
        await this.requireViewer(req);
        return this.applicationsService.refreshVerificationProgress(id);
    }
    async previewVerification(body, req) {
        await this.currentUser(req);
        const document = (0, verification_document_config_1.applyVerificationDocumentSettings)(VerificationDocumentSchema.parse(body));
        try {
            return await this.applicationsService.previewVerificationProgress(document);
        }
        catch (error) {
            const message = error instanceof Error ? error.message : 'Google Sheets preview failed.';
            throw new common_1.BadRequestException(message);
        }
    }
    async detectLibraries(body, req) {
        await this.currentUser(req);
        const parsed = zod_1.z.object({ files: zod_1.z.array(DependencyFileSchema).min(1).max(40) }).parse(body);
        const libraries = this.applicationsService.detectLibraries(parsed.files);
        return { data: { detected: libraries.length > 0, libraries }, meta: {} };
    }
    async create(body, req) {
        await this.requireManager(req);
        const dto = ApplicationCreateSchema.parse(body);
        const { dependencyFiles, ...application } = dto;
        try {
            return await this.applicationsService.createApplicationPersistent({
                ...application,
                ...(dependencyFiles ? { dependencyFiles } : {}),
                verificationDocuments: dto.verificationDocuments.map(verification_document_config_1.applyVerificationDocumentSettings),
                id: crypto.randomUUID(),
                createdAt: undefined,
                updatedAt: undefined,
            });
        }
        catch (error) {
            const requestId = req.headers['x-request-id'] ?? 'unknown';
            console.error(JSON.stringify({
                level: 'error',
                type: 'application_create_failed',
                requestId,
                error: error instanceof Error ? error.message : String(error),
            }));
            throw new common_1.BadRequestException(error instanceof Error ? error.message : 'Unable to create application.');
        }
    }
    async update(id, body, req) {
        await this.requireManager(req);
        const dto = ApplicationUpdateSchema.parse(body);
        const { dependencyFiles, ...application } = dto;
        return this.applicationsService.updateApplicationPersistent(id, {
            ...application,
            ...(dependencyFiles ? { dependencyFiles } : {}),
            ...(dto.verificationDocuments ? { verificationDocuments: dto.verificationDocuments.map(verification_document_config_1.applyVerificationDocumentSettings) } : {}),
        });
    }
    async remove(id, body, req) {
        const accessToken = req.cookies?.[auth_constants_1.AUTH_COOKIE_NAME];
        const user = accessToken ? await this.authService.getPersistentUserBySession(accessToken) : undefined;
        if (!user)
            throw new common_1.UnauthorizedException('Authentication is required.');
        if (!accessToken)
            throw new common_1.UnauthorizedException('Authentication is required.');
        if (!['SUPERADMIN', 'OVERSEER'].includes(user.role))
            throw new common_1.ForbiddenException('Only administrators and overseers can delete applications.');
        const password = zod_1.z.object({ password: zod_1.z.string().min(12).max(128) }).parse(body).password;
        const verified = await this.authService.verifyPasswordForSession(accessToken, password);
        if (!verified)
            throw new common_1.UnauthorizedException('Password confirmation failed.');
        await this.applicationsService.deleteApplicationPersistent(id);
        return { data: { deleted: true, id }, meta: {} };
    }
    async assignPic(id, body, req) {
        await this.requireManager(req);
        const dto = zod_1.z.object({ picId: zod_1.z.string() }).parse(body);
        return this.applicationsService.assignPicPersistent(id, dto.picId);
    }
};
exports.ApplicationsController = ApplicationsController;
__decorate([
    (0, common_1.Get)(),
    __param(0, (0, common_1.Query)('page')),
    __param(1, (0, common_1.Query)('search')),
    __param(2, (0, common_1.Query)('sortBy')),
    __param(3, (0, common_1.Query)('sortOrder')),
    __param(4, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, String, String, Object]),
    __metadata("design:returntype", Promise)
], ApplicationsController.prototype, "list", null);
__decorate([
    (0, common_1.Get)('metadata/languages'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", void 0)
], ApplicationsController.prototype, "getLanguages", null);
__decorate([
    (0, common_1.Get)('options'),
    __param(0, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], ApplicationsController.prototype, "options", null);
__decorate([
    (0, common_1.Get)('metadata/frameworks'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", void 0)
], ApplicationsController.prototype, "getFrameworks", null);
__decorate([
    (0, common_1.Get)(':id'),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", Promise)
], ApplicationsController.prototype, "get", null);
__decorate([
    (0, common_1.Get)(':id/verification-progress'),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", Promise)
], ApplicationsController.prototype, "refreshVerificationProgress", null);
__decorate([
    (0, common_1.Post)('verification-preview'),
    __param(0, (0, common_1.Body)()),
    __param(1, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", Promise)
], ApplicationsController.prototype, "previewVerification", null);
__decorate([
    (0, common_1.Post)('detect-libraries'),
    __param(0, (0, common_1.Body)()),
    __param(1, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", Promise)
], ApplicationsController.prototype, "detectLibraries", null);
__decorate([
    (0, common_1.Post)(),
    __param(0, (0, common_1.Body)()),
    __param(1, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", Promise)
], ApplicationsController.prototype, "create", null);
__decorate([
    (0, common_1.Put)(':id'),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, common_1.Body)()),
    __param(2, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object, Object]),
    __metadata("design:returntype", Promise)
], ApplicationsController.prototype, "update", null);
__decorate([
    (0, common_1.Delete)(':id'),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, common_1.Body)()),
    __param(2, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object, Object]),
    __metadata("design:returntype", Promise)
], ApplicationsController.prototype, "remove", null);
__decorate([
    (0, common_1.Put)(':id/pic'),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, common_1.Body)()),
    __param(2, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object, Object]),
    __metadata("design:returntype", Promise)
], ApplicationsController.prototype, "assignPic", null);
exports.ApplicationsController = ApplicationsController = __decorate([
    (0, common_1.Controller)('applications'),
    __metadata("design:paramtypes", [applications_service_1.ApplicationsService, auth_service_1.AuthService])
], ApplicationsController);
//# sourceMappingURL=applications.controller.js.map