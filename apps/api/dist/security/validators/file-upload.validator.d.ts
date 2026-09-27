export type AllowedMime = 'application/pdf' | 'image/png' | 'image/jpeg' | 'text/csv';
export type UploadFile = {
    filename: string;
    mimeType: string;
    sizeBytes: number;
    content?: Uint8Array | Buffer | string;
};
export declare class FileUploadValidator {
    static allowableMimes: AllowedMime[];
    static validate(file: Partial<UploadFile>, maxSizeBytes?: number): {
        valid: boolean;
        reason?: string;
    };
}
