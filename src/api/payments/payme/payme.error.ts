import { PaymeErrorCode } from './payme.constants';
import { PaymeLocalizedMessage } from './payme.types';

/**
 * Payme protokoli xatosi.
 *
 * HTTP darajasida hech qachon 4xx/5xx qaytarilmaydi - Payme har doim 200 va
 * javob tanasidagi `error` obyektini kutadi. Shuning uchun bu `HttpException`
 * emas: `PaymeController` uni ushlab, JSON-RPC formatiga o'raydi.
 */
export class PaymeError extends Error {
  constructor(
    readonly code: number,
    readonly localizedMessage: PaymeLocalizedMessage,
    readonly data?: string,
  ) {
    super(localizedMessage.en);
    this.name = 'PaymeError';
  }

  static insufficientPrivileges() {
    return new PaymeError(PaymeErrorCode.INSUFFICIENT_PRIVILEGES, {
      ru: 'Недостаточно привилегий для выполнения метода',
      uz: 'Metodni bajarish uchun huquqlar yetarli emas',
      en: 'Insufficient privileges to perform the method',
    });
  }

  static methodNotFound(method?: string) {
    return new PaymeError(
      PaymeErrorCode.METHOD_NOT_FOUND,
      {
        ru: 'Запрошенный метод не найден',
        uz: "So'ralgan metod topilmadi",
        en: 'Requested method was not found',
      },
      method,
    );
  }

  static invalidRequest(data?: string) {
    return new PaymeError(
      PaymeErrorCode.INVALID_REQUEST,
      {
        ru: 'Неверный формат запроса',
        uz: "So'rov formati noto'g'ri",
        en: 'Invalid request format',
      },
      data,
    );
  }

  static orderNotFound(field: string) {
    return new PaymeError(
      PaymeErrorCode.ORDER_NOT_FOUND,
      {
        ru: 'Заказ не найден или недоступен для оплаты',
        uz: "Buyurtma topilmadi yoki to'lov uchun mavjud emas",
        en: 'Order not found or not available for payment',
      },
      field,
    );
  }

  static orderInProgress(field: string) {
    return new PaymeError(
      PaymeErrorCode.ORDER_IN_PROGRESS,
      {
        ru: 'Заказ уже обрабатывается другой транзакцией',
        uz: 'Buyurtma allaqachon boshqa tranzaksiyada band',
        en: 'Order is already being processed by another transaction',
      },
      field,
    );
  }

  static orderAlreadyPaid(field: string) {
    return new PaymeError(
      PaymeErrorCode.ORDER_ALREADY_PAID,
      {
        ru: 'Заказ уже оплачен',
        uz: "Buyurtma allaqachon to'langan",
        en: 'Order has already been paid',
      },
      field,
    );
  }

  static invalidAmount() {
    return new PaymeError(PaymeErrorCode.INVALID_AMOUNT, {
      ru: 'Неверная сумма',
      uz: "Noto'g'ri summa",
      en: 'Invalid amount',
    });
  }

  static transactionNotFound() {
    return new PaymeError(PaymeErrorCode.TRANSACTION_NOT_FOUND, {
      ru: 'Транзакция не найдена',
      uz: 'Tranzaksiya topilmadi',
      en: 'Transaction not found',
    });
  }

  static cannotPerform(data?: string) {
    return new PaymeError(
      PaymeErrorCode.CANNOT_PERFORM,
      {
        ru: 'Невозможно выполнить операцию',
        uz: "Amalni bajarib bo'lmaydi",
        en: 'Unable to perform operation',
      },
      data,
    );
  }

  static cannotCancel() {
    return new PaymeError(PaymeErrorCode.CANNOT_CANCEL, {
      ru: 'Невозможно отменить транзакцию: заказ доставлен',
      uz: "Tranzaksiyani bekor qilib bo'lmaydi: buyurtma yetkazib berilgan",
      en: 'Unable to cancel transaction: the order has been delivered',
    });
  }
}
