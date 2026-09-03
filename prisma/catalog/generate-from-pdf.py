# -*- coding: utf-8 -*-
"""
"Каталог 2026-III (ООО «OCO»)" PDF'idan olingan ma'lumotlarni uz/ru/en
ko'rinishida prisma/catalog/*.json ga generatsiya qiladi.

Manba: PDF sahifa 2 (oglavlenie) va 3-19 (jadvallar).
Qiymatlar katalogdagidek AYNAN ko'chirilgan - hisob-kitob qilinmagan.
"""
import json
import re
import unicodedata
from pathlib import Path

OUT = Path("prisma/catalog")

# ---------------------------------------------------------------------------
# Lug'atlar
# ---------------------------------------------------------------------------

KEYS = {
    "Модель": ("Model", "Model"),
    "Материал": ("Material", "Material"),
    "Мощность": ("Quvvat", "Power"),
    "Максимальный напор": ("Maksimal napor", "Max head"),
    "Пропускная способность": ("O'tkazish qobiliyati", "Flow rate"),
    "Частота вращения": ("Aylanish chastotasi", "Rotation speed"),
    "Высота всасывания": ("So'rish balandligi", "Suction height"),
    "Диаметр отверстия": ("Teshik diametri", "Port diameter"),
    "Напряжение": ("Kuchlanish", "Voltage"),
    "Ампераж": ("Amperaj", "Amperage"),
    "Электроток": ("Tok kuchi", "Current"),
    "Класс защиты": ("Himoya klassi", "Protection class"),
    "Частота": ("Chastota", "Frequency"),
    "Частота тока": ("Tok chastotasi", "Current frequency"),
    "Бренд": ("Brend", "Brand"),
    "Поплавок": ("Suzgich", "Float switch"),
    "Вес": ("Og'irligi", "Weight"),
    "Вес брутто": ("Brutto og'irligi", "Gross weight"),
    "Вес нетто": ("Netto og'irligi", "Net weight"),
    "Дальность": ("Masofa", "Range"),
    "Входной / выходной штуцер": ("Kirish / chiqish shtuseri", "Inlet / outlet port"),
    "Напряжение сети": ("Tarmoq kuchlanishi", "Mains voltage"),
    "Температура": ("Harorat", "Temperature"),
    "Максимальная температура": ("Maksimal harorat", "Max temperature"),
    "Давление": ("Bosim", "Pressure"),
    "Максимальная давления": ("Maksimal bosim", "Max pressure"),
    "Ёмкость": ("Sig'imi", "Capacity"),
    "Диаметр": ("Diametri", "Diameter"),
    "Мембрана": ("Membrana", "Membrane"),
    "Тип": ("Turi", "Type"),
    "Поддержание потока вольт": ("Kuchlanish quvvati", "Voltage output"),
    "Электродная проволока": ("Elektrod simi", "Electrode wire"),
    "Электрод": ("Elektrod", "Electrode"),
    "Скорость оборота": ("Aylanish tezligi", "Rotation speed"),
    "Максимальный Ампераж": ("Maksimal amperaj", "Max amperage"),
    "Мин. входное напряжение": ("Min. kirish kuchlanishi", "Min. input voltage"),
    "Выходное напряжение": ("Chiqish kuchlanishi", "Output voltage"),
    "Погрешность ±": ("Xatolik ±", "Tolerance ±"),
}

UNITS = {
    "Вт": ("Vt", "W"),
    "кВт": ("kVt", "kW"),
    "м": ("m", "m"),
    "м³/ч": ("m³/soat", "m3/h"),
    "м³/мин": ("m³/daq", "m3/min"),
    "л/мин": ("l/daq", "l/min"),
    "об/мин": ("ayl/daq", "rpm"),
    "мм": ("mm", "mm"),
    "В": ("V", "V"),
    "А": ("A", "A"),
    "Гц": ("Gs", "Hz"),
    "кг": ("kg", "kg"),
    "л": ("l", "l"),
    "бар": ("bar", "bar"),
    "°C": ("°C", "°C"),
    "МПа": ("MPa", "MPa"),
    "VA": ("VA", "VA"),
    "%": ("%", "%"),
}

# Matnli qiymatlar. Sonlar (250, 1.9, 160-220 ...) tarjima qilinmaydi.
VALUES = {
    "Алюминий": ("Alyuminiy", "Aluminium"),
    "Медный": ("Mis", "Copper"),
    "Латунь": ("Jez", "Brass"),
    "Есть": ("Bor", "Yes"),
    "нет": ("Yo'q", "No"),
    "термически": ("Termik himoya", "Thermal"),
    "Инверторный Полуавтомат": (
        "Invertorli yarim avtomat",
        "Inverter semi-automatic",
    ),
    "Релейный": ("Releli", "Relay"),
}

