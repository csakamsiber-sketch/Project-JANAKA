import { ApplicationEntity, VerificationDocument, VerificationProgress } from './application.entity';
import { OnApplicationBootstrap } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { DependencyDetectorService } from './dependency-detector.service';
export interface PaginatedApplications {
    items: ApplicationEntity[];
    page: number;
    limit: number;
    total: number;
    totalPages: number;
}
export interface SpreadsheetData {
    applicationName?: string | undefined;
    owner?: string | undefined;
    frontendUrl?: string | undefined;
    backendUrl?: string | undefined;
    projectStartDate?: string | undefined;
    lastVerificationDate?: string | undefined;
    lastVerifier?: string | undefined;
    description?: string | undefined;
    picName?: string | undefined;
    languageFrontend?: string | undefined;
    frameworkFrontend?: string | undefined;
    languageBackend?: string | undefined;
    frameworkBackend?: string | undefined;
}
export declare class ApplicationsService implements OnApplicationBootstrap {
    private readonly prisma?;
    private readonly dependencyDetector?;
    private readonly logger;
    private readonly applications;
    private urlCheckTimer?;
    constructor(prisma?: PrismaService | undefined, dependencyDetector?: DependencyDetectorService | undefined);
    onApplicationBootstrap(): Promise<void>;
    private readonly sheetsClient?;
    private readonly driveClient?;
    private readonly supportedLanguages;
    private readonly supportedFrameworks;
    createApplication(input: Omit<ApplicationEntity, 'id' | 'createdAt' | 'updatedAt'> & {
        id?: string;
    }): ApplicationEntity;
    createApplicationPersistent(input: Omit<ApplicationEntity, 'id' | 'createdAt' | 'updatedAt'> & {
        id?: string;
    }): Promise<ApplicationEntity>;
    listApplicationsPersistent(page?: number, filters?: {
        search?: string | undefined;
        sortBy?: string | undefined;
        sortOrder?: string | undefined;
    }): Promise<PaginatedApplications>;
    listApplicationOptions(): Promise<Array<{
        id: string;
        name: string;
    }>>;
    getApplicationPersistent(id: string): Promise<ApplicationEntity | undefined>;
    updateApplicationPersistent(id: string, input: Partial<Omit<ApplicationEntity, 'id' | 'createdAt' | 'updatedAt'>>): Promise<ApplicationEntity>;
    private applicationUsesSpreadsheet;
    deleteApplicationPersistent(id: string): Promise<void>;
    private hydrateFromSpreadsheet;
    private toDatabaseApplication;
    private fromDatabaseApplication;
    detectLibraries(files: Array<{
        name: string;
        content: string;
    }>): import("./dependency-detector.service").DetectedLibrary[];
    private replaceApplicationLibraries;
    updateApplication(id: string, input: Partial<Omit<ApplicationEntity, 'id' | 'createdAt' | 'updatedAt'>>): ApplicationEntity;
    listApplications(page?: number, limit?: number): ApplicationEntity[] | PaginatedApplications;
    getLanguages(): string[];
    getFrameworks(): string[];
    checkApplicationUrls(applications?: ApplicationEntity[]): Promise<{
        checked: number;
        healthy: number;
        failed: number;
        results: Array<{
            applicationId: string;
            applicationName: string;
            url: string;
            ok: boolean;
            status: number | null;
            error?: string;
        }>;
    }>;
    private scheduleNextUrlCheck;
    private getNextRunTime;
    runScheduledApplicationUrlChecks(): Promise<void>;
    runManualApplicationUrlChecks(): Promise<{
        checked: number;
        healthy: number;
        failed: number;
        results: Array<{
            applicationId: string;
            applicationName: string;
            url: string;
            ok: boolean;
            status: number | null;
            error?: string;
        }>;
    }>;
    runManualApplicationSync(onProgress?: (progress: number, message: string) => void): Promise<{
        refreshedApplications: number;
        failedRefreshes: number;
        refreshErrors: {
            applicationId: string;
            error: string;
        }[];
        checked: number;
        healthy: number;
        failed: number;
        results: Array<{
            applicationId: string;
            applicationName: string;
            url: string;
            ok: boolean;
            status: number | null;
            error?: string;
        }>;
    }>;
    refreshVerificationProgress(id: string): Promise<ApplicationEntity>;
    recordVerificationStart(id: string, verifierFirstName: string, date?: string): Promise<void>;
    previewVerificationProgress(document: VerificationDocument): Promise<{
        percent: number;
        status: VerificationProgress["status"];
        totalPoints: number;
        passPoints: number;
        needToFixPoints: number;
        waitingForReviewPoints: number;
        uncheckPoints: number;
        checkingPercent: number;
        pendingVerificationPercent: number;
        values: number[];
        source: string;
        spreadsheetId: string;
        ranges: string[];
        spreadsheetData?: SpreadsheetData;
    }>;
    private readVerificationProgress;
    private calculateProgress;
    private readVerificationValues;
    private readPublicWorkbook;
    private readWithServiceAccount;
    private readDriveWorkbook;
    private readDriveDocument;
    private readDriveGoogleSheet;
    private readPublicCell;
    private buildReadResult;
    private getVerificationRanges;
    private validateSpreadsheetUrl;
    private validateSpreadsheetMetadataUrl;
    private sanitizeSpreadsheetText;
    private normalizeVerificationCellValue;
    private normalizeSpreadsheetNumber;
    private normalizeSpreadsheetDate;
    private getSheetsClient;
    private getDriveClient;
    private combineProgress;
    private extractSpreadsheetId;
    private extractSheetGid;
    getApplication(id: string): ApplicationEntity | undefined;
    assignPic(applicationId: string, picId: string): ApplicationEntity | undefined;
    assignPicPersistent(applicationId: string, picId: string): Promise<ApplicationEntity | undefined>;
}
