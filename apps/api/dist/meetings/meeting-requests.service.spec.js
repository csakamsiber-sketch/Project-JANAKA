"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
jest.mock('@nestjs/common', () => ({
    BadRequestException: class BadRequestException extends Error {
    },
    ConflictException: class ConflictException extends Error {
    },
    ForbiddenException: class ForbiddenException extends Error {
    },
    Injectable: () => (target) => target,
    NotFoundException: class NotFoundException extends Error {
    },
}));
const meeting_requests_service_1 = require("./meeting-requests.service");
describe('MeetingRequestsService', () => {
    it('returns the existing finish result when a meeting is already finished', async () => {
        const existingResult = {
            id: 'result-1',
            meetingId: 'meeting-1',
            phase: 'FINISH',
            capturedAt: new Date('2026-09-23T09:00:00Z'),
            passPoints: 100,
            needToFixPoints: 0,
            waitingPoints: 0,
            uncheckPoints: 0,
            totalPoints: 100,
            progressPercent: 100,
        };
        const meeting = {
            id: 'meeting-1',
            applicationId: 'app-1',
            verificatorId: 'user-1',
            status: 'FINISHED',
            results: [existingResult],
            verificator: { firstName: 'Ada', email: 'ada@example.com' },
        };
        const prisma = {
            meetingSchedule: {
                findUnique: jest.fn().mockResolvedValue(meeting),
            },
            meetingResult: {
                findUnique: jest.fn().mockResolvedValue(existingResult),
            },
            $transaction: jest.fn(async (callback) => callback({
                meetingSchedule: {
                    updateMany: jest.fn().mockResolvedValue({ count: 0 }),
                    findUniqueOrThrow: jest.fn().mockResolvedValue(meeting),
                },
                meetingResult: {
                    create: jest.fn(),
                },
            })),
        };
        const applications = {
            refreshVerificationProgress: jest.fn().mockResolvedValue({ verificationProgress: { totalPoints: 100, passPoints: 100, needToFixPoints: 0, waitingForReviewPoints: 0, uncheckPoints: 0, percent: 100 } }),
            recordVerificationStart: jest.fn(),
        };
        const service = new meeting_requests_service_1.MeetingRequestsService(prisma, applications);
        await expect(service.finishSchedule('meeting-1', 'user-1', 'VERIFICATOR')).resolves.toMatchObject({
            meeting: expect.objectContaining({ status: 'FINISHED' }),
            result: expect.objectContaining({ phase: 'FINISH', passPoints: 100 }),
        });
    });
});
//# sourceMappingURL=meeting-requests.service.spec.js.map