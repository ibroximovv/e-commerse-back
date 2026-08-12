export const translations: Record<string, Record<string, string>> = {
  uz: {
    // Entities / Words
    Phone: 'Telefon',
    Laptop: 'Noutbuk',
    Electronics: 'Elektronika',
    Accessories: 'Aksessuarlar',
    'Smartphones and gadgets': 'Smartfonlar va gadjetlar',
    'High performance laptops': 'Yuqori unumdorlikka ega noutbuklar',
    'Super fast phone': 'Juda tezkor telefon',

    // Errors & Messages
    Unauthorized: 'Ruxsat berilmagan. Iltimos, tizimga kiring.',
    'Forbidden resource': 'Ushbu resursga kirish siz uchun taqiqlangan.',
    'Invalid verification code': "Tasdiqlash kodi noto'g'ri.",
    'Verification code expired':
      'Tasdiqlash kodining amal qilish muddati tugagan.',
    'Code sent successfully': 'Tasdiqlash kodi muvaffaqiyatli yuborildi.',
    'Email already verified':
      'Elektron pochta manzili allaqachon tasdiqlangan.',
    'Please wait 1 minute before resending':
      'Kodni qayta yuborishdan oldin 1 daqiqa kuting.',
    'User not found': 'Foydalanuvchi topilmadi.',
    'Invalid credentials': "Email yoki parol noto'g'ri.",
    'Email already registered':
      "Ushbu email manzili allaqachon ro'yxatdan o'tgan.",
    'Verification code is invalid or expired':
      "Tasdiqlash kodi noto'g'ri yoki muddati tugagan.",
    'Account not verified':
      'Hisobingiz hali tasdiqlanmagan. Iltimos, emailni tasdiqlang.',
    'Password changed successfully': "Parol muvaffaqiyatli o'zgartirildi.",
    'Old password incorrect': "Eski parol noto'g'ri.",
    'Verification code sent to email':
      'Tasdiqlash kodi elektron pochtangizga yuborildi.',
    'Email verified successfully':
      'Elektron pochta muvaffaqiyatli tasdiqlandi.',
    'Too many invalid attempts. Please request a new code':
      "Juda ko'p noto'g'ri urinish. Iltimos, yangi kod so'rang.",
    'Failed to send verification email':
      "Tasdiqlash xatini yuborib bo'lmadi. Iltimos, keyinroq urinib ko'ring.",
    'Invalid refresh token': 'Refresh token yaroqsiz.',
  },
  ru: {
    // Entities / Words
    Phone: 'Телефон',
    Laptop: 'Ноутбук',
    Electronics: 'Электроника',
    Accessories: 'Аксессуары',
    'Smartphones and gadgets': 'Смартфоны и гаджеты',
    'High performance laptops': 'Высокопроизводительные ноутбуки',
    'Super fast phone': 'Супер быстрый телефон',

    // Errors & Messages
    Unauthorized: 'Не авторизован. Пожалуйста, войдите в систему.',
    'Forbidden resource': 'Доступ к этому ресурсу запрещен.',
    'Invalid verification code': 'Неверный код подтверждения.',
    'Verification code expired': 'Срок действия кода подтверждения истек.',
    'Code sent successfully': 'Код подтверждения успешно отправлен.',
    'Email already verified': 'Электронная почта уже подтверждена.',
    'Please wait 1 minute before resending':
      'Подождите 1 минуту перед повторной отправкой.',
    'User not found': 'Пользователь не найден.',
    'Invalid credentials': 'Неверный email или пароль.',
    'Email already registered':
      'Этот адрес электронной почты уже зарегистрирован.',
    'Verification code is invalid or expired':
      'Код подтверждения недействителен или истек.',
    'Account not verified':
      'Аккаунт не подтвержден. Пожалуйста, подтвердите почту.',
    'Password changed successfully': 'Пароль успешно изменен.',
    'Old password incorrect': 'Неверный старый пароль.',
    'Verification code sent to email':
      'Код подтверждения отправлен на вашу почту.',
    'Email verified successfully': 'Электронная почта успешно подтверждена.',
    'Too many invalid attempts. Please request a new code':
      'Слишком много неверных попыток. Пожалуйста, запросите новый код.',
    'Failed to send verification email':
      'Не удалось отправить письмо с кодом. Пожалуйста, попробуйте позже.',
    'Invalid refresh token': 'Недействительный refresh token.',
  },
  en: {
    // Default language, keys map 1:1, but included for completeness
  },
};

export function translate(text: string, lang: string): string {
  if (!text || !lang || lang === 'en') return text;
  const lowerLang = lang.toLowerCase();
  const dict = translations[lowerLang];
  if (!dict) return text;

  // Try exact match
  if (dict[text]) return dict[text];

  // Try case-insensitive matching
  const matchedKey = Object.keys(dict).find(
    (key) => key.toLowerCase() === text.toLowerCase(),
  );
  if (matchedKey) return dict[matchedKey];

  return text;
}

export function translateObject<T>(obj: T, lang: string): T {
  if (!obj || typeof obj !== 'object' || obj instanceof Date) return obj;

  if (Array.isArray(obj)) {
    return obj.map((item) => translateObject(item, lang)) as any;
  }

  const result = { ...obj } as any;

  // Strip password field globally to prevent security leaks
  if ('password' in result) {
    delete result.password;
  }

  for (const key in result) {
    if (Object.prototype.hasOwnProperty.call(result, key)) {
      const val = result[key];
      if (typeof val === 'string' && lang !== 'en') {
        // Only translate fields likely to have values in dictionary
        if (
          [
            'name',
            'description',
            'message',
            'error',
            'fullName',
            'full_name',
          ].includes(key)
        ) {
          result[key] = translate(val, lang);
        }
      } else if (typeof val === 'object' && val !== null) {
        result[key] = translateObject(val, lang);
      }
    }
  }
  return result;
}
