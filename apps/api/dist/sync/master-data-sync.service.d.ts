import { PrismaService } from '../prisma.service';
export declare const PROGRESS_DATA_START_ROW = 1;
export type ProgressVerificationRowInput = {
    documentType?: string;
    applicationName?: string;
    owner?: string;
    status?: string;
    pass?: number;
    needToFix?: number;
    waitingForReview?: number;
    uncheck?: number;
    checkingTotal?: number;
    pendingVerification?: number;
    totalMeetings?: number;
    lastVerifier?: string;
    primaryVerificator?: string;
    firstMeeting?: string;
    lastMeeting?: string;
    daysSinceLastMeeting?: number;
    area?: string;
};
export declare function buildProgressVerificationHeader(): string[];
export declare function normalizeSpreadsheetDate(value: string | null | undefined): string | null;
export declare function formatSheetDate(value: string | null | undefined): string;
export declare function normalizePercentForSheet(value: number | string | null | undefined): number;
export declare function buildProgressVerificationSheet(rows: ProgressVerificationRowInput[]): (string | number)[][];
export declare function getLatestDateFromColumnB(rows: unknown[][]): string | null;
export declare class MasterDataSyncService {
    private readonly prisma;
    constructor(prisma: PrismaService);
    syncDailyResume(onProgress?: (progress: number, message: string) => void): Promise<{
        sheet: string;
        startRow: number;
        rowsWritten: number;
        skippedExisting: number;
        skippedIncomplete: number;
    }>;
    private ensureSheetExists;
    private hasDatabaseCoverageForDate;
    private rowKey;
    private getSheetsClient;
}
