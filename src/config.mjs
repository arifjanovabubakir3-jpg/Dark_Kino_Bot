// ╔════════════════════════════════════════════════════════════╗
// ║  SOZLAMALAR — hammasi Netlify "Environment variables"da   ║
// ╚════════════════════════════════════════════════════════════╝
const env = (k, d = "") => (process.env[k] ?? d).trim();

export const BOT_TOKEN = env("BOT_TOKEN");
export const OWNER_ID = Number(env("OWNER_ID"));            // Bot egasining Telegram ID si
export const KINO_KANAL_ID = Number(env("KINO_KANAL_ID"));  // Kino kanali ID si (-100... bilan boshlanadi)
export const TEG = env("TEG", "#kino");                     // Shu teg yozilgan postlar avtomatik saqlanadi
export const HIMOYA = env("HIMOYA", "false") === "true";    // Boshlang'ich holat: kinoni forward/saqlab bo'lmasin
export const WEBHOOK_SECRET = env("WEBHOOK_SECRET");        // faqat harf, raqam, _ va -
