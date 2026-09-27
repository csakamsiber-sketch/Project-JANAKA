import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { LibrariesService } from '../libraries/libraries.service';
import { FindingsService } from './findings.service';

@Injectable()
export class FindingsScheduler implements OnApplicationBootstrap {
  private readonly logger = new Logger(FindingsScheduler.name);
  private timer?: NodeJS.Timeout;

  constructor(private readonly findingsService: FindingsService, private readonly librariesService: LibrariesService) {}

  async onApplicationBootstrap() {
    this.scheduleNextRun();
    void this.runFindingsScan().catch((error: unknown) => {
      this.logger.error('Initial findings scan failed during startup.', error instanceof Error ? error.stack : String(error));
    });
  }

  private scheduleNextRun() {
    if (this.timer) {
      clearTimeout(this.timer);
    }

    const now = new Date();
    const nextRun = this.getNextRunTime(now);
    const delay = Math.max(0, nextRun.getTime() - now.getTime());

    this.logger.log(`Next findings CVE scan scheduled for ${nextRun.toISOString()}.`);
    this.timer = setTimeout(() => {
      void this.runFindingsScan();
      this.scheduleNextRun();
    }, delay);
  }

  private getNextRunTime(from: Date): Date {
    const candidateHours = [6, 18];
    const nextRun = new Date(from);
    nextRun.setMilliseconds(0);
    nextRun.setSeconds(0);
    nextRun.setMinutes(0);

    for (const hour of candidateHours) {
      const candidate = new Date(nextRun);
      candidate.setHours(hour, 0, 0, 0);
      if (candidate.getTime() > from.getTime()) {
        return candidate;
      }
    }

    const dayAfter = new Date(nextRun);
    dayAfter.setDate(dayAfter.getDate() + 1);
    dayAfter.setHours(6, 0, 0, 0);
    return dayAfter;
  }

  private async runFindingsScan() {
    const synced = await this.librariesService.syncLibraryVulnerabilities();
    this.logger.log(`Scheduled library vulnerability sync stored ${synced} records and normalized stale GHSA entries.`);

    const findingsResponse = await this.findingsService.listFindings({ limit: 1000 });
    const pending = findingsResponse.items.filter((item: { cve?: string | undefined }) => !item.cve);

    if (!pending.length) {
      this.logger.log('No findings require CVE enrichment at this time.');
      return;
    }

    this.logger.log(`Running scheduled CVE check for ${pending.length} findings.`);

    const results = await Promise.allSettled(
      pending.map((finding: {
        applicationId: string;
        verificationPeriodId: string;
        title: string;
        description: string;
        severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL' | 'INFO';
        affectedComponent: string;
        source: string;
        createdBy: string;
      }) => this.findingsService.checkCve({
        applicationId: finding.applicationId,
        verificationPeriodId: finding.verificationPeriodId,
        title: finding.title,
        description: finding.description,
        severity: finding.severity,
        affectedComponent: finding.affectedComponent,
        source: finding.source || 'SCHEDULED_CVE_CHECK',
        createdBy: finding.createdBy,
        packageName: finding.affectedComponent,
        version: '0.21.0',
      })),
    );

    const failed = results.filter((result: PromiseSettledResult<unknown>) => result.status === 'rejected').length;
    if (failed > 0) {
      this.logger.warn(`Scheduled CVE check completed with ${failed} failed item(s).`);
      return;
    }

    this.logger.log('Scheduled CVE check completed successfully.');
  }
}
