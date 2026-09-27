export type NetworkTarget = {
    url: string;
    allowedHosts?: string[];
    disallowPrivateRanges?: boolean;
};
export declare class SsrfValidator {
    static isBlockedHost(hostname: string, allowedHosts?: string[]): boolean;
    static validateUrl(target: NetworkTarget): {
        valid: boolean;
        reason?: string;
    };
}
