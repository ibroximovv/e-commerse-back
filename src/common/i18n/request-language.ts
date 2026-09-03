import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { Lang, normalizeLanguage } from './locale';

export interface LanguageAwareRequest {
  query?: Record<string, unknown>;
  headers?: Record<string, unknown>;
  user?: { language?: unknown };
}

/**
 * Til aniqlash zanjiri: `?ln` -> JWT dagi `user.language` -> `uz`.
 *
 * Ochiq (public) route'larda `JwtAuthGuard` ishlamaydi, shuning uchun
 * `Authorization` sarlavhasi bo'lsa token payload'i imzosiz o'qiladi. Bu faqat
 * tilni tanlash uchun - hech qanday ruxsat qarori bunga tayanmaydi.
 */
export function resolveRequestLanguage(request: LanguageAwareRequest): Lang {
  const queryLang = request.query?.ln;
  if (typeof queryLang === 'string' && queryLang.trim() !== '') {
    return normalizeLanguage(queryLang);
  }

  const user = request.user ?? readUnverifiedTokenPayload(request);
  return normalizeLanguage(user?.language);
}

function readUnverifiedTokenPayload(
  request: LanguageAwareRequest,
): { language?: unknown } | undefined {
  const header = request.headers?.authorization;
  if (typeof header !== 'string') return undefined;

  try {
    const token = header.split(' ')[1];
    const payloadSegment = token?.split('.')[1];
    if (!payloadSegment) return undefined;

    const json = Buffer.from(payloadSegment, 'base64').toString('utf-8');
    return JSON.parse(json) as { language?: unknown };
  } catch {
    // Buzuq token - shunchaki standart tilga tushamiz
    return undefined;
  }
}

/**
 * Kontrollerlarga tilni uzatadi: `findAll(@CurrentLang() lang: Lang)`.
 *
 * Javobni tekislashni `ResponseInterceptor` bajaradi; bu dekorator esa til
 * so'rovning o'zida kerak bo'lgan joylar uchun - nom bo'yicha saralash,
 * qidiruv va faset yorliqlari.
 */
export const CurrentLang = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): Lang =>
    resolveRequestLanguage(ctx.switchToHttp().getRequest()),
);
