import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy } from 'passport-custom';
import { Request } from 'express';
import { User } from '@prisma/client';
import { AuthService } from '../auth.service';

/**
 * `POST /api/auth/login` uchun Passport strategiyasi: telefon + ism
 * (ADMIN uchun telefon + parol). Muvaffaqiyatli bo'lsa foydalanuvchi
 * `request.user` ga yoziladi, token esa kontrollerda chiqariladi.
 */
@Injectable()
export class PhoneStrategy extends PassportStrategy(Strategy, 'phone') {
  constructor(private readonly authService: AuthService) {
    super();
  }

  validate(request: Request): Promise<User> {
    return this.authService.validateLogin(request.body ?? {});
  }
}
