export type VerificationPeriodStatus = 'DRAFT' | 'ACTIVE' | 'CLOSED';

export interface VerificationPeriodEntity {
  id: string;
  applicationId: string;
  name: string;
  startDate: Date;
  endDate: Date;
  status: VerificationPeriodStatus;
  scope: string;
  assignedVerificatorId?: string | undefined;
  createdAt: Date;
  updatedAt: Date;
}
