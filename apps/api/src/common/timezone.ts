export const JAKARTA_TIME_ZONE = 'Asia/Jakarta';
const JAKARTA_OFFSET_MS = 7 * 60 * 60 * 1000;

function getJakartaParts(date: Date) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: JAKARTA_TIME_ZONE,
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

export function fromJakartaCalendar(value: { year: number; month: number; day: number; hour?: number; minute?: number; second?: number }): Date {
  const { year, month, day, hour = 0, minute = 0, second = 0 } = value;
  return new Date(Date.UTC(year, month - 1, day, hour, minute, second) - JAKARTA_OFFSET_MS);
}

export function toJakartaDateString(date: Date): string {
  const { year, month, day } = getJakartaParts(date);
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

export function startOfDayInJakarta(date: Date): Date {
  const { year, month, day } = getJakartaParts(date);
  return fromJakartaCalendar({ year, month, day, hour: 0, minute: 0, second: 0 });
}

export function endOfDayInJakarta(date: Date): Date {
  const start = startOfDayInJakarta(date);
  return new Date(start.getTime() + 24 * 60 * 60 * 1000 - 1);
}

export function startOfMonthInJakarta(date: Date): Date {
  const { year, month } = getJakartaParts(date);
  return fromJakartaCalendar({ year, month, day: 1, hour: 0, minute: 0, second: 0 });
}
