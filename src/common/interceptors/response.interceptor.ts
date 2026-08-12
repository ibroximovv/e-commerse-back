import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { translateObject } from '../i18n/translations';

export interface ApiResponse<T> {
  success: boolean;
  data: T;
  message?: string;
  meta?: any;
}

@Injectable()
export class ResponseInterceptor<T> implements NestInterceptor<
  T,
  ApiResponse<T>
> {
  intercept(
    context: ExecutionContext,
    next: CallHandler,
  ): Observable<ApiResponse<T>> {
    const httpContext = context.switchToHttp();
    const request = httpContext.getRequest();
    // Optionally extract user language from JWT if not already authenticated (e.g. public routes)
    if (!request.user && request.headers.authorization) {
      try {
        const token = request.headers.authorization.split(' ')[1];
        if (token) {
          const payloadBase64 = token.split('.')[1];
          const payloadJson = Buffer.from(payloadBase64, 'base64').toString(
            'utf-8',
          );
          request.user = JSON.parse(payloadJson);
        }
      } catch (e) {
        // Fail silently
      }
    }

    const ln = (request.query.ln || request.user?.language || 'uz').toString();

    return next.handle().pipe(
      map((res) => {
        // If response already has standard format
        if (
          res &&
          typeof res === 'object' &&
          'success' in res &&
          'data' in res
        ) {
          return {
            ...res,
            data: translateObject(res.data, ln),
            message: res.message ? translateObject(res.message, ln) : undefined,
          };
        }

        let data = res;
        let meta = undefined;
        let message = undefined;

        // Check if response has pagination metadata
        if (res && typeof res === 'object') {
          if (
            'data' in res &&
            ('meta' in res || 'total' in res || 'page' in res)
          ) {
            data = res.data;
            meta = res.meta || {
              total: res.total,
              page: res.page,
              limit: res.limit,
              totalPages: res.totalPages,
            };
            message = res.message;
          }
        }

        return {
          success: true,
          data: translateObject(data, ln),
          message: message,
          meta: meta,
        };
      }),
    );
  }
}
