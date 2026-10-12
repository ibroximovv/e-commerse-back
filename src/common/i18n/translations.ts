import { Lang } from './locale';

/**
 * Faqat TIZIM xabarlari va xatolari uchun lug'at.
 *
 * Katalog matnlari (kategoriya/mahsulot nomi, tavsifi, xarakteristikalari) bu
 * yerda emas - ular bazada `name_uz` / `name_ru` / `name_en` ustunlarida
 * saqlanadi va `localizeObject` orqali tanlanadi. Ilgari katalog nomlari ham
 * shu lug'atdan qidirilar edi, shuning uchun bazadagi ruscha matnlar lug'atda
 * topilmay til almashganda ham o'zgarmay qolar edi.
 */
export const translations: Record<string, Record<string, string>> = {
  uz: {
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
    'Price for this product is available on request. Please contact the seller':
      'Bu mahsulotning narxi kelishilgan holda beriladi. Iltimos, sotuvchiga murojaat qiling.',
    'You cannot delete your own account': "O'z hisobingizni o'chira olmaysiz.",
    'You cannot remove the ADMIN role from your own account':
      "O'z hisobingizdan ADMIN rolini olib tashlay olmaysiz.",
    'Cannot remove the last ADMIN account. Promote another user to ADMIN first':
      "Oxirgi ADMIN hisobini olib tashlab bo'lmaydi. Avval boshqa foydalanuvchini ADMIN qiling.",
    'Cart is empty': "Savat bo'sh.",

    // Errors & Messages
    Unauthorized: 'Ruxsat berilmagan. Iltimos, tizimga kiring.',
    'Forbidden resource': 'Ushbu resursga kirish siz uchun taqiqlangan.',
    'User not found': 'Foydalanuvchi topilmadi.',

    'Invalid credentials': "Telefon raqami yoki ism noto'g'ri.",
    'Phone number already registered':
      "Bu telefon raqami allaqachon ro'yxatdan o'tgan. Iltimos, tizimga kiring.",
    'Invalid phone number': "Telefon raqami noto'g'ri.",
    'Full name is required': 'Ism kiritilishi shart.',
    'Too many login attempts. Please try again later':
      "Juda ko'p urinish. Iltimos, birozdan so'ng qayta urinib ko'ring.",
    'Password changed successfully': "Parol muvaffaqiyatli o'zgartirildi.",
    'Old password incorrect': "Eski parol noto'g'ri.",
    'Invalid refresh token': 'Refresh token yaroqsiz.',
    'Logged out successfully': 'Tizimdan muvaffaqiyatli chiqildi.',
    'File uploaded successfully': 'Fayl muvaffaqiyatli yuklandi.',
    'File deleted successfully': "Fayl muvaffaqiyatli o'chirildi.",
    'Payment processed successfully': "To'lov muvaffaqiyatli amalga oshirildi.",
    'Order not found': 'Buyurtma topilmadi.',
    'Only PENDING orders can be cancelled by customers':
      'Faqat kutilayotgan (PENDING) buyurtmalar mijoz tomonidan bekor qilinishi mumkin.',

    // To'lov
    'Order has already been paid': "Buyurtma allaqachon to'langan.",
    'No payment transaction found for this order':
      "Bu buyurtma uchun to'lov tranzaksiyasi topilmadi.",
    'A record with this unique field already exists':
      'Bunday qiymatli yozuv allaqachon mavjud.',
  },
  ru: {
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
    'Price for this product is available on request. Please contact the seller':
      'Цена на этот товар предоставляется по запросу. Пожалуйста, свяжитесь с продавцом.',
    'You cannot delete your own account':
      'Вы не можете удалить свою учётную запись.',
    'You cannot remove the ADMIN role from your own account':
      'Вы не можете снять роль ADMIN со своей учётной записи.',
    'Cannot remove the last ADMIN account. Promote another user to ADMIN first':
      'Нельзя убрать последнюю учётную запись ADMIN. Сначала назначьте администратором другого пользователя.',
    'Cart is empty': 'Корзина пуста.',

    // Errors & Messages
    Unauthorized: 'Не авторизован. Пожалуйста, войдите в систему.',
    'Forbidden resource': 'Доступ к этому ресурсу запрещен.',
    'User not found': 'Пользователь не найден.',

    'Invalid credentials': 'Неверный номер телефона или имя.',
    'Phone number already registered':
      'Этот номер телефона уже зарегистрирован. Пожалуйста, войдите.',
    'Invalid phone number': 'Неверный номер телефона.',
    'Full name is required': 'Укажите имя.',
    'Too many login attempts. Please try again later':
      'Слишком много попыток входа. Повторите попытку позже.',
    'Password changed successfully': 'Пароль успешно изменен.',
    'Old password incorrect': 'Неверный старый пароль.',
    'Invalid refresh token': 'Недействительный refresh token.',
    'Logged out successfully': 'Вы успешно вышли из системы.',
    'File uploaded successfully': 'Файл успешно загружен.',
    'File deleted successfully': 'Файл успешно удален.',
    'Payment processed successfully': 'Оплата прошла успешно.',
    'Order not found': 'Заказ не найден.',
    'Only PENDING orders can be cancelled by customers':
      'Только заказы в статусе PENDING могут быть отменены клиентом.',

    // Оплата
    'Order has already been paid': 'Заказ уже оплачен.',
    'No payment transaction found for this order':
      'Для этого заказа не найдена платёжная транзакция.',
    'A record with this unique field already exists':
      'Запись с таким значением уже существует.',
  },
  en: {
    // Default language, keys map 1:1, but included for completeness
  },
};

/**
 * Tizim xabarini tanlangan tilga o'giradi.
 *
 * Xabarlar kodda ingliz tilida yozilgani uchun `en` da lug'atga murojaat
 * qilinmaydi. Lug'atda topilmagan matn (masalan, ichida ID bo'lgan dinamik
 * xabar) o'zgarmasdan qaytadi.
 *
 * Faqat matnning O'ZI kalit bo'lgan xabarlarga ishlaydi - obyekt ichidagi
 * katalog nomlarini tarjima qilishga urinmaydi. Buning uchun `localizeObject`.
 */
export function translate(text: string, lang: Lang | string): string {
  if (!text || lang === 'en') return text;

  const dict = translations[String(lang).toLowerCase()];
  if (!dict) return text;

  if (dict[text]) return dict[text];

  const matchedKey = Object.keys(dict).find(
    (key) => key.toLowerCase() === text.toLowerCase(),
  );

  return matchedKey ? dict[matchedKey] : text;
}
