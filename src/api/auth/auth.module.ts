import { Module, Global } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { RolesGuard } from './guards/roles.guard';
import { OptionalJwtAuthGuard } from './guards/optional-jwt-auth.guard';
import { PhoneAuthGuard } from './guards/phone-auth.guard';
import { JwtStrategy } from './strategies/jwt.strategy';
import { PhoneStrategy } from './strategies/phone.strategy';

@Global()
@Module({
  imports: [
    PassportModule.register({ session: false }),
    JwtModule.register({}),
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    JwtStrategy,
    PhoneStrategy,
    JwtAuthGuard,
    RolesGuard,
    OptionalJwtAuthGuard,
    PhoneAuthGuard,
  ],
  exports: [
    AuthService,
    JwtModule,
    JwtAuthGuard,
    RolesGuard,
    OptionalJwtAuthGuard,
  ],
})
export class AuthModule {}
