# 🎬 Kino bot — Netlify versiyasi

Eski `bot.py` (aiogram + SQLite + polling) Netlify uchun qayta yozildi:
**grammY + webhook + Postgres (Neon)**. Barcha imkoniyatlar saqlangan.

## Nega o'zgardi?
- Netlify doimiy ishlaydigan server emas — `polling` ishlamaydi, **webhook** ishlatiladi.
- Netlify'da fayl (SQLite) saqlanmaydi — baza tashqarida (**Neon Postgres**, bepul).
- FSM holatlari ham bazada saqlanadi.
- Zaxira nusxa endi `.json` fayl ko'rinishida keladi.

## O'rnatish
1. **Eski tokenni almashtiring!** `bot.py` ichidagi token oshkor bo'lgan.
   @BotFather → `/revoke` (yoki `/token`) → yangi token oling.
2. **Baza:** https://neon.tech da bepul loyiha oching → *Connection string* ni nusxalang (`DATABASE_URL`).
3. Bu papkani **GitHub** repozitoriyasiga yuklang.
4. Netlify → *Add new site → Import from Git* → shu repo. (Build sozlamalari `netlify.toml`da tayyor.)
5. Netlify → *Site configuration → Environment variables* ga `.env.example` dagi qiymatlarni kiriting:
   `BOT_TOKEN`, `OWNER_ID`, `KINO_KANAL_ID`, `DATABASE_URL`, `WEBHOOK_SECRET`
   (`WEBHOOK_SECRET` — o'zingiz o'ylab topgan uzun tasodifiy harf/raqam).
6. **Qayta deploy qiling** (o'zgaruvchilar kiritilgach).
7. Brauzerda oching: `https://SAYTINGIZ.netlify.app/setup?key=WEBHOOK_SECRET`
   — "ok": true chiqsa, bot tayyor.
8. Botni kino kanaliga va majburiy obuna kanallariga **admin** qiling.

> ⚠️ `KINO_KANAL_ID` kanal uchun **-100...** bilan boshlanadi (manfiy). Eski faylda musbat edi — shu sabab kanaldan avto-saqlash ishlamasdi. `/setup` sahifasi buni tekshirib beradi.

## Eslatma
- Xabar yuborish (broadcast) alohida fon funksiyasida ishlaydi (15 daqiqagacha).
- Netlify bepul tarifining limitlari bor: juda katta bot uchun yetmasligi mumkin.
- Eski `kino_bot.db` ma'lumotlari avtomatik ko'chmaydi (kerak bo'lsa, ko'chirish skripti yozish mumkin).
