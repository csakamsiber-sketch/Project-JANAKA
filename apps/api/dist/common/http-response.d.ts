export interface ApiResponse<T> {
    data: T;
    meta: Record<string, unknown>;
}
export interface ApiErrorBody {
    error: {
        code: string;
        message: string;
        requestId: string;
    };
}
export declare function buildSuccessResponse<T>(data: T, meta?: Record<string, unknown>): ApiResponse<T>;
