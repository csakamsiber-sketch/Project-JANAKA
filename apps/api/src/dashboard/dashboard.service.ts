export type DashboardSummary = {
  totalApplications: number;
  activeApplications: number;
  pendingApplications: number;
  cveFindings: number;
  criticalFindings: number;
  verificationSLA: number;
  meetingsThisMonth: number;
  ctiAlerts: number;
  libraryExposure: number;
  upcomingMeetings: Array<{ id: string; application: string; startAt: string; endAt: string; verificator: string }>;
  topCveFindings: Array<{ id: string; cve: string; library: string; version: string; severity: string; summary: string }>;
  pendingVerificationApplications: Array<{ id: string; name: string; percent: number; lastVerificationDate?: string }>;
  longestVerificationElapsed: Array<{ id: string; name: string; lastVerificationDate?: string; elapsedDays: number }>;
};

import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { startOfDayInJakarta, startOfMonthInJakarta } from '../common/timezone';

@Injectable()
export class DashboardService {
  constructor(private readonly prisma: PrismaService) {}

  async getSummary(): Promise<DashboardSummary> {
    const monthStart = startOfMonthInJakarta(new Date());
    const now = new Date();
    const [totalApplications, activeApplications, pendingApplications, cveFindings, criticalFindings, meetingsThisMonth, libraryExposure, applications, meetings, vulnerabilities] = await Promise.all([
      this.prisma.application.count(),
      this.prisma.application.count({ where: { status: 'ACTIVE' } }),
      this.prisma.application.count({ where: { status: 'PENDING' } }),
      this.prisma.vulnerability.count(),
      this.prisma.vulnerability.count({ where: { severity: 'CRITICAL' } }),
      this.prisma.meetingSchedule.count({ where: { startAt: { gte: monthStart } } }),
      this.prisma.applicationLibrary.count(),
      this.prisma.application.findMany({ select: { verificationProgress: true } }),
      this.prisma.meetingSchedule.findMany({ where: { startAt: { gte: startOfDayInJakarta(new Date(now.getTime() - 86400000)), lte: startOfDayInJakarta(new Date(now.getTime() + 86400000 * 2)) }, endAt: { gt: now } }, orderBy: { startAt: 'asc' }, take: 20, include: { application: { select: { name: true } }, verificator: { select: { firstName: true, lastName: true, email: true } } } }),
      this.prisma.vulnerability.findMany({ orderBy: { updatedAt: 'desc' }, take: 50, include: { library: { select: { libraryName: true, version: true } } } }),
    ]);
    const percentages = applications.map((application) => Number((application.verificationProgress as { percent?: number } | null)?.percent ?? 0));
    const verificationSLA = percentages.length ? Number((percentages.reduce((sum, value) => sum + value, 0) / percentages.length).toFixed(2)) : 0;
    const nowTimestamp = now.getTime();
    const applicationRecords = await this.prisma.application.findMany({ select: { id: true, name: true, verificationProgress: true, lastVerificationDate: true } });
    const pendingVerificationApplications = applicationRecords
      .map((application) => ({ id: application.id, name: application.name, percent: Number((application.verificationProgress as { pendingVerificationPercent?: number } | null)?.pendingVerificationPercent ?? 0), ...(application.lastVerificationDate ? { lastVerificationDate: application.lastVerificationDate } : {}) }))
      .filter((application) => application.percent > 0)
      .sort((left, right) => right.percent - left.percent).slice(0, 5);
    const longestVerificationElapsed = applicationRecords
      .map((application) => {
        const date = application.lastVerificationDate ? new Date(application.lastVerificationDate).getTime() : 0;
        return { id: application.id, name: application.name, ...(application.lastVerificationDate ? { lastVerificationDate: application.lastVerificationDate } : {}), elapsedDays: date ? Math.max(0, Math.floor((nowTimestamp - date) / 86400000)) : -1 };
      })
      .sort((left, right) => right.elapsedDays - left.elapsedDays).slice(0, 5);
    const severityRank: Record<string, number> = { CRITICAL: 4, HIGH: 3, MEDIUM: 2, LOW: 1 };
    const topCveFindings = vulnerabilities.sort((left, right) => (severityRank[right.severity] ?? 0) - (severityRank[left.severity] ?? 0)).slice(0, 5).map((vulnerability) => ({ id: vulnerability.id, cve: vulnerability.cve ?? vulnerability.id, library: vulnerability.library.libraryName, version: vulnerability.library.version, severity: vulnerability.severity, summary: vulnerability.summary }));
    return { totalApplications, activeApplications: totalApplications, pendingApplications, cveFindings, criticalFindings, verificationSLA, meetingsThisMonth, ctiAlerts: 0, libraryExposure, upcomingMeetings: meetings.map((meeting) => ({ id: meeting.id, application: meeting.application.name, startAt: meeting.startAt.toISOString(), endAt: meeting.endAt.toISOString(), verificator: `${meeting.verificator.firstName ?? ''} ${meeting.verificator.lastName ?? ''}`.trim() || meeting.verificator.email })), topCveFindings, pendingVerificationApplications, longestVerificationElapsed };
  }
}
