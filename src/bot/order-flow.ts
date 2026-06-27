import { InlineKeyboard, type Context } from "grammy";
import type { Db } from "../db/index.js";
import type { users } from "../db/schema.js";
import {
  findCustomerByPhone,
  getCustomerDetail,
  searchCustomers,
} from "../services/customer.service.js";
import { listCylinderTypes } from "../services/price-period.service.js";
import {
  cancelDeliveryOrder,
  completeDeliveryOrder,
  createDeliveryOrder,
  getOrderDetail,
  listDeliveryWorkers,
  listPendingOrders,
  markOrderDelivering,
} from "../services/order.service.js";
import { notifyEmployeesNewOrder } from "../services/notify.service.js";
import { previewDelivery } from "../services/delivery.service.js";
import { ensureEmployeeId } from "../services/auth.service.js";
import { clearSession, getSession, setSession } from "./session.js";
import type { OrderDraft } from "./session.js";
import { orderStatusText } from "../../utils/order-status.js";
import {
  customerPickButtonLabel,
  formatCustomerConfirmLine,
  formatCustomerPickList,
} from "../../utils/customer-display.js";
import { AppError, forbiddenError } from "../../utils/errors.js";
import { isAdminRole } from "../../utils/auth-roles.js";
import { mainMenu } from "./keyboards.js";

type BotUser = typeof users.$inferSelect;

const ENABLE_CYLINDER_LEDGER = process.env.ENABLE_CYLINDER_LEDGER === "true";

export async function handleOrderCallback(
  ctx: Context,
  db: Db,
  user: BotUser,
  data: string,
): Promise<boolean> {
  if (data.startsWith("order_for_customer:")) {
    requireAdmin(user);
    const customerId = data.slice("order_for_customer:".length);
    const { customer } = await getCustomerDetail(db, customerId);
    setSession(ctx.from!.id, {
      step: "idle",
      orderDraft: {
        customerId: customer.id,
        customerName: customer.name,
        lines: [],
      },
    });
    await ctx.reply(formatCustomerConfirmLine(customer));
    await showOrderCylinderPicker(ctx, db, customer.name);
    return true;
  }

  if (data === "order_new") {
    requireAdmin(user);
    setSession(ctx.from!.id, { step: "order_customer_phone" });
    await ctx.reply("📞 Lên đơn mới\nNhập SĐT, tên hoặc địa chỉ khách:");
    return true;
  }

  if (data === "orders_list") {
    await showOrdersList(ctx, db, user);
    return true;
  }

  if (data === "order_cancel_draft") {
    clearSession(ctx.from!.id);
    await ctx.reply("❌ Đã huỷ lên đơn", { reply_markup: mainMenu(user.role) });
    return true;
  }

  if (data === "order_confirm_save") {
    requireAdmin(user);
    await promptEmployeeOrSaveOrder(ctx, db, user);
    return true;
  }

  if (data.startsWith("order_assign_emp:")) {
    requireAdmin(user);
    const employeeId = data.slice("order_assign_emp:".length);
    await finalizeOwnerOrder(ctx, db, user, employeeId);
    return true;
  }

  if (data.startsWith("order_pick_cust:")) {
    requireAdmin(user);
    const customerId = data.slice("order_pick_cust:".length);
    const { customer } = await getCustomerDetail(db, customerId);
    setSession(ctx.from!.id, {
      step: "idle",
      orderDraft: {
        customerId: customer.id,
        customerName: customer.name,
        lines: [],
      },
    });
    await ctx.reply(formatCustomerConfirmLine(customer));
    await showOrderCylinderPicker(ctx, db, customer.name);
    return true;
  }

  if (data.startsWith("pick_order_cyl:")) {
    requireAdmin(user);
    const typeId = data.slice("pick_order_cyl:".length);
    const session = getSession(ctx.from!.id);
    if (!session.orderDraft) {
      await ctx.reply("⚠️ Phiên hết hạn — bấm 📞 Lên đơn lại");
      return true;
    }
    const types = await listCylinderTypes(db);
    const type = types.find((t) => t.id === typeId);
    if (!type) {
      await ctx.reply("❌ Loại bình không hợp lệ");
      return true;
    }
    session.orderDraft.pendingTypeId = type.id;
    session.orderDraft.pendingTypeName = type.name;
    setSession(ctx.from!.id, { ...session, step: "order_line_qty" });
    await ctx.reply(`🛢 ${type.name}\nNhập số bình cần giao (VD: 4):`);
    return true;
  }

  if (data === "order_add_more") {
    requireAdmin(user);
    const session = getSession(ctx.from!.id);
    if (!session.orderDraft) return true;
    await showOrderCylinderPicker(ctx, db, session.orderDraft.customerName);
    return true;
  }

  if (data.startsWith("order_open:")) {
    const orderId = data.slice("order_open:".length);
    await showOrderDetail(ctx, db, orderId, user);
    return true;
  }

  if (data.startsWith("order_fulfill:")) {
    const orderId = data.slice("order_fulfill:".length);
    await startFulfillOrder(ctx, db, user, orderId);
    return true;
  }

  if (data === "fulfill_confirm") {
    await confirmFulfillOrder(ctx, db, user);
    return true;
  }

  if (data === "fulfill_cancel") {
    clearSession(ctx.from!.id);
    await ctx.reply("❌ Đã huỷ giao hàng", { reply_markup: mainMenu(user.role) });
    return true;
  }

  if (data.startsWith("order_cancel:")) {
    requireAdmin(user);
    const orderId = data.slice("order_cancel:".length);
    await cancelDeliveryOrder(db, orderId);
    await ctx.reply("❌ Đã huỷ đơn", { reply_markup: mainMenu(user.role) });
    return true;
  }

  return false;
}

