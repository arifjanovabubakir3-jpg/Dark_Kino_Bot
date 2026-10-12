// Telegram webhook: Telegram har bir yangilanishni shu manzilga yuboradi (/webhook)
import { webhookCallback } from "grammy";
import { createBot } from "../../src/bot.mjs";
import { WEBHOOK_SECRET } from "../../src/config.mjs";

let origin = "";
const bot = createBot(() => origin);
const handle = webhookCallback(bot, "std/http", { secretToken: WEBHOOK_SECRET });

export default async (req) => {
  origin = new URL(req.url).origin;
  return handle(req);
};

export const config = { path: "/webhook" };
