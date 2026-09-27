import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { ApplicationsService } from '../applications/applications.service';
import { FindingsService } from '../findings/findings.service';
import { LibrariesService } from '../libraries/libraries.service';
import { MasterDataSyncService } from './master-data-sync.service';

type SyncKind = 'master-data' | 'applications' | 'findings';
type SyncJob = { id: string; ownerId: string; kind: SyncKind; status: 'queued' | 'running' | 'completed' | 'failed'; progress: number; message: string; result?: Record<string, unknown>; error?: string; startedAt: string; finishedAt?: string };

@Injectable()
export class SyncService {
  private readonly jobs = new Map<string, SyncJob>();
  private readonly activeByUser = new Map<string, string>();

  constructor(private readonly applications: ApplicationsService, private readonly findings: FindingsService, private readonly libraries: LibrariesService, private readonly masterData: MasterDataSyncService) {}

  start(userId: string, kind: SyncKind): SyncJob {
    const activeId = this.activeByUser.get(userId);
    if (activeId) {
      const active = this.jobs.get(activeId);
      if (active && ['queued', 'running'].includes(active.status)) throw new ConflictException('A synchronization is already running.');
      this.activeByUser.delete(userId);
    }
    const job: SyncJob = { id: randomUUID(), ownerId: userId, kind, status: 'queued', progress: 0, message: 'Synchronization queued.', startedAt: new Date().toISOString() };
    this.jobs.set(job.id, job);
    this.activeByUser.set(userId, job.id);
    void this.run(userId, job).catch(() => undefined);
    return job;
  }

  get(userId: string, jobId: string): SyncJob {
    const job = this.jobs.get(jobId);
    if (!job || job.ownerId !== userId) throw new NotFoundException('Synchronization job not found.');
    return job;
  }

  private async run(userId: string, job: SyncJob) {
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
      } else if (job.kind === 'applications') {
        const result = await this.applications.runManualApplicationSync((progress, message) => {
          job.progress = progress;
          job.message = message;
        });
        job.progress = 100;
        job.result = result;
        job.message = `Synchronized ${result.refreshedApplications} application(s) and checked ${result.checked} endpoint(s).`;
      } else {
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
    } catch (error) {
      job.status = 'failed';
      job.error = error instanceof Error ? error.message : 'Synchronization failed.';
      job.message = job.error;
    } finally {
      job.finishedAt = new Date().toISOString();
      this.activeByUser.delete(userId);
      setTimeout(() => this.jobs.delete(job.id), 10 * 60 * 1000).unref();
    }
  }
}