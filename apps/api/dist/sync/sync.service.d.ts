import { ApplicationsService } from '../applications/applications.service';
import { FindingsService } from '../findings/findings.service';
import { LibrariesService } from '../libraries/libraries.service';
import { MasterDataSyncService } from './master-data-sync.service';
type SyncKind = 'master-data' | 'applications' | 'findings';
type SyncJob = {
    id: string;
    ownerId: string;
    kind: SyncKind;
    status: 'queued' | 'running' | 'completed' | 'failed';
    progress: number;
    message: string;
    result?: Record<string, unknown>;
    error?: string;
    startedAt: string;
    finishedAt?: string;
};
export declare class SyncService {
    private readonly applications;
    private readonly findings;
    private readonly libraries;
    private readonly masterData;
    private readonly jobs;
    private readonly activeByUser;
    constructor(applications: ApplicationsService, findings: FindingsService, libraries: LibrariesService, masterData: MasterDataSyncService);
    start(userId: string, kind: SyncKind): SyncJob;
    get(userId: string, jobId: string): SyncJob;
    private run;
}
export {};