export async function handleOrderText(
  ctx: Context,
  db: Db,
  user: BotUser,
  step: string,
  text: string,
): Promise<boolean> {
  if (step === "order_customer_phone") {
    requireAdmin(user);
    await pickCustomerForOrder(ctx, db, text);
    return true;
  }

  if (step === "order_line_qty") {
    requireAdmin(user);
    await addOrderLineQty(ctx, text);
    return true;
  }

  if (step === "fulfill_compact") {
    await enterFulfillCompact(ctx, db, user, text);
    return true;
  }

  return false;
}

function requireAdmin(user: BotUser) {
  if (!isAdminRole(user.role)) throw forbiddenError("Chỉ quản trị viên");
}

async function pickCustomerForOrder(ctx: Context, db: Db, query: string) {
  const telegramId = ctx.from!.id;
  const byPhone = await findCustomerByPhone(db, query);
  if (byPhone) {
    setSession(telegramId, {
      step: "idle",
      orderDraft: {
        customerId: byPhone.id,
        customerName: byPhone.name,
        lines: [],
      },
    });
    await ctx.reply(formatCustomerConfirmLine(byPhone));
    await showOrderCylinderPicker(ctx, db, byPhone.name);
    return;
  }

  const results = await searchCustomers(db, query, 5);
  if (!results.length) {
    await ctx.reply("❌ Không tìm thấy khách — thêm khách trước hoặc nhập lại");
    return;
  }
  if (results.length === 1) {
    const c = results[0];
    setSession(telegramId, {
      step: "idle",
      orderDraft: { customerId: c.id, customerName: c.name, lines: [] },
    });
    await ctx.reply(formatCustomerConfirmLine(c));
    await showOrderCylinderPicker(ctx, db, c.name);
    return;
  }

  const kb = new InlineKeyboard();
  for (const c of results) {
    kb.text(`📞 ${customerPickButtonLabel(c)}`, `order_for_customer:${c.id}`).row();
  }
  kb.text("❌ Huỷ", "order_cancel_draft");
  await ctx.reply(`Chọn khách — nhấn để lên đơn:\n\n${formatCustomerPickList(results)}`, {
    reply_markup: kb,
  });
}

async function showOrderCylinderPicker(ctx: Context, db: Db, customerName: string) {
  const types = await listCylinderTypes(db);
  const kb = new InlineKeyboard();
  for (const t of types) {
    kb.text(t.name, `pick_order_cyl:${t.id}`).row();
  }
  kb.text("❌ Huỷ", "order_cancel_draft");
  await ctx.reply(`📞 ${customerName}\nChọn loại bình cần giao:`, { reply_markup: kb });
}

