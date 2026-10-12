// Bir martalik sozlash: https://SAYTINGIZ.netlify.app/setup?key=WEBHOOK_SECRET
// Jadvallarni yaratadi, webhookni ulaydi, buyruqlar ro'yxatini o'rnatadi.
import { Api } from "grammy";
import * as C from "../../src/config.mjs";
import { initSchema } from "../../src/db.mjs";
import { ADMIN_COMMANDS, COMMANDS } from "../../src/bot.mjs";

export default async (req) => {
  const url = new URL(req.url);
  if (!C.WEBHOOK_SECRET || url.searchParams.get("key") !== C.WEBHOOK_SECRET) {
    return new Response("Ruxsat yo'q (key noto'g'ri yoki WEBHOOK_SECRET kiritilmagan)", { status: 403 });
  }

  const res = {};
  const api = new Api(C.BOT_TOKEN);
  try {
    res.bot = "@" + (await api.getMe()).username;
    await initSchema();
    res.baza = "OK (jadvallar tayyor)";

    res.webhook = `${url.origin}/webhook`;
    await api.setWebhook(res.webhook, {
      secret_token: C.WEBHOOK_SECRET,
      allowed_updates: ["message", "callback_query", "channel_post"],
      drop_pending_updates: true,
    });
    await api.setMyCommands(COMMANDS);
    if (C.OWNER_ID) {
      await api.setMyCommands(ADMIN_COMMANDS, { scope: { type: "chat", chat_id: C.OWNER_ID } }).catch(() => {});
    } else res.ogohlantirish_owner = "OWNER_ID kiritilmagan!";

    if (C.KINO_KANAL_ID > 0) res.ogohlantirish_kanal = "KINO_KANAL_ID manfiy bo'lishi kerak (-100... bilan boshlanadi)!";
    try {
      const ch = await api.getChat(C.KINO_KANAL_ID);
      res.kino_kanal = "OK: " + (ch.title || ch.id);
    } catch (e) {
      res.kino_kanal = "XATO: " + e.message + " (ID to'g'rimi va bot kanalda adminmi?)";
    }
    res.ok = true;
  } catch (e) {
    res.ok = false;
    res.xato = e.message;
  }
  return Response.json(res, { status: res.ok ? 200 : 500 });
};

export const config = { path: "/setup" };
