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
    'If the account exists, a password reset code has been sent':
      "Agar bunday hisob mavjud bo'lsa, parolni tiklash kodi yuborildi.",
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
    'Invalid refresh token': 'Refresh token yaroqsiz.',
    'Password reset code sent to email':
      'Parolni tiklash kodi elektron pochtangizga yuborildi.',
    'Password reset successfully': 'Parol muvaffaqiyatli tiklandi.',
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
    'If the account exists, a password reset code has been sent':
      'Если такая учётная запись существует, код для сброса пароля отправлен.',
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
    'Invalid refresh token': 'Недействительный refresh token.',
    'Password reset code sent to email':
      'Код для сброса пароля отправлен на вашу почту.',
    'Password reset successfully': 'Пароль успешно сброшен.',
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
