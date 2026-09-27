"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.MeetingRequestsService = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../prisma.service");
const applications_service_1 = require("../applications/applications.service");
const meeting_scheduling_1 = require("./meeting-scheduling");
const timezone_1 = require("../common/timezone");
const XLSX = __importStar(require("xlsx"));
let MeetingRequestsService = class MeetingRequestsService {
    prisma;
    applications;
    requests = new Map();
    constructor(prisma, applications) {
        this.prisma = prisma;
        this.applications = applications;
    }
    async createSchedule(input) {
        if (!this.prisma)
            throw new Error('Meeting persistence is not configured.');
        const startAt = new Date(input.startAt);
        const endAt = new Date(input.endAt);
        if (!Number.isFinite(startAt.getTime()) || !Number.isFinite(endAt.getTime()) || endAt <= startAt)
            throw new common_1.BadRequestException('Meeting end time must be later than start time.');
        const [application, verificator] = await Promise.all([
            this.prisma.application.findUnique({ where: { id: input.applicationId }, select: { id: true, name: true } }),
            this.prisma.user.findFirst({ where: { id: input.verificatorId, role: 'VERIFICATOR', isActive: true }, select: { id: true, email: true, firstName: true, lastName: true } }),
        ]);
        if (!application)
            throw new common_1.NotFoundException('Application not found.');
        if (!verificator)
            throw new common_1.NotFoundException('Active verificator not found.');
        return this.prisma.$transaction(async (transaction) => {
            await transaction.$executeRawUnsafe('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', `meeting-verificator:${input.verificatorId}`);
            const existing = await transaction.meetingSchedule.findMany({ where: { verificatorId: input.verificatorId, status: { in: ['SCHEDULED', 'IN_PROGRESS'] } }, select: { id: true, verificatorId: true, startAt: true, endAt: true, status: true } });
            try {
                (0, meeting_scheduling_1.ensureNoOverlap)(existing, { verificatorId: input.verificatorId, startAt, endAt, status: 'SCHEDULED' });
            }
            catch (error) {
                throw new common_1.ConflictException(error instanceof Error ? error.message : 'Meeting overlap is not allowed for the same verificator.');
            }
            return transaction.meetingSchedule.create({ data: { applicationId: input.applicationId, verificatorId: input.verificatorId, createdById: input.createdById, startAt, endAt, purpose: input.purpose, timezone: input.timezone ?? 'UTC' }, include: { application: true, verificator: true } });
        });
    }
    async updateSchedule(id, input) {
        if (!this.prisma)
            throw new Error('Meeting persistence is not configured.');
        const existingMeeting = await this.prisma.meetingSchedule.findUnique({ where: { id }, include: { application: true, verificator: true } });
        if (!existingMeeting)
            throw new common_1.NotFoundException('Meeting not found.');
        const applicationId = input.applicationId ?? existingMeeting.applicationId;
        const verificatorId = input.verificatorId ?? existingMeeting.verificatorId;
        const startAt = input.startAt ? new Date(input.startAt) : existingMeeting.startAt;
        const endAt = input.endAt ? new Date(input.endAt) : existingMeeting.endAt;
        const purpose = input.purpose ?? existingMeeting.purpose;
        const timezone = input.timezone ?? existingMeeting.timezone;
        if (!Number.isFinite(startAt.getTime()) || !Number.isFinite(endAt.getTime()) || endAt <= startAt)
            throw new common_1.BadRequestException('Meeting end time must be later than start time.');
        return this.prisma.$transaction(async (transaction) => {
            await transaction.$executeRawUnsafe('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', `meeting-verificator:${verificatorId}`);
            const overlaps = await transaction.meetingSchedule.findMany({
                where: { verificatorId, status: { in: ['SCHEDULED', 'IN_PROGRESS'] }, id: { not: id } },
                select: { id: true, verificatorId: true, startAt: true, endAt: true, status: true },
            });
            try {
                (0, meeting_scheduling_1.ensureNoOverlap)(overlaps, { id, verificatorId, startAt, endAt, status: existingMeeting.status });
            }
            catch (error) {
                throw new common_1.ConflictException(error instanceof Error ? error.message : 'Meeting overlap is not allowed for the same verificator.');
            }
            return transaction.meetingSchedule.update({
                where: { id },
                data: { applicationId, verificatorId, startAt, endAt, purpose, timezone },
                include: { application: true, verificator: true, results: { orderBy: { capturedAt: 'asc' } } },
            });
        });
    }
    async deleteSchedule(id) {
        if (!this.prisma)
            throw new Error('Meeting persistence is not configured.');
        const meeting = await this.prisma.meetingSchedule.findUnique({ where: { id } });
        if (!meeting)
            throw new common_1.NotFoundException('Meeting not found.');
        await this.prisma.meetingSchedule.delete({ where: { id } });
        return { deleted: true, id };
    }
    async listSchedules(userId, role, options) {
        if (!this.prisma)
            return { items: [], pagination: { page: options.page, limit: options.limit, total: 0, totalPages: 0 } };
        const now = new Date();
        const nowJakartaParts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jakarta', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(now);
        const year = Number(nowJakartaParts.find((part) => part.type === 'year')?.value ?? new Date().getUTCFullYear());
        const month = Number(nowJakartaParts.find((part) => part.type === 'month')?.value ?? 1);
        const day = Number(nowJakartaParts.find((part) => part.type === 'day')?.value ?? 1);
        let start = (0, timezone_1.fromJakartaCalendar)({ year, month, day: 1, hour: 0, minute: 0, second: 0 });
        if (options.period === 'today') {
            start = (0, timezone_1.startOfDayInJakarta)(now);
        }
        else if (options.period === 'week') {
            const weekday = new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Jakarta', weekday: 'short' }).format(now);
            const offsetMap = { Sun: 6, Mon: 0, Tue: 1, Wed: 2, Thu: 3, Fri: 4, Sat: 5 };
            const offset = offsetMap[weekday] ?? 0;
            start = (0, timezone_1.fromJakartaCalendar)({ year, month, day: day - offset, hour: 0, minute: 0, second: 0 });
        }
        else if (options.period === 'month') {
            start = (0, timezone_1.fromJakartaCalendar)({ year, month, day: 1, hour: 0, minute: 0, second: 0 });
        }
        const end = new Date(start);
        if (options.period === 'month')
            end.setUTCMonth(end.getUTCMonth() + 1);
        else if (options.period === 'week')
            end.setUTCDate(end.getUTCDate() + 7);
        else if (options.period === 'today')
            end.setUTCDate(end.getUTCDate() + 1);
        const canFilterByVerificator = role === 'SUPERADMIN' || role === 'OVERSEER';
        const where = {
            ...(options.period !== 'all' ? { startAt: { gte: start, lt: end } } : {}),
            ...(role === 'VERIFICATOR' && userId ? { verificatorId: userId } : canFilterByVerificator && options.verificatorId ? { verificatorId: options.verificatorId } : {}),
        };
        const skip = (options.page - 1) * options.limit;
        const [total, allItems] = await this.prisma.$transaction([
            this.prisma.meetingSchedule.count({ where }),
            this.prisma.meetingSchedule.findMany({
                where,
                orderBy: [{ startAt: 'asc' }, { id: 'asc' }],
                include: { application: { select: { id: true, name: true } }, verificator: { select: { id: true, email: true, firstName: true, lastName: true } }, results: { orderBy: { capturedAt: 'asc' } } },
            }),
        ]);
        const statusOrder = { SCHEDULED: 0, IN_PROGRESS: 1, FINISHED: 2, CANCELLED: 3 };
        allItems.sort((left, right) => {
            const statusDifference = (statusOrder[left.status] ?? 4) - (statusOrder[right.status] ?? 4);
            if (statusDifference !== 0)
                return statusDifference;
            const timeDifference = left.status === 'FINISHED'
                ? right.startAt.getTime() - left.startAt.getTime()
                : left.startAt.getTime() - right.startAt.getTime();
            return timeDifference || left.id.localeCompare(right.id);
        });
        const items = allItems.slice(skip, skip + options.limit);
        return { items, pagination: { page: options.page, limit: options.limit, total, totalPages: Math.ceil(total / options.limit) } };
    }
    async listScheduleOptions() {
        if (!this.prisma)
            return { applications: [], verificators: [] };
        const [applications, verificators] = await Promise.all([
            this.prisma.application.findMany({ select: { id: true, name: true }, orderBy: { name: 'asc' } }),
            this.prisma.user.findMany({ where: { role: 'VERIFICATOR', isActive: true }, select: { id: true, email: true, firstName: true, lastName: true }, orderBy: { email: 'asc' } }),
        ]);
        return { applications, verificators };
    }
    async startSchedule(id, userId, role) {
        return this.captureSchedule(id, userId, role, 'START');
    }
    async finishSchedule(id, userId, role, meetingNotes) {
        return this.captureSchedule(id, userId, role, 'FINISH', meetingNotes);
    }
    async listApplicationResults(applicationId) {
        if (!this.prisma)
            return [];
        return this.prisma.meetingResult.findMany({ where: { meeting: { applicationId } }, orderBy: { capturedAt: 'asc' }, include: { meeting: { select: { id: true, startAt: true, endAt: true, status: true } } } });
    }
    async generateReport(userId, role, month, year) {
        if (!this.prisma)
            throw new Error('Meeting persistence is not configured.');
        const start = new Date(Date.UTC(year, month - 1, 1));
        const end = new Date(Date.UTC(year, month, 1));
        const meetings = await this.prisma.meetingSchedule.findMany({
            where: { startAt: { gte: start, lt: end }, ...(role === 'VERIFICATOR' ? { verificatorId: userId } : {}) },
            orderBy: { startAt: 'asc' },
            include: { application: { select: { name: true, picName: true, environment: true } }, verificator: { select: { firstName: true, lastName: true, email: true } }, results: true },
        });
        const verifierName = role === 'VERIFICATOR' && meetings[0]
            ? `${meetings[0].verificator.firstName ?? ''} ${meetings[0].verificator.lastName ?? ''}`.trim() || meetings[0].verificator.email
            : 'All Verificators';
        const modules = ['Architecture', 'Authentication', 'Session Management', 'Access Control', 'Validation Sanitation and Encapsulating', 'Cryptography', 'Error Handling and Loging', 'Data Protection', 'Communications', 'Malicious Code', 'Business Logic', 'File and Resources', 'API', 'Configuration'];
        const dailyRows = meetings.map((meeting) => {
            const startResult = meeting.results.find((result) => result.phase === 'START');
            const finishResult = meeting.results.find((result) => result.phase === 'FINISH');
            const meetingVerifier = `${meeting.verificator.firstName ?? ''} ${meeting.verificator.lastName ?? ''}`.trim() || meeting.verificator.email;
            const shuffled = [...modules].sort(() => Math.random() - 0.5).slice(0, 2 + Math.floor(Math.random() * 3));
            return [(0, timezone_1.toJakartaDateString)(meeting.startAt), meetingVerifier, meeting.application.name, `${((startResult?.passPoints ?? 0) / Math.max(1, startResult?.totalPoints ?? 0) * 100).toFixed(2)}%`, `${((finishResult?.passPoints ?? 0) / Math.max(1, finishResult?.totalPoints ?? 0) * 100).toFixed(2)}%`, shuffled.join(', ')];
        });
        const applicationRows = Array.from(new Map(meetings.map((meeting) => [meeting.application.name, [meeting.application.name, meeting.application.picName ?? '', 'STAGING']])).values()).map((row, index) => [index + 1, ...row]);
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([['TGL', 'Verifikator', 'APP', 'PERSENTASE AWAL', 'PERSENTASE AKHIR', 'VERIFIKASI'], ...dailyRows]), 'DAILY REPORT');
        XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([['No', 'Nama Aplikasi', 'Verifikator Utama', 'Environment'], ...applicationRows]), 'APPLICATION LIST');
        const content = XLSX.write(workbook, { type: 'base64', bookType: 'xlsx' });
        const monthName = start.toLocaleString('en-US', { month: 'long', timeZone: 'UTC' });
        return { fileName: `Report CSA - ${monthName} ${year} - ${verifierName}.xlsx`, contentBase64: content, mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' };
    }
    async captureSchedule(id, userId, role, phase, meetingNotes) {
        if (!this.prisma || !this.applications)
            throw new Error('Meeting persistence is not configured.');
        const meeting = await this.prisma.meetingSchedule.findUnique({ where: { id }, include: { results: true, verificator: { select: { firstName: true, email: true } } } });
        if (!meeting)
            throw new common_1.NotFoundException('Meeting not found.');
        if (role === 'VERIFICATOR' && meeting.verificatorId !== userId)
            throw new common_1.ForbiddenException('This meeting is assigned to another verificator.');
        const existingResult = meeting.results.find((result) => result.phase === phase);
        if (phase === 'START' && meeting.status === 'IN_PROGRESS' && existingResult) {
            return { meeting, result: existingResult };
        }
        if (phase === 'FINISH' && meeting.status === 'FINISHED' && existingResult) {
            return { meeting, result: existingResult };
        }
        if (phase === 'START' && meeting.status !== 'SCHEDULED')
            throw new common_1.ForbiddenException('Only scheduled meetings can be started.');
        if (phase === 'FINISH' && meeting.status !== 'IN_PROGRESS')
            throw new common_1.ForbiddenException('Only active meetings can be finished.');
        if (phase === 'START') {
            const verifierFirstName = meeting.verificator.firstName?.trim() || meeting.verificator.email;
            await this.applications.recordVerificationStart(meeting.applicationId, verifierFirstName, (0, timezone_1.toJakartaDateString)(new Date()));
        }
        const application = await this.applications.refreshVerificationProgress(meeting.applicationId);
        const progress = application.verificationProgress;
        const totalPoints = Number(progress?.totalPoints ?? 0);
        const passPoints = Number(progress?.passPoints ?? 0);
        const needToFixPoints = Number(progress?.needToFixPoints ?? 0);
        const waitingPoints = Number(progress?.waitingForReviewPoints ?? 0);
        const uncheckPoints = Number(progress?.uncheckPoints ?? 0);
        const progressPercent = totalPoints > 0 ? (passPoints / totalPoints) * 100 : Number(progress?.percent ?? 0);
        const now = new Date();
        return this.prisma.$transaction(async (transaction) => {
            const transition = await transaction.meetingSchedule.updateMany({
                where: { id, status: phase === 'START' ? 'SCHEDULED' : 'IN_PROGRESS' },
                data: phase === 'START' ? { status: 'IN_PROGRESS', startedAt: now } : { status: 'FINISHED', finishedAt: now, meetingNotes: meetingNotes?.trim() || null },
            });
            if (transition.count !== 1) {
                throw new common_1.ConflictException(phase === 'START' ? 'Only scheduled meetings can be started.' : 'Only active meetings can be finished.');
            }
            const result = await transaction.meetingResult.create({ data: { meetingId: id, phase, capturedAt: now, passPoints, needToFixPoints, waitingPoints, uncheckPoints, totalPoints, progressPercent } });
            const updated = await transaction.meetingSchedule.findUniqueOrThrow({ where: { id } });
            return { meeting: updated, result };
        });
    }
    createRequest(input) {
        const now = new Date().toISOString();
        const request = {
            ...input,
            createdAt: input.createdAt ?? now,
            updatedAt: input.updatedAt ?? now,
        };
        this.requests.set(request.id, request);
        return request;
    }
    listRequests() {
        return Array.from(this.requests.values());
    }
    updateRequest(id, status, notes) {
        const request = this.requests.get(id);
        if (!request) {
            return undefined;
        }
        request.status = status;
        request.notes = notes !== undefined ? notes : request.notes;
        request.updatedAt = new Date().toISOString();
        return request;
    }
};
exports.MeetingRequestsService = MeetingRequestsService;
exports.MeetingRequestsService = MeetingRequestsService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService, applications_service_1.ApplicationsService])
], MeetingRequestsService);
//# sourceMappingURL=meeting-requests.service.js.map