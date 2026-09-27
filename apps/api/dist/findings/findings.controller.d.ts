import { FastifyRequest } from 'fastify';
import { FindingsService } from './findings.service';
import { AuthService } from '../auth/auth.service';
export declare class FindingsController {
    private readonly findingsService;
    private readonly authService;
    constructor(findingsService: FindingsService, authService: AuthService);
    private requireUser;
    list(page?: string, limit?: string, applicationId?: string, severity?: string): Promise<{
        items: import("./finding.entity").FindingEntity[];
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
    checkCve(body: unknown, req: FastifyRequest): Promise<import("./finding.entity").FindingEntity>;
    create(body: unknown, req: FastifyRequest): Promise<import("./finding.entity").FindingEntity>;
    updateStatus(id: string, body: unknown, req: FastifyRequest): Promise<import("./finding.entity").FindingEntity>;
}
