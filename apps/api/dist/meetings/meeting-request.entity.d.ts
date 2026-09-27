export type MeetingStatus = 'PENDING' | 'APPROVED' | 'REJECTED' | 'CANCELLED' | 'RESCHEDULED';
export interface MeetingRequestEntity {
    id: string;
    applicationId: string;
    requestedBy: string;
    verificatorId?: string | undefined;
    title: string;
    agenda: string;
    proposedStart: string;
    proposedEnd: string;
    status: MeetingStatus;
    notes?: string | undefined;
    createdAt: string;
    updatedAt: string;
}
