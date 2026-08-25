import {
  Injectable,
  BadRequestException,
  UnauthorizedException,
  NotFoundException,
  OnModuleDestroy,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { MailService } from '../../common/services/mail.service';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';
import { randomInt } from 'crypto';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { VerifyOtpDto } from './dto/verify-otp.dto';
import { ResendOtpDto } from './dto/resend-otp.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';

interface OtpRecord {
  code: string;
  expiresAt: Date;
  attempts: number;
}

@Injectable()
export class AuthService implements OnModuleDestroy {
  private readonly logger = new Logger(AuthService.name);

  // In-memory verification code caches
  private otpMap = new Map<string, OtpRecord>();
  private cooldownMap = new Map<string, Date>();

  // In-memory password reset caches
  private resetOtpMap = new Map<string, OtpRecord>();
  private resetCooldownMap = new Map<string, Date>();

  private readonly otpTtlMinutes: number;
  private readonly resendCooldownSeconds: number;
  private readonly maxOtpAttempts = 5;
  private readonly cleanupTimer: NodeJS.Timeout;

  constructor(
    private readonly prisma: PrismaService,
    private readonly mailService: MailService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {
    this.otpTtlMinutes =
      Number(this.configService.get<string>('OTP_TTL_MINUTES') ?? 10) || 10;
    this.resendCooldownSeconds =
      Number(
        this.configService.get<string>('OTP_RESEND_COOLDOWN_SECONDS') ?? 60,
      ) || 60;

    // Without this the maps grow forever for every address that never verifies.
    this.cleanupTimer = setInterval(() => this.purgeExpired(), 5 * 60 * 1000);
    this.cleanupTimer.unref();
  }

  onModuleDestroy() {
    clearInterval(this.cleanupTimer);
  }

  async register(dto: RegisterDto) {
    const email = this.normalizeEmail(dto.email);

    const existingUser = await this.prisma.user.findUnique({
      where: { email },
    });

    if (existingUser?.is_verified) {
      throw new BadRequestException('Email already registered');
    }

    // Checked before touching the database so the register endpoint cannot be used
    // to bypass the resend cooldown and flood an address with mail.
    this.assertNotOnCooldown(email);

    const hashedPassword = await bcrypt.hash(dto.password, 10);

    if (existingUser) {
      // Registered but never verified: refresh the credentials and send a new code
      await this.prisma.user.update({
        where: { email },
        data: {
          password: hashedPassword,
          full_name: dto.full_name,
          phone: dto.phone,
        },
      });
    } else {
      await this.prisma.user.create({
        data: {
          email,
          password: hashedPassword,
          full_name: dto.full_name,
          phone: dto.phone,
          is_verified: false,
        },
      });
    }

    await this.sendVerificationOtp(email);
    return { message: 'Verification code sent to email' };
  }

  async verify(dto: VerifyOtpDto) {
    const email = this.normalizeEmail(dto.email);
    const record = this.otpMap.get(email);

    if (!record) {
      throw new BadRequestException('Verification code is invalid or expired');
    }

    if (new Date() > record.expiresAt) {
      this.otpMap.delete(email);
      throw new BadRequestException('Verification code expired');
    }

    if (record.code !== dto.code) {
      record.attempts += 1;
      // A 6-digit code is brute-forceable without a cap on guesses.
      if (record.attempts >= this.maxOtpAttempts) {
        this.otpMap.delete(email);
        throw new BadRequestException(
          'Too many invalid attempts. Please request a new code',
        );
      }
      throw new BadRequestException('Invalid verification code');
    }

    const user = await this.prisma.user.findUnique({ where: { email } });
    if (!user) {
      this.otpMap.delete(email);
      this.cooldownMap.delete(email);
      throw new NotFoundException('User not found');
    }

    if (!user.is_verified) {
      await this.prisma.user.update({
        where: { email },
        data: { is_verified: true },
      });
    }

    this.otpMap.delete(email);
    this.cooldownMap.delete(email);

    return { message: 'Email verified successfully' };
  }

  async resendCode(dto: ResendOtpDto) {
    const email = this.normalizeEmail(dto.email);

    const user = await this.prisma.user.findUnique({ where: { email } });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    if (user.is_verified) {
      throw new BadRequestException('Email already verified');
    }

    this.assertNotOnCooldown(email);

    await this.sendVerificationOtp(email);
    return { message: 'Verification code sent to email' };
  }

  async login(dto: LoginDto) {
    const email = this.normalizeEmail(dto.email);

    const user = await this.prisma.user.findUnique({ where: { email } });

    if (!user) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const isPasswordValid = await bcrypt.compare(dto.password, user.password);
    if (!isPasswordValid) {
      throw new UnauthorizedException('Invalid credentials');
    }

    if (!user.is_verified) {
      throw new UnauthorizedException('Account not verified');
    }

    const tokens = await this.generateTokens(
      user.id,
      user.email,
      user.role,
      user.language,
    );

    return {
      user: {
        id: user.id,
        email: user.email,
        full_name: user.full_name,
        role: user.role,
        phone: user.phone,
        photo: user.photo,
        language: user.language,
        is_verified: user.is_verified,
        created_at: user.created_at,
        updated_at: user.updated_at,
      },
      ...tokens,
    };
  }

  async forgotPassword(dto: ForgotPasswordDto) {
    const email = this.normalizeEmail(dto.email);

    const user = await this.prisma.user.findUnique({ where: { email } });
    if (!user) {
      throw new NotFoundException('User not found');
    }

    if (!user.is_verified) {
      throw new BadRequestException('Account not verified');
    }

    this.assertNotOnResetCooldown(email);
    await this.sendPasswordResetOtp(email);

    return { message: 'Password reset code sent to email' };
  }

  async resetPassword(dto: ResetPasswordDto) {
    const email = this.normalizeEmail(dto.email);
    const record = this.resetOtpMap.get(email);

    if (!record) {
      throw new BadRequestException('Verification code is invalid or expired');
    }

    if (new Date() > record.expiresAt) {
      this.resetOtpMap.delete(email);
      throw new BadRequestException('Verification code expired');
    }

    if (record.code !== dto.code) {
      record.attempts += 1;
      if (record.attempts >= this.maxOtpAttempts) {
        this.resetOtpMap.delete(email);
        throw new BadRequestException(
          'Too many invalid attempts. Please request a new code',
        );
      }
      throw new BadRequestException('Invalid verification code');
    }

    const user = await this.prisma.user.findUnique({ where: { email } });
    if (!user) {
      this.resetOtpMap.delete(email);
      this.resetCooldownMap.delete(email);
      throw new NotFoundException('User not found');
    }

    const hashedNewPassword = await bcrypt.hash(dto.new_password, 10);
    await this.prisma.user.update({
      where: { email },
      data: { password: hashedNewPassword },
    });

    this.resetOtpMap.delete(email);
    this.resetCooldownMap.delete(email);

    return { message: 'Password reset successfully' };
  }

  async logout() {
    return { message: 'Logged out successfully' };
  }

  async refresh(dto: RefreshTokenDto) {
    try {
      const payload = await this.jwtService.verifyAsync<{ sub: string }>(
        dto.refresh_token,
        {
          secret: this.configService.get<string>('JWT_REFRESH_SECRET'),
        },
      );

      const user = await this.prisma.user.findUnique({
        where: { id: payload.sub },
      });

      if (!user) {
        throw new UnauthorizedException('User not found');
      }

      return this.generateTokens(user.id, user.email, user.role, user.language);
    } catch {
      throw new UnauthorizedException('Invalid refresh token');
    }
  }

  async changePassword(userId: string, dto: ChangePasswordDto) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    const isOldPasswordValid = await bcrypt.compare(
      dto.old_password,
      user.password,
    );
    if (!isOldPasswordValid) {
      throw new BadRequestException('Old password incorrect');
    }

    const hashedNewPassword = await bcrypt.hash(dto.new_password, 10);
    await this.prisma.user.update({
      where: { id: userId },
      data: { password: hashedNewPassword },
    });

    return { message: 'Password changed successfully' };
  }

  // --- Helper Methods ---

  private normalizeEmail(email: string): string {
    return email.trim().toLowerCase();
  }

  private assertNotOnCooldown(email: string) {
    const lastSent = this.cooldownMap.get(email);
    if (!lastSent) return;

    const elapsedSeconds = Math.floor((Date.now() - lastSent.getTime()) / 1000);
    if (elapsedSeconds < this.resendCooldownSeconds) {
      throw new BadRequestException('Please wait 1 minute before resending');
    }
  }

  private assertNotOnResetCooldown(email: string) {
    const lastSent = this.resetCooldownMap.get(email);
    if (!lastSent) return;

    const elapsedSeconds = Math.floor((Date.now() - lastSent.getTime()) / 1000);
    if (elapsedSeconds < this.resendCooldownSeconds) {
      throw new BadRequestException('Please wait 1 minute before resending');
    }
  }

  private async sendVerificationOtp(email: string) {
    // Math.random() is not a CSPRNG - a predictable OTP is a guessable OTP.
    const code = randomInt(0, 1_000_000).toString().padStart(6, '0');
    const expiresAt = new Date(Date.now() + this.otpTtlMinutes * 60 * 1000);

    this.otpMap.set(email, { code, expiresAt, attempts: 0 });
    this.cooldownMap.set(email, new Date());

    try {
      await this.mailService.sendVerificationCode(
        email,
        code,
        this.otpTtlMinutes,
      );
    } catch (error) {
      this.otpMap.delete(email);
      this.cooldownMap.delete(email);
      this.logger.error(`Could not deliver verification code to ${email}`);
      throw error;
    }
  }

  private async sendPasswordResetOtp(email: string) {
    const code = randomInt(0, 1_000_000).toString().padStart(6, '0');
    const expiresAt = new Date(Date.now() + this.otpTtlMinutes * 60 * 1000);

    this.resetOtpMap.set(email, { code, expiresAt, attempts: 0 });
    this.resetCooldownMap.set(email, new Date());

    try {
      await this.mailService.sendPasswordResetCode(
        email,
        code,
        this.otpTtlMinutes,
      );
    } catch (error) {
      this.resetOtpMap.delete(email);
      this.resetCooldownMap.delete(email);
      this.logger.error(`Could not deliver password reset code to ${email}`);
      throw error;
    }
  }

  private purgeExpired() {
    const now = Date.now();

    for (const [email, record] of this.otpMap) {
      if (record.expiresAt.getTime() <= now) {
        this.otpMap.delete(email);
      }
    }

    for (const [email, record] of this.resetOtpMap) {
      if (record.expiresAt.getTime() <= now) {
        this.resetOtpMap.delete(email);
      }
    }

    const cooldownMs = this.resendCooldownSeconds * 1000;
    for (const [email, sentAt] of this.cooldownMap) {
      if (now - sentAt.getTime() >= cooldownMs) {
        this.cooldownMap.delete(email);
      }
    }

    for (const [email, sentAt] of this.resetCooldownMap) {
      if (now - sentAt.getTime() >= cooldownMs) {
        this.resetCooldownMap.delete(email);
      }
    }
  }

  private async generateTokens(
    userId: string,
    email: string,
    role: string,
    language: string,
  ) {
    const [accessToken, refreshToken] = await Promise.all([
      this.jwtService.signAsync(
        { sub: userId, email, role, language },
        {
          secret: this.configService.get<string>('JWT_ACCESS_SECRET'),
          expiresIn: this.configService.get<any>(
            'JWT_ACCESS_EXPIRATION',
            '15m',
          ),
        },
      ),
      this.jwtService.signAsync(
        { sub: userId, language },
        {
          secret: this.configService.get<string>('JWT_REFRESH_SECRET'),
          expiresIn: this.configService.get<any>(
            'JWT_REFRESH_EXPIRATION',
            '7d',
          ),
        },
      ),
    ]);

    return {
      access_token: accessToken,
      refresh_token: refreshToken,
    };
  }
}
