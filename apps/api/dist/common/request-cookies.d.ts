type CookieRequest = {
    cookies?: Record<string, string | undefined>;
    headers: {
        cookie?: string | undefined;
    };
};
export declare function getRequestCookies(request: CookieRequest): Record<string, string>;
export declare function getRequestAccessToken(request: {
    headers: {
        authorization?: string | string[] | undefined;
    };
}): string | undefined;
export {};
