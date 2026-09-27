import { VerificationDocumentType } from './application.entity';

export type VerificationDocumentInput = {
  type: VerificationDocumentType;
  label: string;
  url: string;
};

export function applyVerificationDocumentSettings(input: VerificationDocumentInput) {
  const settings: Record<VerificationDocumentType, { sheetName: string; passCell: string; needToFixCell: string; waitingForReviewCell: string; uncheckCell: string; totalPoints: number }> = {
    WEB_CHECKLIST: { sheetName: 'Dashboard', passCell: 'C45', needToFixCell: 'D45', waitingForReviewCell: 'E45', uncheckCell: 'F45', totalPoints: 310 },
    NEW_FEATURE_BUG_FIXING: { sheetName: 'Dashboard', passCell: 'C14', needToFixCell: 'D14', waitingForReviewCell: 'E14', uncheckCell: 'F14', totalPoints: 100 },
    MOBILE_CHECKLIST: { sheetName: 'Dashboard', passCell: 'C45', needToFixCell: 'D45', waitingForReviewCell: 'E45', uncheckCell: 'F45', totalPoints: 310 },
    CUSTOM_DOCUMENT: { sheetName: 'Dashboard', passCell: 'C45', needToFixCell: 'D45', waitingForReviewCell: 'E45', uncheckCell: 'F45', totalPoints: 310 },
  };
  return { ...input, ...settings[input.type] };
}
