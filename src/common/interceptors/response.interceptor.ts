import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { translate } from '../i18n/translations';
import { Lang, localizeObject } from '../i18n/locale';
import {
  LanguageAwareRequest,
  resolveRequestLanguage,
} from '../i18n/request-language';
import { RAW_RESPONSE_KEY } from '../decorators/raw-response.decorator';

export interface ApiResponse<T> {
  success: boolean;
  data: T;
  message?: string;
  meta?: any;
  /** Javob qaysi tilda qaytganini frontend keshlashda ishlatadi. */
  language: Lang;
}

/**
 * Barcha javoblarni yagona formatga soladi va ko'p tilli maydonlarni tekislaydi.
 *
 * Ikki xil tarjima bir-biriga aralashmaydi:
 *  - katalog matnlari (`name`, `description`, atributlar) bazadagi til
 *    ustunlaridan olinadi - `localizeObject`;
 *  - tizim xabarlari va xatolar statik lug'atdan olinadi - `translate`.
 */
@Injectable()
export class ResponseInterceptor<T> implements NestInterceptor<
  T,
  ApiResponse<T>
> {
  intercept(
    context: ExecutionContext,
    next: CallHandler,
  ): Observable<ApiResponse<T>> {
    // Tashqi protokol o'z javob formatini talab qiladigan endpointlar
    // (masalan Payme JSON-RPC) o'ramdan butunlay chetda qoladi
    const isRaw =
      Reflect.getMetadata(RAW_RESPONSE_KEY, context.getHandler()) === true;
    if (isRaw) {
      return next.handle() as Observable<ApiResponse<T>>;
    }

    const request = context.switchToHttp().getRequest<LanguageAwareRequest>();
    const lang = resolveRequestLanguage(request);

    // Admin panelidagi tahrirlash formasi uchun barcha tillar kerak bo'ladi
    const raw = isTruthyFlag(request.query?.raw);

    return next.handle().pipe(
      map((res) => {
        const shaped = shapeResponse(res);

        return {
          success: true,
          data: (raw ? shaped.data : localizeObject(shaped.data, lang)) as T,
          message: shaped.message ? translate(shaped.message, lang) : undefined,
          meta: shaped.meta,
          language: lang,
        };
      }),
    );
  }
}

interface ShapedResponse {
  data: unknown;
  meta?: unknown;
  message?: string;
}

/**
 * Servislar javobni uch xil ko'rinishda qaytaradi: tayyor `{success, data}`,
 * sahifalangan `{data, meta}` yoki oddiy qiymat. Hammasini bitta shaklga solamiz.
 */
function shapeResponse(res: unknown): ShapedResponse {
  if (!res || typeof res !== 'object') return { data: res };

  const record = res as Record<string, unknown>;

  if ('success' in record && 'data' in record) {
    return {
      data: record.data,
      meta: record.meta,
      message: asMessage(record.message),
    };
  }

  const isPaginated =
    'data' in record &&
    ('meta' in record || 'total' in record || 'page' in record);

  if (isPaginated) {
    return {
      data: record.data,
      meta: record.meta ?? {
        total: record.total,
        page: record.page,
        limit: record.limit,
        totalPages: record.totalPages,
      },
      message: asMessage(record.message),
    };
  }

  return { data: res };
}

function asMessage(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

function isTruthyFlag(value: unknown): boolean {
  return (
    typeof value === 'string' &&
    ['true', '1', 'yes', 'on'].includes(value.toLowerCase())
  );
}