async function addOrderLineQty(ctx: Context, text: string) {
  const telegramId = ctx.from!.id;
  const session = getSession(telegramId);
  if (!session.orderDraft) return;

  const qty = Number(text.replace(/\D/g, ""));
  if (!qty || qty <= 0) {
    await ctx.reply("❌ Nhập số bình hợp lệ (VD: 4)");
    return;
  }

  const typeId = session.orderDraft.pendingTypeId;
  const typeName = session.orderDraft.pendingTypeName ?? "?";
  if (!typeId) {
    await ctx.reply("❌ Chọn loại bình trước");
    return;
  }

  session.orderDraft.lines.push({
    cylinderTypeId: typeId,
    cylinderName: typeName,
    cylindersOut: qty,
  });
  delete session.orderDraft.pendingTypeId;
  delete session.orderDraft.pendingTypeName;

  setSession(telegramId, { step: "idle", orderDraft: session.orderDraft });
  await showOrderConfirm(ctx, session.orderDraft);
}

async function showOrderConfirm(ctx: Context, draft: OrderDraft) {
  const lines = draft.lines
    .map((l) => `· ${l.cylinderName}: giao ${l.cylindersOut} bình`)
    .join("\n");
  const kb = new InlineKeyboard()
    .text("✅ Xác nhận lên đơn", "order_confirm_save")
    .row()
    .text("➕ Thêm loại bình", "order_add_more")
    .text("❌ Huỷ", "order_cancel_draft");
  await ctx.reply(
    `📋 Xác nhận đơn — ${draft.customerName}\n${lines}\n\nBấm ✅ để lên đơn — hệ thống tự gán người giao (hoặc chọn nếu có từ 2 người).`,
    { reply_markup: kb },
  );
}

async function promptEmployeeOrSaveOrder(ctx: Context, db: Db, user: BotUser) {
  const session = getSession(ctx.from!.id);
  if (!session.orderDraft?.lines.length) {
    await ctx.reply("❌ Đơn trống — bấm 📞 Lên đơn lại");
    return;
  }

  const workers = await listDeliveryWorkers(db);

  if (workers.length === 1) {
    await finalizeOwnerOrder(ctx, db, user, workers[0].employeeId);
    return;
  }

  const kb = new InlineKeyboard();
  for (const w of workers) {
    const label = w.isOwner ? `👑 ${w.name} (chủ)` : `👷 ${w.name}`;
    kb.text(label, `order_assign_emp:${w.employeeId}`).row();
  }
  kb.text("❌ Huỷ", "order_cancel_draft");
  await ctx.reply(
    `👷 Chọn người giao — ${session.orderDraft.customerName}\n\nChỉ người được chọn nhận thông báo đơn trên Telegram.`,
    { reply_markup: kb },
  );
}

async function finalizeOwnerOrder(
  ctx: Context,
  db: Db,
  user: BotUser,
  assignedEmployeeId?: string,
) {
  const session = getSession(ctx.from!.id);
  if (!session.orderDraft?.lines.length) {
    await ctx.reply("❌ Đơn trống — bấm 📞 Lên đơn lại");
    return;
  }

  const draft = session.orderDraft;
  try {
    const { order } = await createDeliveryOrder(db, {
      customerId: draft.customerId,
      createdByUserId: user.id,
      assignedEmployeeId,
      lines: draft.lines.map((l) => ({
        cylinderTypeId: l.cylinderTypeId,
        cylindersOut: l.cylindersOut,
      })),
    });

    await notifyEmployeesNewOrder(db, ctx.api, order.id);
    clearSession(ctx.from!.id);

    const summary = draft.lines.map((l) => `${l.cylinderName} ×${l.cylindersOut}`).join(", ");
    const assignee =
      assignedEmployeeId &&
      (await listDeliveryWorkers(db)).find(
        (w) => w.employeeId === assignedEmployeeId,
      )?.name;

    await ctx.reply(
      `✅ Đã lên đơn thành công!\n\n👤 ${draft.customerName}\n🛢 ${summary}\n👷 Người giao: ${assignee ?? "?"}`,
      { reply_markup: mainMenu(user.role) },
    );
  } catch (err) {
    console.error("finalizeOwnerOrder:", err);
    const msg = err instanceof Error ? err.message : "Lỗi lưu đơn";
    await ctx.reply(`❌ ${msg}`, { reply_markup: mainMenu(user.role) });
  }
}

