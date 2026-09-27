"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.FileUploadValidator = void 0;
class FileUploadValidator {
    static allowableMimes = ['application/pdf', 'image/png', 'image/jpeg', 'text/csv'];
    static validate(file, maxSizeBytes = 5 * 1024 * 1024) {
        if (!file || typeof file !== 'object') {
            return { valid: false, reason: 'No file payload provided' };
        }
        if (!file.filename || typeof file.filename !== 'string') {
            return { valid: false, reason: 'Filename is required' };
        }
        if (file.filename.includes('..') || file.filename.includes('/') || file.filename.includes('\\')) {
            return { valid: false, reason: 'Invalid filename path' };
        }
        if (!file.mimeType || typeof file.mimeType !== 'string') {
            return { valid: false, reason: 'MIME type is required' };
        }
        if (!this.allowableMimes.includes(file.mimeType)) {
            return { valid: false, reason: 'Unsupported MIME type' };
        }
        const size = Number(file.sizeBytes ?? 0);
        if (!Number.isFinite(size) || size <= 0) {
            return { valid: false, reason: 'File size is required and must be positive' };
        }
        if (size > maxSizeBytes) {
            return { valid: false, reason: 'File exceeded maximum upload size' };
        }
        return { valid: true };
    }
}
exports.FileUploadValidator = FileUploadValidator;
//# sourceMappingURL=file-upload.validator.js.map