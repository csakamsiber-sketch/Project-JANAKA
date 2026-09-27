import { VerificationPeriodService } from './verification-period.service';

describe('VerificationPeriodService', () => {
  it('creates a verification period', () => {
    const service = new VerificationPeriodService();
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
