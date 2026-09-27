"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const file_upload_validator_1 = require("./file-upload.validator");
describe('FileUploadValidator', () => {
    it('rejects path traversal filenames', () => {
        const result = file_upload_validator_1.FileUploadValidator.validate({ filename: '../secrets.txt', mimeType: 'text/csv', sizeBytes: 200 });
        expect(result.valid).toBe(false);
    });
    it('accepts valid PDF uploads under limit', () => {
        const result = file_upload_validator_1.FileUploadValidator.validate({ filename: 'report.pdf', mimeType: 'application/pdf', sizeBytes: 1000 });
        expect(result.valid).toBe(true);
    });
});
//# sourceMappingURL=file-upload.validator.spec.js.map