# Mahsulot turi nomlari
TYPES = {
    "auto": (
        "Avtomatik suv nasosi",
        "Автоматический водяной насос",
        "Automatic water pump",
    ),
    "auto_protected": (
        "Avtomatik himoyalangan suv nasosi",
        "Автоматический защищенный водяной насос",
        "Automatic protected water pump",
    ),
    "auto_smart": (
        "Avtomatik aqlli suv nasosi",
        "Автоматический умный водяной насос",
        "Automatic smart water pump",
    ),
    "submersible": (
        "Botiriladigan suv nasosi",
        "Погружной водяной насос",
        "Submersible water pump",
    ),
    "surface": (
        "Yer usti suv nasosi",
        "Поверхностный водяной насос",
        "Surface water pump",
    ),
    "centrifugal": (
        "Markazdan qochma suv nasosi",
        "Центробежный водяной насос",
        "Centrifugal water pump",
    ),
    "regulator": (
        "Suv nasosi avtomatik regulyatori",
        "Автоматический регулятор водяного насоса",
        "Automatic water pump controller",
    ),
    "circulation": (
        "Sirkulyatsion nasos",
        "Циркуляционный насос",
        "Circulation pump",
    ),
    "recirculation": (
        "Retsirkulyatsion nasos",
        "Рециркуляционный насос",
        "Recirculation pump",
    ),
    "tank": ("Kengaytirish baki", "Расширительный бак", "Expansion tank"),
    "welder": ("Payvandlash apparati", "Сварочный аппарат", "Welding machine"),
    "motor": ("Elektrodvigatel", "Электродвигатель", "Electric motor"),
    "stabilizer": ("Stabilizator", "Стабилизатор", "Voltage stabilizer"),
}

DESCRIPTIONS = {
    "auto": (
        "Bosim avtomatikasi o'rnatilgan avtomatik suv nasosi.",
        "Автоматический водяной насос со встроенной автоматикой давления.",
        "Automatic water pump with a built-in pressure control unit.",
    ),
    "auto_protected": (
        "Termik himoyali, yopiq korpusdagi avtomatik suv nasosi.",
        "Автоматический водяной насос в закрытом корпусе с термической защитой.",
        "Automatic water pump in a closed housing with thermal protection.",
    ),
    "auto_smart": (
        "Elektron boshqaruvli aqlli avtomatik suv nasosi.",
        "Умный автоматический водяной насос с электронным управлением.",
        "Smart automatic water pump with electronic control.",
    ),
    "submersible": (
        "Toza va iflos suv uchun botiriladigan drenaj nasosi.",
        "Погружной дренажный насос для чистой и загрязнённой воды.",
        "Submersible drainage pump for clean and dirty water.",
    ),
    "surface": (
        "Suv ta'minoti tizimlari uchun yer usti nasosi.",
        "Поверхностный насос для систем водоснабжения.",
        "Surface pump for water supply systems.",
    ),
    "centrifugal": (
        "Yuqori unumdorlikka ega markazdan qochma nasos.",
        "Центробежный насос с высокой производительностью.",
        "High-capacity centrifugal pump.",
    ),
    "regulator": (
        "Suv nasosini avtomatik yoqib-o'chiruvchi bosim regulyatori.",
        "Регулятор давления для автоматического включения и выключения насоса.",
        "Pressure controller that switches the pump on and off automatically.",
    ),
    "circulation": (
        "Isitish tizimlari uchun uch tezlikli sirkulyatsion nasos.",
        "Трёхскоростной циркуляционный насос для систем отопления.",
        "Three-speed circulation pump for heating systems.",
    ),
    "recirculation": (
        "Issiq suv ta'minoti uchun retsirkulyatsion nasos.",
        "Рециркуляционный насос для систем горячего водоснабжения.",
        "Recirculation pump for hot water supply systems.",
    ),
    "tank": (
        "EPDM membranali kengaytirish baki.",
        "Расширительный бак с мембраной EPDM.",
        "Expansion tank with an EPDM membrane.",
    ),
    "welder": (
        "Invertorli yarim avtomat payvandlash apparati.",
        "Инверторный полуавтоматический сварочный аппарат.",
        "Inverter semi-automatic welding machine.",
    ),
    "motor": (
        "Uch fazali asenkron elektrodvigatel.",
        "Асинхронный электродвигатель.",
        "Asynchronous electric motor.",
    ),
    "stabilizer": (
        "Releli avtomatik kuchlanish stabilizatori.",
        "Релейный автоматический стабилизатор напряжения.",
        "Relay-type automatic voltage stabilizer.",
    ),
}

MATERIAL_SUFFIX = {
    "Алюминий": ("alyuminiy", "алюминий", "aluminium"),
    "Медный": ("mis", "медный", "copper"),
    "Латунь": ("jez", "латунь", "brass"),
}

