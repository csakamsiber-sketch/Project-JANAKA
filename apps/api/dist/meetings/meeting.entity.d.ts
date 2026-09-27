export type MeetingType = 'REQUESTED' | 'APPROVED' | 'REJECTED' | 'SCHEDULED' | 'IN_PROGRESS' | 'FINISHED' | 'CANCELLED';
export interface MeetingEntity {
    id: string;
    applicationId: string;
    verificationPeriodId: string;
    verificatorId: string;
    picId: string;
    startAt: Date;
    endAt: Date;
    status: MeetingType;
    purpose: string;
    participants: string[];
    timezone: string;
    createdAt: Date;
    updatedAt: Date;
}
