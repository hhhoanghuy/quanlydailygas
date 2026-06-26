import { Bot, InlineKeyboard, type Context } from "grammy";
import type { Db } from "../db/index.js";
import {
  getUserByTelegramId,
} from "../services/auth.service.js";
import {
  createCustomer,
  getCustomerDetail,
  searchCustomerDebt,
  searchCustomers,
} from "../services/customer.service.js";
import { getStatsByDay, getStatsByEmployee, getStatsOrders } from "../services/stats.service.js";
import { createPayment } from "../services/payment.service.js";
import { clearSession, getSession, setSession, type CustomerDraft } from "./session.js";
import { tryActivateFromText } from "./activation.js";
import { handleOrderCallback, handleOrderText } from "./order-flow.js";
import { handleSettingsCallback, handleSettingsText } from "./settings-flow.js";
import { adminMenu, backMenu, employeeMenu, mainMenu, statsMenu } from "./keyboards.js";
import { replyMenuForUser } from "./menu-commands.js";
import { sendDashboardLink } from "./dashboard-link.js";
import { AppError, forbiddenError } from "../../utils/errors.js";
import { orderStatusText } from "../../utils/order-status.js";
import {
  customerPickButtonLabel,
  formatCustomerSearchLine,
} from "../../utils/customer-display.js";
import type { users } from "../db/schema.js";

type BotUser = typeof users.$inferSelect;

export function registerBotHandlers(bot: Bot, db: Db) {
  bot.on("callback_query:data", async (ctx) => {
    const data = ctx.callbackQuery.data;
    // Phải trả lời ngay — Telegram timeout ~10s
    await ctx.answerCallbackQuery().catch(() => {});

    const user = await requireUser(db, ctx.from.id);
    if (!user) {
      await ctx.reply(
        "❌ Chưa kích hoạt tài khoản.\n\nNhân viên: bấm link mã mời từ chủ đại lý hoặc gõ:\n/start <mã mời>",
      );
      return;
    }

  try {
    if (await handleOrderCallback(ctx, db, user, data)) return;
    if (await handleSettingsCallback(ctx, db, user, data)) return;
    await handleCallback(ctx, db, user, data);
    } catch (err) {
      await replyError(ctx, err);
    }
  });

  bot.on("message:text", async (ctx) => {
    if (ctx.message.text.startsWith("/")) return;

    const text = ctx.message.text.trim();
    const user = await requireUser(db, ctx.from.id);
    if (!user) {
      if (await tryActivateFromText(ctx, db, text)) return;
      await ctx.reply(
        "❌ Chưa kích hoạt.\n\nCách 1: Bấm link mã mời từ chủ đại lý\nCách 2: Gõ /start GAS-XXXXXXXX\nCách 3: Gửi mã GAS-XXXXXXXX",
      );
      return;
    }

    const session = getSession(ctx.from.id);

    try {
      await ctx.replyWithChatAction("typing");
      const handled = await handleText(ctx, db, user, session.step, text);
      if (!handled) {
        await replyUnknownInput(ctx, user, session.step);
      }
    } catch (err) {
      await replyError(ctx, err);
    }
  });

  bot.catch((err) => {
    console.error("Bot error:", err);
  });
}

