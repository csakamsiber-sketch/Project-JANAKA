"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const verification_period_service_1 = require("./verification-period.service");
describe('VerificationPeriodService', () => {
    it('creates a verification period', () => {
        const service = new verification_period_service_1.VerificationPeriodService();
        const period = service.createPeriod({
            applicationId: 'app-1',
            name: 'Sept 2026',
            startDate: new Date('2026-09-01T00:00:00.000Z'),
            endDate: new Date('2026-09-15T00:00:00.000Z'),
            status: 'ACTIVE',
            scope: 'Authentication, session, API security',
            assignedVerificatorId: 'verifier-1',
        });
        expect(period.name).toBe('Sept 2026');
        expect(service.listPeriods()).toHaveLength(1);
    });
});
//# sourceMappingURL=verification-period.service.spec.js.map