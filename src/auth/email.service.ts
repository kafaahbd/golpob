import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';

@Injectable()
export class EmailService {
  private transporter: nodemailer.Transporter;
  private readonly logger = new Logger(EmailService.name);

  constructor(private config: ConfigService) {
    this.transporter = nodemailer.createTransport({
      host: config.get('SMTP_HOST'),
      port: config.get<number>('SMTP_PORT', 587),
      secure: false,
      auth: {
        user: config.get('SMTP_USER'),
        pass: config.get('SMTP_PASS'),
      },
    });
  }

  async sendOtp(email: string, code: string): Promise<void> {
    const from = this.config.get('EMAIL_FROM', 'Golpo <noreply@golpo.app>');

    try {
      await this.transporter.sendMail({
        from,
        to: email,
        subject: `${code} - Your Golpo Verification Code`,
        html: this.buildOtpEmail(code),
      });
      this.logger.log(`OTP sent to ${email}`);
    } catch (err) {
      this.logger.error(`Failed to send OTP to ${email}:`, err);
      throw err;
    }
  }

  private buildOtpEmail(code: string): string {
    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <style>
          body { font-family: 'Segoe UI', Arial, sans-serif; background: #0a0a0a; color: #fff; margin: 0; padding: 0; }
          .container { max-width: 480px; margin: 40px auto; background: #111; border-radius: 16px; overflow: hidden; }
          .header { background: linear-gradient(135deg, #059669, #10b981); padding: 32px; text-align: center; }
          .header h1 { margin: 0; font-size: 28px; font-weight: 800; letter-spacing: -1px; }
          .header p { margin: 4px 0 0; opacity: 0.8; font-size: 14px; }
          .body { padding: 36px 32px; text-align: center; }
          .otp-code { font-size: 48px; font-weight: 900; letter-spacing: 12px; color: #10b981; margin: 24px 0; font-family: monospace; }
          .note { font-size: 13px; color: #666; margin-top: 16px; line-height: 1.6; }
          .footer { padding: 20px 32px; border-top: 1px solid #1f1f1f; text-align: center; font-size: 12px; color: #444; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>Golpo</h1>
            <p>by Kafaah</p>
          </div>
          <div class="body">
            <p style="font-size:16px; color:#ccc;">Your verification code is:</p>
            <div class="otp-code">${code}</div>
            <p class="note">
              This code expires in <strong style="color:#10b981">5 minutes</strong>.<br>
              Do not share this code with anyone.
            </p>
          </div>
          <div class="footer">
            &copy; ${new Date().getFullYear()} Kafaah. All rights reserved.
          </div>
        </div>
      </body>
      </html>
    `;
  }
}
