"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
jest.mock('@nestjs/common', () => ({
    Injectable: () => (target) => target,
}));
jest.mock('@nestjs/common', () => ({
    Injectable: () => (target) => target,
}));
const libraries_service_1 = require("../libraries/libraries.service");
const findings_service_1 = require("./findings.service");
describe('FindingsService', () => {
    it('creates and lists findings', async () => {
        const service = new findings_service_1.FindingsService();
        const finding = service.createFinding({
            applicationId: 'app-1',
            verificationPeriodId: 'period-1',
            source: 'STATIC_SCAN',
            title: 'Weak cookie flags',
            description: 'Session cookies without explicit protections',
            severity: 'HIGH',
            status: 'OPEN',
            affectedComponent: 'auth.middleware',
            evidence: 'Cookie config lacked secure and sameSite',
            recommendation: 'Set secure flags and use SameSite = Lax/Strict',
            createdBy: 'verifier-1',
            cve: 'CVE-2024-1001',
        });
        expect(finding.title).toBe('Weak cookie flags');
        const result = await service.listFindings();
        expect(result.items).toHaveLength(1);
    });
    it('deduplicates CVE findings and paginates filtered results', async () => {
        const service = new findings_service_1.FindingsService();
        service.createFinding({
            applicationId: 'app-1',
            verificationPeriodId: 'period-1',
            source: 'STATIC_SCAN',
            title: 'Weak cookie flags',
            description: 'Session cookies without explicit protections',
            severity: 'HIGH',
            status: 'OPEN',
            affectedComponent: 'auth.middleware',
            evidence: 'Cookie config lacked secure and sameSite',
            recommendation: 'Set secure flags and use SameSite = Lax/Strict',
            createdBy: 'verifier-1',
            cve: 'CVE-2024-1001',
        });
        service.createFinding({
            applicationId: 'app-1',
            verificationPeriodId: 'period-1',
            source: 'STATIC_SCAN',
            title: 'Weak cookie flags',
            description: 'Duplicate detection should ignore same CVE',
            severity: 'HIGH',
            status: 'OPEN',
            affectedComponent: 'auth.middleware',
            evidence: 'Same issue',
            recommendation: 'Fix same issue',
            createdBy: 'verifier-1',
            cve: 'CVE-2024-1001',
        });
        service.createFinding({
            applicationId: 'app-2',
            verificationPeriodId: 'period-2',
            source: 'MANUAL',
            title: 'Input validation gap',
            description: 'Missing schema enforcement',
            severity: 'MEDIUM',
            status: 'OPEN',
            affectedComponent: 'api',
            evidence: 'Payload accepted malformed fields',
            recommendation: 'Reject unknown keys and validate all inputs',
            createdBy: 'verifier-2',
            cve: 'CVE-2024-1002',
        });
        const filtered = await service.listFindings({ applicationId: 'app-1', page: 1, limit: 10 });
        expect(filtered.items).toHaveLength(1);
        expect(filtered.total).toBe(1);
        expect(filtered.totalPages).toBe(1);
        expect(filtered.items[0]?.cve).toBe('CVE-2024-1001');
    });
    it('enriches a finding with a CVE when checking OSV', async () => {
        const service = new findings_service_1.FindingsService();
        const originalFetch = global.fetch;
        global.fetch = jest.fn().mockResolvedValue({
            ok: true,
            json: async () => ({ vulns: [{ id: 'CVE-2024-4444', database_specific: { severity: 'HIGH' } }] }),
        });
        try {
            const result = await service.checkCve({
                applicationId: 'app-3',
                verificationPeriodId: 'period-3',
                title: 'Potential SSRF to internal host',
                description: 'Outbound HTTP requests accept untrusted hosts',
                severity: 'HIGH',
                affectedComponent: 'http.client',
                source: 'OSV_CHECK',
                createdBy: 'verifier-3',
                packageName: 'axios',
                version: '0.21.0',
            });
            expect(result.cve).toBe('CVE-2024-4444');
            const listing = await service.listFindings();
            expect(listing.items).toHaveLength(1);
        }
        finally {
            global.fetch = originalFetch;
        }
    });
    it('omits Prisma filters when applicationId and severity are absent', async () => {
        const prisma = {
            vulnerability: {
                count: jest.fn().mockResolvedValue(2),
                findMany: jest.fn().mockResolvedValue([
                    {
                        id: 'vuln-1',
                        cve: 'CVE-2024-2001',
                        severity: 'HIGH',
                        summary: 'Prototype pollution issue',
                        fixedVersion: '2.0.0',
                        createdAt: new Date('2024-01-01T00:00:00.000Z'),
                        updatedAt: new Date('2024-01-02T00:00:00.000Z'),
                        library: {
                            libraryName: 'lodash',
                            version: '4.17.20',
                            applications: [{ applicationId: 'app-9' }],
                        },
                    },
                ]),
                groupBy: jest.fn().mockResolvedValue([
                    { severity: 'HIGH', _count: { _all: 2 } },
                ]),
            },
        };
        const service = new findings_service_1.FindingsService(prisma);
        await service.listFindings({ page: 1, limit: 10, applicationId: undefined, severity: undefined });
        expect(prisma.vulnerability.count).toHaveBeenCalledWith({ where: {} });
        expect(prisma.vulnerability.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: {} }));
    });
    it('reads findings from the vulnerability table when Prisma is available', async () => {
        const prisma = {
            vulnerability: {
                count: jest.fn().mockResolvedValue(2),
                findMany: jest.fn().mockResolvedValue([
                    {
                        id: 'vuln-1',
                        cve: 'CVE-2024-2001',
                        severity: 'HIGH',
                        summary: 'Prototype pollution issue',
                        fixedVersion: '2.0.0',
                        createdAt: new Date('2024-01-01T00:00:00.000Z'),
                        updatedAt: new Date('2024-01-02T00:00:00.000Z'),
                        library: {
                            libraryName: 'lodash',
                            version: '4.17.20',
                            applications: [{ applicationId: 'app-9' }],
                        },
                    },
                    {
                        id: 'vuln-2',
                        cve: null,
                        severity: 'MEDIUM',
                        summary: 'Insufficient validation in parser',
                        fixedVersion: null,
                        createdAt: new Date('2024-01-03T00:00:00.000Z'),
                        updatedAt: new Date('2024-01-04T00:00:00.000Z'),
                        library: {
                            libraryName: 'axios',
                            version: '0.21.0',
                            applications: [{ applicationId: 'app-10' }],
                        },
                    },
                ]),
                groupBy: jest.fn().mockResolvedValue([
                    { severity: 'HIGH', _count: { _all: 1 } },
                    { severity: 'MEDIUM', _count: { _all: 1 } },
                ]),
            },
        };
        const service = new findings_service_1.FindingsService(prisma);
        const result = await service.listFindings({ page: 1, limit: 10 });
        expect(prisma.vulnerability.count).toHaveBeenCalled();
        expect(prisma.vulnerability.findMany).toHaveBeenCalled();
        expect(prisma.vulnerability.groupBy).toHaveBeenCalled();
        expect(result.total).toBe(2);
        expect(result.summary).toEqual({ total: 2, critical: 0, high: 1, medium: 1, low: 0 });
        expect(result.items[0]?.applicationId).toBe('app-9');
        expect(result.items[0]?.cve).toBe('CVE-2024-2001');
        expect(result.items[1]?.title).toContain('axios');
    });
    it('normalizes GHSA-style OSV IDs to a real CVE before persisting to the database', async () => {
        const prisma = {
            library: {
                findMany: jest.fn().mockResolvedValue([
                    { id: 'lib-1', libraryName: 'axios', version: '0.21.0', ecosystem: 'npm' },
                ]),
            },
            vulnerability: {
                findMany: jest.fn().mockResolvedValue([]),
                findUnique: jest.fn().mockResolvedValue(null),
                update: jest.fn().mockResolvedValue({ id: 'vuln-1' }),
                delete: jest.fn().mockResolvedValue({ id: 'vuln-1' }),
                upsert: jest.fn().mockResolvedValue({ id: 'vuln-1' }),
            },
        };
        const originalFetch = global.fetch;
        global.fetch = jest.fn().mockResolvedValue({
            ok: true,
            json: async () => ({
                vulns: [{
                        id: 'GHSA-xxxx-xxxx',
                        aliases: ['CVE-2024-1234'],
                        summary: 'Prototype pollution in axios',
                        database_specific: { severity: 'CRITICAL' },
                        affected: [{ ranges: [{ events: [{ fixed: '1.2.3' }] }] }],
                    }],
            }),
        });
        try {
            const service = new libraries_service_1.LibrariesService(prisma);
            const synced = await service.syncLibraryVulnerabilities();
            expect(synced).toBe(1);
            expect(prisma.vulnerability.upsert).toHaveBeenCalledWith(expect.objectContaining({
                where: { cve: 'CVE-2024-1234' },
                create: expect.objectContaining({ cve: 'CVE-2024-1234', fixedVersion: '1.2.3' }),
            }));
        }
        finally {
            global.fetch = originalFetch;
        }
    });
    it('updates the status of a finding', () => {
        const service = new findings_service_1.FindingsService();
        const finding = service.createFinding({
            applicationId: 'app-1',
            verificationPeriodId: 'period-1',
            source: 'MANUAL',
            title: 'Input validation gap',
            description: 'Missing schema enforcement',
            severity: 'MEDIUM',
            status: 'OPEN',
            affectedComponent: 'api',
            evidence: 'Payload accepted malformed fields',
            recommendation: 'Reject unknown keys and validate all inputs',
            createdBy: 'verifier-2',
            cve: 'CVE-2024-1003',
        });
        const updated = service.updateStatus(finding.id, 'MITIGATED');
        expect(updated?.status).toBe('MITIGATED');
    });
});
//# sourceMappingURL=findings.service.spec.js.map