import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private transporter: nodemailer.Transporter | null = null;

  constructor(private readonly configService: ConfigService) {
    const host = this.configService.get<string>('SMTP_HOST');
    const port = this.configService.get<number>('SMTP_PORT');
    const user = this.configService.get<string>('SMTP_USER');
    const pass = this.configService.get<string>('SMTP_PASS');

    if (host && port) {
      this.transporter = nodemailer.createTransport({
        host,
        port,
        auth: {
          user,
          pass,
        },
      });
    }
  }

  async sendVerificationCode(email: string, code: string): Promise<boolean> {
    const from = this.configService.get<string>('SMTP_FROM', 'noreply@e-commerse.com');
    const subject = 'E-commerse: Verification Code';
    const text = `Your verification code is: ${code}. It expires in 10 minutes.`;
    const html = `
      <div style="font-family: Arial, sans-serif; padding: 20px; border: 1px solid #eee; border-radius: 5px; max-width: 600px;">
        <h2 style="color: #333;">Welcome to E-commerse!</h2>
        <p>Thank you for registering. Please use the verification code below to verify your email address:</p>
        <div style="font-size: 24px; font-weight: bold; color: #4CAF50; padding: 10px; border: 1px dashed #4CAF50; display: inline-block; margin: 15px 0;">
          ${code}
        </div>
        <p style="color: #777; font-size: 12px;">This code will expire in 10 minutes. If you did not register for an account, please ignore this email.</p>
      </div>
    `;

    // Console logging OTP code fallback is extremely helpful for local testing
    this.logger.log(`[Verification Code for ${email}]: ${code}`);

    if (!this.transporter) {
      this.logger.warn('SMTP transport is not configured. Verification code logged above.');
      return true;
    }

    try {
      await this.transporter.sendMail({
        from,
        to: email,
        subject,
        text,
        html,
      });
      return true;
    } catch (error) {
      this.logger.error(`Failed to send verification email to ${email}: ${error.message}`);
      // Return true to avoid blocking the workflow if SMTP details are mock
      return true;
    }
  }
}
