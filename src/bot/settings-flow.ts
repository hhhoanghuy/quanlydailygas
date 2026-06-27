import { InlineKeyboard, type Context } from "grammy";
import type { Db } from "../db/index.js";
import type { users } from "../db/schema.js";
import {
  formatPriceTable,
  getCurrentPrices,
  setCylinderPrice,
} from "../services/price-period.service.js";
import { createInviteCode, buildInviteDeepLink } from "../services/auth.service.js";
import { clearSession, getSession, setSession } from "./session.js";
import { forbiddenError } from "../../utils/errors.js";
import { isAdminRole } from "../../utils/auth-roles.js";
import { backMenu } from "./keyboards.js";

type BotUser = typeof users.$inferSelect;

function settingsMenu() {
  return new InlineKeyboard()
    .text("💰 Đơn giá", "settings_prices")
    .text("🔗 Mã mời NV", "settings_invite")
    .row()
    .text("◀️ Menu", "menu");
}

function priceTableMenu() {
  return new InlineKeyboard()
    .text("✏️ Thay đổi giá", "settings_prices_edit")
    .row()
    .text("◀️ Cài đặt", "settings")
    .text("📋 Menu", "menu");
}

function requireAdmin(user: BotUser) {
  if (!isAdminRole(user.role)) throw forbiddenError("Chỉ quản trị viên");
}

export async function handleSettingsCallback(
  ctx: Context,
  db: Db,
  user: BotUser,
  data: string,
): Promise<boolean> {
  if (data === "settings") {
    requireAdmin(user);
    clearSession(ctx.from!.id);
    await ctx.reply("⚙️ Cài đặt", { reply_markup: settingsMenu() });
    return true;
  }

  if (data === "settings_prices") {
    requireAdmin(user);
    clearSession(ctx.from!.id);
    await showPriceTable(ctx, db);
    return true;
  }

  if (data === "settings_prices_edit") {
    requireAdmin(user);
    await showPriceTypePicker(ctx, db);
    return true;
  }

  if (data.startsWith("settings_price_type:")) {
    requireAdmin(user);
    const typeId = data.slice("settings_price_type:".length);
    await pickPriceType(ctx, db, typeId);
    return true;
  }

  if (data === "settings_prices_cancel") {
    requireAdmin(user);
    clearSession(ctx.from!.id);
    await showPriceTable(ctx, db);
    return true;
  }

  if (data === "settings_invite") {
    requireAdmin(user);
    const invite = await createInviteCode(db, "employee", 72);
    const link = buildInviteDeepLink(invite.code);
    await ctx.reply(
      `🔗 Mã mời nhân viên\n\nMã: ${invite.code}\nLink (gửi cho NV — bấm để kích hoạt):\n${link}\n\nHoặc NV gõ: /start ${invite.code}`,
      { reply_markup: settingsMenu() },
    );
    return true;
  }

  return false;
}

export async function handleSettingsText(
  ctx: Context,
  db: Db,
  user: BotUser,
  step: string,
  text: string,
): Promise<boolean> {
  if (step === "settings_price_amount") {
    requireAdmin(user);
    await saveSinglePrice(ctx, db, text);
    return true;
  }
  return false;
}

async function showPriceTable(ctx: Context, db: Db) {
  const current = await getCurrentPrices(db);
  if (!current) {
    await ctx.reply("❌ Chưa có bảng giá — chạy npm run db:seed", {
      reply_markup: backMenu(),
    });
    return;
  }

  await ctx.reply(
    `💰 BẢNG GIÁ HIỆN TẠI\n\n${formatPriceTable(current.prices)}`,
    { reply_markup: priceTableMenu() },
  );
}

async function showPriceTypePicker(ctx: Context, db: Db) {
  const current = await getCurrentPrices(db);
  if (!current) {
    await ctx.reply("❌ Chưa có bảng giá — chạy npm run db:seed", {
      reply_markup: backMenu(),
    });
    return;
  }

  setSession(ctx.from!.id, { step: "idle" });

  const kb = new InlineKeyboard();
  for (const p of current.prices) {
    const label = `${p.name} — ${p.pricePerCylinder.toLocaleString("vi-VN")}đ`.slice(0, 60);
    kb.text(label, `settings_price_type:${p.cylinderTypeId}`).row();
  }
  kb.text("◀️ Xong", "settings_prices_cancel");

  await ctx.reply("✏️ Chọn loại bình cần đổi giá:", { reply_markup: kb });
}

async function pickPriceType(ctx: Context, db: Db, typeId: string) {
  const current = await getCurrentPrices(db);
  const picked = current?.prices.find((p) => p.cylinderTypeId === typeId);
  if (!picked) {
    await ctx.reply("❌ Loại bình không hợp lệ");
    return;
  }

  setSession(ctx.from!.id, {
    step: "settings_price_amount",
    priceEditDraft: {
      cylinderTypeId: picked.cylinderTypeId,
      cylinderName: picked.name,
    },
  });

  const kb = new InlineKeyboard()
    .text("❌ Huỷ", "settings_prices_edit")
    .text("◀️ Xong", "settings_prices_cancel");

  await ctx.reply(
    `💰 ${picked.name}\nGiá hiện tại: ${picked.pricePerCylinder.toLocaleString("vi-VN")}đ/bình\n\nNhập giá mới (VD: 350000 hoặc 350000vnd):`,
    { reply_markup: kb },
  );
}

async function saveSinglePrice(ctx: Context, db: Db, text: string) {
  const session = getSession(ctx.from!.id);
  if (!session.priceEditDraft) {
    await ctx.reply("⚠️ Phiên hết hạn — bấm ✏️ Thay đổi giá lại");
    return;
  }

  const price = Number(text.trim().toLowerCase().replace(/vnđ|vnd/g, "").replace(/\D/g, ""));
  if (!price || price <= 0) {
    await ctx.reply("❌ Giá không hợp lệ — nhập số (VD: 350000)");
    return;
  }

  const { cylinderTypeId, cylinderName } = session.priceEditDraft;
  await setCylinderPrice(db, cylinderTypeId, price);

  const kb = new InlineKeyboard()
    .text("✏️ Đổi loại khác", "settings_prices_edit")
    .row()
    .text("◀️ Xong", "settings_prices_cancel");

  await ctx.reply(
    `✅ Đã cập nhật ${cylinderName}: ${price.toLocaleString("vi-VN")}đ/bình`,
    { reply_markup: kb },
  );

  setSession(ctx.from!.id, { step: "idle" });
}
