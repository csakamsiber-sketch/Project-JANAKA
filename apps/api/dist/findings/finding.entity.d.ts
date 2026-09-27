export type FindingSeverity = 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW' | 'INFO';
export type FindingStatus = 'OPEN' | 'UNDER_REVIEW' | 'MITIGATED' | 'FIXED' | 'FALSE_POSITIVE' | 'ACCEPTED_RISK';
export interface FindingEntity {
    id: string;
    applicationId: string;
    verificationPeriodId: string;
    source: string;
    title: string;
    description: string;
    severity: FindingSeverity;
    status: FindingStatus;
    affectedComponent: string;
    cve?: string | undefined;
    fixedVersion?: string | undefined;
    evidence?: string | undefined;
    recommendation?: string | undefined;
    createdBy: string;
    createdAt: Date;
    updatedAt: Date;
}
