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
exports.SyncController = void 0;
const common_1 = require("@nestjs/common");
const auth_service_1 = require("../auth/auth.service");
const auth_constants_1 = require("../auth/auth.constants");
const request_cookies_1 = require("../common/request-cookies");
const sync_service_1 = require("./sync.service");
let SyncController = class SyncController {
    auth;
    sync;
    constructor(auth, sync) {
        this.auth = auth;
        this.sync = sync;
    }
    async masterDataSync(req) {
        const user = await this.user(req);
        return { data: this.sync.start(user.id, 'master-data'), meta: {} };
    }
    async user(req) {
        const token = (0, request_cookies_1.getRequestCookies)(req)[auth_constants_1.AUTH_COOKIE_NAME];
        const user = token ? await this.auth.getPersistentUserBySession(token) : undefined;
        if (!user)
            throw new common_1.ForbiddenException('Authentication is required.');
        if (!['SUPERADMIN', 'OVERSEER'].includes(user.role))
            throw new common_1.ForbiddenException('Only administrators can run synchronization.');
        return user;
    }
    async start(kind, req) {
        const user = await this.user(req);
        if (kind !== 'applications' && kind !== 'findings')
            throw new common_1.ForbiddenException('Unsupported synchronization type.');
        return { data: this.sync.start(user.id, kind), meta: {} };
    }
    async status(jobId, req) {
        const user = await this.user(req);
        return { data: this.sync.get(user.id, jobId), meta: {} };
    }
};
exports.SyncController = SyncController;
__decorate([
    (0, common_1.Post)('master-data'),
    __param(0, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], SyncController.prototype, "masterDataSync", null);
__decorate([
    (0, common_1.Post)(':kind'),
    __param(0, (0, common_1.Param)('kind')),
    __param(1, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", Promise)
], SyncController.prototype, "start", null);
__decorate([
    (0, common_1.Get)(':jobId'),
    __param(0, (0, common_1.Param)('jobId')),
    __param(1, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", Promise)
], SyncController.prototype, "status", null);
exports.SyncController = SyncController = __decorate([
    (0, common_1.Controller)('sync'),
    __metadata("design:paramtypes", [auth_service_1.AuthService, sync_service_1.SyncService])
], SyncController);
//# sourceMappingURL=sync.controller.js.map