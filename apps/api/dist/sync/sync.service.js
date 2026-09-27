"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.SyncService = void 0;
const common_1 = require("@nestjs/common");
const node_crypto_1 = require("node:crypto");
const applications_service_1 = require("../applications/applications.service");
const findings_service_1 = require("../findings/findings.service");
const libraries_service_1 = require("../libraries/libraries.service");
const master_data_sync_service_1 = require("./master-data-sync.service");
let SyncService = class SyncService {
    applications;
    findings;
    libraries;
    masterData;
    jobs = new Map();
    activeByUser = new Map();
    constructor(applications, findings, libraries, masterData) {
        this.applications = applications;
        this.findings = findings;
        this.libraries = libraries;
        this.masterData = masterData;
    }
    start(userId, kind) {
        const activeId = this.activeByUser.get(userId);
        if (activeId) {
            const active = this.jobs.get(activeId);
            if (active && ['queued', 'running'].includes(active.status))
                throw new common_1.ConflictException('A synchronization is already running.');
            this.activeByUser.delete(userId);
        }
        const job = { id: (0, node_crypto_1.randomUUID)(), ownerId: userId, kind, status: 'queued', progress: 0, message: 'Synchronization queued.', startedAt: new Date().toISOString() };
        this.jobs.set(job.id, job);
        this.activeByUser.set(userId, job.id);
        void this.run(userId, job).catch(() => undefined);
        return job;
    }
    get(userId, jobId) {
        const job = this.jobs.get(jobId);
        if (!job || job.ownerId !== userId)
            throw new common_1.NotFoundException('Synchronization job not found.');
        return job;
    }
    async run(userId, job) {
        job.status = 'running';
        job.message = job.kind === 'master-data' ? 'Preparing master data synchronization.' : job.kind === 'applications' ? 'Preparing application synchronization.' : 'Refreshing vulnerability data.';
        try {
            if (job.kind === 'master-data') {
                const result = await this.masterData.syncDailyResume((progress, message) => {
                    job.progress = progress;
                    job.message = message;
                });
                job.progress = 100;
                job.result = result;
                job.message = `Synchronized ${result.rowsWritten} master data row(s).`;
            }
            else if (job.kind === 'applications') {
                const result = await this.applications.runManualApplicationSync((progress, message) => {
                    job.progress = progress;
                    job.message = message;
                });
                job.progress = 100;
                job.result = result;
                job.message = `Synchronized ${result.refreshedApplications} application(s) and checked ${result.checked} endpoint(s).`;
            }
            else {
                job.progress = 1;
                const synced = await this.libraries.syncLibraryVulnerabilities((progress, message) => {
                    job.progress = Math.max(1, Math.round(progress * 0.45));
                    job.message = `Refreshing libraries: ${message}`;
                });
                job.progress = 48;
                job.message = 'Loading findings to check.';
                const findings = await this.findings.listFindings({ limit: 1000 });
                const pending = findings.items.filter((item) => !item.cve);
                job.progress = 50;
                job.message = `Checking ${pending.length} pending finding(s).`;
                let completed = 0;
                const results = await Promise.allSettled(pending.map((finding) => this.findings.checkCve({ applicationId: finding.applicationId, verificationPeriodId: finding.verificationPeriodId, title: finding.title, description: finding.description, severity: finding.severity, affectedComponent: finding.affectedComponent, source: finding.source || 'MANUAL_SYNC', createdBy: finding.createdBy, packageName: finding.affectedComponent, version: '0.21.0' }).finally(() => {
                    completed += 1;
                    job.progress = 50 + Math.round((completed / Math.max(1, pending.length)) * 50);
                    job.message = `Checked finding ${completed} of ${pending.length}.`;
                })));
                job.progress = 100;
                job.result = { synchronizedLibraries: synced, checkedFindings: pending.length, failedFindings: results.filter((item) => item.status === 'rejected').length };
                job.message = `Synchronized ${pending.length} finding(s).`;
            }
            job.status = 'completed';
        }
        catch (error) {
            job.status = 'failed';
            job.error = error instanceof Error ? error.message : 'Synchronization failed.';
            job.message = job.error;
        }
        finally {
            job.finishedAt = new Date().toISOString();
            this.activeByUser.delete(userId);
            setTimeout(() => this.jobs.delete(job.id), 10 * 60 * 1000).unref();
        }
    }
};
exports.SyncService = SyncService;
exports.SyncService = SyncService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [applications_service_1.ApplicationsService, findings_service_1.FindingsService, libraries_service_1.LibrariesService, master_data_sync_service_1.MasterDataSyncService])
], SyncService);
//# sourceMappingURL=sync.service.js.map