async function handleCallback(
  ctx: Context,
  db: Db,
  user: BotUser,
  data: string,
): Promise<void> {
  if (await handleOrderCallback(ctx, db, user, data)) return;

  if (data === "menu") {
    clearSession(ctx.from!.id);
    await replyMenuForUser(ctx, user);
    return;
  }

  if (data === "team_menu") {
    requireOwner(user);
    await ctx.reply(
      [
        "👷 Quản lý nhân sự",
        "",
        "Đang triển khai (P3): danh sách NV, cập nhật, giao việc theo mã đơn.",
        "Tạm thời tạo mã mời NV: ⚙️ Cài đặt → 🔗 Mã mời NV",
        "Hoặc web dashboard → Đội ngũ",
      ].join("\n"),
      { reply_markup: backMenu() },
    );
    return;
  }

  if (data === "claim_orders") {
    if (user.role !== "employee") {
      await ctx.reply("❌ Chỉ nhân viên mới nhận đơn.", { reply_markup: adminMenu() });
      return;
    }
    await ctx.reply(
      [
        "📥 Nhận đơn",
        "",
        "Chỉ đơn chưa gán người giao — đang triển khai (P2).",
        "Hiện tại xem đơn đã gán cho bạn: 📋 Xem đơn.",
      ].join("\n"),
      { reply_markup: employeeMenu() },
    );
    return;
  }

  if (data === "debt_check") {
    setSession(ctx.from!.id, { step: "debt_phone" });
    const title = user.role === "employee" ? "💰 Kiểm tra công nợ" : "💰 Tra nợ";
    await ctx.reply(`${title}\nNhập tên, SĐT hoặc địa chỉ khách:`);
    return;
  }

  if (data === "payment_collect") {
    requireOwner(user);
    setSession(ctx.from!.id, { step: "payment_search" });
    await ctx.reply("💵 Thu nợ\nNhập tên, SĐT hoặc địa chỉ khách:");
    return;
  }

  if (data.startsWith("payment_pick:")) {
    requireOwner(user);
    const customerId = data.slice("payment_pick:".length);
    clearSession(ctx.from!.id);
    await startPaymentFlow(ctx, db, ctx.from!.id, customerId);
    return;
  }

  if (data.startsWith("debt_pick:")) {
    const customerId = data.slice("debt_pick:".length);
    clearSession(ctx.from!.id);
    await replyDebtCard(ctx, db, user, customerId);
    return;
  }

  if (data === "delivery_new") {
    if (user.role === "owner") {
      await handleOrderCallback(ctx, db, user, "order_new");
    } else {
      await handleOrderCallback(ctx, db, user, "orders_list");
    }
    return;
  }

  if (data === "search") {
    requireOwner(user);
    await ctx.reply("👤 Khách hàng — chọn thao tác:", { reply_markup: customersMenu() });
    return;
  }

  if (data === "stats") {
    requireOwner(user);
    await ctx.reply("📊 Thống kê — chọn loại:", { reply_markup: statsMenu() });
    return;
  }

  if (data === "stats_day") {
    requireOwner(user);
    const s = await getStatsByDay(db, new Date());
    const cyl = s.cylinders.length
      ? s.cylinders.map((c) => `· ${c.typeName}: giao ${c.cylindersOut} thu ${c.cylindersIn}`).join("\n")
      : "· Chưa có giao hàng";
    await ctx.reply(
      [
        `📅 ${s.date}`,
        `📦 Số đơn giao: ${s.orderCount}`,
        `💵 TM: ${s.cashRevenue.toLocaleString("vi-VN")}đ`,
        `🏦 CK: ${s.transferRevenue.toLocaleString("vi-VN")}đ`,
        `📒 Nợ thêm: ${s.debtAdded.toLocaleString("vi-VN")}đ`,
        "",
        "🛢 Theo loại bình:",
        cyl,
      ].join("\n"),
      { reply_markup: statsMenu() },
    );
    return;
  }

  if (data === "stats_employees") {
    requireOwner(user);
    const s = await getStatsByEmployee(db, new Date());
    if (!s.employees.length) {
      await ctx.reply(`👷 ${s.date}\nChưa có NV giao hàng hôm nay.`, { reply_markup: statsMenu() });
      return;
    }
    const lines = s.employees.map(
      (e) =>
        `· ${e.name}: ${e.deliveryCount} đơn | ${e.cylindersOut} bình giao | TM cầm ${e.cashHeld.toLocaleString("vi-VN")}đ`,
    );
    await ctx.reply(`👷 Theo NV — ${s.date}\n\n${lines.join("\n")}`, { reply_markup: statsMenu() });
    return;
  }

  if (data === "stats_web") {
    requireOwner(user);
    await sendDashboardLink(ctx, db, user);
    return;
  }

  if (data === "stats_orders") {
    requireOwner(user);
    const s = await getStatsOrders(db);
    const formatOrderLine = (o: {
      customerName: string;
      status: string;
      assignedEmployeeName: string | null;
    }) => {
      const nv = o.assignedEmployeeName ?? "chưa gán NV";
      return `· ${o.customerName} — ${orderStatusText(o.status, true)} — 👷 ${nv}`;
    };
    const open = s.openList.length
      ? s.openList.map(formatOrderLine).join("\n")
      : "· Không có";
    const done = s.completedList.length
      ? s.completedList.map(formatOrderLine).join("\n")
      : "· Không có";
    await ctx.reply(
      [
        "📋 Đơn hàng",
        `⏳ Chưa giao: ${s.notDelivered}`,
        `🚚 Đang giao: ${s.delivering}`,
        `✅ Đã giao: ${s.completed}`,
        `❌ Đã huỷ: ${s.cancelled}`,
        "",
        "Chưa hoàn thành:",
        open,
        "",
        "Đã giao gần đây:",
        done,
      ].join("\n"),
      { reply_markup: statsMenu() },
    );
    return;
  }


  if (data === "customers") {
    requireOwner(user);
    await ctx.reply("👤 Khách hàng — chọn thao tác:", {
      reply_markup: customersMenu(),
    });
    return;
  }

  if (data === "customer_add") {
    requireOwner(user);
    setSession(ctx.from!.id, { step: "customer_add" });
    await ctx.reply(
      "➕ Thêm khách mới\nGửi theo format:\n`Tên | SĐT | Địa chỉ`\n\nVD: `Phở Hoa | 0901234567 | 123 Lê Lợi`",
      { parse_mode: "Markdown", reply_markup: cancelCustomerMenu() },
    );
    return;
  }

  if (data === "customer_search") {
    requireOwner(user);
    setSession(ctx.from!.id, { step: "customer_search" });
    await ctx.reply("🔍 Tìm khách — gõ tên, SĐT hoặc địa chỉ:", {
      reply_markup: cancelCustomerMenu(),
    });
    return;
  }

  if (data === "customer_save") {
    requireOwner(user);
    const session = getSession(ctx.from!.id);
    if (!session.customerDraft) {
      await ctx.reply("⚠️ Phiên hết hạn — bấm ➕ Thêm khách lại", {
        reply_markup: customersMenu(),
      });
      return;
    }
    const c = await createCustomer(db, session.customerDraft);
    clearSession(ctx.from!.id);
    await ctx.reply(
      `✅ Thêm khách thành công!\n\n👤 ${c.name}\n📞 ${c.phone}\n📍 ${c.address}`,
      { reply_markup: customersMenu() },
    );
    return;
  }

  if (data === "customer_cancel") {
    clearSession(ctx.from!.id);
    await ctx.reply("❌ Đã huỷ thêm khách", { reply_markup: customersMenu() });
    return;
  }


  await ctx.reply("⚠️ Nút chưa hỗ trợ — bấm ◀️ Menu", { reply_markup: backMenu() });
}

