export type VulnerabilitySeverity = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
export type LibraryVulnerability = {
    id: string;
    library: string;
    version: string;
    cve?: string;
    severity: VulnerabilitySeverity;
    summary: string;
    fixedVersion?: string;
};
export type LibraryRecord = {
    name: string;
    version: string;
    ecosystem: 'npm' | 'pip' | 'maven' | 'nuget' | 'go';
    vulnerabilities: LibraryVulnerability[];
};
import { PrismaService } from '../prisma.service';
export declare class LibrariesService {
    private readonly prisma;
    constructor(prisma: PrismaService);
    private normalizeCve;
    private resolveCveFromVulns;
    repairLegacyCveRecords(): Promise<number>;
    syncLibraryVulnerabilities(onProgress?: (progress: number, message: string) => void): Promise<number>;
    listVulnerabilities(): Promise<any[]>;
    static normalizeVersion(version: string): string;
    static assessLibrary(record: LibraryRecord): LibraryVulnerability[];
    static correlateVulnerabilities(libraries: LibraryRecord[], severityThreshold?: VulnerabilitySeverity): LibraryVulnerability[];
    static buildRecommendedRemediation(vulns: LibraryVulnerability[]): string[];
}