CATEGORIES = [
    (
        "avtomaticheskie-nasosy",
        ("Avtomatik nasoslar", "Автоматические насосы", "Automatic pumps"),
        (
            "Bosim avtomatikasi o'rnatilgan avtomatik suv nasoslari: 1WZB, PW, XP va SMART PUMP seriyalari.",
            "Автоматические водяные насосы со встроенным блоком управления: серии 1WZB, PW, XP и SMART PUMP.",
            "Automatic water pumps with a built-in control unit: 1WZB, PW, XP and SMART PUMP series.",
        ),
        1,
        True,
    ),
    (
        "pogruzhnye-nasosy",
        ("Botiriladigan nasoslar", "Погружные насосы", "Submersible pumps"),
        (
            "Mis va alyuminiy korpusli QDX seriyasidagi botiriladigan drenaj va fekal nasoslar.",
            "Погружные дренажные и фекальные водяные насосы серии QDX в медном и алюминиевом исполнении.",
            "QDX series submersible drainage and sewage pumps in copper and aluminium versions.",
        ),
        2,
        True,
    ),
    (
        "poverhnostnye-nasosy",
        ("Yer usti nasoslari", "Поверхностные насосы", "Surface pumps"),
        (
            "QB, CPM va JET seriyalaridagi yer usti va markazdan qochma suv nasoslari.",
            "Поверхностные и центробежные водяные насосы серий QB, CPM и JET.",
            "Surface and centrifugal water pumps of the QB, CPM and JET series.",
        ),
        3,
        True,
    ),
    (
        "avtomaticheskie-regulyatory",
        (
            "Avtomatik regulyatorlar",
            "Автоматические регуляторы",
            "Automatic controllers",
        ),
        (
            "Suv nasoslari uchun avtomatik bosim regulyatorlari (kontrollerlari).",
            "Автоматические регуляторы (контроллеры) давления для водяных насосов.",
            "Automatic pressure controllers for water pumps.",
        ),
        4,
        False,
    ),
    (
        "tsirkulyatsionnye-nasosy",
        ("Sirkulyatsion nasoslar", "Циркуляционные насосы", "Circulation pumps"),
        (
            "Isitish va issiq suv ta'minoti tizimlari uchun sirkulyatsion va retsirkulyatsion nasoslar.",
            "Циркуляционные и рециркуляционные насосы для систем отопления и горячего водоснабжения.",
            "Circulation and recirculation pumps for heating and hot water supply systems.",
        ),
        5,
        False,
    ),
    (
        "rasshiritelnyy-bak",
        ("Kengaytirish baklari", "Расширительный бак", "Expansion tanks"),
        (
            "8 dan 50 litrgacha bo'lgan EPDM membranali kengaytirish baklari.",
            "Расширительные баки с мембраной EPDM объёмом от 8 до 50 литров.",
            "Expansion tanks with an EPDM membrane, from 8 to 50 litres.",
        ),
        6,
        False,
    ),
    (
        "instrumenty",
        ("Asboblar", "Инструменты", "Tools"),
        (
            "Payvandlash apparatlari va elektrodvigatellar.",
            "Сварочные аппараты и электродвигатели.",
            "Welding machines and electric motors.",
        ),
        7,
        False,
    ),
    (
        "stabilizatory",
        ("Stabilizatorlar", "Стабилизаторы", "Voltage stabilizers"),
        (
            "DNB seriyasidagi releli kuchlanish stabilizatorlari.",
            "Релейные стабилизаторы напряжения DNB.",
            "DNB series relay voltage stabilizers.",
        ),
        8,
        False,
    ),
]

# ---------------------------------------------------------------------------
# Mahsulotlar - PDF jadvallaridan aynan ko'chirilgan
# (no, tur, model, kategoriya slug, material, [(kalit, qiymat, birlik), ...])
# ---------------------------------------------------------------------------

P = []


def add(no, kind, model, cat, material, attrs):
    P.append(
        {
            "no": no,
            "kind": kind,
            "model": model,
            "cat": cat,
            "material": material,
            "attrs": attrs,
        }
    )


A = "avtomaticheskie-nasosy"
S = "pogruzhnye-nasosy"
V = "poverhnostnye-nasosy"
R = "avtomaticheskie-regulyatory"
C = "tsirkulyatsionnye-nasosy"
T = "rasshiritelnyy-bak"
I = "instrumenty"
St = "stabilizatory"

# --- 1. Автоматические насосы (PDF 3-7) ---
# Модель: 1WZB, Алюминь
add(1, "auto", "1WZB-250", A, "Алюминий", [
    ("Модель", "1WZB", None), ("Мощность", "250", "Вт"),
    ("Максимальный напор", "24", "м"), ("Пропускная способность", "1.9", "м³/ч"),
    ("Частота вращения", "2860", "об/мин"), ("Диаметр отверстия", "25", "мм"),
    ("Напряжение", "160-220", "В")])
add(2, "auto", "1WZB-370", A, "Алюминий", [
    ("Модель", "1WZB", None), ("Мощность", "370", "Вт"),
    ("Максимальный напор", "30", "м"), ("Пропускная способность", "2.1", "м³/ч"),
    ("Частота вращения", "2860", "об/мин"), ("Диаметр отверстия", "25", "мм"),
    ("Напряжение", "160-220", "В")])
