import {
  IsOptional,
  IsString,
  registerDecorator,
  ValidationOptions,
} from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { SUPPORTED_LANGUAGES } from '../i18n/locale';

/**
 * Ko'p tilli matn maydoni. Bazada `<field>_uz`, `<field>_ru`, `<field>_en`
 * ustunlariga yoyiladi (`spreadLocalized`).
 *
 * `PATCH` da yuborilmagan til o'zgarishsiz qoladi - shuning uchun barcha
 * tillar ixtiyoriy.
 */
export class LocalizedTextDto {
  @ApiPropertyOptional({ example: 'Avtomatik suv nasosi 1WZB-250' })
  @IsString()
  @IsOptional()
  uz?: string;

  @ApiPropertyOptional({ example: 'Автоматический водяной насос 1WZB-250' })
  @IsString()
  @IsOptional()
  ru?: string;

  @ApiPropertyOptional({ example: 'Automatic water pump 1WZB-250' })
  @IsString()
  @IsOptional()
  en?: string;
}

/**
 * Majburiy ko'p tilli maydon uchun: kamida bitta tilda matn bo'lishi shart.
 *
 * Uchala tilni ham talab qilmaymiz - admin bitta tilda kiritsa, qolganlari
 * `spreadLocalizedRequired` orqali mavjud tildan to'ldiriladi.
 */
export function HasAtLeastOneLanguage(options?: ValidationOptions) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      name: 'hasAtLeastOneLanguage',
      target: object.constructor,
      propertyName,
      options,
      validator: {
        validate(value: unknown) {
          if (!value || typeof value !== 'object') return false;
          const record = value as Record<string, unknown>;
          return SUPPORTED_LANGUAGES.some(
            (lang) =>
              typeof record[lang] === 'string' && record[lang].trim() !== '',
          );
        },
        defaultMessage() {
          return `${propertyName} kamida bitta tilda to'ldirilishi kerak (uz, ru yoki en)`;
        },
      },
    });
  };
}