async function showOrdersList(ctx: Context, db: Db, user: BotUser) {
  const orders = await listPendingOrders(
    db,
    user.role === "employee" && user.employeeId
      ? { employeeId: user.employeeId }
      : undefined,
  );
  if (!orders.length) {
    const msg =
      user.role === "employee"
        ? "📋 Không có đơn được giao cho bạn"
        : "📋 Không có đơn mở";
    await ctx.reply(msg, { reply_markup: mainMenu(user.role) });
    return;
  }

  const summaryText = orders
    .slice(0, 8)
    .map((o, i) => {
      const lines = [
        `${i + 1}. ${o.customerName} (${o.customerPhone})`,
        `📍 ${o.customerAddress}`,
        `🛢 ${o.lineSummary}`,
        `📌 ${orderStatusText(o.status)}`,
      ];
      if (isAdminRole(user.role)) {
        lines.push(`👷 ${o.assignedEmployeeName ?? "chưa gán người giao"}`);
      }
      return lines.join("\n");
    })
    .join("\n\n");

  const kb = new InlineKeyboard();
  for (const o of orders.slice(0, 10)) {
    const label = `${o.customerName} | ${o.customerPhone}`.slice(0, 60);
    kb.text(label, `order_open:${o.id}`).row();
  }
  kb.text("◀️ Menu", "menu");
  const listTitle = isAdminRole(user.role) ? "Đơn mở" : "Đơn cần giao";
  await ctx.reply(`📋 ${listTitle} (${orders.length})\n\n${summaryText}`, { reply_markup: kb });
}

async function showOrderDetail(
  ctx: Context,
  db: Db,
  orderId: string,
  user: BotUser,
) {
  const { order, lines } = await getOrderDetail(db, orderId);
  const lineText = lines
    .map((l) => `· ${l.typeName}: giao ${l.cylindersOut} bình`)
    .join("\n");

  const kb = new InlineKeyboard();
  const assigneeId =
    user.employeeId ?? (isAdminRole(user.role) ? await ensureEmployeeId(db, user) : null);
  const canFulfill =
    Boolean(assigneeId) &&
    (order.status === "pending" || order.status === "delivering") &&
    order.assignedEmployeeId === assigneeId;

  if (canFulfill) {
    kb.text("🚚 Giao hàng", `order_fulfill:${order.id}`).row();
  }
  if (isAdminRole(user.role) && (order.status === "pending" || order.status === "delivering")) {
    kb.text("❌ Huỷ đơn", `order_cancel:${order.id}`).row();
  }
  kb.text("◀️ Danh sách", "orders_list").text("📋 Menu", "menu");

  const assigneeLine = order.assignedEmployeeName
    ? `👷 Người giao: ${order.assignedEmployeeName}\n`
    : "⚠️ Chưa gán người giao — chủ cần huỷ và lên đơn lại\n";

  await ctx.reply(
    `📦 Đơn hàng\n\n👤 ${order.customerName}\n📞 ${order.customerPhone}\n📍 ${order.customerAddress}\n${assigneeLine}\n${lineText}\n\nTrạng thái: ${orderStatusText(order.status)}`,
    { reply_markup: kb },
  );
}

