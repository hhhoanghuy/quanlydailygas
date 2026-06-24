import { validationError } from "../../utils/errors.js";

/** Username bot Telegram — cấu hình qua TELEGRAM_BOT_USERNAME trong .env (không có @) */
export function getBotUsername(): string {
  const raw = process.env.TELEGRAM_BOT_USERNAME?.trim();
  if (!raw) {
    throw validationError(
      "Thiếu TELEGRAM_BOT_USERNAME trong .env (VD: quanlydailygas_bot)",
    );
  }
  return raw.replace(/^@/, "");
}

/** URL công khai của server — dùng cho magic link & webhook */
export function getPublicBaseUrl(): string {
  const raw = process.env.PUBLIC_BASE_URL?.trim();
  if (raw) return raw.replace(/\/$/, "");
  const port = process.env.PORT ?? "3000";
  return `http://localhost:${port}`;
}

export function getWebhookUrl(): string | undefined {
  const explicit = process.env.WEBHOOK_URL?.trim();
  if (explicit) return explicit;
  if (process.env.NODE_ENV === "production") {
    return `${getPublicBaseUrl()}/telegram/webhook`;
  }
  return undefined;
}
