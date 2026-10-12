import { Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

/**
 * Ochiq (public) endpointlar uchun. Token bo'lsa - `request.user` to'ldiriladi,
 * bo'lmasa yoki yaroqsiz bo'lsa - so'rov baribir o'tkaziladi.
 * Shu orqali bitta endpoint admin va oddiy foydalanuvchiga turlicha javob bera oladi.
 */
@Injectable()
export class OptionalJwtAuthGuard extends AuthGuard('jwt') {
  handleRequest<TUser>(_err: unknown, user: TUser | false): TUser | undefined {
    // Yaroqsiz token - mehmon sifatida davom etadi
    return user || undefined;
  }
}
