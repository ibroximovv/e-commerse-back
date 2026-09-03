import {
  localizeObject,
  normalizeLanguage,
  pickLocalized,
  spreadLocalized,
  spreadLocalizedRequired,
} from './locale';

describe('normalizeLanguage', () => {
  it("qo'llab-quvvatlanadigan tillarni tanidi", () => {
    expect(normalizeLanguage('uz')).toBe('uz');
    expect(normalizeLanguage('RU')).toBe('ru');
    expect(normalizeLanguage(' en ')).toBe('en');
  });

  it("mintaqa qo'shimchasini tashlab yuboradi", () => {
    expect(normalizeLanguage('ru-RU')).toBe('ru');
    expect(normalizeLanguage('en_US')).toBe('en');
  });

  it('notanish qiymat uchun standart tilga tushadi', () => {
    expect(normalizeLanguage('de')).toBe('uz');
    expect(normalizeLanguage(undefined)).toBe('uz');
    expect(normalizeLanguage(42)).toBe('uz');
  });
});

describe('pickLocalized', () => {
  const variants = { uz: 'Nasos', ru: 'Насос', en: 'Pump' };

  it("so'ralgan tilni qaytaradi", () => {
    expect(pickLocalized(variants, 'ru')).toBe('Насос');
    expect(pickLocalized(variants, 'en')).toBe('Pump');
  });

  it("bo'sh til uchun fallback zanjiri bo'ylab tushadi", () => {
    // uz bo'sh -> uz -> ru tartibida qidiriladi
    expect(pickLocalized({ uz: '', ru: 'Насос', en: '' }, 'uz')).toBe('Насос');
    expect(pickLocalized({ uz: null, ru: null, en: 'Pump' }, 'ru')).toBe(
      'Pump',
    );
  });

  it("faqat bo'shliqdan iborat matnni to'ldirilgan deb hisoblamaydi", () => {
    expect(pickLocalized({ uz: '   ', ru: 'Насос' }, 'uz')).toBe('Насос');
  });

  it("hech qayerda matn bo'lmasa null qaytaradi", () => {
    expect(pickLocalized({ uz: '', ru: '', en: '' }, 'uz')).toBeNull();
    expect(pickLocalized({}, 'en')).toBeNull();
  });
});

describe('localizeObject', () => {
  it("til uchligini bitta maydonga yig'adi va xom ustunlarni tashlaydi", () => {
    const result = localizeObject(
      {
        id: '1',
        name_uz: 'Avtomatik nasos',
        name_ru: 'Автоматический насос',
        name_en: 'Automatic pump',
        stock: 5,
      },
      'ru',
    );

    expect(result).toEqual({
      id: '1',
      name: 'Автоматический насос',
      stock: 5,
    });
  });

  it("bir til bo'sh bo'lsa fallbackni qo'llaydi", () => {
    // Bu aynan foydalanuvchi uchragan xato: ruscha katalog matni tilni
    // almashtirganda ham o'zgarmay qolardi. Endi bo'sh uz uchun ru ko'rsatiladi.
    const result = localizeObject(
      { name_uz: '', name_ru: 'Насос', name_en: '' },
      'uz',
    );

    expect(result).toEqual({ name: 'Насос' });
  });

  it('ichma-ich obyekt va massivlarni ham qayta ishlaydi', () => {
    const result = localizeObject(
      {
        name_uz: 'Nasos',
        name_ru: 'Насос',
        name_en: 'Pump',
        category: {
          name_uz: 'Nasoslar',
          name_ru: 'Насосы',
          name_en: 'Pumps',
        },
        attributes: [
          {
            key_uz: 'Quvvat',
            key_ru: 'Мощность',
            key_en: 'Power',
            value_uz: '250',
            value_ru: '250',
            value_en: '250',
            unit_uz: 'Vt',
            unit_ru: 'Вт',
            unit_en: 'W',
          },
        ],
      },
      'en',
    );

    expect(result).toEqual({
      name: 'Pump',
      category: { name: 'Pumps' },
      attributes: [{ key: 'Power', value: '250', unit: 'W' }],
    });
  });

  it('parol maydonini hamma joyda olib tashlaydi', () => {
    const result = localizeObject(
      { email: 'a@b.uz', password: 'secret', user: { password: 'nested' } },
      'uz',
    );

    expect(result).toEqual({ email: 'a@b.uz', user: {} });
  });

  it("Date va oddiy qiymatlarni o'zgartirmaydi", () => {
    const created = new Date('2026-01-01T00:00:00.000Z');
    const result = localizeObject({ created_at: created, count: 3 }, 'uz');

    expect(result).toEqual({ created_at: created, count: 3 });
    expect((result as any).created_at).toBeInstanceOf(Date);
  });

  it('bazasi mavjud maydonni ustiga yozib yubormaydi', () => {
    // `name` allaqachon bor - `name_ru` uni bosib ketmasligi kerak
    const result = localizeObject({ name: 'Original', name_ru: 'Насос' }, 'ru');

    expect(result).toEqual({ name: 'Original', name_ru: 'Насос' });
  });

  it('sikllik havolada cheksiz rekursiyaga tushmaydi', () => {
    const node: any = { name_uz: 'A', name_ru: 'A', name_en: 'A' };
    node.self = node;

    const result = localizeObject(node, 'uz');

    expect(result.name).toBe('A');
    expect(result.self).toBe(result);
  });
});

describe('spreadLocalized', () => {
  it('yuborilgan tillarni ustunlarga yoyadi', () => {
    expect(spreadLocalized('description', { ru: 'Текст' })).toEqual({
      description_ru: 'Текст',
    });
  });

  it("yuborilmagan tilni natijaga qo'shmaydi (PATCH ni buzmaslik uchun)", () => {
    const result = spreadLocalized('name', { uz: 'Nasos', ru: undefined });

    expect(result).toEqual({ name_uz: 'Nasos' });
    expect('name_ru' in result).toBe(false);
  });

  it("undefined uchun bo'sh obyekt qaytaradi", () => {
    expect(spreadLocalized('name', undefined)).toEqual({});
  });
});

describe('spreadLocalizedRequired', () => {
  it("uchala ustunni ham to'ldiradi", () => {
    expect(
      spreadLocalizedRequired('name', {
        uz: 'Nasos',
        ru: 'Насос',
        en: 'Pump',
      }),
    ).toEqual({ name_uz: 'Nasos', name_ru: 'Насос', name_en: 'Pump' });
  });

  it("bo'sh tilni mavjud tildan to'ldiradi", () => {
    expect(spreadLocalizedRequired('name', { ru: 'Насос' })).toEqual({
      name_uz: 'Насос',
      name_ru: 'Насос',
      name_en: 'Насос',
    });
  });
});