add(3, "auto", "1WZB-550", A, "Алюминий", [
    ("Модель", "1WZB", None), ("Мощность", "550", "Вт"),
    ("Максимальный напор", "42", "м"), ("Пропускная способность", "3", "м³/ч"),
    ("Частота вращения", "2860", "об/мин"), ("Высота всасывания", "8", "м"),
    ("Диаметр отверстия", "25", "мм"), ("Напряжение", "220", "В")])
add(4, "auto", "1WZB-750", A, "Алюминий", [
    ("Модель", "1WZB", None), ("Мощность", "750", "Вт"),
    ("Максимальный напор", "50", "м"), ("Пропускная способность", "3.5", "м³/ч"),
    ("Частота вращения", "2860", "об/мин"), ("Диаметр отверстия", "25", "мм"),
    ("Напряжение", "160-220", "В")])

# Модель: PW, Медный
for no, model, power, head, flow, amp in [
    (5, "PW 250", "250", "27", "2", "1.9"),
    (6, "PW 370", "370", "30", "2,2", "1.9"),
    (7, "PW 550", "550", "42", "2,2", "3.9"),
    (8, "PW 750", "750", "50", "3,4", "5.2"),
]:
    add(no, "auto", model, A, "Медный", [
        ("Модель", "PW", None), ("Мощность", power, "Вт"),
        ("Максимальный напор", head, "м"),
        ("Пропускная способность", flow, "м³/ч"),
        ("Частота вращения", "3000", "об/мин"),
        ("Высота всасывания", "8", "м"), ("Диаметр отверстия", "25", "мм"),
        ("Напряжение", "160-220", "В"), ("Ампераж", amp, "А")])

add(9, "auto", "PW 1100", A, "Медный", [
    ("Модель", "PW", None), ("Мощность", "1100", "Вт"),
    ("Максимальный напор", "55", "м"), ("Пропускная способность", "4,8", "м³/ч"),
    ("Частота вращения", "3000", "об/мин"), ("Высота всасывания", "8", "м"),
    ("Диаметр отверстия", "40", "мм"), ("Напряжение", "160-220", "В"),
    ("Ампераж", "6.9", "А")])

# Модель: Наружный насос, Медный
add(10, "auto_protected", "XP 300", A, "Медный", [
    ("Модель", "XP", None), ("Мощность", "300", "Вт"),
    ("Максимальный напор", "32", "м"),
    ("Пропускная способность", "34", "л/мин"),
    ("Частота вращения", "2850", "об/мин"), ("Высота всасывания", "8", "м"),
    ("Диаметр отверстия", "25", "мм"), ("Класс защиты", "термически", None),
    ("Напряжение", "220", "В"), ("Частота", "50", "Гц"),
    ("Бренд", "OCO", None)])

# Модель: SMART PUMP, Медный
add(11, "auto_smart", "WZB 300A", A, "Медный", [
    ("Модель", "SMART PUMP", None), ("Мощность", "300", "Вт"),
    ("Максимальный напор", "30", "м"), ("Пропускная способность", "2", "м³/ч"),
    ("Частота вращения", "3000", "об/мин"), ("Высота всасывания", "8", "м"),
    ("Диаметр отверстия", "25", "мм"), ("Класс защиты", "IP44", None),
    ("Напряжение", "220", "В"), ("Частота", "50", "Гц"), ("Бренд", "OCO", None)])
add(12, "auto_smart", "WZB 400A", A, "Медный", [
    ("Модель", "SMART PUMP", None), ("Мощность", "400", "Вт"),
    ("Максимальный напор", "35", "м"), ("Пропускная способность", "2", "м³/ч"),
    ("Частота вращения", "3000", "об/мин"), ("Высота всасывания", "8", "м"),
    ("Диаметр отверстия", "25", "мм"), ("Класс защиты", "IP44", None),
    ("Напряжение", "220", "В"), ("Частота", "50", "Гц"), ("Бренд", "OCO", None)])

# Модель: SMART PUMP, Алюминь
add(13, "auto_smart", "PW 250 SMART", A, "Алюминий", [
    ("Модель", "SMART PUMP", None), ("Мощность", "250", "Вт"),
    ("Максимальный напор", "27", "м"), ("Пропускная способность", "2", "м³/ч"),
    ("Частота вращения", "3000", "об/мин"), ("Высота всасывания", "8", "м"),
    ("Диаметр отверстия", "25", "мм"), ("Класс защиты", "IP44", None),
    ("Напряжение", "160-220", "В"), ("Частота", "50", "Гц"),
    ("Бренд", "OCO", None)])
add(14, "auto_smart", "PW 370 SMART", A, "Алюминий", [
    ("Модель", "SMART PUMP", None), ("Мощность", "370", "Вт"),
    ("Максимальный напор", "30", "м"), ("Пропускная способность", "2.2", "м³/ч"),
    ("Частота вращения", "3000", "об/мин"), ("Высота всасывания", "8", "м"),
    ("Диаметр отверстия", "25", "мм"), ("Класс защиты", "IP44", None),
    ("Напряжение", "160-220", "В"), ("Частота", "50", "Гц"),
    ("Бренд", "OCO", None)])