async function handleText(
  ctx: Context,
  db: Db,
  user: BotUser,
  step: string,
  text: string,
): Promise<boolean> {
  const telegramId = ctx.from!.id;

  if (await handleOrderText(ctx, db, user, step, text)) return true;
  if (await handleSettingsText(ctx, db, user, step, text)) return true;

  if (
    (step === "idle" || step === "customer_add" || step === "customer_confirm") &&
    user.role === "owner" &&
    looksLikeCustomerAdd(text)
  ) {
    await showCustomerConfirm(ctx, telegramId, text);
    return true;
  }

  if (step === "debt_phone") {
    await processDebtSearch(ctx, db, telegramId, text, user);
    return true;
  }

  if (step === "payment_search") {
    requireOwner(user);
    await processPaymentSearch(ctx, db, telegramId, text);
    return true;
  }

  if (step === "payment_input") {
    requireOwner(user);
    await processPaymentInput(ctx, db, telegramId, text, user);
    return true;
  }

  if (step === "search_query" || step === "customer_search") {
    requireOwner(user);
    await processCustomerSearch(ctx, db, telegramId, text);
    return true;
  }

  if (step === "customer_add" || step === "customer_confirm") {
    requireOwner(user);
    await ctx.reply(
      "❌ Sai format.\nGửi đúng: `Tên | SĐT | Địa chỉ`\nVD: `Phở Hoa | 0901234567 | 123 Lê Lợi`",
      { parse_mode: "Markdown", reply_markup: cancelCustomerMenu() },
    );
    return true;
  }

  return false;
}

