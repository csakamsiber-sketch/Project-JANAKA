import { PrismaService } from '../prisma.service';
import { FindingEntity } from './finding.entity';
export declare class FindingsService {
    private readonly prisma?;
    private readonly findings;
    constructor(prisma?: PrismaService);
    private normalizeCve;
    private dedupeKey;
    private mapVulnerabilityToFinding;
    createFinding(input: Omit<FindingEntity, 'id' | 'createdAt' | 'updatedAt'> & {
        id?: string;
        cve?: string | undefined;
    }): FindingEntity;
    checkCve(input: {
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
    }): Promise<FindingEntity>;
    listFindings(options?: {
        applicationId?: string | undefined;
        severity?: string | undefined;
        page?: number | undefined;
        limit?: number | undefined;
    }): Promise<{
        items: FindingEntity[];
        page: number;
        total: number;
        totalPages: number;
        summary: {
            total: number;
            critical: number;
            high: number;
            medium: number;
            low: number;
        };
    }>;
    updateStatus(id: string, status: FindingEntity['status']): FindingEntity | undefined;
}
