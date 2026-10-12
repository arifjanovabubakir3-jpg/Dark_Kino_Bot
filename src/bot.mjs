// 🎬 KINO BOT v2 — Netlify versiyasi (grammY, webhook, Postgres) — to'liq o'zbek tilida
import { Bot, InlineKeyboard, InputFile, Keyboard } from "grammy";
import * as C from "./config.mjs";
import * as D from "./db.mjs";
import {
  esc, fullName, htmlTransformer, janrdan, koddan, qisqa, safeCode, safeId, sana, tozala,
} from "./util.mjs";

// ───────────────────────── MENYU TUGMALARI ─────────────────────────
const B_QIDIR = "🔎 Kino qidirish";
const B_RANDOM = "🎲 Tasodifiy kino";
const B_YANGI = "🆕 Yangi kinolar";
const B_TOP = "🏆 Top kinolar";
const B_JANR = "🎭 Janrlar";
const B_FAV = "❤️ Sevimlilar";
const B_ORDER = "🎞 Kino buyurtma";
const B_CONTACT = "📩 Adminga murojaat";
const B_PROFIL = "👤 Profilim";
const B_REF = "🤝 Do'st taklif qilish";
const B_HELP = "ℹ️ Yordam";
const B_ADMIN = "🛠 Admin panel";

const MENU_KEYS = {
  [B_QIDIR]: "qidir", [B_RANDOM]: "random", [B_YANGI]: "new", [B_TOP]: "top",
  [B_JANR]: "janr", [B_FAV]: "fav", [B_ORDER]: "order", [B_CONTACT]: "contact",
  [B_PROFIL]: "profil", [B_REF]: "ref", [B_HELP]: "help", [B_ADMIN]: "admin",
};

export const COMMANDS = [
  { command: "start", description: "🚀 Botni ishga tushirish" },
  { command: "menu", description: "📋 Asosiy menyu" },
  { command: "new", description: "🆕 Yangi kinolar" },
  { command: "top", description: "🏆 Top kinolar" },
  { command: "random", description: "🎲 Tasodifiy kino" },
  { command: "genres", description: "🎭 Janrlar" },
  { command: "fav", description: "❤️ Sevimlilar" },
  { command: "profile", description: "👤 Profilim" },
  { command: "help", description: "ℹ️ Yordam" },
];
export const ADMIN_COMMANDS = [...COMMANDS, { command: "admin", description: "🛠 Admin panel" }];

function asosiyMenu(admin) {
  const kb = new Keyboard()
    .text(B_QIDIR).text(B_RANDOM).row()
    .text(B_YANGI).text(B_TOP).row()
    .text(B_JANR).text(B_FAV).row()
    .text(B_ORDER).text(B_CONTACT).row()
    .text(B_PROFIL).text(B_REF).row()
    .text(B_HELP);
  if (admin) kb.row().text(B_ADMIN);
  return kb.resized().placeholder("Kino kodini yoki nomini yozing...");
}
const menuFor = async (uid) => asosiyMenu(await D.isAdmin(uid));

/** items: [{text, data}] yoki [{text, url}] — perRow ta tugmadan qatorlarga */
function kbGrid(items, perRow = 1) {
  const kb = new InlineKeyboard();
  items.forEach((it, i) => {
    if (it.url) kb.url(it.text, it.url); else kb.text(it.text, it.data);
    if ((i + 1) % perRow === 0 && i < items.length - 1) kb.row();
  });
  return kb;
}

// ───────────────────────── YORDAMCHI FUNKSIYALAR ─────────────────────────
const himoyaYoqilgan = async () => (await D.getSetting("himoya", C.HIMOYA ? "1" : "0")) === "1";
const obunaYoqilgan = async () => (await D.getSetting("obuna", "1")) === "1";

async function obunaTekshir(api, userId) {
  if (!(await obunaYoqilgan())) return [];
  const kanallar = await D.channels();
  const natija = await Promise.all(kanallar.map(async (ch) => {
    try {
      const cid = /^-?\d+$/.test(ch.chat_id) ? Number(ch.chat_id) : ch.chat_id;
      const m = await api.getChatMember(cid, userId);
      const yoq = m.status === "left" || m.status === "kicked" || (m.status === "restricted" && !m.is_member);
      return yoq ? ch : null;
    } catch (e) { // bot kanalda admin emas va hokazo
      console.warn("Obuna tekshirib bo'lmadi", ch.chat_id, e.message);
      return null;
    }
  }));
  return natija.filter(Boolean);
}

