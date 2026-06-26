import { InlineKeyboard, type Context } from "grammy";
import type { Db } from "../db/index.js";
import type { users } from "../db/schema.js";
import {
  getCustomerDetail,
  listCustomersForHub,
  searchCustomers,
  updateCustomer,
} from "../services/customer.service.js";
import { clearSession, getSession, setSession } from "./session.js";
import {
  customerPickButtonLabel,
  formatCustomerSearchLine,
} from "../../utils/customer-display.js";
import { AppError } from "../../utils/errors.js";
import {
  CUSTOMER_INPUT_FORMAT,
  parseCustomerInput,
} from "../../utils/customer-input.js";

type BotUser = typeof users.$inferSelect;

function customerHubButtonLabel(name: string, phone: string) {
  return `${name} · ${phone}`.slice(0, 64);
}

export async function showCustomersHub(ctx: Context, db: Db) {
  const list = await listCustomersForHub(db, 10);
  const kb = new InlineKeyboard();

  if (list.length) {
    for (const c of list) {
      kb.text(customerHubButtonLabel(c.name, c.phone), `customer_view:${c.id}`).row();
    }
  }

  kb.text("🔍 Tìm kiếm / Xem thêm", "customer_search").row();
  kb.text("➕ Thêm khách", "customer_add").row();
  kb.text("◀️ Menu", "menu");

  const header = list.length
    ? `👤 Khách hàng (${list.length} gần nhất)\nChọn khách:`
    : "👤 Chưa có khách — thêm mới hoặc tìm kiếm:";

  await ctx.reply(header, { reply_markup: kb });
}

export async function showCustomerDetail(
  ctx: Context,
  db: Db,
  customerId: string,
) {
  const { customer, debtBalance } = await getCustomerDetail(db, customerId);
  const kb = new InlineKeyboard()
    .text("📦 Tạo đơn", `order_for_customer:${customerId}`)
    .text("✏️ Cập nhật", `customer_edit:${customerId}`)
    .row()
    .text("◀️ Khách hàng", "customers");

  await ctx.reply(
    [
      `👤 ${customer.name}`,
      `📞 ${customer.phone}`,
      `📍 ${customer.address}`,
      `💰 Nợ: ${debtBalance.toLocaleString("vi-VN")}đ`,
    ].join("\n"),
    { reply_markup: kb },
  );
}

export async function handleCustomerFlowCallback(
  ctx: Context,
  db: Db,
  user: BotUser,
  data: string,
): Promise<boolean> {
  if (data === "customers") {
    await showCustomersHub(ctx, db);
    return true;
  }

  if (data.startsWith("customer_view:")) {
    await showCustomerDetail(ctx, db, data.slice("customer_view:".length));
    return true;
  }

  if (data.startsWith("customer_edit:")) {
    const customerId = data.slice("customer_edit:".length);
    const { customer } = await getCustomerDetail(db, customerId);
    setSession(ctx.from!.id, {
      step: "customer_edit",
      customerEditDraft: {
        customerId,
        name: customer.name,
        phone: customer.phone,
        address: customer.address,
      },
    });
    await ctx.reply(
      [
        `✏️ Cập nhật — ${customer.name}`,
        "",
        `Gửi: ${CUSTOMER_INPUT_FORMAT}`,
        `VD: ${customer.name} - ${customer.phone} - ${customer.address}`,
      ].join("\n"),
      { reply_markup: new InlineKeyboard().text("❌ Huỷ", `customer_view:${customerId}`) },
    );
    return true;
  }

  if (data === "customer_search") {
    setSession(ctx.from!.id, { step: "customer_search" });
    await ctx.reply("🔍 Nhập tên, SĐT hoặc địa chỉ khách:", {
      reply_markup: new InlineKeyboard().text("◀️ Khách hàng", "customers"),
    });
    return true;
  }

  return false;
}

export async function handleCustomerFlowText(
  ctx: Context,
  db: Db,
  step: string,
  text: string,
): Promise<boolean> {
  const telegramId = ctx.from!.id;
  const session = getSession(telegramId);

  if (step === "customer_search") {
    const results = await searchCustomers(db, text, 8);
    clearSession(telegramId);
    if (!results.length) {
      await ctx.reply(`❌ Không tìm thấy "${text}"`, {
        reply_markup: new InlineKeyboard().text("◀️ Khách hàng", "customers"),
      });
      return true;
    }
    const lines = await Promise.all(
      results.map(async (c) => {
        const d = await getCustomerDetail(db, c.id);
        return formatCustomerSearchLine(c, ` (nợ ${d.debtBalance.toLocaleString("vi-VN")}đ)`);
      }),
    );
    const kb = new InlineKeyboard();
    for (const c of results) {
      kb.text(customerPickButtonLabel(c), `customer_view:${c.id}`).row();
    }
    kb.text("◀️ Khách hàng", "customers");
    await ctx.reply(`🔍 Tìm thấy ${results.length} khách:\n\n${lines.join("\n\n")}`, {
      reply_markup: kb,
    });
    return true;
  }

  if (step === "customer_edit" && session.customerEditDraft) {
    const parsed = parseCustomerInput(text);
    if (!parsed) {
      await ctx.reply(`❌ Sai format. Gửi: ${CUSTOMER_INPUT_FORMAT}`);
      return true;
    }
    try {
      const id = session.customerEditDraft.customerId;
      await updateCustomer(db, id, {
        name: parsed.name,
        phone: parsed.phone,
        address: parsed.address,
      });
      clearSession(telegramId);
      await ctx.reply(`✅ Đã cập nhật khách: ${parsed.name}`, {
        reply_markup: new InlineKeyboard().text("◀️ Chi tiết", `customer_view:${id}`),
      });
    } catch (err) {
      const msg = err instanceof AppError ? err.message : "Lỗi cập nhật";
      await ctx.reply(`❌ ${msg}`);
    }
    return true;
  }

  return false;
}