async function startFulfillOrder(
  ctx: Context,
  db: Db,
  user: BotUser,
  orderId: string,
) {
  if (!user.employeeId) {
    user.employeeId = await ensureEmployeeId(db, user);
  }
  const detail = await markOrderDelivering(db, orderId, user.employeeId!);

  const lineSummary = detail.lines
    .map((l, i) => `  ${i + 1}. ${l.typeName}: giao ${l.cylindersOut}`)
    .join("\n");

  const thuExample =
    detail.lines.length === 1 ? "3" : detail.lines.map(() => "3").join(" ");

  const capacities = detail.lines.map((l) => Number(l.capacityKg ?? 0));
  const gasEligibleCount = capacities.filter((c) => c >= 20).length;

  let gasHint: string;
  if (gasEligibleCount === 0) {
    gasHint = "Bình <20kg — không nhập gas dư.";
  } else if (gasEligibleCount === 1) {
    gasHint = "Gas dư (tuỳ chọn, bình ≥20kg): thêm số kg cuối dòng. VD: 3 800000vnd tm 5";
  } else {
    gasHint = [
      `Gas dư (tuỳ chọn): ${gasEligibleCount} dòng bình ≥20kg → nhập ${gasEligibleCount} số theo thứ tự các dòng đó`,
      "VD: 0 10 (không dư / 10kg) — bỏ qua nếu không có",
    ].join("\n");
  }

  const formatHint = [
    "Đơn đã có SL giao — chỉ nhập vỏ thu + tiền tổng:",
    "Cú pháp: <vỏ thu> <tiền>vnd <tm|ck|no> [- gas dư]",
    "Có thể dùng dấu cách hoặc dấu - giữa các phần",
    "tm = tiền mặt | ck = chuyển khoản | no = ghi nợ (không thu tiền)",
    "⚠️ Vỏ thu theo đúng thứ tự dòng đơn: dòng 1, dòng 2, dòng 3...",
    "",
    detail.lines.length === 1
      ? "VD thu tiền: 3 800000vnd tm"
      : `VD thu tiền: ${thuExample} 1500000vnd tm`,
    detail.lines.length === 1
      ? "VD ghi nợ: 3 0vnd no"
      : `VD ghi nợ: ${thuExample} 0vnd no`,
    "",
    gasHint,
  ].join("\n");

  setSession(ctx.from!.id, {
    step: "fulfill_compact",
    fulfillDraft: {
      orderId,
      customerId: detail.order.customerId,
      customerName: detail.order.customerName,
      lines: detail.lines.map((l) => ({
        cylinderTypeId: l.cylinderTypeId,
        cylinderName: l.typeName,
        cylindersOut: l.cylindersOut,
        capacityKg: Number(l.capacityKg ?? 0),
      })),
    },
  });

  await ctx.reply(`🚚 Giao hàng — ${detail.order.customerName}\n${lineSummary}\n\n${formatHint}`);
}

async function enterFulfillCompact(ctx: Context, db: Db, user: BotUser, text: string) {
  const session = getSession(ctx.from!.id);
  if (!session.fulfillDraft) return;
  const capacities = session.fulfillDraft.lines.map((l) => Number(l.capacityKg ?? 0));
  const parsed = parseFulfillInput(text, session.fulfillDraft.lines.length, capacities);
  if (!parsed.ok) {
    await ctx.reply(`❌ ${parsed.error}`);
    return;
  }

  if (!user.employeeId) {
    user.employeeId = await ensureEmployeeId(db, user);
  }

  const { cylindersIn, cashReceived, paymentMethod, gasSurplusKgByLine } = parsed;

  const pricing = await previewDelivery(db, {
    customerId: session.fulfillDraft.customerId,
    employeeId: user.employeeId,
    cashReceived,
    deliveredAt: new Date(),
    lines: session.fulfillDraft.lines.map((l, i) => ({
      cylinderTypeId: l.cylinderTypeId,
      cylindersOut: l.cylindersOut,
      cylindersIn: cylindersIn[i],
      gasSurplusKg: gasSurplusKgByLine[i],
    })),
    allowGasSurplus: true,
    enableCylinderLedger: ENABLE_CYLINDER_LEDGER,
  });

  session.fulfillDraft.cylindersIn = cylindersIn;
  session.fulfillDraft.gasSurplusKgByLine = gasSurplusKgByLine;
  session.fulfillDraft.paymentMethod =
    paymentMethod === "tm" ? "cash" : paymentMethod === "ck" ? "transfer" : undefined;
  session.fulfillDraft.note = `payment=${paymentMethod}`;
  session.fulfillDraft.cashReceived = cashReceived;
  session.fulfillDraft.preview = {
    orderAmount: pricing.orderAmount,
    debtAmount: pricing.debtAmount,
    cashReceived,
  };
  setSession(ctx.from!.id, { ...session, step: "idle" });

  const lineText = session.fulfillDraft.lines
    .map(
      (l, i) =>
        `· ${l.cylinderName}: giao ${l.cylindersOut} thu ${cylindersIn[i]}` +
        (gasSurplusKgByLine[i] > 0 ? ` | gas dư ${gasSurplusKgByLine[i]}kg` : ""),
    )
    .join("\n");

  const kb = new InlineKeyboard()
    .text("✅ Hoàn thành", "fulfill_confirm")
    .text("❌ Huỷ", "fulfill_cancel");

  await ctx.reply(
    `📦 Xác nhận giao — ${session.fulfillDraft.customerName}\n${lineText}\n\nThu: ${cashReceived.toLocaleString(
      "vi-VN",
    )}đ (${paymentLabel(paymentMethod)})\nTổng: ${pricing.orderAmount.toLocaleString("vi-VN")}đ\nNợ thêm: ${pricing.debtAmount.toLocaleString("vi-VN")}đ`,
    { reply_markup: kb },
  );
}

