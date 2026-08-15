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
    Smartphones: 'Smartfonlar',
    Laptops: 'Noutbuklar',
    Tablets: 'Planshetlar',
    Headphones: 'Quloqchinlar',
    Chargers: 'Quvvatlagichlar',
    Cases: 'Chexollar',
    'Home Appliances': 'Maishiy texnika',
    Kitchen: 'Oshxona',
    'Cables, cases, chargers': 'Kabellar, chexollar, quvvatlagichlar',

    // Katalog xatolari
    'Category has subcategories. Archive it instead of deleting':
      "Kategoriyada ichki kategoriyalar bor. O'chirish o'rniga arxivlang.",
    'Category has products. Archive it instead of deleting':
      "Kategoriyada mahsulotlar bor. O'chirish o'rniga arxivlang.",
    'Category with this name already exists':
      'Bunday nomli kategoriya allaqachon mavjud.',
    'Category cannot be its own parent':
      "Kategoriya o'zining ota kategoriyasi bo'la olmaydi.",
    'Cannot move a category into its own subcategory':
      "Kategoriyani o'zining ichki kategoriyasi ostiga ko'chirib bo'lmaydi.",
    'Cannot assign a product to an archived category':
      "Arxivlangan kategoriyaga mahsulot qo'shib bo'lmaydi.",
    'Discount price must be lower than the original price':
      "Chegirma narxi asosiy narxdan kichik bo'lishi kerak.",
    'Product with this SKU already exists':
      'Bunday SKU bilan mahsulot allaqachon mavjud.',
    'Product not found': 'Mahsulot topilmadi.',
    'Review not found': 'Izoh topilmadi.',
    'Not enough stock available': "Omborda yetarli mahsulot yo'q.",
    'Cart is empty': "Savat bo'sh.",

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
    Smartphones: 'Смартфоны',
    Laptops: 'Ноутбуки',
    Tablets: 'Планшеты',
    Headphones: 'Наушники',
    Chargers: 'Зарядные устройства',
    Cases: 'Чехлы',
    'Home Appliances': 'Бытовая техника',
    Kitchen: 'Кухня',
    'Cables, cases, chargers': 'Кабели, чехлы, зарядные устройства',

    // Ошибки каталога
    'Category has subcategories. Archive it instead of deleting':
      'В категории есть подкатегории. Архивируйте её вместо удаления.',
    'Category has products. Archive it instead of deleting':
      'В категории есть товары. Архивируйте её вместо удаления.',
    'Category with this name already exists':
      'Категория с таким названием уже существует.',
    'Category cannot be its own parent':
      'Категория не может быть своей же родительской.',
    'Cannot move a category into its own subcategory':
      'Нельзя переместить категорию в её собственную подкатегорию.',
    'Cannot assign a product to an archived category':
      'Нельзя добавить товар в архивированную категорию.',
    'Discount price must be lower than the original price':
      'Цена со скидкой должна быть меньше основной цены.',
    'Product with this SKU already exists': 'Товар с таким SKU уже существует.',
    'Product not found': 'Товар не найден.',
    'Review not found': 'Отзыв не найден.',
    'Not enough stock available': 'Недостаточно товара на складе.',
    'Cart is empty': 'Корзина пуста.',

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
