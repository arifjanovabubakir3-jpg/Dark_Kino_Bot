// Xabar yuborish (broadcast) — Netlify "background function" (15 daqiqagacha ishlaydi).
// Faqat webhook funksiyasi (x-secret bilan) chaqira oladi.
import { Api, GrammyError } from "grammy";
import * as C from "../../src/config.mjs";
import * as D from "../../src/db.mjs";
import { htmlTransformer } from "../../src/util.mjs";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export default async (req) => {
  if (!C.WEBHOOK_SECRET || req.headers.get("x-secret") !== C.WEBHOOK_SECRET) {
    return new Response("Ruxsat yo'q", { status: 403 });
  }
  const { from_chat, message_id, info_id } = await req.json();
  const api = new Api(C.BOT_TOKEN);
  api.config.use(htmlTransformer);

  const ids = await D.userIds();
  const edit = (text) => api.editMessageText(from_chat, info_id, text).catch(() => {});

  const send = async (uid) => {
    try {
      await api.copyMessage(uid, from_chat, message_id);
      return true;
    } catch (e) {
      if (e instanceof GrammyError && e.error_code === 429) {
        await sleep(((e.parameters?.retry_after ?? 1) + 0.2) * 1000);
        try { await api.copyMessage(uid, from_chat, message_id); return true; } catch { return false; }
      }
      return false;
    }
  };

  let ok = 0, fail = 0;
  for (let i = 0; i < ids.length; i++) {
    if (await send(ids[i])) ok++; else fail++;
    await sleep(50);
    if ((i + 1) % 100 === 0) await edit(`⏳ Yuborilmoqda... (${i + 1}/${ids.length})`);
  }
  await edit(`✅ Xabar yuborish yakunlandi!\n\n📬 Yetkazildi: <b>${ok}</b>\n❌ Yetkazilmadi: <b>${fail}</b>`);
  return new Response("done");
};
