import { SetMetadata } from '@nestjs/common';

export const RAW_RESPONSE_KEY = 'raw_response';

/**
 * `ResponseInterceptor` ni chetlab o'tadi - handler nimani qaytarsa, o'sha
 * o'zgarishsiz yuboriladi.
 *
 * Tashqi tizim javob formatini o'zi belgilaydigan endpointlar uchun: Payme
 * Merchant API JSON-RPC javobini kutadi, bizning `{success, data, message}`
 * o'ramimizni emas.
 */
export const RawResponse = () => SetMetadata(RAW_RESPONSE_KEY, true);