function obunaKb(kanallar) {
  const items = kanallar.map((ch, i) => ({ text: `📢 ${ch.nomi || "Kanal"} #${i + 1}`, url: ch.link }));
  items.push({ text: "✅ Obunani tekshirish", data: "check_sub" });
  return kbGrid(items, 1);
}

const OBUNA_MATNI =
  "👋 Botdan foydalanish uchun quyidagi kanallarga obuna bo'ling, " +
  "so'ng <b>«✅ Obunani tekshirish»</b> tugmasini bosing:";

/** Obuna tekshiruvi. Obuna bo'lmasa — xabar yuboradi va false qaytaradi. */
async function ruxsat(ctx, uid) {
  if (await D.isAdmin(uid)) return true;
  const yoq = await obunaTekshir(ctx.api, uid);
  if (yoq.length) {
    await ctx.reply(OBUNA_MATNI, { reply_markup: obunaKb(yoq) });
    return false;
  }
  return true;
}

function kinoKb(code, fav, me) {
  const link = `https://t.me/${me}?start=${code}`;
  const share = "https://t.me/share/url?url=" + encodeURIComponent(link) +
    "&text=" + encodeURIComponent("🎬 Ushbu kinoni ko'rib chiqing!");
  return kbGrid([
    { text: fav ? "💔 Sevimlilardan olish" : "❤️ Sevimlilarga qo'shish", data: `fav:${code}` },
    { text: "📤 Do'stga ulashish", url: share },
  ], 1);
}

function royxatKb(rows) {
  return kbGrid(rows.map((r) => ({
    text: `🎬 ${r.code} — ${qisqa(r.caption, 30)}${r.views !== undefined ? ` 👁${r.views}` : ""}`,
    data: `m:${r.code}`,
  })), 1);
}

async function kinoYubor(ctx, chatId, kino) {
  const me = ctx.me.username;
  let cap = esc((kino.caption || "").slice(0, 700));
  if (kino.janr) cap += `\n\n🎭 Janr: ${esc(kino.janr)}`;
  cap += `\n\n🔑 Kod: <code>${kino.code}</code>\n🤖 @${me}`;
  const other = {
    caption: cap,
    reply_markup: kinoKb(kino.code, await D.isFav(chatId, kino.code), me),
    protect_content: await himoyaYoqilgan(),
  };
  if (kino.tur === "video") await ctx.api.sendVideo(chatId, kino.file_id, other);
  else await ctx.api.sendDocument(chatId, kino.file_id, other);
  await D.view(kino.code);
}

async function kinoSorov(ctx, kod, uid) {
  if (!(await ruxsat(ctx, uid))) return;
  const kino = kod == null ? null : await D.movie(kod);
  if (!kino) {
    await ctx.reply("❌ Bunday kodli kino topilmadi.\nKodni to'g'ri yozganingizni tekshiring.");
    return;
  }
  await kinoYubor(ctx, ctx.chat.id, kino);
}

function panelKb(owner) {
  const items = [
    ["📊 Statistika", "adm:stat"], ["📨 Xabar yuborish", "adm:bc"],
    ["🎬 Kino qo'shish", "adm:addmovie"], ["✏️ Kino tahrirlash", "adm:edit"],
    ["🗑 Kino o'chirish", "adm:delmovie"], ["📋 Kinolar ro'yxati", "adm:list"],
    ["🏆 Top kinolar", "adm:top"], ["🔍 Foydalanuvchi ma'lumoti", "adm:uinfo"],
    ["➕ Kanal qo'shish", "adm:addch"], ["➖ Kanal o'chirish", "adm:delch"],
    ["🚫 Ban", "adm:ban"], ["✅ Unban", "adm:unban"],
    ["⚙️ Sozlamalar", "adm:set"],
  ];
  if (owner) items.push(["👤 Admin qo'shish", "adm:addadm"], ["❌ Admin o'chirish", "adm:deladm"],
    ["💾 Zaxira nusxa", "adm:backup"]);
  return kbGrid(items.map(([text, data]) => ({ text, data })), 2);
}

async function sozlamaKb() {
  const ob = (await obunaYoqilgan()) ? "✅ Yoqilgan" : "❌ O'chirilgan";
  const hm = (await himoyaYoqilgan()) ? "✅ Yoqilgan" : "❌ O'chirilgan";
  return kbGrid([
    { text: `📢 Majburiy obuna: ${ob}`, data: "set:obuna" },
    { text: `🔒 Kino himoyasi: ${hm}`, data: "set:himoya" },
  ], 1);
}

