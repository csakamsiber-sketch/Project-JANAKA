export type ApplicationEnvironment = 'DEV' | 'STAGING' | 'PRODUCTION';
export type ApplicationStatus = 'ACTIVE' | 'PENDING' | 'ARCHIVED' | 'MONITORING' | 'REVIEW';
export type SpreadsheetType = 'WEB_FE' | 'WEB_BE' | 'MOBILE' | 'CR_UPDATE';
export type VerificationDocumentType = 'MOBILE_CHECKLIST' | 'WEB_CHECKLIST' | 'NEW_FEATURE_BUG_FIXING' | 'CUSTOM_DOCUMENT';

export interface SpreadsheetLink {
  type: SpreadsheetType;
  label: string;
  url: string;
}

export interface VerificationDocument {
  type: VerificationDocumentType;
  label: string;
  url: string;
  sheetName: string;
  passCell: string;
  needToFixCell: string;
  waitingForReviewCell: string;
  uncheckCell: string;
  totalPoints?: number | undefined;
  progress?: VerificationProgress | undefined;
}

export interface VerificationProgress {
  percent: number;
  totalPoints?: number | undefined;
  passPoints?: number | undefined;
  needToFixPoints?: number | undefined;
  waitingForReviewPoints?: number | undefined;
  uncheckPoints?: number | undefined;
  checkingPercent?: number | undefined;
  pendingVerificationPercent?: number | undefined;
  lastUpdated: string;
  lastVerifier: string;
  lastVerificationDate?: string | undefined;
  status: 'NOT_STARTED' | 'IN_PROGRESS' | 'APPROVED' | 'REJECTED';
  notes?: string | undefined;
}

export interface LibraryRecord {
  id?: string;
  name: string;
  version: string;
  ecosystem?: string;
  source?: string;
  layer?: 'frontend' | 'backend';
  vulnerabilities?: Array<{ id?: string; cve?: string; severity: string; summary: string; fixedVersion?: string }>;
}

export interface ApplicationEntity {
  id: string;
  name: string;
  description?: string | undefined;
  organization: string;
  environment: ApplicationEnvironment;
  language?: string | undefined;
  framework?: string | undefined;
  languageFrontend?: string | undefined;
  languageBackend?: string | undefined;
  frameworkFrontend?: string | undefined;
  frameworkBackend?: string | undefined;
  technologyStack: string[];
  libraries?: LibraryRecord[] | undefined;
  projectStartDate: string;
  owner: string;
  picId?: string | undefined;
  picName?: string | undefined;
  developerIds: string[];
  googleSheetId?: string | undefined;
  spreadsheetLinks: SpreadsheetLink[];
  verificationDocuments?: VerificationDocument[] | undefined;
  frontendUrl?: string | undefined;
  backendUrl?: string | undefined;
  lastVerificationDate?: string | undefined;
  lastVerifier?: string | undefined;
  verificationProgress?: VerificationProgress | undefined;
  status?: ApplicationStatus | undefined;
  createdAt: Date;
  updatedAt: Date;
}
