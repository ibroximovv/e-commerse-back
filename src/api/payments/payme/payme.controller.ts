import { Body, Controller, Headers, Logger, Post } from '@nestjs/common';
import { ApiExcludeEndpoint, ApiOperation, ApiTags } from '@nestjs/swagger';
import { PaymeService } from './payme.service';
import { PaymeError } from './payme.error';
import { PaymeErrorCode } from './payme.constants';
import { JSONRPC_VERSION } from './payme.types';
import type { PaymeRequest, PaymeResponse } from './payme.types';
import { RawResponse } from '../../../common/decorators/raw-response.decorator';

/**
 * Payme SERVERI chaqiradigan yagona endpoint (webhook).
 *
 * Protokol talablari:
 *  - HTTP status HAR DOIM 200 bo'ladi, xato javob tanasidagi `error` da keladi;
 *  - avtorizatsiya `Authorization: Basic base64("Paycom:<KEY>")` orqali;
 *  - javob standart `{success, data}` o'ramiga solinmaydi (`@RawResponse`).
 *
 * Merchant kabinetida ko'rsatiladigan manzil:
 *   https://api.ocomarket.uz/api/payments/payme
 */
@ApiTags('Payments')
@Controller('api/payments/payme')
export class PaymeController {
  private readonly logger = new Logger(PaymeController.name);

  constructor(private readonly paymeService: PaymeService) {}

  @Post()
  @RawResponse()
  @ApiExcludeEndpoint()
  @ApiOperation({ summary: 'Payme Merchant API (JSON-RPC webhook)' })
  async handle(
    @Body() body: PaymeRequest,
    @Headers('authorization') authorization?: string,
  ): Promise<PaymeResponse> {
    const id = body?.id ?? null;

    try {
      this.paymeService.authorize(authorization);
      const result = await this.paymeService.handle(body);
      return { jsonrpc: JSONRPC_VERSION, id, result };
    } catch (error) {
      if (error instanceof PaymeError) {
        return {
          jsonrpc: JSONRPC_VERSION,
          id,
          error: {
            code: error.code,
            message: error.localizedMessage,
            ...(error.data ? { data: error.data } : {}),
          },
        };
      }

      // Kutilmagan xato (baza uzilishi va h.k.). Payme'ga protokol xatosi
      // qaytaramiz - u so'rovni qaytadan yuboradi.
      this.logger.error(
        `Payme so'rovida kutilmagan xato: ${body?.method ?? '-'}`,
        error instanceof Error ? error.stack : String(error),
      );

      return {
        jsonrpc: JSONRPC_VERSION,
        id,
        error: {
          code: PaymeErrorCode.PARSE_ERROR,
          message: {
            ru: 'Внутренняя ошибка сервера',
            uz: 'Serverning ichki xatosi',
            en: 'Internal server error',
          },
        },
      };
    }
  }
}
