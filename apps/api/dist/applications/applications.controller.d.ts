import { FastifyRequest } from 'fastify';
import { AuthService } from '../auth/auth.service';
import { ApplicationsService } from './applications.service';
export declare class ApplicationsController {
    private readonly applicationsService;
    private readonly authService;
    constructor(applicationsService: ApplicationsService, authService: AuthService);
    private currentUser;
    private requireManager;
    private requireViewer;
    list(page?: string, search?: string, sortBy?: string, sortOrder?: string, req?: FastifyRequest): Promise<import("./applications.service").PaginatedApplications>;
    getLanguages(): {
        data: string[];
        meta: {};
    };
    options(req: FastifyRequest): Promise<{
        data: {
            id: string;
            name: string;
        }[];
        meta: {};
    }>;
    getFrameworks(): {
        data: string[];
        meta: {};
    };
    get(id: string, req: FastifyRequest): Promise<import("./application.entity").ApplicationEntity>;
    refreshVerificationProgress(id: string, req: FastifyRequest): Promise<import("./application.entity").ApplicationEntity>;
    previewVerification(body: unknown, req: FastifyRequest): Promise<{
        percent: number;
        status: import("./application.entity").VerificationProgress["status"];
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
        spreadsheetData?: import("./applications.service").SpreadsheetData;
    }>;
    detectLibraries(body: unknown, req: FastifyRequest): Promise<{
        data: {
            detected: boolean;
            libraries: import("./dependency-detector.service").DetectedLibrary[];
        };
        meta: {};
    }>;
    create(body: unknown, req: FastifyRequest): Promise<import("./application.entity").ApplicationEntity>;
    update(id: string, body: unknown, req: FastifyRequest): Promise<import("./application.entity").ApplicationEntity>;
    remove(id: string, body: unknown, req: FastifyRequest): Promise<{
        data: {
            deleted: boolean;
            id: string;
        };
        meta: {};
    }>;
    assignPic(id: string, body: unknown, req: FastifyRequest): Promise<import("./application.entity").ApplicationEntity>;
}
