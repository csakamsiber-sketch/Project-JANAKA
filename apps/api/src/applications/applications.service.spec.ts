jest.mock('@nestjs/common', () => ({
  Injectable: () => (target: unknown) => target,
  Logger: class Logger {
    constructor() {}
    log() {}
    warn() {}
  },
  OnApplicationBootstrap: () => (target: unknown) => target,
}));

import { ApplicationsService } from './applications.service';

describe('ApplicationsService', () => {
  it('creates and lists applications', () => {
    const service = new ApplicationsService();
    const app = service.createApplication({
      name: 'Core Portal',
      description: 'Main platform',
      organization: 'PT Example',
      environment: 'PRODUCTION',
      language: 'TypeScript',
      framework: 'Next.js',
      technologyStack: ['nextjs', 'nestjs'],
      projectStartDate: '2025-01-10',
      owner: 'engineering',
      developerIds: ['dev-1', 'dev-2'],
      googleSheetId: 'sheet-1',
      spreadsheetLinks: [
        { type: 'WEB_FE', label: 'FE Sheet', url: 'https://example.com/fe' },
        { type: 'WEB_BE', label: 'BE Sheet', url: 'https://example.com/be' },
      ],
      verificationProgress: {
        percent: 25,
        lastUpdated: '2026-09-01T00:00:00Z',
        lastVerifier: 'Verificator A',
        status: 'IN_PROGRESS',
      },
      status: 'PENDING',
    });

    expect(app.name).toBe('Core Portal');
    expect(service.listApplications()).toHaveLength(1);
  });

  it('assigns a PIC to an application', () => {
    const service = new ApplicationsService();
    const app = service.createApplication({
      name: 'Employee App',
      organization: 'PT Example',
      environment: 'STAGING',
      language: 'JavaScript',
      framework: 'React',
      technologyStack: ['react'],
      projectStartDate: '2025-03-01',
      owner: 'product',
      developerIds: [],
      spreadsheetLinks: [{ type: 'MOBILE', label: 'Mobile', url: 'https://example.com/mobile' }],
      verificationProgress: {
        percent: 50,
        lastUpdated: '2026-09-02T00:00:00Z',
        lastVerifier: 'Verificator B',
        status: 'IN_PROGRESS',
      },
      status: 'ACTIVE',
    });

    const updated = service.assignPic(app.id, 'pic-9');
    expect(updated?.picId).toBe('pic-9');
  });

  it('checks URL reachability for applications', async () => {
    const originalFetch = global.fetch;
    global.fetch = jest.fn().mockResolvedValue({ ok: true, status: 200 }) as unknown as typeof fetch;

    try {
      const service = new ApplicationsService();
      const app = service.createApplication({
        name: 'Health Check App',
        organization: 'PT Example',
        environment: 'PRODUCTION',
        language: 'TypeScript',
        framework: 'Next.js',
        technologyStack: ['nextjs'],
        projectStartDate: '2025-05-15',
        owner: 'platform',
        developerIds: [],
        spreadsheetLinks: [],
        frontendUrl: 'https://example.com',
        backendUrl: 'https://api.example.com',
        verificationProgress: {
          percent: 10,
          lastUpdated: '2026-09-02T00:00:00Z',
          lastVerifier: 'Verificator C',
          status: 'IN_PROGRESS',
        },
        status: 'ACTIVE',
      });

      const result = await service.checkApplicationUrls([app]);
      expect(result.checked).toBe(2);
      expect(result.healthy).toBe(2);
      expect(result.failed).toBe(0);
    } finally {
      global.fetch = originalFetch;
    }
  });

  it('preserves decimal verification percentages when combining document progress', () => {
    const service = new ApplicationsService();
    const result = (service as any).combineProgress([
      { progress: { percent: 72.83, totalPoints: 100, passPoints: 72.83, needToFixPoints: 8.21, waitingForReviewPoints: 5.12, uncheckPoints: 13.84, checkingPercent: 86.16, pendingVerificationPercent: 18.96, lastUpdated: '2026-09-01T00:00:00Z', lastVerifier: 'A', lastVerificationDate: '2026-09-01', status: 'IN_PROGRESS', notes: '' } },
      { progress: { percent: 67.17, totalPoints: 100, passPoints: 67.17, needToFixPoints: 15.99, waitingForReviewPoints: 2.5, uncheckPoints: 14.34, checkingPercent: 85.66, pendingVerificationPercent: 16.84, lastUpdated: '2026-09-02T00:00:00Z', lastVerifier: 'B', lastVerificationDate: '2026-09-02', status: 'IN_PROGRESS', notes: '' } },
    ]);

    expect(result.percent).toBe(70.0);
    expect(result.checkingPercent).toBe(85.91);
    expect(result.pendingVerificationPercent).toBe(17.9);
  });

  it('keeps New Feature and Bug Fixing values as point-based values', () => {
    const service = new ApplicationsService();
    const result = (service as any).buildReadResult(
      [92.9, 7.1, 0, 0, 'My App', 'Owner Name', 'https://example.com', 'https://api.example.com', '2025-01-10', '2026-09-01', 'Sample description', 'PIC Name', 'TypeScript', 'Next.js', 'Node.js', 'NestJS', 'John Doe'],
      ['C14', 'D14', 'E14', 'F14', 'B3', 'C4', 'B5', 'B6', 'C6', 'D6', 'E4', 'F8', 'D8', 'D9', 'F9', 'B13'],
      { type: 'NEW_FEATURE_BUG_FIXING', label: 'New Feature and Bug Fixing', url: 'https://docs.google.com/spreadsheets/d/test', sheetName: 'Dashboard', passCell: 'C14', needToFixCell: 'D14', waitingForReviewCell: 'E14', uncheckCell: 'F14', totalPoints: 100 },
      'unit-test',
      'test-sheet-id',
    );

    expect(result.values).toEqual([92.9, 7.1, 0, 0]);
    expect(result.totalPoints).toBeUndefined();
    expect(result.spreadsheetData?.applicationName).toBe('My App');
  });

  it('treats a 100% pass value as full points instead of 1 point', () => {
    const service = new ApplicationsService();
    const result = (service as any).calculateProgress([1, 0, 0, 0], 100);

    expect(result.percent).toBe(100);
    expect(result.passPoints).toBe(100);
    expect(result.status).toBe('APPROVED');
  });
});
