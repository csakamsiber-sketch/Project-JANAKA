"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.MailService = void 0;
const common_1 = require("@nestjs/common");
const nodemailer_1 = __importDefault(require("nodemailer"));
function escapeHtml(value) {
    return value.replace(/[&<>"']/g, (character) => ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;',
    })[character] ?? character);
}
function emailTemplate(title, eyebrow, content) {
    return `<!doctype html>
<html lang="en">
  <body style="margin:0;background:#080b12;color:#dbe7f5;font-family:Arial,Helvetica,sans-serif;">
    <div style="padding:32px 16px;background:linear-gradient(135deg,#080b12 0%,#101827 100%);">
      <div style="max-width:560px;margin:0 auto;border:1px solid #24354a;background:#0d1420;box-shadow:0 0 30px rgba(44,226,218,.12);">
        <div style="padding:22px 28px;border-bottom:1px solid #24354a;background:#101b2b;">
          <div style="font-size:11px;letter-spacing:3px;color:#51e6dc;font-weight:700;">JAMUS // KALIMASADA</div>
          <div style="margin-top:8px;font-size:11px;letter-spacing:2px;color:#71849c;text-transform:uppercase;">${escapeHtml(eyebrow)}</div>
        </div>
        <div style="padding:32px 28px;">
          <h1 style="margin:0 0 18px;color:#f3f7fb;font-size:25px;line-height:1.2;font-weight:700;">${escapeHtml(title)}</h1>
          ${content}
        </div>
        <div style="padding:18px 28px;border-top:1px solid #24354a;color:#71849c;font-size:12px;line-height:1.6;">
          Automated security notification. Never share verification codes or temporary credentials.
        </div>
      </div>
    </div>
  </body>
</html>`;
}
function codeBlock(code) {
    return `<div style="margin:24px 0;padding:18px;border:1px solid #2ce2d9;background:#0a2028;color:#7ef7ed;text-align:center;font-size:30px;letter-spacing:8px;font-weight:700;">${escapeHtml(code)}</div>`;
}
let MailService = class MailService {
    transporter;
    constructor() {
        const host = process.env.SMTP_HOST ?? 'smtp.gmail.com';
        const port = Number(process.env.SMTP_PORT ?? 465);
        const user = process.env.SMTP_USER ?? 'csakamsiber@gmail.com';
        const password = process.env.SMTP_PASSWORD;
        this.transporter = host && password
            ? nodemailer_1.default.createTransport({
                host,
                port,
                secure: process.env.SMTP_SECURE !== 'false',
                auth: { user, pass: password },
                requireTLS: port === 587,
            })
            : null;
    }
    async sendLoginOtp(to, code) {
        if (!this.transporter) {
            if (process.env.NODE_ENV !== 'production') {
                console.info(`[DEV OTP] login code for ${to}: ${code}`);
                return;
            }
            throw new common_1.ServiceUnavailableException('SMTP is not configured. Set SMTP_HOST and SMTP_PASSWORD before using OTP login.');
        }
        try {
            await this.transporter.sendMail({
                from: process.env.SMTP_FROM ?? 'csakamsiber@gmail.com',
                to,
                subject: 'JAMUS KALIMASADA login verification code',
                text: `Your JAMUS KALIMASADA verification code is ${code}. It expires in 10 minutes.`,
                html: emailTemplate('Verify your sign-in', 'Access checkpoint', `<p style="margin:0;color:#b8c7d9;font-size:15px;line-height:1.7;">Use the verification code below to continue your secure sign-in.</p>${codeBlock(code)}<p style="margin:0;color:#71849c;font-size:13px;line-height:1.6;">This code expires in 10 minutes. If you did not request it, you can safely ignore this message.</p>`),
            });
        }
        catch {
            throw new common_1.ServiceUnavailableException('The login verification email could not be sent.');
        }
    }
    async sendRegistrationApproval(to, temporaryPassword) {
        if (!this.transporter) {
            if (process.env.NODE_ENV !== 'production') {
                console.info(`[DEV REGISTRATION] temporary password for ${to}: ${temporaryPassword}`);
                return;
            }
            throw new common_1.ServiceUnavailableException('SMTP is not configured. Set SMTP_HOST and SMTP_PASSWORD before approving registrations.');
        }
        try {
            await this.transporter.sendMail({
                from: process.env.SMTP_FROM ?? 'csakamsiber@gmail.com',
                to,
                subject: 'JAMUS KALIMASADA registration approved',
                text: `Your registration has been approved. Temporary password: ${temporaryPassword}. Please sign in and change it as soon as possible.`,
                html: emailTemplate('Access approved', 'Identity provisioning', `<p style="margin:0;color:#b8c7d9;font-size:15px;line-height:1.7;">Your registration has been approved. Use this temporary password for your first sign-in:</p><div style="margin:24px 0;padding:16px;border:1px solid #a78bfa;background:#1b1830;color:#d8caff;font-family:monospace;font-size:18px;word-break:break-all;">${escapeHtml(temporaryPassword)}</div><p style="margin:0;color:#f6c177;font-size:13px;line-height:1.6;">Change this password immediately after signing in.</p>`),
            });
        }
        catch {
            throw new common_1.ServiceUnavailableException('The registration approval email could not be sent.');
        }
    }
    async sendAdminActionOtp(to, code, action) {
        if (!this.transporter) {
            if (process.env.NODE_ENV !== 'production') {
                console.info(`[DEV ADMIN ACTION] ${action} code for ${to}: ${code}`);
                return;
            }
            throw new common_1.ServiceUnavailableException('SMTP is not configured for administrator action verification.');
        }
        try {
            await this.transporter.sendMail({
                from: process.env.SMTP_FROM ?? 'csakamsiber@gmail.com',
                to,
                subject: 'JAMUS KALIMASADA administrator action verification',
                text: `Use verification code ${code} to confirm the ${action.toLowerCase()} action. This code expires in 10 minutes.`,
                html: emailTemplate('Confirm administrator action', 'Privileged operation', `<p style="margin:0;color:#b8c7d9;font-size:15px;line-height:1.7;">Enter this code to authorize the <strong style="color:#f3f7fb;">${escapeHtml(action.toLowerCase())}</strong> operation.</p>${codeBlock(code)}<p style="margin:0;color:#71849c;font-size:13px;line-height:1.6;">This code expires in 10 minutes. If this was not you, contact your security administrator.</p>`),
            });
        }
        catch {
            throw new common_1.ServiceUnavailableException('The administrator action verification email could not be sent.');
        }
    }
    async sendPasswordChangedNotification(to) {
        if (!this.transporter) {
            if (process.env.NODE_ENV !== 'production') {
                console.info(`[DEV PASSWORD CHANGE] password change notification sent for ${to}`);
                return;
            }
            throw new common_1.ServiceUnavailableException('SMTP is not configured for password change notifications.');
        }
        try {
            await this.transporter.sendMail({
                from: process.env.SMTP_FROM ?? 'csakamsiber@gmail.com',
                to,
                subject: 'JAMUS KALIMASADA password changed',
                text: 'Your JAMUS KALIMASADA account password was changed successfully. All active sessions have been terminated for security reasons.',
                html: emailTemplate('Password changed', 'Security update', `<p style="margin:0;color:#b8c7d9;font-size:15px;line-height:1.7;">Your JAMUS KALIMASADA account password was changed successfully.</p><p style="margin:18px 0 0;color:#f6c177;font-size:14px;line-height:1.7;">All active sessions were terminated for your protection, and you will need to sign in again.</p>`),
            });
        }
        catch {
            throw new common_1.ServiceUnavailableException('The password change notification email could not be sent.');
        }
    }
};
exports.MailService = MailService;
exports.MailService = MailService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [])
], MailService);
//# sourceMappingURL=mail.service.js.map