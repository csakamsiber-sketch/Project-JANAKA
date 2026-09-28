import { Controller, Get, Headers, UnauthorizedException } from '@nestjs/common';
import { timingSafeEqual } from 'node:crypto';
import { ApplicationsService } from './applications/applications.service';
import { FindingsScheduler } from './findings/findings.scheduler';

@Controller('internal')
export class ScheduledTasksController {
  constructor(private readonly applications: ApplicationsService, private readonly findings: FindingsScheduler) {}

  @Get('cron')
  async runScheduledTasks(@Headers('authorization') authorization?: string) {
    const expectedSecret = process.env.CRON_SECRET;
    const suppliedSecret = authorization?.startsWith('Bearer ') ? authorization.slice(7) : '';
    const expected = Buffer.from(expectedSecret ?? '');
    const supplied = Buffer.from(suppliedSecret);
    if (!expectedSecret || !suppliedSecret || expected.length !== supplied.length || !timingSafeEqual(expected, supplied)) {
      throw new UnauthorizedException('Scheduled task authorization failed.');
    }

    const [urlChecks] = await Promise.all([
      this.applications.runScheduledApplicationUrlChecks(),
      this.findings.runScheduledScan(),
    ]);
    return { completed: true, urlChecks };
  }
}