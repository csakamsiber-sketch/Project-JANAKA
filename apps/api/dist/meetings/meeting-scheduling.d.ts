export interface MeetingSlot {
    id?: string;
    verificatorId: string;
    startAt: Date;
    endAt: Date;
    status?: string;
}
export declare function validateMeetingDuration(startAt: Date, endAt: Date): void;
export declare function hasOverlap(existing: MeetingSlot, candidate: MeetingSlot): boolean;
export declare function getMeetingSortPriority(slot: MeetingSlot, now?: Date): number;
export declare function sortMeetingSlots<T extends MeetingSlot>(left: T, right: T): number;
export declare function ensureNoOverlap(existingMeetings: MeetingSlot[], candidate: MeetingSlot): void;
