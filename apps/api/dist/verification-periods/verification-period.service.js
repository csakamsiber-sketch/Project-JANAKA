"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.VerificationPeriodService = void 0;
class VerificationPeriodService {
    periods = new Map();
    createPeriod(input) {
        const now = new Date();
        const period = {
            id: input.id ?? crypto.randomUUID(),
            applicationId: input.applicationId,
            name: input.name,
            startDate: input.startDate,
            endDate: input.endDate,
            status: input.status,
            scope: input.scope,
            assignedVerificatorId: input.assignedVerificatorId,
            createdAt: now,
            updatedAt: now,
        };
        this.periods.set(period.id, period);
        return period;
    }
    listPeriods() {
        return Array.from(this.periods.values());
    }
    getPeriod(id) {
        return this.periods.get(id);
    }
}
exports.VerificationPeriodService = VerificationPeriodService;
//# sourceMappingURL=verification-period.service.js.map