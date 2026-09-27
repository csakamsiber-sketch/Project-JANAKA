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
exports.MeetingRequestsController = void 0;
const common_1 = require("@nestjs/common");
const zod_1 = require("zod");
const meeting_requests_service_1 = require("./meeting-requests.service");
const auth_service_1 = require("../auth/auth.service");
const auth_constants_1 = require("../auth/auth.constants");
const request_cookies_1 = require("../common/request-cookies");
const MeetingRequestSchema = zod_1.z.object({
    id: zod_1.z.string().min(1),
    applicationId: zod_1.z.string().min(1),
    requestedBy: zod_1.z.string().min(1),
    verificatorId: zod_1.z.string().optional().transform((value) => value ?? undefined),
    title: zod_1.z.string().min(1),
    agenda: zod_1.z.string().min(1),
    proposedStart: zod_1.z.string().min(1),
    proposedEnd: zod_1.z.string().min(1),
    status: zod_1.z.enum(['PENDING', 'APPROVED', 'REJECTED', 'CANCELLED', 'RESCHEDULED']).default('PENDING'),
    notes: zod_1.z.string().optional().transform((value) => value ?? undefined),
});
let MeetingRequestsController = class MeetingRequestsController {
    meetingRequestsService;
    authService;
    constructor(meetingRequestsService, authService) {
        this.meetingRequestsService = meetingRequestsService;
        this.authService = authService;
    }
    async currentUser(req) {
        const accessToken = (0, request_cookies_1.getRequestCookies)(req)[auth_constants_1.AUTH_COOKIE_NAME];
        const user = accessToken ? await this.authService.getPersistentUserBySession(accessToken) : undefined;
        if (!user)
            throw new common_1.ForbiddenException('Authentication is required.');
        return user;
    }
    async listSchedules(period, verificatorId, page, limit, req) {
        const user = await this.currentUser(req);
        const dto = zod_1.z.object({
            period: zod_1.z.enum(['today', 'week', 'month', 'all']).default('today'),
            verificatorId: zod_1.z.string().uuid().optional(),
            page: zod_1.z.coerce.number().int().min(1).default(1),
            limit: zod_1.z.coerce.number().int().min(1).max(50).default(10),
        }).parse({ period, verificatorId, page, limit });
        return this.meetingRequestsService.listSchedules(user.id, user.role, dto);
    }
    async listScheduleOptions(req) {
        const user = await this.currentUser(req);
        if (!['SUPERADMIN', 'OVERSEER'].includes(user.role))
            throw new common_1.ForbiddenException('Only administrators and overseers can view scheduling options.');
        return this.meetingRequestsService.listScheduleOptions();
    }
    async createSchedule(body, req) {
        const user = await this.currentUser(req);
        if (!['SUPERADMIN', 'OVERSEER'].includes(user.role))
            throw new common_1.ForbiddenException('Only administrators and overseers can schedule meetings.');
        const dto = zod_1.z.object({ applicationId: zod_1.z.string().uuid(), verificatorId: zod_1.z.string().uuid(), startAt: zod_1.z.string().datetime(), endAt: zod_1.z.string().datetime(), purpose: zod_1.z.string().min(1).max(500), timezone: zod_1.z.string().max(80).optional(), forceConflictOverride: zod_1.z.boolean().optional() }).parse(body);
        return this.meetingRequestsService.createSchedule({ ...dto, ...(dto.timezone ? { timezone: dto.timezone } : {}), createdById: user.id });
    }
    async updateSchedule(id, body, req) {
        const user = await this.currentUser(req);
        if (!['SUPERADMIN', 'OVERSEER'].includes(user.role))
            throw new common_1.ForbiddenException('Only administrators and overseers can edit meetings.');
        const dto = zod_1.z.object({ applicationId: zod_1.z.string().uuid().optional(), verificatorId: zod_1.z.string().uuid().optional(), startAt: zod_1.z.string().datetime().optional(), endAt: zod_1.z.string().datetime().optional(), purpose: zod_1.z.string().min(1).max(500).optional(), timezone: zod_1.z.string().max(80).optional(), forceConflictOverride: zod_1.z.boolean().optional() }).parse(body ?? {});
        return this.meetingRequestsService.updateSchedule(id, dto);
    }
    async deleteSchedule(id, req) {
        const user = await this.currentUser(req);
        if (!['SUPERADMIN', 'OVERSEER'].includes(user.role))
            throw new common_1.ForbiddenException('Only administrators and overseers can delete meetings.');
        return this.meetingRequestsService.deleteSchedule(id);
    }
    async startSchedule(id, req) {
        const user = await this.currentUser(req);
        return this.meetingRequestsService.startSchedule(id, user.id, user.role);
    }
    async finishSchedule(id, body, req) {
        const user = await this.currentUser(req);
        const dto = zod_1.z.object({ notes: zod_1.z.string().max(4000).optional() }).parse(body ?? {});
        return this.meetingRequestsService.finishSchedule(id, user.id, user.role, dto.notes);
    }
    listApplicationResults(applicationId) {
        return this.meetingRequestsService.listApplicationResults(applicationId);
    }
    async report(month, year, req) {
        const user = await this.currentUser(req);
        const parsed = zod_1.z.object({ month: zod_1.z.coerce.number().int().min(1).max(12), year: zod_1.z.coerce.number().int().min(2000).max(2100) }).parse({ month, year });
        return this.meetingRequestsService.generateReport(user.id, user.role, parsed.month, parsed.year);
    }
    listRequests() {
        return this.meetingRequestsService.listRequests();
    }
    async createRequest(body, req) {
        const user = await this.currentUser(req);
        if (!['PIC', 'VERIFICATOR', 'SUPERADMIN', 'OVERSEER'].includes(user.role))
            throw new common_1.ForbiddenException('This role cannot request meetings.');
        const dto = MeetingRequestSchema.parse(body);
        return this.meetingRequestsService.createRequest(dto);
    }
    async updateRequest(id, body, req) {
        const user = await this.currentUser(req);
        if (!['SUPERADMIN', 'OVERSEER'].includes(user.role))
            throw new common_1.ForbiddenException('Only administrators and overseers can update meeting requests.');
        const dto = zod_1.z.object({ status: zod_1.z.enum(['PENDING', 'APPROVED', 'REJECTED', 'CANCELLED', 'RESCHEDULED']), notes: zod_1.z.string().optional() }).parse(body);
        return this.meetingRequestsService.updateRequest(id, dto.status, dto.notes);
    }
};
exports.MeetingRequestsController = MeetingRequestsController;
__decorate([
    (0, common_1.Get)('schedules'),
    __param(0, (0, common_1.Query)('period')),
    __param(1, (0, common_1.Query)('verificatorId')),
    __param(2, (0, common_1.Query)('page')),
    __param(3, (0, common_1.Query)('limit')),
    __param(4, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, String, String, Object]),
    __metadata("design:returntype", Promise)
], MeetingRequestsController.prototype, "listSchedules", null);
__decorate([
    (0, common_1.Get)('schedules/options'),
    __param(0, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], MeetingRequestsController.prototype, "listScheduleOptions", null);
__decorate([
    (0, common_1.Post)('schedules'),
    __param(0, (0, common_1.Body)()),
    __param(1, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", Promise)
], MeetingRequestsController.prototype, "createSchedule", null);
__decorate([
    (0, common_1.Patch)('schedules/:id'),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, common_1.Body)()),
    __param(2, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object, Object]),
    __metadata("design:returntype", Promise)
], MeetingRequestsController.prototype, "updateSchedule", null);
__decorate([
    (0, common_1.Delete)('schedules/:id'),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", Promise)
], MeetingRequestsController.prototype, "deleteSchedule", null);
__decorate([
    (0, common_1.Post)('schedules/:id/start'),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", Promise)
], MeetingRequestsController.prototype, "startSchedule", null);
__decorate([
    (0, common_1.Post)('schedules/:id/finish'),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, common_1.Body)()),
    __param(2, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object, Object]),
    __metadata("design:returntype", Promise)
], MeetingRequestsController.prototype, "finishSchedule", null);
__decorate([
    (0, common_1.Get)('application/:applicationId/results'),
    __param(0, (0, common_1.Param)('applicationId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", void 0)
], MeetingRequestsController.prototype, "listApplicationResults", null);
__decorate([
    (0, common_1.Get)('reports'),
    __param(0, (0, common_1.Query)('month')),
    __param(1, (0, common_1.Query)('year')),
    __param(2, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, Object]),
    __metadata("design:returntype", Promise)
], MeetingRequestsController.prototype, "report", null);
__decorate([
    (0, common_1.Get)('requests'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", void 0)
], MeetingRequestsController.prototype, "listRequests", null);
__decorate([
    (0, common_1.Post)('requests'),
    __param(0, (0, common_1.Body)()),
    __param(1, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", Promise)
], MeetingRequestsController.prototype, "createRequest", null);
__decorate([
    (0, common_1.Patch)('requests/:id'),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, common_1.Body)()),
    __param(2, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object, Object]),
    __metadata("design:returntype", Promise)
], MeetingRequestsController.prototype, "updateRequest", null);
exports.MeetingRequestsController = MeetingRequestsController = __decorate([
    (0, common_1.Controller)('meetings'),
    __metadata("design:paramtypes", [meeting_requests_service_1.MeetingRequestsService, auth_service_1.AuthService])
], MeetingRequestsController);
//# sourceMappingURL=meeting-requests.controller.js.map