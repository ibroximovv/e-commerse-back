import {
  Injectable,
  BadRequestException,
  UnauthorizedException,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { MailService } from '../../common/services/mail.service';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { VerifyOtpDto } from './dto/verify-otp.dto';
import { ResendOtpDto } from './dto/resend-otp.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';

@Injectable()
export class AuthService {
  // In-memory verification code caches
  private otpMap = new Map<string, { code: string; expiresAt: Date }>();
  private cooldownMap = new Map<string, Date>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly mailService: MailService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {}

  async register(dto: RegisterDto) {
    const existingUser = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });

    if (existingUser) {
      if (existingUser.is_verified) {
        throw new BadRequestException('Email already registered');
      }
      // If user registered but did not verify, let's update password and send new code
      const hashedPassword = await bcrypt.hash(dto.password, 10);
      await this.prisma.user.update({
        where: { email: dto.email },
        data: {
          password: hashedPassword,
          full_name: dto.full_name,
          phone: dto.phone,
        },
      });
    } else {
      const hashedPassword = await bcrypt.hash(dto.password, 10);
      await this.prisma.user.create({
        data: {
          email: dto.email,
          password: hashedPassword,
          full_name: dto.full_name,
          phone: dto.phone,
          is_verified: false,
        },
      });
    }

    await this.sendVerificationOtp(dto.email);
    return { message: 'Verification code sent to email' };
  }

  async verify(dto: VerifyOtpDto) {
    const record = this.otpMap.get(dto.email);
    if (!record) {
      throw new BadRequestException('Verification code is invalid or expired');
    }

    if (new Date() > record.expiresAt) {
      this.otpMap.delete(dto.email);
      throw new BadRequestException('Verification code expired');
    }

    if (record.code !== dto.code) {
      throw new BadRequestException('Invalid verification code');
    }

    await this.prisma.user.update({
      where: { email: dto.email },
      data: { is_verified: true },
    });

    this.otpMap.delete(dto.email);
    this.cooldownMap.delete(dto.email);

    return { message: 'Email verified successfully' };
  }

  async resendCode(dto: ResendOtpDto) {
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    if (user.is_verified) {
      throw new BadRequestException('Email already verified');
    }

    const lastSent = this.cooldownMap.get(dto.email);
    if (lastSent) {
      const elapsedSeconds = Math.floor((new Date().getTime() - lastSent.getTime()) / 1000);
      if (elapsedSeconds < 60) {
        throw new BadRequestException(`Please wait 1 minute before resending`);
      }
    }

    await this.sendVerificationOtp(dto.email);
    return { message: 'Verification code sent to email' };
  }

  async login(dto: LoginDto) {
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });

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

    return this.generateTokens(user.id, user.email, user.role, user.language);
  }

  async refresh(dto: RefreshTokenDto) {
    try {
      const payload = await this.jwtService.verifyAsync(dto.refresh_token, {
        secret: this.configService.get<string>('JWT_REFRESH_SECRET'),
      });

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

    const isOldPasswordValid = await bcrypt.compare(dto.old_password, user.password);
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

  private async sendVerificationOtp(email: string) {
    const code = Math.floor(100000 + Math.random() * 900000).toString();
    const expiresAt = new Date(new Date().getTime() + 10 * 60 * 1000); // 10 minutes

    this.otpMap.set(email, { code, expiresAt });
    this.cooldownMap.set(email, new Date());

    await this.mailService.sendVerificationCode(email, code);
  }

  private async generateTokens(userId: string, email: string, role: string, language: string) {
    const [accessToken, refreshToken] = await Promise.all([
      this.jwtService.signAsync(
        { sub: userId, email, role, language },
        {
          secret: this.configService.get<string>('JWT_ACCESS_SECRET'),
          expiresIn: this.configService.get<any>('JWT_ACCESS_EXPIRATION', '15m'),
        },
      ),
      this.jwtService.signAsync(
        { sub: userId, language },
        {
          secret: this.configService.get<string>('JWT_REFRESH_SECRET'),
          expiresIn: this.configService.get<any>('JWT_REFRESH_EXPIRATION', '7d'),
        },
      ),
    ]);

    return {
      access_token: accessToken,
      refresh_token: refreshToken,
    };
  }
}