async function confirmFulfillOrder(ctx: Context, db: Db, user: BotUser) {
  const session = getSession(ctx.from!.id);
  if (!session.fulfillDraft?.cylindersIn || session.fulfillDraft.cashReceived === undefined) {
    await ctx.reply("⚠️ Phiên hết hạn");
    return;
  }

  if (!user.employeeId) {
    user.employeeId = await ensureEmployeeId(db, user);
  }

  try {
    const customerId = session.fulfillDraft.customerId;
    const customerName = session.fulfillDraft.customerName;

    const result = await completeDeliveryOrder(db, {
      orderId: session.fulfillDraft.orderId,
      employeeId: user.employeeId,
      cylindersInByLine: session.fulfillDraft.cylindersIn,
      gasSurplusKgByLine: session.fulfillDraft.gasSurplusKgByLine,
      cashReceived: session.fulfillDraft.cashReceived,
      note: session.fulfillDraft.note,
      allowGasSurplus: true,
      enableCylinderLedger: ENABLE_CYLINDER_LEDGER,
    });

    const summary = await buildFulfillSuccessMessage(db, customerId, customerName, result.pricing);

    clearSession(ctx.from!.id);
    await ctx.reply(summary, { reply_markup: mainMenu(user.role) });
  } catch (err) {
    const msg = err instanceof AppError ? err.message : err instanceof Error ? err.message : "Lỗi giao hàng";
    await ctx.reply(`❌ ${msg}`, { reply_markup: mainMenu(user.role) });
  }
}

type FulfillPaymentMethod = "tm" | "ck" | "no";

type ParsedFulfill =
  | {
      ok: true;
      cylindersIn: number[];
      cashReceived: number;
      paymentMethod: FulfillPaymentMethod;
      gasSurplusKgByLine: number[];
    }
  | { ok: false; error: string };

function paymentLabel(method: FulfillPaymentMethod) {
  if (method === "tm") return "tiền mặt";
  if (method === "ck") return "chuyển khoản";
  return "ghi nợ";
}

