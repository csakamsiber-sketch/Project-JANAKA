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
exports.FindingsService = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../prisma.service");
const FINDINGS_PAGE_LIMIT = 10;
let FindingsService = class FindingsService {
    prisma;
    findings = new Map();
    constructor(prisma) {
        this.prisma = prisma;
    }
    normalizeCve(value) {
        if (!value)
            return undefined;
        const cleaned = value.trim();
        if (!cleaned)
            return undefined;
        const upper = cleaned.toUpperCase();
        return /^CVE-\d{4}-\d+$/i.test(upper) ? upper : undefined;
    }
    dedupeKey(finding) {
        if (finding.cve)
            return `cve:${finding.applicationId}:${finding.cve.toUpperCase()}`;
        return `title:${finding.applicationId}:${finding.title.toLowerCase()}:${finding.description.toLowerCase()}`;
    }
    mapVulnerabilityToFinding(vulnerability) {
        const applicationId = vulnerability.applicationId ?? vulnerability.library.applications?.[0]?.applicationId ?? '';
        const severity = (vulnerability.severity ?? 'MEDIUM').toString().toUpperCase();
        const item = {
            id: vulnerability.id,
            applicationId,
            verificationPeriodId: '',
            source: 'VULNERABILITY_TABLE',
            title: `${vulnerability.library.libraryName} ${vulnerability.library.version}`,
            description: vulnerability.summary,
            severity: severity === 'LOW' || severity === 'MEDIUM' || severity === 'HIGH' || severity === 'CRITICAL' || severity === 'INFO' ? severity : 'MEDIUM',
            status: 'OPEN',
            affectedComponent: vulnerability.library.libraryName,
            cve: this.normalizeCve(vulnerability.cve ?? undefined),
            evidence: vulnerability.summary,
            recommendation: vulnerability.fixedVersion ? `Upgrade to ${vulnerability.fixedVersion} or a later secure version.` : 'Review and update this library to a secure release.',
            fixedVersion: vulnerability.fixedVersion ?? undefined,
            createdBy: 'system',
            createdAt: vulnerability.createdAt,
            updatedAt: vulnerability.updatedAt,
        };
        return item;
    }
    createFinding(input) {
        const now = new Date();
        const normalizedCve = this.normalizeCve(input.cve);
        const finding = {
            id: input.id ?? crypto.randomUUID(),
            applicationId: input.applicationId,
            verificationPeriodId: input.verificationPeriodId,
            source: input.source,
            title: input.title,
            description: input.description,
            severity: input.severity,
            status: input.status,
            affectedComponent: input.affectedComponent,
            cve: normalizedCve,
            evidence: input.evidence,
            recommendation: input.recommendation,
            createdBy: input.createdBy,
            createdAt: now,
            updatedAt: now,
        };
        const existing = Array.from(this.findings.values()).find((entry) => this.dedupeKey(entry) === this.dedupeKey(finding));
        if (existing)
            return existing;
        this.findings.set(finding.id, finding);
        return finding;
    }
    async checkCve(input) {
        const packageName = input.packageName?.trim();
        const version = input.version?.trim();
        let cve;
        if (packageName && version) {
            try {
                const response = await fetch('https://api.osv.dev/v1/query', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ package: { name: packageName, ecosystem: 'npm' }, version }),
                });
                if (response.ok) {
                    const payload = await response.json();
                    const candidates = payload.vulns?.flatMap((vulnerability) => {
                        const ids = [vulnerability.id, ...(vulnerability.aliases ?? [])].filter((value) => Boolean(value && value.trim()));
                        return ids.map((value) => this.normalizeCve(value)).filter((value) => Boolean(value));
                    }) ?? [];
                    cve = candidates[0];
                }
            }
            catch {
                cve = undefined;
            }
        }
        const created = this.createFinding({
            applicationId: input.applicationId,
            verificationPeriodId: input.verificationPeriodId,
            source: input.source,
            title: input.title,
            description: input.description,
            severity: input.severity,
            status: 'OPEN',
            affectedComponent: input.affectedComponent,
            cve: cve ?? undefined,
            evidence: cve ? `CVE identified via OSV match: ${cve}` : undefined,
            recommendation: cve ? 'Validate against the affected package and remediate the vulnerable version.' : 'Manually confirm the vulnerability before remediation.',
            createdBy: input.createdBy,
        });
        return created;
    }
    async listFindings(options = {}) {
        if (this.prisma) {
            const page = Math.max(1, Number(options.page ?? 1));
            const limit = Math.max(1, Number(options.limit ?? FINDINGS_PAGE_LIMIT));
            const severity = options.severity?.trim().toUpperCase();
            const applicationId = options.applicationId?.trim();
            const where = {};
            if (severity) {
                where.severity = { equals: severity };
            }
            if (applicationId) {
                const applicationLibraryLinks = await this.prisma.applicationLibrary.findMany({
                    where: { applicationId },
                    select: { libraryId: true },
                });
                const libraryIds = Array.from(new Set(applicationLibraryLinks.map((link) => link.libraryId).filter(Boolean)));
                if (libraryIds.length) {
                    where.libraryId = { in: libraryIds };
                }
                else {
                    return {
                        items: [],
                        page,
                        total: 0,
                        totalPages: 1,
                        summary: { total: 0, critical: 0, high: 0, medium: 0, low: 0 },
                    };
                }
            }
            const [total, vulnerabilities, severityCounts] = await Promise.all([
                this.prisma.vulnerability.count({ where }),
                this.prisma.vulnerability.findMany({
                    where,
                    orderBy: { updatedAt: 'desc' },
                    skip: (page - 1) * limit,
                    take: limit,
                    include: {
                        library: {
                            include: {
                                applications: { select: { applicationId: true } },
                            },
                        },
                    },
                }),
                this.prisma.vulnerability.groupBy({
                    by: ['severity'],
                    where,
                    _count: { _all: true },
                }),
            ]);
            const severitySummary = severityCounts.reduce((acc, row) => {
                const normalizedSeverity = String(row.severity ?? '').toUpperCase();
                if (['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'].includes(normalizedSeverity)) {
                    acc[normalizedSeverity] = Number(row._count._all ?? 0);
                }
                return acc;
            }, {});
            const items = vulnerabilities.flatMap((vulnerability) => {
                const applicationIds = Array.from(new Set((vulnerability.library.applications ?? []).map((entry) => entry.applicationId).filter(Boolean)));
                const entries = applicationIds.length ? applicationIds : [''];
                return entries.map((applicationId) => this.mapVulnerabilityToFinding({
                    ...vulnerability,
                    applicationId,
                    library: {
                        libraryName: vulnerability.library.libraryName,
                        version: vulnerability.library.version,
                        applications: vulnerability.library.applications ?? undefined,
                    },
                }));
            });
            const totalPages = Math.max(1, Math.ceil(total / limit));
            return {
                items,
                page: Math.min(page, totalPages),
                total,
                totalPages,
                summary: {
                    total,
                    critical: severitySummary.CRITICAL ?? 0,
                    high: severitySummary.HIGH ?? 0,
                    medium: severitySummary.MEDIUM ?? 0,
                    low: severitySummary.LOW ?? 0,
                },
            };
        }
        const page = Math.max(1, Number(options.page ?? 1));
        const limit = Math.max(1, Number(options.limit ?? FINDINGS_PAGE_LIMIT));
        const severity = options.severity?.trim().toUpperCase();
        const source = Array.from(this.findings.values()).filter((finding) => {
            if (options.applicationId && finding.applicationId !== options.applicationId)
                return false;
            if (severity && finding.severity !== severity)
                return false;
            return true;
        });
        const total = source.length;
        const totalPages = Math.max(1, Math.ceil(total / limit));
        const safePage = Math.min(page, totalPages);
        const startIndex = (safePage - 1) * limit;
        const items = source.slice(startIndex, startIndex + limit);
        const summary = {
            total,
            critical: source.filter((item) => item.severity === 'CRITICAL').length,
            high: source.filter((item) => item.severity === 'HIGH').length,
            medium: source.filter((item) => item.severity === 'MEDIUM').length,
            low: source.filter((item) => item.severity === 'LOW').length,
        };
        return { items, page: safePage, total, totalPages, summary };
    }
    updateStatus(id, status) {
        const finding = this.findings.get(id);
        if (!finding) {
            return undefined;
        }
        finding.status = status;
        finding.updatedAt = new Date();
        return finding;
    }
};
exports.FindingsService = FindingsService;
exports.FindingsService = FindingsService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService])
], FindingsService);
//# sourceMappingURL=findings.service.js.map