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
exports.LibrariesService = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../prisma.service");
let LibrariesService = class LibrariesService {
    prisma;
    constructor(prisma) {
        this.prisma = prisma;
    }
    normalizeCve(value) {
        if (!value)
            return null;
        const cleaned = value.trim();
        if (!cleaned)
            return null;
        const upper = cleaned.toUpperCase();
        return /^CVE-\d{4}-\d+$/i.test(upper) ? upper : null;
    }
    resolveCveFromVulns(vulns) {
        const candidateIds = vulns.flatMap((vulnerability) => [vulnerability.id, ...(vulnerability.aliases ?? [])]).filter((value) => Boolean(value && value.trim()));
        return candidateIds.map((value) => this.normalizeCve(value)).find((value) => Boolean(value)) ?? null;
    }
    async repairLegacyCveRecords() {
        const staleRows = await this.prisma.vulnerability.findMany({
            include: { library: true },
        });
        let repaired = 0;
        for (const row of staleRows) {
            if (!row.cve || this.normalizeCve(row.cve))
                continue;
            const library = row.library;
            if (!library)
                continue;
            try {
                const response = await fetch('https://api.osv.dev/v1/query', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        package: { name: library.libraryName, ecosystem: library.ecosystem === 'npm' ? 'npm' : library.ecosystem },
                        version: library.version,
                    }),
                    signal: AbortSignal.timeout(8_000),
                });
                if (!response.ok)
                    continue;
                const payload = await response.json();
                const normalizedCve = this.resolveCveFromVulns(payload.vulns ?? []);
                if (!normalizedCve)
                    continue;
                const existing = await this.prisma.vulnerability.findUnique({ where: { cve: normalizedCve } });
                if (existing && existing.id !== row.id) {
                    await this.prisma.vulnerability.delete({ where: { id: row.id } });
                    repaired += 1;
                    continue;
                }
                await this.prisma.vulnerability.update({
                    where: { id: row.id },
                    data: { cve: normalizedCve, updatedAt: new Date() },
                });
                repaired += 1;
            }
            catch {
            }
        }
        return repaired;
    }
    async syncLibraryVulnerabilities(onProgress) {
        const repaired = await this.repairLegacyCveRecords();
        const libraries = await this.prisma.library.findMany();
        if (!libraries.length) {
            onProgress?.(100, 'No libraries found to synchronize.');
            return repaired;
        }
        let synced = 0;
        for (let index = 0; index < libraries.length; index += 1) {
            const library = libraries[index];
            if (!library)
                continue;
            try {
                const response = await fetch('https://api.osv.dev/v1/query', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        package: { name: library.libraryName, ecosystem: library.ecosystem === 'npm' ? 'npm' : library.ecosystem },
                        version: library.version,
                    }),
                    signal: AbortSignal.timeout(8_000),
                });
                if (!response.ok)
                    continue;
                const payload = await response.json();
                const vulns = payload.vulns ?? [];
                for (const vulnerability of vulns) {
                    const cve = this.resolveCveFromVulns([vulnerability]);
                    const severity = (vulnerability.database_specific?.severity ?? 'MEDIUM').toString().toUpperCase();
                    const summary = (vulnerability.summary ?? vulnerability.details ?? 'Vulnerability reported by OSV.').toString().trim();
                    const fixedVersionValue = vulnerability.affected?.flatMap((affected) => affected.ranges ?? []).flatMap((range) => range.events ?? []).map((event) => event.fixed).find((value) => Boolean(value));
                    const fixedVersion = fixedVersionValue && fixedVersionValue.trim() ? fixedVersionValue.trim() : null;
                    if (!cve) {
                        continue;
                    }
                    await this.prisma.vulnerability.upsert({
                        where: { cve },
                        update: {
                            severity,
                            summary,
                            fixedVersion,
                            updatedAt: new Date(),
                        },
                        create: {
                            libraryId: library.id,
                            cve,
                            severity,
                            summary,
                            fixedVersion,
                        },
                    });
                    synced += 1;
                }
            }
            catch {
            }
            const progress = Math.round(((index + 1) / libraries.length) * 100);
            onProgress?.(progress, `Updated library ${index + 1} of ${libraries.length}.`);
        }
        return synced + repaired;
    }
    async listVulnerabilities() {
        const libraries = await this.prisma.library.findMany({ include: { applications: { include: { application: { select: { id: true, name: true } } } } } });
        const results = [];
        for (let offset = 0; offset < libraries.length; offset += 8) {
            const batch = await Promise.all(libraries.slice(offset, offset + 8).map(async (library) => {
                try {
                    const response = await fetch('https://api.osv.dev/v1/query', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ package: { name: library.libraryName, ecosystem: library.ecosystem === 'npm' ? 'npm' : library.ecosystem }, version: library.version }),
                        signal: AbortSignal.timeout(8_000),
                    });
                    if (!response.ok)
                        return [];
                    const payload = await response.json();
                    return (payload.vulns ?? []).map((vulnerability) => ({
                        id: vulnerability.id,
                        library: library.libraryName,
                        version: library.version,
                        severity: vulnerability.database_specific?.severity ?? 'UNKNOWN',
                        summary: vulnerability.summary ?? vulnerability.details ?? 'Vulnerability reported by OSV.',
                        fixedVersion: vulnerability.affected?.flatMap((affected) => affected.ranges ?? []).flatMap((range) => range.events ?? []).map((event) => event.fixed).find(Boolean),
                        cveUrl: vulnerability.id.startsWith('CVE-') ? `https://nvd.nist.gov/vuln/detail/${vulnerability.id}` : `https://osv.dev/vulnerability/${vulnerability.id}`,
                        applications: library.applications.map((application) => application.application),
                    }));
                }
                catch {
                    return [];
                }
            }));
            results.push(...batch);
        }
        const findings = new Map();
        for (const finding of results.flat()) {
            const existing = findings.get(finding.id);
            if (!existing) {
                findings.set(finding.id, finding);
            }
            else {
                findings.set(finding.id, {
                    ...existing,
                    applications: Array.from(new Map([...existing.applications, ...finding.applications].map((application) => [application.id, application])).values()),
                });
            }
        }
        return Array.from(findings.values());
    }
    static normalizeVersion(version) {
        return String(version ?? '').trim();
    }
    static assessLibrary(record) {
        const list = Array.isArray(record?.vulnerabilities) ? record.vulnerabilities : [];
        return list.filter((item) => {
            if (!item || typeof item !== 'object')
                return false;
            if (!item.library || !item.summary || !item.severity)
                return false;
            return true;
        });
    }
    static correlateVulnerabilities(libraries, severityThreshold = 'MEDIUM') {
        const ranked = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'];
        const minIndex = ranked.indexOf(severityThreshold);
        const vulnerabilities = [];
        for (const library of libraries ?? []) {
            for (const vuln of this.assessLibrary(library)) {
                if (ranked.indexOf(vuln.severity) >= minIndex) {
                    vulnerabilities.push({
                        ...vuln,
                        library: vuln.library || library.name,
                        version: vuln.version || library.version,
                    });
                }
            }
        }
        return vulnerabilities;
    }
    static buildRecommendedRemediation(vulns) {
        return Array.from(new Set(vulns
            .filter((v) => v.fixedVersion)
            .map((v) => `${v.library} -> ${v.fixedVersion}`)));
    }
};
exports.LibrariesService = LibrariesService;
exports.LibrariesService = LibrariesService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService])
], LibrariesService);
//# sourceMappingURL=libraries.service.js.map