const YORDAM =
  "📖 <b>Qo'llanma</b>\n\n" +
  "🔎 Kino <b>kodini</b> yuboring (masalan: <code>25</code>) yoki <b>nomini</b> yozing.\n" +
  "🎲 Tasodifiy kino, 🆕 yangilari, 🏆 eng ko'p ko'rilganlari — menyudan tanlang.\n" +
  "🎭 Janr bo'yicha qidirish mumkin.\n" +
  "❤️ Yoqqan kinolarni sevimlilarga saqlang.\n" +
  "🎞 Topolmagan kinongizni buyurtma qiling.\n" +
  "📩 Savol va takliflar uchun adminga yozing.\n\n" +
  "Botdan foydalanish uchun homiy kanallarga obuna bo'lish shart.";

// ───────────────────────── MENYU AMALLARI ─────────────────────────
async function amal(ctx, key) {
  const uid = ctx.from.id;
  await D.clearState(uid);

  if (key === "menu") {
    await ctx.reply("📋 <b>Asosiy menyu</b> 👇", { reply_markup: await menuFor(uid) });
  } else if (key === "qidir") {
    await ctx.reply("🔎 Kino <b>kodini</b> yoki <b>nomini</b> yozib yuboring:");
  } else if (key === "random") {
    if (!(await ruxsat(ctx, uid))) return;
    const k = await D.random();
    if (!k) await ctx.reply("😔 Hozircha kinolar yo'q.");
    else {
      await ctx.reply("🎲 Sizga tasodifiy kino:");
      await kinoYubor(ctx, ctx.chat.id, k);
    }
  } else if (key === "new") {
    if (!(await ruxsat(ctx, uid))) return;
    const rows = await D.newest(10);
    if (!rows.length) await ctx.reply("😔 Hozircha kinolar yo'q.");
    else await ctx.reply("🆕 <b>Eng so'nggi kinolar:</b>", { reply_markup: royxatKb(rows) });
  } else if (key === "top") {
    if (!(await ruxsat(ctx, uid))) return;
    const rows = await D.top(10);
    if (!rows.length) await ctx.reply("😔 Hozircha kinolar yo'q.");
    else await ctx.reply("🏆 <b>Eng ko'p ko'rilgan kinolar:</b>", { reply_markup: royxatKb(rows) });
  } else if (key === "janr") {
    if (!(await ruxsat(ctx, uid))) return;
    const g = await D.genres();
    if (!g.length) { await ctx.reply("😔 Janrlar hali qo'shilmagan."); return; }
    await ctx.reply("🎭 <b>Janrni tanlang:</b>", {
      reply_markup: kbGrid(g.map((x) => ({ text: `🎭 ${x.janr} (${x.n})`, data: `gn:${x.janr}` })), 2),
    });
  } else if (key === "fav") {
    if (!(await ruxsat(ctx, uid))) return;
    const rows = await D.favs(uid);
    if (!rows.length) await ctx.reply("💔 Sevimlilar ro'yxati bo'sh.\nKino ostidagi «❤️» tugmasi orqali qo'shing.");
    else await ctx.reply("❤️ <b>Sevimli kinolaringiz:</b>", { reply_markup: royxatKb(rows) });
  } else if (key === "order") {
    await D.setState(uid, "contact", { tur: "order" });
    await ctx.reply("🎞 Qaysi kinoni xohlaysiz?\nNomini (imkon bo'lsa yili va tilini) yozib yuboring.\nBekor qilish: /cancel");
  } else if (key === "contact") {
    await D.setState(uid, "contact", { tur: "contact" });
    await ctx.reply("📩 Adminga xabaringizni yozing (matn, rasm, ovoz...).\nBekor qilish: /cancel");
  } else if (key === "profil") {
    const u = await D.user(uid);
    await ctx.reply(
      "👤 <b>Profilingiz</b>\n\n" +
      `🆔 ID: <code>${uid}</code>\n` +
      `📅 Qo'shilgan sana: <b>${u ? sana(u.qoshilgan) : "—"}</b>\n` +
      `❤️ Sevimlilar: <b>${await D.favCount(uid)}</b>\n` +
      `🤝 Taklif qilgan do'stlar: <b>${await D.refs(uid)}</b>`);
  } else if (key === "ref") {
    const link = `https://t.me/${ctx.me.username}?start=ref${uid}`;
    await ctx.reply(
      "🤝 <b>Do'stlaringizni taklif qiling!</b>\n\n" +
      `Sizning havolangiz:\n<code>${link}</code>\n\n` +
      `Hozirgacha taklif qilganlar: <b>${await D.refs(uid)}</b>`);
  } else if (key === "help") {
    await ctx.reply(YORDAM);
  } else if (key === "admin") {
    if (await D.isAdmin(uid)) await ctx.reply("🛠 <b>Admin panel</b>", { reply_markup: panelKb(uid === C.OWNER_ID) });
  }
}

