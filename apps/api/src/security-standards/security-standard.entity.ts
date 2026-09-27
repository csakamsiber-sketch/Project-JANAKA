export type StandardStatus = 'NOT_STARTED' | 'READY_TO_CHECK' | 'FIXING' | 'DONE';
export type ValidationResult = 'INVALID' | 'VALID' | 'N/A';

export interface SecurityStandardEntity {
  id: string;
  name: string;
  requirement: string;
  description: string;
  reference: string;
  version: string;
  status: StandardStatus;
  evidence?: string;
  finding?: string;
  verificationResult?: ValidationResult;
  createdAt: Date;
  updatedAt: Date;
}
