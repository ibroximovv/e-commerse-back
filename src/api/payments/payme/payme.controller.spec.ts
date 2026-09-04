import { Test } from '@nestjs/testing';
import { PaymeController } from './payme.controller';
import { PaymeService } from './payme.service';
import { PaymeError } from './payme.error';
import { PaymeErrorCode } from './payme.constants';

/**
 * Controller javob QOBIG'I uchun mas'ul: `jsonrpc`, `id` echo va xatolarni
 * JSON-RPC formatiga o'rash. Biznes mantiq `payme.service.spec.ts` da.
 */
describe('PaymeController', () => {
  let controller: PaymeController;

  const paymeService = {
    authorize: jest.fn(),
    handle: jest.fn(),
  };

  beforeEach(async () => {
    // `clearAllMocks` chaqiruvlarni tozalaydi, lekin `mockImplementation` ni
    // qoldiradi - avtorizatsiya testidagi throw keyingi testlarga o'tib ketardi
    jest.resetAllMocks();

    const module = await Test.createTestingModule({
      controllers: [PaymeController],
      providers: [{ provide: PaymeService, useValue: paymeService }],
    }).compile();

    controller = module.get(PaymeController);
  });

  const AUTH = `Basic ${Buffer.from('Paycom:key').toString('base64')}`;

  it("muvaffaqiyatli javobda jsonrpc va so'rov id'si qaytadi", async () => {
    paymeService.handle.mockResolvedValue({ allow: true });

    const response = await controller.handle(
      { jsonrpc: '2.0', id: 28760, method: 'CheckPerformTransaction' },
      AUTH,
    );

    expect(response).toEqual({
      jsonrpc: '2.0',
      id: 28760,
      result: { allow: true },
    });
  });

  it("PaymeError ni JSON-RPC xatosiga o'raydi", async () => {
    paymeService.handle.mockRejectedValue(PaymeError.invalidAmount());

    const response: any = await controller.handle(
      { jsonrpc: '2.0', id: 5, method: 'CreateTransaction' },
      AUTH,
    );

    expect(response).toEqual({
      jsonrpc: '2.0',
      id: 5,
      error: {
        code: PaymeErrorCode.INVALID_AMOUNT,
        message: {
          ru: 'Неверная сумма',
          uz: "Noto'g'ri summa",
          en: 'Invalid amount',
        },
      },
    });
  });

  it("xato xabari uchala tilda ham bo'ladi", async () => {
    paymeService.handle.mockRejectedValue(PaymeError.transactionNotFound());

    const response: any = await controller.handle({ id: 1 }, AUTH);

    expect(Object.keys(response.error.message).sort()).toEqual([
      'en',
      'ru',
      'uz',
    ]);
  });

  it('avtorizatsiya xatosini -32504 bilan qaytaradi', async () => {
    paymeService.authorize.mockImplementation(() => {
      throw PaymeError.insufficientPrivileges();
    });

    const response: any = await controller.handle({ id: 7 }, undefined);

    expect(response.error.code).toBe(PaymeErrorCode.INSUFFICIENT_PRIVILEGES);
    // Auth yiqilsa biznes mantiqqa umuman o'tmasligi kerak
    expect(paymeService.handle).not.toHaveBeenCalled();
  });

  it('kutilmagan xatoni ham JSON-RPC javobiga aylantiradi', async () => {
    // Baza uzilishi kabi holat HTML/500 emas, protokol xatosi bo'lib chiqishi
    // kerak - aks holda Payme javobni umuman tushunmaydi
    paymeService.handle.mockRejectedValue(new Error('connection lost'));

    const response: any = await controller.handle({ id: 9 }, AUTH);

    expect(response.jsonrpc).toBe('2.0');
    expect(response.id).toBe(9);
    expect(response.error.code).toBe(PaymeErrorCode.PARSE_ERROR);
  });

  it('HTTP status 200 qaytaradi', () => {
    // NestJS `@Post()` uchun standart 201 qaytaradi, Payme esa HAR DOIM 200
    // kutadi. Bu metadata bo'lgani uchun `controller.handle()` ni chaqirib
    // tekshirib bo'lmaydi - dekoratordagi qiymatni o'qiymiz.
    const status = Reflect.getMetadata(
      '__httpCode__',
      PaymeController.prototype.handle,
    );

    expect(status).toBe(200);
  });

  it('id yuborilmasa null qaytaradi', async () => {
    paymeService.handle.mockResolvedValue({});

    const response = await controller.handle(
      { method: 'CheckTransaction' },
      AUTH,
    );

    expect(response).toMatchObject({ jsonrpc: '2.0', id: null });
  });
});