// ───────────────────────── BOT ─────────────────────────
/** getOrigin — sayt manzili (broadcast fon funksiyasini chaqirish uchun) */
export function createBot(getOrigin) {
  const bot = new Bot(C.BOT_TOKEN);
  bot.api.config.use(htmlTransformer);
  bot.catch((err) => console.error("Xatolik:", err.error?.stack || err.error || err));

  // Ban middleware
  bot.use(async (ctx, next) => {
    const u = ctx.from;
    if (u && u.id !== C.OWNER_ID && (await D.isBanned(u.id))) return;
    await next();
  });

  bot.command("cancel", async (ctx) => {
    await D.clearState(ctx.from.id);
    await ctx.reply("❌ Amal bekor qilindi.", { reply_markup: await menuFor(ctx.from.id) });
  });

  bot.hears(Object.keys(MENU_KEYS), async (ctx) => {
    await D.userAdd(ctx.from);
    await amal(ctx, MENU_KEYS[ctx.message.text]);
  });

  bot.command(["menu", "top", "new", "random", "fav", "profile", "help", "genres", "admin", "panel"], async (ctx) => {
    await D.userAdd(ctx.from);
    const cmd = ctx.message.text.slice(1).split(/[\s@]/)[0].toLowerCase();
    const key = { profile: "profil", genres: "janr", panel: "admin" }[cmd] ?? cmd;
    await amal(ctx, key);
  });

  // ── KANALDAN AVTO-SAQLASH
  bot.on(["channel_post:video", "channel_post:document"], async (ctx) => {
    const post = ctx.channelPost;
    if (post.chat.id !== C.KINO_KANAL_ID) {
      console.log("Boshqa kanal posti e'tiborsiz qoldirildi:", post.chat.id);
      return;
    }
    const caption = post.caption || "";
    if (!caption.toLowerCase().includes(C.TEG.toLowerCase())) return; // teg yo'q

    const f = post.video ?? post.document;
    const tur = post.video ? "video" : "document";
    const janr = janrdan(caption);
    const saved = await D.addMovie(koddan(caption), f.file_id, tur, tozala(caption), janr);

    if (saved == null) {
      await ctx.api.sendMessage(C.OWNER_ID,
        `⚠️ Bu kod allaqachon band. Kino saqlanmadi:\n«${esc(qisqa(tozala(caption)))}»`);
      return;
    }

    try { // kanaldagi postga kodni yozib qo'yamiz (entity'lar saqlanadi)
      const base = `${caption}\n\n🔑 Kod: `;
      await ctx.api.editMessageCaption(post.chat.id, post.message_id, {
        caption: `${base}${saved} | 🤖 @${ctx.me.username}`,
        caption_entities: [
          ...(post.caption_entities || []),
          { type: "code", offset: base.length, length: String(saved).length },
        ],
      });
    } catch (e) {
      console.warn("Kanal captionini o'zgartirib bo'lmadi:", e.message);
    }

    const janrTxt = janr ? `\n🎭 Janr: ${esc(janr)}` : "";
    await ctx.api.sendMessage(C.OWNER_ID,
      `✅ Kino avtomatik saqlandi!\n🔑 Kod: <code>${saved}</code>\n🎬 ${esc(qisqa(tozala(caption)))}${janrTxt}`);
  });

  // ── /start
  bot.command("start", async (ctx) => {
    const u = ctx.from;
    await D.clearState(u.id);
    const arg = (ctx.match || "").trim();

    let ref = null;
    if (/^ref\d+$/.test(arg) && safeId(arg.slice(3)) && Number(arg.slice(3)) !== u.id) ref = Number(arg.slice(3));
    const yangi = await D.userAdd(u, ref);
    if (yangi && ref) {
      try {
        await ctx.api.sendMessage(ref, `🎉 Siz taklif qilgan <b>${esc(fullName(u))}</b> botga qo'shildi!`);
      } catch { /* ignore */ }
    }

    if (!(await ruxsat(ctx, u.id))) return;

    if (/^\d+$/.test(arg)) { // deep-link: t.me/bot?start=15
      await kinoSorov(ctx, safeCode(arg), u.id);
      await ctx.reply("📋 Menyu 👇", { reply_markup: await menuFor(u.id) });
      return;
    }

    await ctx.reply(
      `🎬 Assalomu alaykum, <b>${esc(u.first_name)}</b>!\n\n` +
      "Men kino botman. Kino <b>kodini</b> yuboring — men uni topib beraman.\n" +
      "Kodni bilmasangiz, <b>nomini</b> yozing yoki quyidagi menyudan tanlang 👇",
      { reply_markup: await menuFor(u.id) });
  });

  // ───────────────────────── CALLBACKLAR ─────────────────────────
  bot.callbackQuery("check_sub", async (ctx) => {
    const yoq = await obunaTekshir(ctx.api, ctx.from.id);
    if (yoq.length) {
      await ctx.answerCallbackQuery({ text: "❗ Hali hamma kanalga obuna bo'lmadingiz!", show_alert: true });
      return;
    }
    await ctx.answerCallbackQuery({ text: "✅ Rahmat!" });
    try { await ctx.editMessageText("✅ Obuna tasdiqlandi!"); } catch { /* ignore */ }
    await ctx.reply("Endi kino <b>kodini</b> yuboring yoki menyudan tanlang 🎬",
      { reply_markup: await menuFor(ctx.from.id) });
  });

  bot.callbackQuery(/^m:(\d{1,9})$/, async (ctx) => {
    await ctx.answerCallbackQuery();
    await kinoSorov(ctx, Number(ctx.match[1]), ctx.from.id);
  });

  bot.callbackQuery(/^gn:(.+)$/, async (ctx) => {
    await ctx.answerCallbackQuery();
    if (!(await ruxsat(ctx, ctx.from.id))) return;
    const janr = ctx.match[1];
    const rows = await D.byGenre(janr);
    if (!rows.length) { await ctx.reply("😔 Bu janrda kino topilmadi."); return; }
    await ctx.reply(`🎭 <b>${esc(janr)}</b> kinolari:`, { reply_markup: royxatKb(rows) });
  });

  bot.callbackQuery(/^fav:(\d{1,9})$/, async (ctx) => {
    const code = Number(ctx.match[1]);
    const qoshildi = await D.favToggle(ctx.from.id, code);
    await ctx.answerCallbackQuery({ text: qoshildi ? "❤️ Sevimlilarga qo'shildi" : "💔 Sevimlilardan olib tashlandi" });
    try {
      await ctx.editMessageReplyMarkup({ reply_markup: kinoKb(code, qoshildi, ctx.me.username) });
    } catch { /* ignore */ }
  });

  // ── Murojaat javobi (admin)
  bot.callbackQuery(/^rp:(\d+)$/, async (ctx) => {
    if (!(await D.isAdmin(ctx.from.id))) {
      await ctx.answerCallbackQuery({ text: "Ruxsat yo'q", show_alert: true });
      return;
    }
    await ctx.answerCallbackQuery();
    await D.setState(ctx.from.id, "reply", { to: Number(ctx.match[1]) });
    await ctx.reply("✉️ Javobingizni yuboring (matn, rasm, video...).\nBekor qilish: /cancel");
  });

  // ── Admin panel
  bot.callbackQuery(/^adm:(.+)$/, async (ctx) => {
    const uid = ctx.from.id;
    if (!(await D.isAdmin(uid))) {
      await ctx.answerCallbackQuery({ text: "Ruxsat yo'q", show_alert: true });
      return;
    }
    const act = ctx.match[1];
    await ctx.answerCallbackQuery();
    const say = (t, o) => ctx.reply(t, o);

    if (act === "stat") {
      const s = await D.stats();
      await say(
        "📊 <b>Statistika</b>\n\n" +
        `👥 Foydalanuvchilar: <b>${s.users}</b>\n` +
        `🆕 Bugun qo'shilgan: <b>${s.today}</b>\n` +
        `🚫 Banlanganlar: <b>${s.banned}</b>\n` +
        `🎬 Kinolar: <b>${s.movies}</b>\n` +
        `👁 Jami ko'rishlar: <b>${s.views}</b>\n` +
        `❤️ Sevimlilarga qo'shilganlar: <b>${s.favs}</b>\n` +
        `📢 Majburiy kanallar: <b>${s.channels}</b>`);
    } else if (act === "bc") {
      await D.setState(uid, "broadcast");
      await say("📨 Barcha foydalanuvchilarga yuboriladigan xabarni yuboring (matn, rasm, video...).\nBekor qilish: /cancel");
    } else if (act === "addmovie") {
      await D.setState(uid, "add_movie");
      await say(
        "🎬 Kinoni (video yoki fayl) yuboring.\nCaptionga nomini yozing. Ixtiyoriy:\n" +
        "<code>Kod: 25</code>\n<code>Janr: Jangari</code>\n\n" +
        "Kod yozmasangiz avtomatik beriladi.\nBekor qilish: /cancel");
    } else if (act === "edit") {
      await D.setState(uid, "edit_code");
      await say("✏️ Tahrirlanadigan kino kodini yuboring.\nBekor qilish: /cancel");
    } else if (act === "delmovie") {
      await D.setState(uid, "del_movie");
      await say("🗑 O'chiriladigan kino kodini yuboring.\nBekor qilish: /cancel");
    } else if (act === "list") {
      const rows = await D.lastMovies(20);
      if (!rows.length) await say("Kinolar yo'q.");
      else {
        const txt = rows.map((r) => `<code>${r.code}</code> — ${esc(qisqa(r.caption))}`).join("\n");
        await say(`📋 <b>Oxirgi 20 ta kino:</b>\n\n${txt}`);
      }
    } else if (act === "top") {
      const rows = await D.top(10);
      const txt = rows.map((r) => `<code>${r.code}</code> — ${esc(qisqa(r.caption))} (👁 ${r.views})`).join("\n") || "Yo'q";
      await say(`🏆 <b>Top kinolar:</b>\n\n${txt}`);
    } else if (act === "uinfo") {
      await D.setState(uid, "uinfo");
      await say("🔍 Foydalanuvchi ID sini yuboring.\nBekor qilish: /cancel");
    } else if (act === "addch") {
      await D.setState(uid, "add_channel");
      await say(
        "➕ Kanalni yuboring (bot kanalda <b>admin</b> bo'lishi shart):\n\n" +
        "• Ochiq kanal: <code>@kanal_username</code>\n" +
        "• Yopiq kanal: <code>-1001234567890 https://t.me/+invite_link</code>\n\nBekor qilish: /cancel");
    } else if (act === "delch") {
      const kanallar = await D.channels();
      if (!kanallar.length) { await say("Majburiy kanallar yo'q."); return; }
      await say("Qaysi kanalni o'chirasiz?", {
        reply_markup: kbGrid(kanallar.map((ch) => ({ text: `🗑 ${ch.nomi}`, data: `delch:${ch.id}` })), 1),
      });
    } else if (act === "ban") {
      await D.setState(uid, "ban");
      await say("🚫 Ban qilinadigan foydalanuvchi ID sini yuboring.\nBekor qilish: /cancel");
    } else if (act === "unban") {
      await D.setState(uid, "unban");
      await say("✅ Bandan chiqariladigan foydalanuvchi ID sini yuboring.\nBekor qilish: /cancel");
    } else if (act === "set") {
      await say("⚙️ <b>Sozlamalar</b>", { reply_markup: await sozlamaKb() });
    } else if (act === "addadm" && uid === C.OWNER_ID) {
      await D.setState(uid, "add_admin");
      await say("👤 Yangi admin ID sini yuboring.\nBekor qilish: /cancel");
    } else if (act === "deladm" && uid === C.OWNER_ID) {
      await D.setState(uid, "del_admin");
      const list = (await D.admins()).join(", ") || "yoq";
      await say(`❌ O'chiriladigan admin ID sini yuboring.\nHozirgi adminlar: ${list}\nBekor qilish: /cancel`);
    } else if (act === "backup" && uid === C.OWNER_ID) {
      const data = await D.dumpAll();
      const nom = `zaxira-${new Date().toISOString().slice(0, 16).replace(/[:T]/g, "-")}.json`;
      await ctx.replyWithDocument(new InputFile(Buffer.from(JSON.stringify(data, null, 1)), nom),
        { caption: `💾 Zaxira nusxa — ${sana(D.now())}` });
    }
  });

  bot.callbackQuery(/^set:(obuna|himoya)$/, async (ctx) => {
    if (!(await D.isAdmin(ctx.from.id))) {
      await ctx.answerCallbackQuery({ text: "Ruxsat yo'q", show_alert: true });
      return;
    }
    if (ctx.match[1] === "obuna") await D.setSetting("obuna", (await obunaYoqilgan()) ? "0" : "1");
    else await D.setSetting("himoya", (await himoyaYoqilgan()) ? "0" : "1");
    await ctx.answerCallbackQuery({ text: "Saqlandi ✅" });
    try { await ctx.editMessageReplyMarkup({ reply_markup: await sozlamaKb() }); } catch { /* ignore */ }
  });

  bot.callbackQuery(/^delch:(\d+)$/, async (ctx) => {
    if (!(await D.isAdmin(ctx.from.id))) return;
    await D.channelDel(Number(ctx.match[1]));
    await ctx.answerCallbackQuery({ text: "O'chirildi" });
    try { await ctx.editMessageText("✅ Kanal o'chirildi."); } catch { /* ignore */ }
  });

  // ───────────────────────── HOLATLI XABARLAR (FSM) + ODDIY MATN ─────────────────────────
  bot.on("message", async (ctx) => {
    const uid = ctx.from.id;
    const m = ctx.message;
    const text = m.text?.trim();
    const st = await D.getState(uid);

    // Holat yo'q: kod yoki qidiruv
    if (!st) {
      if (m.text && !m.text.startsWith("/")) await matn(ctx, text);
      return;
    }

    switch (st.state) {
      case "contact": { // murojaat / buyurtma
        await D.clearState(uid);
        const u = ctx.from;
        const sarlavha = st.data.tur === "order" ? "🎞 <b>Kino buyurtma</b>" : "📩 <b>Yangi murojaat</b>";
        const head = `${sarlavha}\n👤 ${esc(fullName(u))} (@${esc(u.username || "—")})\n🆔 <code>${u.id}</code>`;
        const kb = new InlineKeyboard().text("✉️ Javob berish", `rp:${u.id}`);
        const adminlar = new Set([C.OWNER_ID, ...(await D.admins())]);
        for (const a of adminlar) {
          try {
            await ctx.api.sendMessage(a, head);
            await ctx.api.copyMessage(a, m.chat.id, m.message_id, { reply_markup: kb });
          } catch { /* ignore */ }
        }
        await ctx.reply("✅ Yuborildi! Tez orada javob beramiz.", { reply_markup: await menuFor(uid) });
        return;
      }

      case "reply": { // admin javobi
        const to = st.data.to;
        await D.clearState(uid);
        try {
          await ctx.api.sendMessage(to, "📬 <b>Admindan javob:</b>");
          await ctx.api.copyMessage(to, m.chat.id, m.message_id);
          await ctx.reply("✅ Javob yuborildi.");
        } catch {
          await ctx.reply("❌ Yuborib bo'lmadi (foydalanuvchi botni bloklagan bo'lishi mumkin).");
        }
        return;
      }

      case "broadcast": {
        await D.clearState(uid);
        const ids = await D.userIds();
        const info = await ctx.reply(`⏳ Yuborilmoqda... (0/${ids.length})`);
        try {
          // Uzoq jarayon — Netlify "background function"da bajariladi (15 daqiqagacha)
          const r = await fetch(`${getOrigin()}/.netlify/functions/broadcast-background`, {
            method: "POST",
            headers: { "content-type": "application/json", "x-secret": C.WEBHOOK_SECRET },
            body: JSON.stringify({ from_chat: m.chat.id, message_id: m.message_id, info_id: info.message_id }),
          });
          if (!r.ok) throw new Error(`HTTP ${r.status}`);
        } catch (e) {
          console.error("Broadcast boshlanmadi:", e);
          await ctx.api.editMessageText(m.chat.id, info.message_id, "❌ Xabar yuborishni boshlab bo'lmadi.");
        }
        return;
      }

      case "add_movie": {
        const f = m.video ?? m.document;
        if (!f) { await ctx.reply("❗ Iltimos, video yoki fayl yuboring. Bekor qilish: /cancel"); return; }
        const cap = m.caption || "";
        const saved = await D.addMovie(koddan(cap), f.file_id, m.video ? "video" : "document", tozala(cap), janrdan(cap));
        await D.clearState(uid);
        if (saved == null) await ctx.reply("⚠️ Bu kod allaqachon band. Boshqa kod bilan urinib ko'ring.");
        else await ctx.reply(`✅ Kino saqlandi!\n🔑 Kod: <code>${saved}</code>`);
        return;
      }
    }

    // Quyidagi holatlar faqat matn qabul qiladi
    if (!text) return;

    switch (st.state) {
      case "edit_code": {
        const code = safeCode(text);
        if (code == null || !(await D.movie(code))) {
          await ctx.reply("❌ Bunday kodli kino topilmadi. Qayta yuboring yoki /cancel");
          return;
        }
        await D.setState(uid, "edit_text", { code });
        await ctx.reply("✏️ Yangi nomni yuboring. Janrni o'zgartirish uchun oxiriga <code>Janr: Komediya</code> deb yozing.");
        return;
      }
      case "edit_text": {
        const code = st.data.code;
        await D.clearState(uid);
        await D.updateMovie(code, tozala(text), janrdan(text));
        await ctx.reply(`✅ <code>${code}</code>-kino yangilandi.`);
        return;
      }
      case "del_movie": {
        if (!/^\d+$/.test(text)) { await ctx.reply("❗ Faqat raqam yuboring."); return; }
        await D.clearState(uid);
        const code = safeCode(text);
        const ok = code != null && (await D.delMovie(code));
        await ctx.reply(ok ? "✅ Kino o'chirildi." : "❌ Bunday kodli kino topilmadi.");
        return;
      }
      case "uinfo": {
        const id = safeId(text);
        if (id == null) { await ctx.reply("❗ Faqat ID raqam yuboring."); return; }
        await D.clearState(uid);
        const u = await D.user(id);
        if (!u) { await ctx.reply("❌ Bunday foydalanuvchi topilmadi."); return; }
        await ctx.reply(
          "🔍 <b>Foydalanuvchi</b>\n\n" +
          `👤 Ism: ${esc(u.ism || "—")}\n` +
          `🔗 Username: @${esc(u.username || "—")}\n` +
          `🆔 ID: <code>${u.id}</code>\n` +
          `📅 Qo'shilgan: ${sana(u.qoshilgan)}\n` +
          `🚫 Ban: ${u.banned ? "ha" : "yoq"}\n` +
          `❤️ Sevimlilar: ${await D.favCount(id)}\n` +
          `🤝 Taklif qilganlar: ${await D.refs(id)}`);
        return;
      }
      case "add_channel": {
        const parts = text.split(/\s+/);
        const cid = parts[0];
        let link = parts[1] || null;
        if (cid.startsWith("@")) link = link || `https://t.me/${cid.slice(1)}`;
        else if (!(link && /^-?\d+$/.test(cid))) {
          await ctx.reply("❗ Yopiq kanal uchun ID va havola kerak:\n<code>-1001234567890 https://t.me/+xxxx</code>");
          return;
        }
        let chat;
        try {
          chat = await ctx.api.getChat(/^-?\d+$/.test(cid) ? Number(cid) : cid);
        } catch {
          await ctx.reply("❌ Kanal topilmadi yoki bot kanalda admin emas. Tekshirib qayta yuboring.");
          return;
        }
        const nomi = chat.title || chat.username || cid;
        await D.channelAdd(cid, nomi, link);
        await D.clearState(uid);
        await ctx.reply(`✅ Majburiy obunaga qo'shildi: <b>${esc(nomi)}</b>`);
        return;
      }
      case "ban":
      case "unban": {
        const id = safeId(text);
        if (id == null) { await ctx.reply("❗ Faqat ID raqam yuboring."); return; }
        if (st.state === "ban") {
          if (id === C.OWNER_ID) { await ctx.reply("❌ Egani ban qilib bo'lmaydi."); return; }
          await D.setBan(id, 1);
          await D.clearState(uid);
          await ctx.reply(`🚫 <code>${id}</code> ban qilindi.`);
        } else {
          await D.setBan(id, 0);
          await D.clearState(uid);
          await ctx.reply(`✅ <code>${id}</code> bandan chiqarildi.`);
        }
        return;
      }
      case "add_admin":
      case "del_admin": {
        const id = safeId(text);
        if (uid !== C.OWNER_ID || id == null) { await ctx.reply("❗ Faqat ID raqam yuboring."); return; }
        if (st.state === "add_admin") {
          await D.adminAdd(id);
          await D.clearState(uid);
          await ctx.reply(`✅ <code>${id}</code> admin qilindi.`);
        } else {
          await D.adminDel(id);
          await D.clearState(uid);
          await ctx.reply(`✅ <code>${id}</code> adminlikdan olindi.`);
        }
        return;
      }
    }
  });

  // ── Oddiy matn: kod yoki qidiruv
  async function matn(ctx, t) {
    await D.userAdd(ctx.from);
    const uid = ctx.from.id;

    if (/^\d+$/.test(t)) { await kinoSorov(ctx, safeCode(t), uid); return; }

    if (t.length < 3) {
      await ctx.reply("🔎 Qidirish uchun kamida 3 ta harf yozing yoki kino kodini yuboring.");
      return;
    }
    if (!(await ruxsat(ctx, uid))) return;

    const res = await D.search(t);
    if (!res.length) {
      await ctx.reply("😔 Hech narsa topilmadi.\nBoshqa nom bilan urinib ko'ring yoki " +
        `«${B_ORDER}» orqali buyurtma bering.`);
      return;
    }
    await ctx.reply("🔎 <b>Qidiruv natijalari:</b>", { reply_markup: royxatKb(res) });
  }

  return bot;
}
