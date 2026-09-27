export type DashboardSummary = {
    totalApplications: number;
    activeApplications: number;
    pendingApplications: number;
    cveFindings: number;
    criticalFindings: number;
    verificationSLA: number;
    meetingsThisMonth: number;
    ctiAlerts: number;
    libraryExposure: number;
    upcomingMeetings: Array<{
        id: string;
        application: string;
        startAt: string;
        endAt: string;
        verificator: string;
    }>;
    topCveFindings: Array<{
        id: string;
        cve: string;
        library: string;
        version: string;
        severity: string;
        summary: string;
    }>;
    pendingVerificationApplications: Array<{
        id: string;
        name: string;
        percent: number;
        lastVerificationDate?: string;
    }>;
    longestVerificationElapsed: Array<{
        id: string;
        name: string;
        lastVerificationDate?: string;
        elapsedDays: number;
    }>;
};
import { PrismaService } from '../prisma.service';
export declare class DashboardService {
    private readonly prisma;
    constructor(prisma: PrismaService);
    getSummary(): Promise<DashboardSummary>;
}
