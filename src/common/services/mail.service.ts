import {
  Injectable,
  InternalServerErrorException,
  Logger,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';

@Injectable()
export class MailService implements OnModuleInit {
  private readonly logger = new Logger(MailService.name);
  private readonly user: string;
  private readonly transport: nodemailer.Transporter;

  constructor(private readonly configService: ConfigService) {
    this.user = (this.configService.get<string>('MAIL_USER') || '').trim();
    // Google shows app passwords as "grtf zyfb vtxr kcdw" - the spaces are display
    // only, so they are stripped to avoid an EAUTH (535) rejection.
    const pass = (this.configService.get<string>('MAIL_PASS') || '').replace(
      /\s+/g,
      '',
    );

    this.transport = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: this.user,
        pass,
      },
    });

    if (!this.user || !pass) {
      this.logger.warn(
        'MAIL_USER / MAIL_PASS are empty. Put your Gmail address and its 16-character app password in .env',
      );
    }
  }

  async onModuleInit(): Promise<void> {
    try {
      await this.transport.verify();
      this.logger.log(`Gmail is ready: ${this.user}`);
    } catch (error) {
      // Only a warning: the app must still boot when mail is misconfigured.
      this.logger.error(
        `Gmail connection failed: ${this.describeError(error)}`,
      );
    }
  }

  async sendSmsToMail(
    email: string,
    subject: string,
    text: string,
    html?: string,
  ) {
    try {
      await this.transport.sendMail({
        // Gmail only accepts the authenticated account (or a verified alias) as sender.
        from: `"E-commerse" <${this.user}>`,
        to: email,
        subject,
        text,
        html,
      });
      this.logger.log(`Mail sent to ${email}`);
      return { message: `successfully, sent sms to ${email}` };
    } catch (error) {
      this.logger.error(
        `Failed to send mail to ${email}: ${this.describeError(error)}`,
      );
      throw new InternalServerErrorException(
        this.toMailError(error).message || 'MailService internal server error',
      );
    }
  }

  async sendVerificationCode(email: string, code: string, ttlMinutes = 10) {
    return this.sendSmsToMail(
      email,
      'Verification code',
      `Your verification code is: ${code}. It expires in ${ttlMinutes} minutes.`,
      `<div style="font-family: Arial, sans-serif; padding: 20px; border: 1px solid #eee; border-radius: 5px; max-width: 600px;">
        <h2 style="color: #333;">Welcome to E-commerse!</h2>
        <p>Please use the verification code below to verify your email address:</p>
        <div style="font-size: 30px; font-weight: bold; color: #4CAF50; padding: 10px; border: 1px dashed #4CAF50; display: inline-block; margin: 15px 0; letter-spacing: 6px;">
          ${code}
        </div>
        <p style="color: #777; font-size: 12px;">This code expires in ${ttlMinutes} minutes. If you did not register, please ignore this email.</p>
      </div>`,
    );
  }

  /** nodemailer rejects with plain Error objects carrying an SMTP `code`. */
  private toMailError(error: unknown): { code?: string; message: string } {
    const err = error as { code?: unknown; message?: unknown } | null;
    return {
      code: typeof err?.code === 'string' ? err.code : undefined,
      message: typeof err?.message === 'string' ? err.message : String(error),
    };
  }

  private describeError(error: unknown): string {
    const { code, message } = this.toMailError(error);
    const base = `${code ? `[${code}] ` : ''}${message}`;

    if (code === 'EAUTH') {
      return `${base} - Gmail rejected the credentials. Turn on 2-Step Verification and use a 16-character app password (https://myaccount.google.com/apppasswords) as MAIL_PASS, not the account password.`;
    }
    return base;
  }
}
