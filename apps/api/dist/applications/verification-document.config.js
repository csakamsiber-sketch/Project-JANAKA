"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.applyVerificationDocumentSettings = applyVerificationDocumentSettings;
function applyVerificationDocumentSettings(input) {
    const settings = {
        WEB_CHECKLIST: { sheetName: 'Dashboard', passCell: 'C45', needToFixCell: 'D45', waitingForReviewCell: 'E45', uncheckCell: 'F45', totalPoints: 310 },
        NEW_FEATURE_BUG_FIXING: { sheetName: 'Dashboard', passCell: 'C14', needToFixCell: 'D14', waitingForReviewCell: 'E14', uncheckCell: 'F14', totalPoints: 100 },
        MOBILE_CHECKLIST: { sheetName: 'Dashboard', passCell: 'C45', needToFixCell: 'D45', waitingForReviewCell: 'E45', uncheckCell: 'F45', totalPoints: 310 },
        CUSTOM_DOCUMENT: { sheetName: 'Dashboard', passCell: 'C45', needToFixCell: 'D45', waitingForReviewCell: 'E45', uncheckCell: 'F45', totalPoints: 310 },
    };
    return { ...input, ...settings[input.type] };
}
//# sourceMappingURL=verification-document.config.js.map