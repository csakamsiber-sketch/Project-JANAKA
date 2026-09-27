import { startOfDayInJakarta, toJakartaDateString } from './timezone';

describe('timezone helpers', () => {
  it('keeps the calendar date in Asia/Jakarta when the instant is after UTC midnight', () => {
    expect(toJakartaDateString(new Date('2026-09-27T16:00:00.000Z'))).toBe('2026-09-27');
  });

  it('builds a Jakarta start-of-day boundary for database filtering', () => {
    const start = startOfDayInJakarta(new Date('2026-09-27T16:00:00.000Z'));
    expect(start.toISOString()).toBe('2026-09-26T17:00:00.000Z');
  });
});
