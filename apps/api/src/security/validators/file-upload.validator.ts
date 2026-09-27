export type AllowedMime = 'application/pdf' | 'image/png' | 'image/jpeg' | 'text/csv';

export type UploadFile = {
  filename: string;
  mimeType: string;
  sizeBytes: number;
  content?: Uint8Array | Buffer | string;
};

export class FileUploadValidator {
  static allowableMimes: AllowedMime[] = ['application/pdf', 'image/png', 'image/jpeg', 'text/csv'];

  static validate(file: Partial<UploadFile>, maxSizeBytes = 5 * 1024 * 1024): { valid: boolean; reason?: string } {
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

    if (!this.allowableMimes.includes(file.mimeType as AllowedMime)) {
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
