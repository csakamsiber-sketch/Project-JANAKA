"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const meeting_scheduling_1 = require("./meeting-scheduling");
describe('meeting scheduling', () => {
    it('rejects zero-duration meetings', () => {
        expect(() => (0, meeting_scheduling_1.validateMeetingDuration)(new Date('2026-09-01T09:00:00Z'), new Date('2026-09-01T09:00:00Z'))).toThrow();
    });
    it('rejects overlapping meetings for the same verificator', () => {
        const existing = [
            { verificatorId: 'v-1', startAt: new Date('2026-09-01T09:00:00Z'), endAt: new Date('2026-09-01T10:00:00Z') },
        ];
        expect(() => (0, meeting_scheduling_1.ensureNoOverlap)(existing, {
            verificatorId: 'v-1',
            startAt: new Date('2026-09-01T09:30:00Z'),
            endAt: new Date('2026-09-01T10:30:00Z'),
        })).toThrow('Meeting overlap is not allowed for the same verificator.');
    });
    it('allows non-overlapping meetings', () => {
        const existing = [
            { verificatorId: 'v-2', startAt: new Date('2026-09-01T08:00:00Z'), endAt: new Date('2026-09-01T09:00:00Z') },
        ];
        expect(() => (0, meeting_scheduling_1.ensureNoOverlap)(existing, {
            verificatorId: 'v-2',
            startAt: new Date('2026-09-01T09:00:00Z'),
            endAt: new Date('2026-09-01T10:00:00Z'),
        })).not.toThrow();
    });
    it('orders meetings from newest start time to oldest start time', () => {
        const meetings = [
            { id: 'old', verificatorId: 'v-1', startAt: new Date('2026-09-01T09:00:00Z'), endAt: new Date('2026-09-01T10:00:00Z') },
            { id: 'newest', verificatorId: 'v-1', startAt: new Date('2026-09-03T09:00:00Z'), endAt: new Date('2026-09-03T10:00:00Z') },
            { id: 'middle', verificatorId: 'v-1', startAt: new Date('2026-09-02T09:00:00Z'), endAt: new Date('2026-09-02T10:00:00Z') },
        ];
        expect([...meetings].sort(meeting_scheduling_1.sortMeetingSlots).map((meeting) => meeting.id)).toEqual(['newest', 'middle', 'old']);
    });
});
//# sourceMappingURL=meeting-scheduling.spec.js.map