# --- 2. Погружные насосы (PDF 8-10) ---
for no, model, power, head, flow, ip, dia, volt in [
    (15, "QDX 1.5-12-0.25F", "250", "12", "1.5", "IP68", "25", "220"),
    (16, "QDX 1.5-16-0.37F", "370", "16", "1.5", "IP68", "25", "220"),
    (17, "QDX 15-17-0.55F", "550", "17", "15", "IP68", "50", "220"),
    (18, "QDX 30-6-0.75F", "750", "6", "30", "IP68", "80", "220"),
]:
    add(no, "submersible", model, S, "Медный", [
        ("Модель", "QDX", None), ("Мощность", power, "Вт"),
        ("Максимальный напор", head, "м"),
        ("Пропускная способность", flow, "м³/ч"),
        ("Частота вращения", "2860", "об/мин"), ("Класс защиты", ip, None),
        ("Диаметр отверстия", dia, "мм"), ("Напряжение", volt, "В"),
        ("Частота", "50", "Гц"), ("Бренд", "OCO", None)])

add(19, "submersible", "QDX 40-6-1.1", S, "Медный", [
    ("Модель", "QDX", None), ("Мощность", "1100", "Вт"),
    ("Максимальный напор", "12", "м"), ("Пропускная способность", "45", "м³/ч"),
    ("Частота вращения", "2860", "об/мин"), ("Класс защиты", "IP44", None),
    ("Диаметр отверстия", "80", "мм"), ("Напряжение", "160-220", "В"),
    ("Бренд", "OCO", None)])
add(20, "submersible", "QDX 100-12-3.5", S, "Медный", [
    ("Модель", "QDX", None), ("Мощность", "3500", "Вт"),
    ("Максимальный напор", "12", "м"), ("Пропускная способность", "100", "м³/ч"),
    ("Частота вращения", "2860", "об/мин"), ("Класс защиты", "IP44", None),
    ("Диаметр отверстия", "150", "мм"), ("Напряжение", "160-220", "В"),
    ("Бренд", "OCO", None)])
add(21, "submersible", "QDX 150-11-5.5", S, "Медный", [
    ("Модель", "QDX", None), ("Мощность", "5500", "Вт"),
    ("Максимальный напор", "11", "м"), ("Пропускная способность", "150", "м³/ч"),
    ("Частота вращения", "2860", "об/мин"), ("Класс защиты", "IP44", None),
    ("Диаметр отверстия", "200", "мм"), ("Напряжение", "160-220", "В")])

# QDX Алюминь
add(22, "submersible", "QDX 1.5-16-0.37", S, "Алюминий", [
    ("Модель", "QDX", None), ("Мощность", "370", "Вт"),
    ("Максимальный напор", "16", "м"), ("Пропускная способность", "1.5", "м³/ч"),
    ("Частота вращения", "2860", "об/мин"), ("Поплавок", "нет", None),
    ("Диаметр отверстия", "25", "мм"), ("Напряжение", "160-220", "В"),
    ("Частота", "50", "Гц"), ("Бренд", "OCO", None)])
add(23, "submersible", "QDX 1.5-32-1.1", S, "Алюминий", [
    ("Модель", "QDX", None), ("Мощность", "1100", "Вт"),
    ("Максимальный напор", "32", "м"), ("Пропускная способность", "1.5", "м³/ч"),
    ("Частота вращения", "2860", "об/мин"), ("Поплавок", "нет", None),
    ("Диаметр отверстия", "25", "мм"), ("Напряжение", "160-220", "В"),
    ("Частота", "50", "Гц"), ("Бренд", "OCO", None)])

# --- 3. Поверхностные насосы (PDF 11-13) ---
for no, model, material, power, head, flow, gross, net in [
    (24, "QB-60", "Алюминий", "370", "30", "30", "5,5", "5"),
    (25, "QB-60", "Медный", "370", "30", "30", "5,5", "5"),
    (26, "QB-70", "Медный", "750", "60", "60", "6,5", "6"),
]:
    add(no, "surface", model, V, material, [
        ("Модель", "QB", None), ("Мощность", power, "Вт"),
        ("Максимальный напор", head, "м"),
        ("Пропускная способность", flow, "л/мин"),
        ("Частота вращения", "2860", "об/мин"), ("Высота всасывания", "8", "м"),
        ("Диаметр отверстия", "25", "мм"), ("Вес брутто", gross, "кг"),
        ("Вес нетто", net, "кг"), ("Напряжение", "220", "В"),
        ("Частота", "50", "Гц"), ("Бренд", "OCO", None)])