async function requireUser(db: Db, telegramUserId: number) {
  return getUserByTelegramId(db, telegramUserId);
}

function requireOwner(user: BotUser) {
  if (user.role !== "owner") throw forbiddenError("Chỉ chủ đại lý");
}

async function replyError(ctx: Context, err: unknown) {
  if (err instanceof AppError) {
    const detail = err.details?.map((d) => d.message).join(", ");
    const msg = detail ? `${err.message} (${detail})` : err.message;
    await ctx.reply(`❌ ${msg}`, { reply_markup: backMenu() });
    return;
  }
  console.error(err);
  await ctx.reply("❌ Lỗi hệ thống — thử lại hoặc /menu", { reply_markup: backMenu() });
}

async function replyUnknownInput(ctx: Context, user: BotUser, step: string) {
  const hints: Record<string, string> = {
    idle: "Bấm /menu để mở menu hoặc chọn nút bên dưới.",
    customer_add: "Gửi: Tên | SĐT | Địa chỉ",
    customer_confirm: "Bấm ✅ Lưu để xác nhận hoặc gửi lại thông tin khách.",
    customer_search: "Gõ tên, SĐT hoặc địa chỉ khách để tìm.",
    debt_phone: "Nhập tên, SĐT hoặc địa chỉ khách để tra nợ.",
    payment_search: "Nhập tên, SĐT hoặc địa chỉ khách để thu nợ.",
    payment_input: "Nhập: <số tiền> tm hoặc ck. VD: 500000 tm",
    order_customer_phone: "Nhập SĐT, tên hoặc địa chỉ khách để lên đơn.",
    order_line_qty: "Nhập số bình cần giao (VD: 4).",
    fulfill_compact:
      "Nhập: <vỏ thu> <tiền>vnd <tm|ck|no>. Dùng dấu cách hoặc -. VD ghi nợ: 4 3 0vnd no",
    settings_price_amount: "Nhập giá mới (VD: 350000).",
  };
  await ctx.reply(`⚠️ ${hints[step] ?? "Bấm /menu để quay lại"}`, {
    reply_markup: mainMenu(user.role),
  });
}

export { mainMenu, statsMenu, adminMenu, employeeMenu } from "./keyboards.js";

function customersMenu() {
  return new InlineKeyboard()
    .text("➕ Thêm khách", "customer_add")
    .text("🔍 Tìm khách", "customer_search")
    .row()
    .text("◀️ Menu", "menu");
}

function cancelCustomerMenu() {
  return new InlineKeyboard()
    .text("❌ Huỷ", "customer_cancel")
    .text("◀️ Menu", "menu");
}

function customerConfirmMenu() {
  return new InlineKeyboard()
    .text("✅ Lưu", "customer_save")
    .text("❌ Huỷ", "customer_cancel");
}

function looksLikeCustomerAdd(text: string): boolean {
  const draft = parseCustomerInput(text);
  return draft !== null;
}

function parseCustomerInput(text: string): CustomerDraft | null {
  if (!text.includes("|")) return null;
  const parts = text.split("|").map((s) => s.trim());
  if (parts.length < 3 || !parts[0] || !parts[1] || !parts[2]) return null;
  const digits = parts[1].replace(/\D/g, "");
  if (digits.length < 9) return null;
  return {
    name: parts[0],
    phone: parts[1],
    address: parts[2],
    customerType: parseCustomerType(parts[3]),
  };
}

