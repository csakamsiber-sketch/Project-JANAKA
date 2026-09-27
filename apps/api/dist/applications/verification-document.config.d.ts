import { VerificationDocumentType } from './application.entity';
export type VerificationDocumentInput = {
    type: VerificationDocumentType;
    label: string;
    url: string;
};
export declare function applyVerificationDocumentSettings(input: VerificationDocumentInput): {
    sheetName: string;
    passCell: string;
    needToFixCell: string;
    waitingForReviewCell: string;
    uncheckCell: string;
    totalPoints: number;
    type: VerificationDocumentType;
    label: string;
    url: string;
};