for no, model, power, head, flow, net in [
    (27, "CPM 130", "370", "16", "80", "6.9"),
    (28, "CPM 146", "550", "25", "105", "10"),
    # Katalogda "Мощность,W 0,75" yozilgan - bu 0.75 kVt, ya'ni 750 Vt
    (29, "CPM 158", "750", "30", "120", "11.5"),
]:
    add(no, "centrifugal", model, V, "Медный", [
        ("Модель", "CPM", None), ("Мощность", power, "Вт"),
        ("Максимальный напор", head, "м"),
        ("Пропускная способность", flow, "л/мин"),
        ("Частота вращения", "2850", "об/мин"), ("Высота всасывания", "8", "м"),
        ("Диаметр отверстия", "25", "мм"), ("Вес нетто", net, "кг"),
        ("Напряжение", "180-230", "В"), ("Частота", "50", "Гц"),
        ("Класс защиты", "IP44", None), ("Бренд", "OCO", None)])

for no, model, material, power, head, flow, current in [
    (30, "JET 750", "Алюминий", "750", "40", "90", "4,9"),
    (31, "JET 1100", "Алюминий", "1100", "51", "100", "6,5"),
    (32, "JET 750", "Медный", "750", "40", "90", "4,9"),
    (33, "JET 1100", "Медный", "1100", "51", "100", "6,5"),
]:
    add(no, "surface", model, V, material, [
        ("Модель", "JET", None), ("Мощность", power, "Вт"),
        ("Максимальный напор", head, "м"),
        ("Пропускная способность", flow, "л/мин"),
        ("Частота вращения", "2850", "об/мин"), ("Высота всасывания", "9", "м"),
        ("Диаметр отверстия", "25", "мм"), ("Напряжение", "220-240", "В"),
        ("Частота", "50", "Гц"), ("Электроток", current, "А"),
        ("Бренд", "OCO", None)])

add(34, "surface", "JET 1100A", V, "Медный", [
    ("Модель", "JET", None), ("Мощность", "1100", "Вт"),
    ("Максимальный напор", "51", "м"),
    ("Пропускная способность", "100", "л/мин"),
    ("Частота вращения", "2850", "об/мин"), ("Высота всасывания", "9", "м"),
    ("Диаметр отверстия", "25", "мм"), ("Напряжение", "220-240", "В"),
    ("Бренд", "OCO", None)])

# --- 4. Автоматические регуляторы (PDF 14) ---
add(35, "regulator", "EPC-1", R, None, [
    # Katalogda birinchi qatorning nomi yozilmagan, faqat "1,1" qiymati bor
    ("Мощность", "1,1", "кВт"),
    ("Максимальная температура", "60", "°C"), ("Давление", "1", "МПа"),
    ("Класс защиты", "IP65", None), ("Напряжение", "220-240", "В"),
    ("Частота", "50-60", "Гц"), ("Бренд", "OCO", None)])

# --- 5. Циркуляционные насосы (PDF 14-15) ---
for no, model, power, head, flow, port, weight in [
    (36, "RS 25-6-180", "46/67/97", "22/38/55", "3/5/6", "25", "2.8"),
    (37, "RS 32-6-180", "46/67/97", "22/38/55", "3/5/6", "50", "3.1"),
    (38, "RS 25-8-180", "150/200/248", "46/78/105", "3/5/8", "40", "5.1"),
    (39, "RS 32-8-180", "150/200/248", "46/78/105", "3/5/8", "50", "5.1"),
]:
    add(no, "circulation", model, C, None, [
        ("Модель", "RS", None), ("Мощность", power, "Вт"),
        ("Максимальный напор", head, "м"),
        # Katalogda "м3/мин" - 46-97 Vt nasos uchun imkonsiz, м³/ч to'g'ri
        ("Пропускная способность", flow, "м³/ч"),
        ("Дальность", "180", "м"),
        ("Входной / выходной штуцер", port, "мм"),
        ("Класс защиты", "IP44", None), ("Частота тока", "50", "Гц"),
        ("Напряжение сети", "220", "В"), ("Вес", weight, "кг"),
        ("Бренд", "OCO", None)])

for no, material in [(40, None), (41, "Латунь")]:
    attrs = [
        ("Модель", "LPS", None), ("Мощность", "120", "Вт"),
        ("Максимальный напор", "9", "м"),
        ("Пропускная способность", "30", "л/мин"),
        ("Входной / выходной штуцер", "15", "мм"),
        ("Температура", "110", "°C"), ("Напряжение", "160-220", "В"),
        ("Вес", "2.42", "кг"), ("Бренд", "OCO", None)]
    add(no, "recirculation", "LPS 15-9 Z", C, material, attrs)

# --- 6. Расширительный бак (PDF 16-17) ---
add(42, "tank", "Tank 8V", T, None, [
    ("Ёмкость", "8", "л"), ("Диаметр", '1"G (25mm)', None),
    ("Вес брутто", "2.02", "кг"), ("Вес нетто", "1.75", "кг"),
    ("Бренд", "OCO", None)])
