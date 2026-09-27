import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { FindingEntity } from './finding.entity';

const FINDINGS_PAGE_LIMIT = 10;

@Injectable()
export class FindingsService {
  private readonly findings = new Map<string, FindingEntity>();

  constructor(private readonly prisma?: PrismaService) {}

  private normalizeCve(value?: string) {
    if (!value) return undefined;
    const cleaned = value.trim();
    if (!cleaned) return undefined;
    const upper = cleaned.toUpperCase();
    return /^CVE-\d{4}-\d+$/i.test(upper) ? upper : undefined;
  }

  private dedupeKey(finding: Pick<FindingEntity, 'applicationId' | 'cve' | 'title' | 'description'>) {
    if (finding.cve) return `cve:${finding.applicationId}:${finding.cve.toUpperCase()}`;
    return `title:${finding.applicationId}:${finding.title.toLowerCase()}:${finding.description.toLowerCase()}`;
  }

  private mapVulnerabilityToFinding(vulnerability: {
    id: string;
    cve: string | null;
    severity: string;
    summary: string;
    fixedVersion: string | null;
    createdAt: Date;
    updatedAt: Date;
    library: {
      libraryName: string;
      version: string;
      applications?: Array<{ applicationId: string }> | null;
    };
    applicationId?: string | undefined;
  }): FindingEntity {
    const applicationId = vulnerability.applicationId ?? vulnerability.library.applications?.[0]?.applicationId ?? '';
    const severity = (vulnerability.severity ?? 'MEDIUM').toString().toUpperCase();
    const item: FindingEntity = {
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

  createFinding(input: Omit<FindingEntity, 'id' | 'createdAt' | 'updatedAt'> & { id?: string; cve?: string | undefined }): FindingEntity {
    const now = new Date();
    const normalizedCve = this.normalizeCve(input.cve);
    const finding: FindingEntity = {
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
    if (existing) return existing;

    this.findings.set(finding.id, finding);
    return finding;
  }

  async checkCve(input: {
    applicationId: string;
    verificationPeriodId: string;
    title: string;
    description: string;
    severity: FindingEntity['severity'];
    affectedComponent: string;
    source: string;
    createdBy: string;
    packageName?: string | undefined;
    version?: string | undefined;
  }): Promise<FindingEntity> {
    const packageName = input.packageName?.trim();
    const version = input.version?.trim();
    let cve: string | undefined;

    if (packageName && version) {
      try {
        const response = await fetch('https://api.osv.dev/v1/query', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ package: { name: packageName, ecosystem: 'npm' }, version }),
        });
        if (response.ok) {
          const payload = await response.json() as {
            vulns?: Array<{
              id?: string;
              aliases?: string[];
              database_specific?: { severity?: string };
            }>;
          };
          const candidates = payload.vulns?.flatMap((vulnerability) => {
            const ids = [vulnerability.id, ...(vulnerability.aliases ?? [])].filter((value): value is string => Boolean(value && value.trim()));
            return ids.map((value) => this.normalizeCve(value)).filter((value): value is string => Boolean(value));
          }) ?? [];
          cve = candidates[0];
        }
      } catch {
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

  async listFindings(options: { applicationId?: string | undefined; severity?: string | undefined; page?: number | undefined; limit?: number | undefined } = {}): Promise<{ items: FindingEntity[]; page: number; total: number; totalPages: number; summary: { total: number; critical: number; high: number; medium: number; low: number } }> {
    if (this.prisma) {
      const page = Math.max(1, Number(options.page ?? 1));
      const limit = Math.max(1, Number(options.limit ?? FINDINGS_PAGE_LIMIT));
      const severity = options.severity?.trim().toUpperCase();
      const applicationId = options.applicationId?.trim();
      const where: Record<string, unknown> = {};

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
        } else {
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

      const severitySummary = (severityCounts as Array<{ severity?: string | null; _count: { _all?: number | null } }>).reduce<Record<string, number>>((acc, row) => {
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
      if (options.applicationId && finding.applicationId !== options.applicationId) return false;
      if (severity && finding.severity !== severity) return false;
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

  updateStatus(id: string, status: FindingEntity['status']): FindingEntity | undefined {
    const finding = this.findings.get(id);
    if (!finding) {
      return undefined;
    }

    finding.status = status;
    finding.updatedAt = new Date();
    return finding;
  }
}
