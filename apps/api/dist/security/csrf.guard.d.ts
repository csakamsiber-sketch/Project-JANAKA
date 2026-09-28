import { AuthService } from '../auth/auth.service';
export declare class CSRFGuard {
    private readonly authService;
    constructor(authService: AuthService);
    use(req: any, res: any, next: any): Promise<any>;
    private firstHeaderValue;
    private createToken;
    private readCookie;
    private setCsrfCookie;
}
