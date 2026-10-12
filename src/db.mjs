// Ma'lumotlar bazasi: Postgres (Neon). SQLite Netlify'da saqlanmaydi (serverless), shuning uchun tashqi baza kerak.
import { neon } from "@neondatabase/serverless";
import { OWNER_ID } from "./config.mjs";
import { fullName } from "./util.mjs";

let _sql;
const q = (text, params = []) => (_sql ??= neon(process.env.DATABASE_URL)).query(text, params);
const one = async (text, params = []) => (await q(text, params))[0] ?? null;
export const now = () => Math.floor(Date.now() / 1000);

const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS users(
     id BIGINT PRIMARY KEY, ism TEXT, username TEXT, qoshilgan BIGINT,
     banned INTEGER DEFAULT 0, ref_by BIGINT)`,
  `CREATE TABLE IF NOT EXISTS movies(
     code INTEGER PRIMARY KEY, file_id TEXT, tur TEXT, caption TEXT,
     views INTEGER DEFAULT 0, qoshilgan BIGINT, janr TEXT)`,
  `CREATE TABLE IF NOT EXISTS channels(
     id SERIAL PRIMARY KEY, chat_id TEXT, nomi TEXT, link TEXT)`,
  `CREATE TABLE IF NOT EXISTS admins(id BIGINT PRIMARY KEY)`,
  `CREATE TABLE IF NOT EXISTS favs(
     uid BIGINT, code INTEGER, ts BIGINT, PRIMARY KEY(uid, code))`,
  `CREATE TABLE IF NOT EXISTS settings(k TEXT PRIMARY KEY, v TEXT)`,
  `CREATE TABLE IF NOT EXISTS states(uid BIGINT PRIMARY KEY, state TEXT, data JSONB)`,
  `CREATE INDEX IF NOT EXISTS movies_views_idx ON movies(views DESC)`,
];
export async function initSchema() {
  for (const s of SCHEMA) await q(s);
}

// ── sozlamalar
export async function getSetting(k, d = "") {
  const r = await one("SELECT v FROM settings WHERE k=$1", [k]);
  return r ? r.v : d;
}
export const setSetting = (k, v) =>
  q("INSERT INTO settings(k,v) VALUES($1,$2) ON CONFLICT (k) DO UPDATE SET v=EXCLUDED.v", [k, v]);

// ── FSM holati (aiogram MemoryStorage o'rniga — serverless'da xotira saqlanmaydi)
export async function getState(uid) {
  const r = await one("SELECT state, data FROM states WHERE uid=$1", [uid]);
  return r ? { state: r.state, data: r.data || {} } : null;
}
export const setState = (uid, state, data = {}) =>
  q(`INSERT INTO states(uid,state,data) VALUES($1,$2,$3::jsonb)
     ON CONFLICT (uid) DO UPDATE SET state=EXCLUDED.state, data=EXCLUDED.data`,
    [uid, state, JSON.stringify(data)]);
export const clearState = (uid) => q("DELETE FROM states WHERE uid=$1", [uid]);

// ── foydalanuvchilar
export async function userAdd(u, ref = null) {
  const r = await q(
    `INSERT INTO users(id,ism,username,qoshilgan,ref_by) VALUES($1,$2,$3,$4,$5)
     ON CONFLICT (id) DO NOTHING RETURNING id`,
    [u.id, fullName(u), u.username ?? null, now(), ref]);
  return r.length > 0;
}
export const user = (uid) => one("SELECT * FROM users WHERE id=$1", [uid]);
export async function isBanned(uid) {
  const r = await one("SELECT banned FROM users WHERE id=$1", [uid]);
  return !!(r && r.banned);
}
export const setBan = (uid, val) => q("UPDATE users SET banned=$1 WHERE id=$2", [val, uid]);
export async function userIds() {
  return (await q("SELECT id FROM users WHERE banned=0")).map((r) => Number(r.id));
}
export async function refs(uid) {
  return (await one("SELECT COUNT(*)::int AS n FROM users WHERE ref_by=$1", [uid])).n;
}

// ── kinolar
export async function nextCode() {
  return (await one("SELECT COALESCE(MAX(code),0)+1 AS n FROM movies")).n;
}
export async function addMovie(code, fileId, tur, caption, janr = null) {
  code = code || (await nextCode());
  const r = await q(
    `INSERT INTO movies(code,file_id,tur,caption,janr,qoshilgan) VALUES($1,$2,$3,$4,$5,$6)
     ON CONFLICT (code) DO NOTHING RETURNING code`,
    [code, fileId, tur, caption, janr, now()]);
  return r.length ? r[0].code : null; // null — kod band
}
export const updateMovie = (code, caption, janr) =>
  q("UPDATE movies SET caption=$1, janr=COALESCE($2, janr) WHERE code=$3", [caption, janr, code]);
export const movie = (code) => one("SELECT * FROM movies WHERE code=$1", [code]);
export async function delMovie(code) {
  const r = await q("DELETE FROM movies WHERE code=$1 RETURNING code", [code]);
  await q("DELETE FROM favs WHERE code=$1", [code]);
  return r.length > 0;
}
export const view = (code) => q("UPDATE movies SET views=views+1 WHERE code=$1", [code]);
export function search(text) {
  const like = `%${text.replace(/[\\%_]/g, "\\$&")}%`;
  return q("SELECT code, caption FROM movies WHERE caption ILIKE $1 OR janr ILIKE $1 LIMIT 15", [like]);
}
export const top = (n = 10) => q("SELECT code, caption, views FROM movies ORDER BY views DESC LIMIT $1", [n]);
export const newest = (n = 10) =>
  q("SELECT code, caption FROM movies ORDER BY qoshilgan DESC, code DESC LIMIT $1", [n]);
export const random = () => one("SELECT * FROM movies ORDER BY RANDOM() LIMIT 1");
export const genres = () =>
  q(`SELECT janr, COUNT(*)::int AS n FROM movies WHERE janr IS NOT NULL AND janr<>''
     GROUP BY janr ORDER BY n DESC LIMIT 30`);
export const byGenre = (janr) =>
  q("SELECT code, caption FROM movies WHERE janr=$1 ORDER BY code DESC LIMIT 40", [janr]);
export const lastMovies = (n = 20) => q("SELECT code, caption FROM movies ORDER BY code DESC LIMIT $1", [n]);

// ── sevimlilar
export async function isFav(uid, code) {
  return !!(await one("SELECT 1 AS x FROM favs WHERE uid=$1 AND code=$2", [uid, code]));
}
export async function favToggle(uid, code) {
  if (await isFav(uid, code)) {
    await q("DELETE FROM favs WHERE uid=$1 AND code=$2", [uid, code]);
    return false;
  }
  await q("INSERT INTO favs(uid,code,ts) VALUES($1,$2,$3) ON CONFLICT DO NOTHING", [uid, code, now()]);
  return true;
}
export const favs = (uid) =>
  q(`SELECT m.code, m.caption FROM favs f JOIN movies m ON m.code=f.code
     WHERE f.uid=$1 ORDER BY f.ts DESC LIMIT 30`, [uid]);
export async function favCount(uid) {
  return (await one("SELECT COUNT(*)::int AS n FROM favs WHERE uid=$1", [uid])).n;
}

// ── kanallar
export const channels = () => q("SELECT * FROM channels ORDER BY id");
export const channelAdd = (chatId, nomi, link) =>
  q("INSERT INTO channels(chat_id,nomi,link) VALUES($1,$2,$3)", [chatId, nomi, link]);
export const channelDel = (id) => q("DELETE FROM channels WHERE id=$1", [id]);

// ── adminlar
export async function admins() {
  return (await q("SELECT id FROM admins")).map((r) => Number(r.id));
}
export const adminAdd = (uid) => q("INSERT INTO admins(id) VALUES($1) ON CONFLICT DO NOTHING", [uid]);
export const adminDel = (uid) => q("DELETE FROM admins WHERE id=$1", [uid]);
export async function isAdmin(uid) {
  return uid === OWNER_ID || (await admins()).includes(uid);
}

// ── statistika
export async function stats() {
  const t = now() + 5 * 3600; // Toshkent kuni boshlanishi
  const today = t - (t % 86400) - 5 * 3600;
  return one(
    `SELECT
       (SELECT COUNT(*) FROM users)::int AS users,
       (SELECT COUNT(*) FROM users WHERE qoshilgan>=$1)::int AS today,
       (SELECT COUNT(*) FROM users WHERE banned=1)::int AS banned,
       (SELECT COUNT(*) FROM movies)::int AS movies,
       (SELECT COALESCE(SUM(views),0) FROM movies)::int AS views,
       (SELECT COUNT(*) FROM channels)::int AS channels,
       (SELECT COUNT(*) FROM favs)::int AS favs`, [today]);
}

// ── zaxira nusxa (SQLite fayli o'rniga JSON)
export async function dumpAll() {
  const out = {};
  for (const t of ["users", "movies", "channels", "admins", "favs", "settings"]) {
    out[t] = await q(`SELECT * FROM ${t}`);
  }
  return out;
}