add(43, "tank", "Tank 12V", T, None, [
    ("Ёмкость", "12", "л"), ("Максимальная давления", "10", "бар"),
    ("Диаметр", '1"G (25mm)', None), ("Температура", "0-99", "°C"),
    ("Мембрана", "EPDM", None), ("Вес брутто", "3.1", "кг"),
    ("Вес нетто", "3", "кг"), ("Бренд", "OCO", None)])
add(44, "tank", "Tank 19V", T, None, [
    ("Ёмкость", "8", "л"), ("Диаметр", '1"G (25mm)', None),
    ("Вес брутто", "3.5", "кг"), ("Вес нетто", "3", "кг"),
    ("Бренд", "OCO", None)])
add(45, "tank", "Tank 24V W", T, None, [
    ("Ёмкость", "24", "л"), ("Максимальная давления", "10", "бар"),
    ("Диаметр", '1"G (25mm)', None), ("Температура", "0-99", "°C"),
    ("Мембрана", "EPDM", None), ("Вес брутто", "3.7", "кг"),
    ("Вес нетто", "3.6", "кг"), ("Бренд", "OCO", None)])
add(46, "tank", "Tank 24V L", T, None, [
    ("Ёмкость", "24", "л"), ("Максимальная давления", "10", "бар"),
    ("Диаметр", '1"G (25mm)', None), ("Температура", "0-99", "°C"),
    ("Мембрана", "EPDM", None), ("Вес брутто", "3.7", "кг"),
    ("Вес нетто", "3.6", "кг"), ("Бренд", "OCO", None)])
add(47, "tank", "Tank 36V", T, None, [
    ("Ёмкость", "36", "л"), ("Максимальная давления", "8", "бар"),
    ("Диаметр", '1"G (25mm)', None), ("Температура", "0-99", "°C"),
    ("Мембрана", "EPDM", None), ("Вес брутто", "7.4", "кг"),
    ("Вес нетто", "7", "кг"), ("Бренд", "OCO", None)])
add(48, "tank", "Tank 50V", T, None, [
    ("Ёмкость", "36", "л"), ("Максимальная давления", "8", "бар"),
    ("Диаметр", '1"G (25mm)', None), ("Температура", "0-99", "°C"),
    ("Мембрана", "EPDM", None), ("Вес брутто", "7.9", "кг"),
    ("Вес нетто", "7.5", "кг"), ("Бренд", "OCO", None)])

# --- 7. Инструменты (PDF 18) ---
for no, model, flow_volt in [(49, "MIG-300", "300"), (50, "MIG-400", "400")]:
    add(no, "welder", model, I, None, [
        ("Тип", "Инверторный Полуавтомат", None),
        ("Поддержание потока вольт", flow_volt, None),
        ("Электроток", "20-250", "А"),
        ("Электродная проволока", "0.8-1.0", "мм"),
        ("Частота тока", "50", "Гц"), ("Электрод", "1.6-3.2", "мм"),
        ("Напряжение", "220", "В"), ("Вес", "7.2", "кг"),
        ("Бренд", "OCO", None)])

for no, model, rpm in [(51, "YL90L-4", "1500"), (52, "YL90-L-2", "3000")]:
    add(no, "motor", model, I, None, [
        ("Мощность", "3", "кВт"), ("Скорость оборота", rpm, "об/мин"),
        ("Напряжение", "220", "В"), ("Частота тока", "50", "Гц"),
        ("Электроток", "13.0", "А"), ("Вес", "19", "кг")])

# --- 8. Стабилизаторы (PDF 19) ---
for no, model, power, amp, gross, net in [
    (53, "DNB-1000 VA", "1.000", "3.6", "2.5", "2.35"),
    (54, "DNB-2000 VA", "2.000", "7.2", "4.35", "4.15"),
]:
    add(no, "stabilizer", model, St, None, [
        ("Мощность", power, "VA"), ("Максимальный Ампераж", amp, "А"),
        ("Тип", "Релейный", None), ("Частота тока", "50", "Гц"),
        ("Мин. входное напряжение", "100-260", "В"),
        ("Выходное напряжение", "220", "В"), ("Погрешность ±", "10", "%"),
        ("Вес брутто", gross, "кг"), ("Вес нетто", net, "кг"),
        ("Бренд", "OCO", None)])

# ---------------------------------------------------------------------------
# Generatsiya
# ---------------------------------------------------------------------------

TRANSLIT = {
    "а": "a", "б": "b", "в": "v", "г": "g", "д": "d", "е": "e", "ё": "yo",
    "ж": "j", "з": "z", "и": "i", "й": "y", "к": "k", "л": "l", "м": "m",
    "н": "n", "о": "o", "п": "p", "р": "r", "с": "s", "т": "t", "у": "u",
    "ф": "f", "х": "h", "ц": "ts", "ч": "ch", "ш": "sh", "щ": "sch",
    "ъ": "", "ы": "y", "ь": "", "э": "e", "ю": "yu", "я": "ya",
}


