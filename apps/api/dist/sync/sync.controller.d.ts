import { FastifyRequest } from 'fastify';
import { AuthService } from '../auth/auth.service';
import { SyncService } from './sync.service';
export declare class SyncController {
    private readonly auth;
    private readonly sync;
    constructor(auth: AuthService, sync: SyncService);
    masterDataSync(req: FastifyRequest): Promise<{
        data: {
            id: string;
            ownerId: string;
            kind: "applications" | "findings" | "master-data";
            status: "queued" | "running" | "completed" | "failed";
            progress: number;
            message: string;
            result?: Record<string, unknown>;
            error?: string;
            startedAt: string;
            finishedAt?: string;
        };
        meta: {};
    }>;
    private user;
    start(kind: string, req: FastifyRequest): Promise<{
        data: {
            id: string;
            ownerId: string;
            kind: "applications" | "findings" | "master-data";
            status: "queued" | "running" | "completed" | "failed";
            progress: number;
            message: string;
            result?: Record<string, unknown>;
            error?: string;
            startedAt: string;
            finishedAt?: string;
        };
        meta: {};
    }>;
    status(jobId: string, req: FastifyRequest): Promise<{
        data: {
            id: string;
            ownerId: string;
            kind: "applications" | "findings" | "master-data";
            status: "queued" | "running" | "completed" | "failed";
            progress: number;
            message: string;
            result?: Record<string, unknown>;
            error?: string;
            startedAt: string;
            finishedAt?: string;
        };
        meta: {};
    }>;
}
