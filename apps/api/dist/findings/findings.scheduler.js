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
var FindingsScheduler_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.FindingsScheduler = void 0;
const common_1 = require("@nestjs/common");
const libraries_service_1 = require("../libraries/libraries.service");
const findings_service_1 = require("./findings.service");
let FindingsScheduler = FindingsScheduler_1 = class FindingsScheduler {
    findingsService;
    librariesService;
    logger = new common_1.Logger(FindingsScheduler_1.name);
    timer;
    constructor(findingsService, librariesService) {
        this.findingsService = findingsService;
        this.librariesService = librariesService;
    }
    async onApplicationBootstrap() {
        if (process.env.VERCEL)
            return;
        this.scheduleNextRun();
        void this.runScheduledScan().catch((error) => {
            this.logger.error('Initial findings scan failed during startup.', error instanceof Error ? error.stack : String(error));
        });
    }
    scheduleNextRun() {
        if (this.timer) {
            clearTimeout(this.timer);
        }
        const now = new Date();
        const nextRun = this.getNextRunTime(now);
        const delay = Math.max(0, nextRun.getTime() - now.getTime());
        this.logger.log(`Next findings CVE scan scheduled for ${nextRun.toISOString()}.`);
        this.timer = setTimeout(() => {
            void this.runScheduledScan();
            this.scheduleNextRun();
        }, delay);
    }
    getNextRunTime(from) {
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
    async runScheduledScan() {
        const synced = await this.librariesService.syncLibraryVulnerabilities();
        this.logger.log(`Scheduled library vulnerability sync stored ${synced} records and normalized stale GHSA entries.`);
        const findingsResponse = await this.findingsService.listFindings({ limit: 1000 });
        const pending = findingsResponse.items.filter((item) => !item.cve);
        if (!pending.length) {
            this.logger.log('No findings require CVE enrichment at this time.');
            return;
        }
        this.logger.log(`Running scheduled CVE check for ${pending.length} findings.`);
        const results = await Promise.allSettled(pending.map((finding) => this.findingsService.checkCve({
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
        })));
        const failed = results.filter((result) => result.status === 'rejected').length;
        if (failed > 0) {
            this.logger.warn(`Scheduled CVE check completed with ${failed} failed item(s).`);
            return;
        }
        this.logger.log('Scheduled CVE check completed successfully.');
    }
};
exports.FindingsScheduler = FindingsScheduler;
exports.FindingsScheduler = FindingsScheduler = FindingsScheduler_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [findings_service_1.FindingsService, libraries_service_1.LibrariesService])
], FindingsScheduler);
//# sourceMappingURL=findings.scheduler.js.map