async function showCustomerConfirm(ctx: Context, telegramId: number, text: string) {
  const draft = parseCustomerInput(text);
  if (!draft) {
    await ctx.reply(
      "❌ Sai format.\nGửi: `Tên | SĐT | Địa chỉ`\nVD: `Phở Hoa | 0901234567 | 123 Lê Lợi`",
      { parse_mode: "Markdown", reply_markup: cancelCustomerMenu() },
    );
    return;
  }

  setSession(telegramId, { step: "customer_confirm", customerDraft: draft });
  await ctx.reply(
    `📋 Xác nhận thêm khách?\n\n👤 ${draft.name}\n📞 ${draft.phone}\n📍 ${draft.address}`,
    { reply_markup: customerConfirmMenu() },
  );
}

function parseCustomerType(raw?: string): "household" | "restaurant" | "industrial" | undefined {
  if (!raw) return undefined;
  const t = raw.toLowerCase();
  if (t.includes("quán") || t.includes("quan")) return "restaurant";
  if (t.includes("cn") || t.includes("công nghiệp") || t.includes("cong nghiep")) {
    return "industrial";
  }
  if (t.includes("nhà") || t.includes("nha")) return "household";
  return undefined;
}

async function replyDebtCard(
  ctx: Context,
  db: Db,
  user: BotUser,
  customerId: string,
) {
  const { customer, debtBalance } = await getCustomerDetail(db, customerId);
  const kb = new InlineKeyboard();
  if (user.role === "owner") {
    kb.text("📞 Lên đơn", `order_for_customer:${customerId}`).row();
    kb.text("💵 Thu nợ", `payment_pick:${customerId}`).row();
  } else {
    kb.text("📋 Xem đơn", "orders_list").row();
  }
  kb.text("◀️ Menu", "menu");
  await ctx.reply(
    [
      `💰 ${customer.name}`,
      `SĐT: ${customer.phone}`,
      `📍 ${customer.address}`,
      `Đang nợ: ${debtBalance.toLocaleString("vi-VN")}đ`,
    ].join("\n"),
    { reply_markup: kb },
  );
}

async function processDebtSearch(
  ctx: Context,
  db: Db,
  telegramId: number,
  text: string,
  user: BotUser,
) {
  const results = await searchCustomerDebt(db, text);
  clearSession(telegramId);

  if (!results.length) {
    await ctx.reply(`❌ Không tìm thấy khách với "${text}"`, {
      reply_markup: backMenu(),
    });
    return;
  }

  if (results.length === 1) {
    await replyDebtCard(ctx, db, user, results[0].id);
    return;
  }

  const lines = results.map((c) =>
    formatCustomerSearchLine(c, ` (nợ ${c.debtBalance.toLocaleString("vi-VN")}đ)`),
  );
  const kb = new InlineKeyboard();
  for (const c of results) {
    kb.text(customerPickButtonLabel(c), `debt_pick:${c.id}`).row();
  }
  kb.text("◀️ Menu", "menu");

  await ctx.reply(
    `✅ Tìm thấy ${results.length} khách — nhấn để xem nợ:\n\n${lines.join("\n\n")}`,
    { reply_markup: kb },
  );
}

function parsePaymentInput(text: string): { amount: number; method: "cash" | "transfer" } | null {
  const normalized = text.trim().toLowerCase().replace(/,/g, "").replace(/\s+/g, " ");
  const m = normalized.match(/^(\d+)\s*(tm|ck)?$/);
  if (!m) return null;
  const amount = Number(m[1]);
  if (!Number.isFinite(amount) || amount <= 0) return null;
  const tag = m[2] ?? "tm";
  return { amount, method: tag === "ck" ? "transfer" : "cash" };
}

async function startPaymentFlow(
  ctx: Context,
  db: Db,
  telegramId: number,
  customerId: string,
) {
  const { customer, debtBalance } = await getCustomerDetail(db, customerId);
  setSession(telegramId, {
    step: "payment_input",
    paymentDraft: { customerId, customerName: customer.name },
  });
  await ctx.reply(
    [
      `💵 Thu nợ — ${customer.name}`,
      `Đang nợ: ${debtBalance.toLocaleString("vi-VN")}đ`,
      "",
      "Nhập: <số tiền> tm hoặc ck",
      "VD: 500000 tm",
      "VD: 300000 ck",
    ].join("\n"),
    { reply_markup: new InlineKeyboard().text("❌ Huỷ", "menu") },
  );
}

