import { FileUploadValidator } from './file-upload.validator';

describe('FileUploadValidator', () => {
  it('rejects path traversal filenames', () => {
    const result = FileUploadValidator.validate({ filename: '../secrets.txt', mimeType: 'text/csv', sizeBytes: 200 });
    expect(result.valid).toBe(false);
  });

  it('accepts valid PDF uploads under limit', () => {
    const result = FileUploadValidator.validate({ filename: 'report.pdf', mimeType: 'application/pdf', sizeBytes: 1000 });
    expect(result.valid).toBe(true);
  });
});
