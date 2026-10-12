import {
  Injectable,
  BadRequestException,
  ConflictException,
  UnauthorizedException,
  NotFoundException,
  HttpException,
  HttpStatus,
  OnModuleDestroy,
} from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { Role, User } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { RegisterDto } from './dto/register.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { JwtPayload } from './strategies/jwt.strategy';
import {
  cleanFullName,
  fullNameKey,
  normalizePhone,
} from '../../common/utils/phone.util';
import { Lang } from '../../common/i18n/locale';

interface FailedLogins {
  count: number;
  resetAt: number;
}

interface LoginBody {
  phone?: unknown;
  full_name?: unknown;
  password?: unknown;
}

@Injectable()
export class AuthService implements OnModuleDestroy {
  // Telefon + ism maxfiy emas, shuning uchun bir raqamga ketma-ket urinishlar
  // cheklanadi: 15 daqiqada 5 ta xato.
  private readonly failedLogins = new Map<string, FailedLogins>();
  private readonly maxFailedLogins = 5;
  private readonly lockoutMs = 15 * 60 * 1000;
  private readonly cleanupTimer: NodeJS.Timeout;

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {
    this.cleanupTimer = setInterval(() => this.purgeExpired(), 5 * 60 * 1000);
    this.cleanupTimer.unref();
  }

  onModuleDestroy() {
    clearInterval(this.cleanupTimer);
  }

  /**
   * Ro'yxatdan o'tish: faqat ism + telefon. Tasdiqlash bosqichi yo'q - javobda
   * darhol tokenlar qaytadi, ya'ni foydalanuvchi qayta login qilmasdan saytga
   * kiradi.
   */
  async register(dto: RegisterDto, language: Lang) {
    const phone = this.requirePhone(dto.phone);
    const fullName = cleanFullName(dto.full_name);

    const existing = await this.prisma.user.findFirst({ where: { phone } });
    if (existing) {
      throw new ConflictException('Phone number already registered');
    }

    const user = await this.prisma.user.create({
      data: { phone, full_name: fullName, role: Role.USER, language },
    });

    return this.buildAuthResponse(user);
  }

  /**
   * `PhoneStrategy` chaqiradi. Oddiy foydalanuvchi: telefon + ism.
   * ADMIN: telefon + parol - aks holda admin telefoni va ismini bilgan har
   * kim panelga kirib olardi.
   *
   * Har qanday muvaffaqiyatsizlik bitta xabar bilan qaytadi: qaysi raqam
   * ro'yxatdan o'tgani yoki admin ekani oshkor bo'lmasin.
   */
  async validateLogin(body: LoginBody): Promise<User> {
    const phone = normalizePhone(body.phone);
    if (!phone) {
      throw new UnauthorizedException('Invalid credentials');
    }

    this.assertNotLockedOut(phone);

    const user = await this.prisma.user.findFirst({ where: { phone } });
    const ok = user ? await this.credentialsMatch(user, body) : false;

    if (!user || !ok) {
      this.recordFailure(phone);
      throw new UnauthorizedException('Invalid credentials');
    }

    this.failedLogins.delete(phone);
    return user;
  }

  login(user: User) {
    return this.buildAuthResponse(user);
  }

  logout() {
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

      return this.generateTokens(user);
    } catch {
      throw new UnauthorizedException('Invalid refresh token');
    }
  }

  /** Faqat ADMIN: oddiy foydalanuvchida parol yo'q. */
  async changePassword(userId: string, dto: ChangePasswordDto) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    const isOldPasswordValid =
      !!user.password &&
      (await bcrypt.compare(dto.old_password, user.password));
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

  private requirePhone(input: unknown): string {
    const phone = normalizePhone(input);
    if (!phone) {
      throw new BadRequestException('Invalid phone number');
    }
    return phone;
  }

  private async credentialsMatch(
    user: User,
    body: LoginBody,
  ): Promise<boolean> {
    if (user.role === Role.ADMIN) {
      if (!user.password || typeof body.password !== 'string') return false;
      return bcrypt.compare(body.password, user.password);
    }

    const given = fullNameKey(body.full_name);
    return given !== '' && given === fullNameKey(user.full_name);
  }

  private assertNotLockedOut(phone: string) {
    const record = this.failedLogins.get(phone);
    if (!record) return;

    if (Date.now() >= record.resetAt) {
      this.failedLogins.delete(phone);
      return;
    }

    if (record.count >= this.maxFailedLogins) {
      throw new HttpException(
        'Too many login attempts. Please try again later',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
  }

  private recordFailure(phone: string) {
    const now = Date.now();
    const record = this.failedLogins.get(phone);

    if (!record || now >= record.resetAt) {
      this.failedLogins.set(phone, { count: 1, resetAt: now + this.lockoutMs });
    } else {
      record.count += 1;
    }
  }

  private purgeExpired() {
    const now = Date.now();
    for (const [phone, record] of this.failedLogins) {
      if (record.resetAt <= now) {
        this.failedLogins.delete(phone);
      }
    }
  }

  private async buildAuthResponse(user: User) {
    const tokens = await this.generateTokens(user);

    return {
      user: {
        id: user.id,
        full_name: user.full_name,
        phone: user.phone,
        role: user.role,
        photo: user.photo,
        language: user.language,
        created_at: user.created_at,
        updated_at: user.updated_at,
      },
      ...tokens,
    };
  }

  private async generateTokens(user: User) {
    const payload: JwtPayload = {
      sub: user.id,
      phone: user.phone,
      role: user.role,
      language: user.language,
    };

    const [accessToken, refreshToken] = await Promise.all([
      this.jwtService.signAsync(payload, {
        secret: this.configService.get<string>('JWT_ACCESS_SECRET'),
        expiresIn: this.configService.get<any>('JWT_ACCESS_EXPIRATION', '15m'),
      }),
      this.jwtService.signAsync(
        { sub: user.id, language: user.language },
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
