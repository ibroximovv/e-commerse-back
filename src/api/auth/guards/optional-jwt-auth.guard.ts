import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { Request } from 'express';
import { Role } from '@prisma/client';

interface JwtPayload {
  sub: string;
  email?: string;
  role?: Role;
  language?: string;
}

/**
 * Ochiq (public) endpointlar uchun. Token bo'lsa - `request.user` to'ldiriladi,
 * bo'lmasa yoki yaroqsiz bo'lsa - so'rov baribir o'tkaziladi.
 * Shu orqali bitta endpoint admin va oddiy foydalanuvchiga turlicha javob bera oladi.
 */
@Injectable()
export class OptionalJwtAuthGuard implements CanActivate {
  constructor(
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();
    const [type, token] = request.headers.authorization?.split(' ') ?? [];

    if (type === 'Bearer' && token) {
      try {
        const payload = await this.jwtService.verifyAsync<JwtPayload>(token, {
          secret: this.configService.get<string>('JWT_ACCESS_SECRET'),
        });
        request['user'] = payload;
      } catch {
        // Yaroqsiz token - mehmon sifatida davom etadi
      }
    }

    return true;
  }
}
