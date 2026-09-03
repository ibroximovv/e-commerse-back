/**
 * Payme har bir xato xabarini uchala tilda kutadi - shuning uchun bu yerdagi
 * matnlar `ResponseInterceptor` tarjimasidan o'tmaydi (JSON-RPC javobi
 * standart o'ramga solinmaydi).
 */
export interface PaymeLocalizedMessage {
  ru: string;
  uz: string;
  en: string;
}

/** Payme `account` obyekti. Maydon nomi merchant kabinetida sozlanadi. */
export type PaymeAccount = Record<string, string | undefined>;

export interface PaymeRequest {
  /** Payme har so'rovda `"2.0"` yuboradi; javobda ham qaytarilishi shart. */
  jsonrpc?: string;
  id?: number | string | null;
  /**
   * Tekshirilmagan qiymat: Payme har qanday matn yuborishi mumkin, shuning
   * uchun `PaymeMethod` emas - `PaymeService.handle` uni o'zi tekshiradi va
   * notanish metod uchun -32601 qaytaradi.
   */
  method?: string;
  params?: {
    id?: string;
    time?: number;
    amount?: number;
    reason?: number;
    account?: PaymeAccount;
    from?: number;
    to?: number;
  };
}

/** JSON-RPC 2.0 talab qiladigan versiya belgisi - javobda qaytarilishi shart. */
export const JSONRPC_VERSION = '2.0';

export interface PaymeSuccessResponse {
  jsonrpc: typeof JSONRPC_VERSION;
  id: number | string | null;
  result: unknown;
}

export interface PaymeErrorResponse {
  jsonrpc: typeof JSONRPC_VERSION;
  id: number | string | null;
  error: {
    code: number;
    message: PaymeLocalizedMessage;
    data?: string;
  };
}

export type PaymeResponse = PaymeSuccessResponse | PaymeErrorResponse;

export interface PaymeTransactionView {
  id: string;
  time: number;
  amount: number;
  account: PaymeAccount;
  create_time: number;
  perform_time: number;
  cancel_time: number;
  transaction: string;
  state: number;
  reason: number | null;
}