def slugify(text):
    text = text.lower()
    out = []
    for ch in text:
        if ch in TRANSLIT:
            out.append(TRANSLIT[ch])
        elif ch.isalnum() and ch.isascii():
            out.append(ch)
        else:
            out.append("-")
    slug = "".join(out)
    slug = unicodedata.normalize("NFKD", slug)
    slug = re.sub(r"[^a-z0-9]+", "-", slug).strip("-")
    return re.sub(r"-{2,}", "-", slug)


def loc(uz, ru, en):
    return {"uz": uz, "ru": ru, "en": en}


def build_attribute(key, value, unit):
    key_uz, key_en = KEYS[key]
    val_uz, val_en = VALUES.get(value, (value, value))
    attribute = {
        "key": loc(key_uz, key, key_en),
        "value": loc(val_uz, value, val_en),
    }
    if unit:
        unit_uz, unit_en = UNITS[unit]
        attribute["unit"] = loc(unit_uz, unit, unit_en)
    return attribute


def build_product(item):
    type_uz, type_ru, type_en = TYPES[item["kind"]]
    desc_uz, desc_ru, desc_en = DESCRIPTIONS[item["kind"]]
    model = item["model"]

    if item["material"]:
        m_uz, m_ru, m_en = MATERIAL_SUFFIX[item["material"]]
        name = loc(
            f"{type_uz} {model} ({m_uz})",
            f"{type_ru} {model} ({m_ru})",
            f"{type_en} {model} ({m_en})",
        )
        desc = loc(
            f"{desc_uz} Korpusi - {m_uz}.",
            f"{desc_ru} Корпус - {m_ru}.",
            f"{desc_en} Housing: {m_en}.",
        )
    else:
        name = loc(f"{type_uz} {model}", f"{type_ru} {model}", f"{type_en} {model}")
        desc = loc(desc_uz, desc_ru, desc_en)

    attrs = list(item["attrs"])
    if item["material"]:
        attrs.insert(1, ("Материал", item["material"], None))

    tags = sorted(
        {
            "oco",
            slugify(model),
            slugify(type_ru.split()[0]),
            *([slugify(item["material"])] if item["material"] else []),
        }
    )

    return {
        "catalog_no": item["no"],
        "name": name,
        "slug": slugify(name["ru"]),
        "sku": model.replace(" ", "-").upper(),
        "category": item["cat"],
        "brand": "OCO",
        "description": desc,
        "tags": tags,
        # Katalogda narx ko'rsatilmagan - hamma tovar kelishilgan narxda
        "price": 0,
        "price_on_request": True,
        "stock": 0,
        "images": [],
        "attributes": [build_attribute(*a) for a in attrs],
        "is_top": False,
        "is_featured": False,
    }


categories = [
    {
        "slug": slug,
        "name": loc(*names),
        "description": loc(*descs),
        "sort_order": order,
        "is_featured": featured,
    }
    for slug, names, descs, order, featured in CATEGORIES
]

products = [build_product(item) for item in P]

# Katalogda bir xil model ikki xil materialda uchraydi (QB-60 alyuminiy/mis,
# JET 750/1100, LPS 15-9 Z jez). SKU bazada unikal bo'lishi shart, shuning
# uchun bunday hollarda material kodi qo'shiladi.
MATERIAL_SKU = {"Алюминий": "AL", "Медный": "CU", "Латунь": "BR"}

sku_counts = {}
for item, product in zip(P, products):
    sku_counts[product["sku"]] = sku_counts.get(product["sku"], 0) + 1

for item, product in zip(P, products):
    if sku_counts[product["sku"]] > 1 and item["material"]:
        product["sku"] = f"{product['sku']}-{MATERIAL_SKU[item['material']]}"

# Slug unikalligi
seen = {}
for product in products:
    base = product["slug"]
    if base in seen:
        seen[base] += 1
        product["slug"] = f"{base}-{seen[base]}"
    else:
        seen[base] = 1

assert len(products) == 54, len(products)
assert len({p["slug"] for p in products}) == 54, "slug dublikat"
duplicates = {
    p["sku"] for p in products if [q["sku"] for q in products].count(p["sku"]) > 1
}
assert not duplicates, f"SKU dublikat: {duplicates}"

OUT.mkdir(parents=True, exist_ok=True)
(OUT / "categories.json").write_text(
    json.dumps(
        {
            "source": "Каталог 2026-III (ООО «OCO»), стр. 2 - Оглавление",
            "categories": categories,
        },
        ensure_ascii=False,
        indent=2,
    )
    + "\n",
    encoding="utf-8",
)
(OUT / "products.json").write_text(
    json.dumps(
        {
            "source": "Каталог 2026-III (ООО «OCO»), стр. 3-19",
            "brand": "OCO",
            "products": products,
        },
        ensure_ascii=False,
        indent=2,
    )
    + "\n",
    encoding="utf-8",
)

print(f"categories: {len(categories)}, products: {len(products)}")
skus = {}
for p in products:
    skus.setdefault(p["sku"], []).append(p["catalog_no"])
print("takrorlanuvchi SKU:", {k: v for k, v in skus.items() if len(v) > 1})
