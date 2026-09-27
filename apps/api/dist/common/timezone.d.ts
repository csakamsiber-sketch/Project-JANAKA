export declare const JAKARTA_TIME_ZONE = "Asia/Jakarta";
export declare function fromJakartaCalendar(value: {
    year: number;
    month: number;
    day: number;
    hour?: number;
    minute?: number;
    second?: number;
}): Date;
export declare function toJakartaDateString(date: Date): string;
export declare function startOfDayInJakarta(date: Date): Date;
export declare function endOfDayInJakarta(date: Date): Date;
export declare function startOfMonthInJakarta(date: Date): Date;
