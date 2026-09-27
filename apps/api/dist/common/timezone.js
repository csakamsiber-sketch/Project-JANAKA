"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.JAKARTA_TIME_ZONE = void 0;
exports.fromJakartaCalendar = fromJakartaCalendar;
exports.toJakartaDateString = toJakartaDateString;
exports.startOfDayInJakarta = startOfDayInJakarta;
exports.endOfDayInJakarta = endOfDayInJakarta;
exports.startOfMonthInJakarta = startOfMonthInJakarta;
exports.JAKARTA_TIME_ZONE = 'Asia/Jakarta';
const JAKARTA_OFFSET_MS = 7 * 60 * 60 * 1000;
function getJakartaParts(date) {
    const parts = new Intl.DateTimeFormat('en-CA', {
        timeZone: exports.JAKARTA_TIME_ZONE,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false,
    }).formatToParts(date);
    const values = Object.fromEntries(parts.filter((part) => part.type !== 'literal').map((part) => [part.type, part.value]));
    return {
        year: Number(values.year),
        month: Number(values.month),
        day: Number(values.day),
        hour: Number(values.hour ?? 0),
        minute: Number(values.minute ?? 0),
        second: Number(values.second ?? 0),
    };
}
function fromJakartaCalendar(value) {
    const { year, month, day, hour = 0, minute = 0, second = 0 } = value;
    return new Date(Date.UTC(year, month - 1, day, hour, minute, second) - JAKARTA_OFFSET_MS);
}
function toJakartaDateString(date) {
    const { year, month, day } = getJakartaParts(date);
    return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}
function startOfDayInJakarta(date) {
    const { year, month, day } = getJakartaParts(date);
    return fromJakartaCalendar({ year, month, day, hour: 0, minute: 0, second: 0 });
}
function endOfDayInJakarta(date) {
    const start = startOfDayInJakarta(date);
    return new Date(start.getTime() + 24 * 60 * 60 * 1000 - 1);
}
function startOfMonthInJakarta(date) {
    const { year, month } = getJakartaParts(date);
    return fromJakartaCalendar({ year, month, day: 1, hour: 0, minute: 0, second: 0 });
}
//# sourceMappingURL=timezone.js.map