async function processPaymentSearch(
  ctx: Context,
  db: Db,
  telegramId: number,
  text: string,
) {
  const results = await searchCustomerDebt(db, text);
  clearSession(telegramId);

  if (!results.length) {
    await ctx.reply(`❌ Không tìm thấy khách với "${text}"`, { reply_markup: backMenu() });
    return;
  }

  if (results.length === 1) {
    await startPaymentFlow(ctx, db, telegramId, results[0].id);
    return;
  }

  const lines = results.map((c) =>
    formatCustomerSearchLine(c, ` (nợ ${c.debtBalance.toLocaleString("vi-VN")}đ)`),
  );
  const kb = new InlineKeyboard();
  for (const c of results) {
    kb.text(customerPickButtonLabel(c), `payment_pick:${c.id}`).row();
  }
  kb.text("◀️ Menu", "menu");

  await ctx.reply(
    `✅ Tìm thấy ${results.length} khách — chọn để thu nợ:\n\n${lines.join("\n\n")}`,
    { reply_markup: kb },
  );
}

async function processPaymentInput(
  ctx: Context,
  db: Db,
  telegramId: number,
  text: string,
  user: BotUser,
) {
  const session = getSession(telegramId);
  const draft = session.paymentDraft;
  if (!draft) {
    clearSession(telegramId);
    await ctx.reply("❌ Phiên thu nợ hết hạn — bấm 💵 Thu nợ trong menu.", {
      reply_markup: mainMenu(user.role),
    });
    return;
  }

  const parsed = parsePaymentInput(text);
  if (!parsed) {
    await ctx.reply("❌ Sai format. VD: 500000 tm hoặc 300000 ck", {
      reply_markup: new InlineKeyboard().text("❌ Huỷ", "menu"),
    });
    return;
  }

  const result = await createPayment(db, {
    customerId: draft.customerId,
    amount: parsed.amount,
    method: parsed.method,
    paidAt: new Date(),
  });

  clearSession(telegramId);

  const methodLabel = parsed.method === "transfer" ? "Chuyển khoản" : "Tiền mặt";
  await ctx.reply(
    [
      "✅ Đã ghi thu nợ",
      `👤 ${draft.customerName}`,
      `💵 ${parsed.amount.toLocaleString("vi-VN")}đ (${methodLabel})`,
      `💰 Còn nợ: ${result.debtBalance.toLocaleString("vi-VN")}đ`,
    ].join("\n"),
    { reply_markup: mainMenu(user.role) },
  );
}

async function processCustomerSearch(
  ctx: Context,
  db: Db,
  telegramId: number,
  text: string,
) {
  const results = await searchCustomers(db, text);
  clearSession(telegramId);
  if (!results.length) {
    await ctx.reply(`❌ Không tìm thấy khách với "${text}"`, {
      reply_markup: customersMenu(),
    });
    return;
  }

  const lines = await Promise.all(
    results.map(async (c) => {
      const debt = await getCustomerDetail(db, c.id);
      return formatCustomerSearchLine(
        c,
        ` (nợ ${debt.debtBalance.toLocaleString("vi-VN")}đ)`,
      );
    }),
  );

  const kb = new InlineKeyboard();
  for (const c of results) {
    kb.text(`📞 ${customerPickButtonLabel(c)}`, `order_for_customer:${c.id}`).row();
  }
  kb.text("◀️ Khách hàng", "customers");

  const header =
    results.length === 1
      ? "✅ Tìm thấy 1 khách"
      : `✅ Tìm thấy ${results.length} khách`;
  await ctx.reply(`${header} — nhấn tên khách để lên đơn:\n\n${lines.join("\n\n")}`, {
    reply_markup: kb,
  });
}
