export declare class MailService {
    private readonly transporter;
    constructor();
    sendLoginOtp(to: string, code: string): Promise<void>;
    sendRegistrationApproval(to: string, temporaryPassword: string): Promise<void>;
    sendAdminActionOtp(to: string, code: string, action: string): Promise<void>;
    sendPasswordChangedNotification(to: string): Promise<void>;
}
