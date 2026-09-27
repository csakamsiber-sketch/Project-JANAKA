export declare class SecurityValidationError extends Error {
    constructor(message: string);
}
export declare function rejectDuplicateQueryParameters(rawUrl: string): void;
export declare function rejectDuplicateJsonKeys(rawBody: string): void;
export declare function rejectPrototypePollutionObject(value: unknown): void;
