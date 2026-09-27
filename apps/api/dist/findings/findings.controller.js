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
exports.FindingsController = void 0;
const common_1 = require("@nestjs/common");
const zod_1 = require("zod");
const findings_service_1 = require("./findings.service");
const auth_service_1 = require("../auth/auth.service");
const auth_constants_1 = require("../auth/auth.constants");
const request_cookies_1 = require("../common/request-cookies");
const FindingCreateSchema = zod_1.z.object({
    applicationId: zod_1.z.string().min(1),
    verificationPeriodId: zod_1.z.string().min(1),
    source: zod_1.z.string().min(1),
    title: zod_1.z.string().min(1),
    description: zod_1.z.string().min(1),
    severity: zod_1.z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL', 'INFO']),
    status: zod_1.z.enum(['OPEN', 'UNDER_REVIEW', 'MITIGATED', 'FIXED', 'FALSE_POSITIVE', 'ACCEPTED_RISK']).default('OPEN'),
    affectedComponent: zod_1.z.string().min(1),
    cve: zod_1.z.string().optional().transform((value) => value ?? undefined),
    evidence: zod_1.z.string().optional().transform((value) => value ?? undefined),
    recommendation: zod_1.z.string().optional().transform((value) => value ?? undefined),
    createdBy: zod_1.z.string().min(1),
});
const FindingCheckCveSchema = zod_1.z.object({
    applicationId: zod_1.z.string().min(1),
    verificationPeriodId: zod_1.z.string().optional().transform((value) => value ?? 'system'),
    title: zod_1.z.string().min(1),
    description: zod_1.z.string().min(1),
    severity: zod_1.z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL', 'INFO']),
    affectedComponent: zod_1.z.string().min(1),
    source: zod_1.z.string().min(1).default('OSV_CHECK'),
    createdBy: zod_1.z.string().min(1),
    packageName: zod_1.z.string().optional().transform((value) => value ?? undefined),
    version: zod_1.z.string().optional().transform((value) => value ?? undefined),
});
let FindingsController = class FindingsController {
    findingsService;
    authService;
    constructor(findingsService, authService) {
        this.findingsService = findingsService;
        this.authService = authService;
    }
    async requireUser(req) {
        const token = (0, request_cookies_1.getRequestCookies)(req)[auth_constants_1.AUTH_COOKIE_NAME];
        const user = token ? await this.authService.getPersistentUserBySession(token) : undefined;
        if (!user)
            throw new common_1.UnauthorizedException('Authentication is required.');
        return user;
    }
    list(page, limit, applicationId, severity) {
        const payload = {
            page: page && Number(page) > 0 ? Number(page) : 1,
            limit: limit && Number(limit) > 0 ? Number(limit) : 10,
        };
        const sanitizedApplicationId = applicationId?.trim();
        const sanitizedSeverity = severity?.trim();
        if (sanitizedApplicationId)
            payload.applicationId = sanitizedApplicationId;
        if (sanitizedSeverity)
            payload.severity = sanitizedSeverity.toUpperCase();
        return this.findingsService.listFindings(payload);
    }
    async checkCve(body, req) {
        const user = await this.requireUser(req);
        if (!['SUPERADMIN', 'OVERSEER', 'VERIFICATOR'].includes(user.role))
            throw new common_1.ForbiddenException('This role cannot check CVEs.');
        const dto = FindingCheckCveSchema.parse(body);
        const payload = {
            applicationId: dto.applicationId,
            verificationPeriodId: dto.verificationPeriodId,
            title: dto.title,
            description: dto.description,
            severity: dto.severity,
            affectedComponent: dto.affectedComponent,
            source: dto.source,
            createdBy: dto.createdBy,
        };
        if (dto.packageName)
            payload.packageName = dto.packageName;
        if (dto.version)
            payload.version = dto.version;
        return this.findingsService.checkCve(payload);
    }
    async create(body, req) {
        const user = await this.requireUser(req);
        if (!['SUPERADMIN', 'OVERSEER', 'VERIFICATOR'].includes(user.role))
            throw new common_1.ForbiddenException('This role cannot create findings.');
        const dto = FindingCreateSchema.parse(body);
        return this.findingsService.createFinding(dto);
    }
    async updateStatus(id, body, req) {
        const user = await this.requireUser(req);
        if (!['SUPERADMIN', 'OVERSEER', 'VERIFICATOR'].includes(user.role))
            throw new common_1.ForbiddenException('This role cannot update findings.');
        const dto = zod_1.z.object({ status: zod_1.z.enum(['OPEN', 'UNDER_REVIEW', 'MITIGATED', 'FIXED', 'FALSE_POSITIVE', 'ACCEPTED_RISK']) }).parse(body);
        return this.findingsService.updateStatus(id, dto.status);
    }
};
exports.FindingsController = FindingsController;
__decorate([
    (0, common_1.Get)(),
    __param(0, (0, common_1.Query)('page')),
    __param(1, (0, common_1.Query)('limit')),
    __param(2, (0, common_1.Query)('applicationId')),
    __param(3, (0, common_1.Query)('severity')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, String, String]),
    __metadata("design:returntype", void 0)
], FindingsController.prototype, "list", null);
__decorate([
    (0, common_1.Post)('check-cve'),
    __param(0, (0, common_1.Body)()),
    __param(1, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", Promise)
], FindingsController.prototype, "checkCve", null);
__decorate([
    (0, common_1.Post)(),
    __param(0, (0, common_1.Body)()),
    __param(1, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", Promise)
], FindingsController.prototype, "create", null);
__decorate([
    (0, common_1.Patch)(':id/status'),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, common_1.Body)()),
    __param(2, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object, Object]),
    __metadata("design:returntype", Promise)
], FindingsController.prototype, "updateStatus", null);
exports.FindingsController = FindingsController = __decorate([
    (0, common_1.Controller)('findings'),
    __metadata("design:paramtypes", [findings_service_1.FindingsService, auth_service_1.AuthService])
], FindingsController);
//# sourceMappingURL=findings.controller.js.map