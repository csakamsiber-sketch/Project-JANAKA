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
Object.defineProperty(exports, "__esModule", { value: true });
exports.CtiController = void 0;
const common_1 = require("@nestjs/common");
const cti_service_1 = require("./cti.service");
let CtiController = class CtiController {
    ctiService;
    constructor(ctiService) {
        this.ctiService = ctiService;
    }
    listAlerts() {
        return [
            {
                id: 'ADV-201',
                title: 'Upstream package advisory',
                source: 'NVD',
                severity: 'HIGH',
                summary: 'Critical vulnerability in a common parser library affecting authentication handling.',
                affectedComponent: 'Auth Gateway',
                publishedAt: '2026-09-10',
            },
            {
                id: 'ADV-202',
                title: 'OAuth session hardening patch',
                source: 'GHSA',
                severity: 'MEDIUM',
                summary: 'Weak session invalidation controls were reported in the OAuth integration.',
                affectedComponent: 'Identity Platform',
                publishedAt: '2026-09-08',
            },
        ].filter(Boolean);
    }
};
exports.CtiController = CtiController;
__decorate([
    (0, common_1.Get)('alerts'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", void 0)
], CtiController.prototype, "listAlerts", null);
exports.CtiController = CtiController = __decorate([
    (0, common_1.Controller)('cti'),
    __metadata("design:paramtypes", [cti_service_1.CtiService])
], CtiController);
//# sourceMappingURL=cti.controller.js.map