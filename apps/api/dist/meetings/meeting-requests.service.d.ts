import { MeetingRequestEntity } from './meeting-request.entity';
import { PrismaService } from '../prisma.service';
import { ApplicationsService } from '../applications/applications.service';
export declare class MeetingRequestsService {
    private readonly prisma?;
    private readonly applications?;
    private readonly requests;
    constructor(prisma?: PrismaService | undefined, applications?: ApplicationsService | undefined);
    createSchedule(input: {
        applicationId: string;
        verificatorId: string;
        createdById: string;
        startAt: string;
        endAt: string;
        purpose: string;
        timezone?: string | undefined;
        forceConflictOverride?: boolean | undefined;
    }): Promise<{
        application: {
            name: string;
            description: string | null;
            id: string;
            createdAt: Date;
            updatedAt: Date;
            status: string | null;
            organization: string;
            environment: string;
            language: string | null;
            framework: string | null;
            languageFrontend: string | null;
            languageBackend: string | null;
            frameworkFrontend: string | null;
            frameworkBackend: string | null;
            projectStartDate: string;
            owner: string;
            picId: string | null;
            picName: string | null;
            developerIds: string[];
            googleSheetId: string | null;
            spreadsheetLinks: import("@prisma/client/runtime/library").JsonValue;
            verificationDocuments: import("@prisma/client/runtime/library").JsonValue | null;
            frontendUrl: string | null;
            backendUrl: string | null;
            lastVerificationDate: string | null;
            lastVerifier: string | null;
            verificationProgress: import("@prisma/client/runtime/library").JsonValue | null;
        };
        verificator: {
            role: string;
            email: string;
            id: string;
            passwordHash: string | null;
            mustChangePassword: boolean;
            firstName: string | null;
            lastName: string | null;
            isActive: boolean;
            createdAt: Date;
            updatedAt: Date;
            deviceFingerprintHash: string | null;
        };
    } & {
        id: string;
        createdAt: Date;
        updatedAt: Date;
        status: string;
        applicationId: string;
        verificatorId: string;
        createdById: string;
        startAt: Date;
        endAt: Date;
        purpose: string;
        meetingNotes: string | null;
        timezone: string;
        startedAt: Date | null;
        finishedAt: Date | null;
    }>;
    updateSchedule(id: string, input: {
        applicationId?: string | undefined;
        verificatorId?: string | undefined;
        startAt?: string | undefined;
        endAt?: string | undefined;
        purpose?: string | undefined;
        timezone?: string | undefined;
        forceConflictOverride?: boolean | undefined;
    }): Promise<{
        application: {
            name: string;
            description: string | null;
            id: string;
            createdAt: Date;
            updatedAt: Date;
            status: string | null;
            organization: string;
            environment: string;
            language: string | null;
            framework: string | null;
            languageFrontend: string | null;
            languageBackend: string | null;
            frameworkFrontend: string | null;
            frameworkBackend: string | null;
            projectStartDate: string;
            owner: string;
            picId: string | null;
            picName: string | null;
            developerIds: string[];
            googleSheetId: string | null;
            spreadsheetLinks: import("@prisma/client/runtime/library").JsonValue;
            verificationDocuments: import("@prisma/client/runtime/library").JsonValue | null;
            frontendUrl: string | null;
            backendUrl: string | null;
            lastVerificationDate: string | null;
            lastVerifier: string | null;
            verificationProgress: import("@prisma/client/runtime/library").JsonValue | null;
        };
        results: {
            id: string;
            totalPoints: number;
            passPoints: number;
            needToFixPoints: number;
            uncheckPoints: number;
            capturedAt: Date;
            meetingId: string;
            phase: string;
            waitingPoints: number;
            progressPercent: number;
        }[];
        verificator: {
            role: string;
            email: string;
            id: string;
            passwordHash: string | null;
            mustChangePassword: boolean;
            firstName: string | null;
            lastName: string | null;
            isActive: boolean;
            createdAt: Date;
            updatedAt: Date;
            deviceFingerprintHash: string | null;
        };
    } & {
        id: string;
        createdAt: Date;
        updatedAt: Date;
        status: string;
        applicationId: string;
        verificatorId: string;
        createdById: string;
        startAt: Date;
        endAt: Date;
        purpose: string;
        meetingNotes: string | null;
        timezone: string;
        startedAt: Date | null;
        finishedAt: Date | null;
    }>;
    deleteSchedule(id: string): Promise<{
        deleted: boolean;
        id: string;
    }>;
    listSchedules(userId: string | undefined, role: string | undefined, options: {
        period: 'today' | 'week' | 'month' | 'all';
        verificatorId?: string | undefined;
        page: number;
        limit: number;
    }): Promise<{
        items: ({
            application: {
                name: string;
                id: string;
            };
            results: {
                id: string;
                totalPoints: number;
                passPoints: number;
                needToFixPoints: number;
                uncheckPoints: number;
                capturedAt: Date;
                meetingId: string;
                phase: string;
                waitingPoints: number;
                progressPercent: number;
            }[];
            verificator: {
                email: string;
                id: string;
                firstName: string | null;
                lastName: string | null;
            };
        } & {
            id: string;
            createdAt: Date;
            updatedAt: Date;
            status: string;
            applicationId: string;
            verificatorId: string;
            createdById: string;
            startAt: Date;
            endAt: Date;
            purpose: string;
            meetingNotes: string | null;
            timezone: string;
            startedAt: Date | null;
            finishedAt: Date | null;
        })[];
        pagination: {
            page: number;
            limit: number;
            total: number;
            totalPages: number;
        };
    }>;
    listScheduleOptions(): Promise<{
        applications: {
            name: string;
            id: string;
        }[];
        verificators: {
            email: string;
            id: string;
            firstName: string | null;
            lastName: string | null;
        }[];
    }>;
    startSchedule(id: string, userId: string, role: string): Promise<{
        meeting: {
            id: string;
            createdAt: Date;
            updatedAt: Date;
            status: string;
            applicationId: string;
            verificatorId: string;
            createdById: string;
            startAt: Date;
            endAt: Date;
            purpose: string;
            meetingNotes: string | null;
            timezone: string;
            startedAt: Date | null;
            finishedAt: Date | null;
        };
        result: {
            id: string;
            totalPoints: number;
            passPoints: number;
            needToFixPoints: number;
            uncheckPoints: number;
            capturedAt: Date;
            meetingId: string;
            phase: string;
            waitingPoints: number;
            progressPercent: number;
        };
    }>;
    finishSchedule(id: string, userId: string, role: string, meetingNotes?: string): Promise<{
        meeting: {
            id: string;
            createdAt: Date;
            updatedAt: Date;
            status: string;
            applicationId: string;
            verificatorId: string;
            createdById: string;
            startAt: Date;
            endAt: Date;
            purpose: string;
            meetingNotes: string | null;
            timezone: string;
            startedAt: Date | null;
            finishedAt: Date | null;
        };
        result: {
            id: string;
            totalPoints: number;
            passPoints: number;
            needToFixPoints: number;
            uncheckPoints: number;
            capturedAt: Date;
            meetingId: string;
            phase: string;
            waitingPoints: number;
            progressPercent: number;
        };
    }>;
    listApplicationResults(applicationId: string): Promise<({
        meeting: {
            id: string;
            status: string;
            startAt: Date;
            endAt: Date;
        };
    } & {
        id: string;
        totalPoints: number;
        passPoints: number;
        needToFixPoints: number;
        uncheckPoints: number;
        capturedAt: Date;
        meetingId: string;
        phase: string;
        waitingPoints: number;
        progressPercent: number;
    })[]>;
    generateReport(userId: string, role: string, month: number, year: number): Promise<{
        fileName: string;
        contentBase64: any;
        mimeType: string;
    }>;
    private captureSchedule;
    createRequest(input: Omit<MeetingRequestEntity, 'createdAt' | 'updatedAt'> & {
        createdAt?: string;
        updatedAt?: string;
    }): MeetingRequestEntity;
    listRequests(): MeetingRequestEntity[];
    updateRequest(id: string, status: MeetingRequestEntity['status'], notes?: string): MeetingRequestEntity | undefined;
}
