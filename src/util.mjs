import { TEG } from "./config.mjs";

export const esc = (s) =>
  String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

export const fullName = (u) => [u.first_name, u.last_name].filter(Boolean).join(" ") || "Foydalanuvchi";

const reEsc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Captiondan teg, 'Kod: 123' va 'Janr: ...' qismlarini olib tashlaydi. */
export function tozala(text) {
  let t = (text || "").replace(new RegExp(reEsc(TEG), "gi"), "");
  t = t.replace(/(?:kod|code)\s*[:\-]?\s*\d+/gi, "");
  t = t.replace(/janr(?:lar)?\s*[:\-]\s*[^\n#]+/gi, "");
  return t.replace(/\n{3,}/g, "\n\n").trim();
}

export function koddan(text) {
  const m = /(?:kod|code)\s*[:\-]?\s*(\d{1,9})(?!\d)/i.exec(text || "");
  return m ? Number(m[1]) : null;
}

export function janrdan(text) {
  const m = /janr(?:lar)?\s*[:\-]\s*([^\n#]+)/i.exec(text || "");
  if (!m) return null;
  const s = m[1].trim();
  return (s.charAt(0).toUpperCase() + s.slice(1).toLowerCase()).slice(0, 20);
}

/** Kino kodi (1–9 xonali raqam) yoki null */
export const safeCode = (s) => (/^\d{1,9}$/.test(String(s).trim()) ? Number(String(s).trim()) : null);
/** Telegram ID (raqam) yoki null */
export const safeId = (s) => (/^\d{1,15}$/.test(String(s).trim()) ? Number(String(s).trim()) : null);

export function qisqa(text, n = 40) {
  const t = (text || "Nomsiz").trim().split("\n")[0];
  return t.length > n ? t.slice(0, n) + "…" : t;
}

/** Sana (Toshkent vaqti, UTC+5) */
export function sana(ts) {
  if (!ts) return "—";
  const d = new Date((Number(ts) + 5 * 3600) * 1000);
  const p = (n) => String(n).padStart(2, "0");
  return `${p(d.getUTCDate())}.${p(d.getUTCMonth() + 1)}.${d.getUTCFullYear()}`;
}

// parse_mode=HTML ni hamma xabarga avtomatik qo'yadi (aiogram'dagi DefaultBotProperties o'rniga)
const HTML_METHODS = new Set(["sendMessage", "editMessageText", "sendVideo", "sendDocument"]);
export function htmlTransformer(prev, method, payload, signal) {
  if (HTML_METHODS.has(method) && payload && !payload.parse_mode && !payload.entities && !payload.caption_entities) {
    payload = { ...payload, parse_mode: "HTML" };
  }
  return prev(method, payload, signal);
}
