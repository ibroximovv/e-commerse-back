import { Transform, TransformFnParams } from 'class-transformer';

/**
 * Query string'dagi boolean qiymatlarni to'g'ri o'giradi.
 * `@Type(() => Boolean)` bilan `?all=false` -> `true` bo'lib ketadi (Boolean('false') === true),
 * shuning uchun DTO'larda faqat shu dekorator ishlatilsin.
 */
export const ToBoolean = () =>
  Transform(({ value }: TransformFnParams): unknown => {
    if (value === undefined || value === null || value === '') return undefined;
    if (typeof value === 'boolean') return value;

    const normalized = String(value).trim().toLowerCase();
    if (['true', '1', 'yes', 'on'].includes(normalized)) return true;
    if (['false', '0', 'no', 'off'].includes(normalized)) return false;

    return value;
  });

/**
 * `?tags=a&tags=b` va `?tags=a,b` ko'rinishlarining ikkalasini ham massivga o'giradi.
 */
export const ToStringArray = () =>
  Transform(({ value }: TransformFnParams): string[] | undefined => {
    if (value === undefined || value === null || value === '') return undefined;

    const raw: unknown[] = Array.isArray(value)
      ? (value as unknown[])
      : String(value).split(',');

    const cleaned = raw
      .map((item) => String(item).trim())
      .filter((item) => item.length > 0);

    return cleaned.length ? cleaned : undefined;
  });

/**
 * Query'dan kelgan sonni `number` ga o'giradi.
 * Son bo'lmasa asl qiymat qaytariladi - validator aniq xato xabarini bersin.
 */
export const ToNumber = () =>
  Transform(({ value }: TransformFnParams): unknown => {
    if (value === undefined || value === null || value === '') return undefined;

    const parsed = Number(value);
    return Number.isNaN(parsed) ? value : parsed;
  });
