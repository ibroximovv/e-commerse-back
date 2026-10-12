import { Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

/** `PhoneStrategy` ni ishga tushiradi. Xatoni strategiyaning o'zi tashlaydi. */
@Injectable()
export class PhoneAuthGuard extends AuthGuard('phone') {}
