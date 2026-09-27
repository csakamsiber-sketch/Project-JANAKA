"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const timezone_1 = require("./timezone");
describe('timezone helpers', () => {
    it('keeps the calendar date in Asia/Jakarta when the instant is after UTC midnight', () => {
        expect((0, timezone_1.toJakartaDateString)(new Date('2026-09-27T16:00:00.000Z'))).toBe('2026-09-27');
    });
    it('builds a Jakarta start-of-day boundary for database filtering', () => {
        const start = (0, timezone_1.startOfDayInJakarta)(new Date('2026-09-27T16:00:00.000Z'));
        expect(start.toISOString()).toBe('2026-09-26T17:00:00.000Z');
    });
});
//# sourceMappingURL=timezone.spec.js.map