/** SL giao lấy từ đơn — NV nhập: <vỏ thu> <tiền>vnd <tm|ck|no> [gas dư] — gas dư chỉ bình ≥20kg */
function parseFulfillInput(
  text: string,
  lineCount: number,
  capacityKgByLine?: number[],
): ParsedFulfill {
  const tokens = tokenizeFulfillInput(text);
  const payIdx = tokens.findIndex((t) => t === "tm" || t === "ck" || t === "no");
  if (payIdx === -1) {
    return {
      ok: false,
      error: "Sai cú pháp. VD: 3 800000vnd tm hoặc 4 3 0vnd no",
    };
  }

  const paymentMethod = tokens[payIdx] as FulfillPaymentMethod;
  const beforePay = tokens.slice(0, payIdx);
  const afterPay = tokens.slice(payIdx + 1);

  if (beforePay.length !== lineCount + 1) {
    return {
      ok: false,
      error: `Cần ${lineCount} số vỏ thu + tiền trước ${paymentMethod}. VD: ${lineCount === 1 ? "3 0vnd no" : "4 3 0vnd no"}`,
    };
  }

  const thuTokens = beforePay.slice(0, lineCount);
  const cylindersIn = thuTokens.map((t) => Number(t));
  const cashReceived = Number(beforePay[lineCount].replace(/\D/g, ""));

  if (cylindersIn.some((n) => Number.isNaN(n) || n < 0)) {
    return { ok: false, error: "Số vỏ thu phải là số không âm" };
  }
  if (Number.isNaN(cashReceived) || cashReceived < 0) {
    return { ok: false, error: "Số tiền thu không hợp lệ — nhớ ghi vnd. VD: 800000vnd" };
  }
  if (paymentMethod === "no" && cashReceived !== 0) {
    return { ok: false, error: "Ghi nợ (no) phải nhập 0vnd. VD: 4 3 0vnd no" };
  }

  let gasSurplusKgByLine = new Array(lineCount).fill(0);
  const gasEligible =
    capacityKgByLine?.map((c) => c >= 20) ?? new Array(lineCount).fill(true);
  const gasEligibleCount = gasEligible.filter(Boolean).length;

  if (afterPay.length > 0) {
    if (gasEligibleCount === 0) {
      return { ok: false, error: "Đơn chỉ có bình <20kg — không nhập gas dư" };
    }
    let gasValues: number[];
    if (afterPay.length === 1 && gasEligibleCount === 1) {
      gasValues = [Number(afterPay[0])];
    } else if (afterPay.length === gasEligibleCount) {
      gasValues = afterPay.map((t) => Number(t));
    } else if (afterPay.length === lineCount && gasEligibleCount === lineCount) {
      gasValues = afterPay.map((t) => Number(t));
    } else {
      return {
        ok: false,
        error: `Gas dư: nhập ${gasEligibleCount} số cho bình ≥20kg (theo thứ tự dòng đó), hoặc bỏ qua`,
      };
    }
    if (gasValues.some((n) => Number.isNaN(n) || n < 0)) {
      return { ok: false, error: "Gas dư phải là số không âm" };
    }
    let gi = 0;
    for (let i = 0; i < lineCount; i++) {
      if (gasEligible[i]) {
        gasSurplusKgByLine[i] = gasValues[gi++];
      }
    }
  }

  return { ok: true, cylindersIn, cashReceived, paymentMethod, gasSurplusKgByLine };
}

function tokenizeFulfillInput(text: string): string[] {
  const normalized = text.trim().toLowerCase().replace(/vnđ|vnd/g, "");
  return normalized.split(/[\s-]+/).filter(Boolean);
}

async function buildFulfillSuccessMessage(
  db: Db,
  customerId: string,
  customerName: string,
  pricing: { orderAmount: number; cashReceived: number; debtAmount: number },
) {
  const { debtBalance, cylinderBalances } = await getCustomerDetail(
    db,
    customerId,
    ENABLE_CYLINDER_LEDGER,
  );

  const lines = [
    "✅ Hoàn thành giao hàng!",
    "",
    `👤 ${customerName}`,
    `Tổng đơn: ${pricing.orderAmount.toLocaleString("vi-VN")}đ`,
    `Thu lần này: ${pricing.cashReceived.toLocaleString("vi-VN")}đ`,
    `Nợ thêm lần này: ${pricing.debtAmount.toLocaleString("vi-VN")}đ`,
    `💰 Tổng nợ hiện tại: ${debtBalance.toLocaleString("vi-VN")}đ`,
  ];

  if (ENABLE_CYLINDER_LEDGER) {
    const holding = cylinderBalances.filter((c) => c.balance !== 0);
    lines.push("", "🛢 Vỏ khách đang giữ:");
    if (holding.length) {
      for (const c of holding) {
        lines.push(`· ${c.name}: ${c.balance} vỏ`);
      }
    } else {
      lines.push("· Không giữ vỏ");
    }
  }

  return lines.join("\n");
}
