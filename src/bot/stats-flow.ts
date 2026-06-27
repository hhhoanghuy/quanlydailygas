import type { Context } from "grammy";
import type { Db } from "../db/index.js";
import {
  getStatsOverview,
  getStatsByEmployee,
  getStatsByCustomer,
  getStatsByMonth,
  getStatsByWeek,
} from "../services/stats.service.js";
import { statsDrilldownMenu } from "./keyboards.js";
import { sendDashboardLink } from "./dashboard-link.js";
import { isAdminRole, MAX_CO_OWNERS } from "../../utils/auth-roles.js";
import type { users } from "../db/schema.js";

type BotUser = typeof users.$inferSelect;

export async function showStatsOverview(ctx: Context, db: Db) {
  const o = await getStatsOverview(db);
  const text = [
    "📊 TỔNG QUAN",
    "",
    `👑 Chủ chính: ${o.primaryOwnerCount}`,
    `🛡 Quản trị viên: ${o.coOwnerCount}/${MAX_CO_OWNERS}`,
    `👷 Số nhân viên: ${o.employeeCount}`,
    `👤 Số khách hàng: ${o.customerCount}`,
    "",
    `📅 Doanh thu tháng ${o.monthLabel}:`,
    `   💵 ${o.monthRevenue.toLocaleString("vi-VN")}đ (TM ${o.monthCash.toLocaleString("vi-VN")} + CK ${o.monthTransfer.toLocaleString("vi-VN")})`,
    `   📦 ${o.monthOrderCount} đơn giao`,
    `   📒 Nợ phát sinh tháng: ${o.monthDebtAdded.toLocaleString("vi-VN")}đ`,
    "",
    `💰 Tổng công nợ hiện tại: ${o.totalDebt.toLocaleString("vi-VN")}đ`,
  ].join("\n");

  await ctx.reply(text, { reply_markup: statsDrilldownMenu() });
}

export async function handleStatsFlowCallback(
  ctx: Context,
  db: Db,
  user: BotUser,
  data: string,
): Promise<boolean> {
  if (data === "stats") {
    await showStatsOverview(ctx, db);
    return true;
  }

  if (data === "stats_employees") {
    const s = await getStatsByEmployee(db, new Date());
    if (!s.employees.length) {
      await ctx.reply(`👷 Hôm nay (${s.date})\nChưa có NV giao hàng.`, {
        reply_markup: statsDrilldownMenu(),
      });
      return true;
    }
    const lines = s.employees.map(
      (e) =>
        `· ${e.name}: ${e.deliveryCount} đơn | ${e.cylindersOut} bình | TM ${e.cashHeld.toLocaleString("vi-VN")}đ`,
    );
    await ctx.reply(`👷 Thống kê theo NV — ${s.date}\n\n${lines.join("\n")}`, {
      reply_markup: statsDrilldownMenu(),
    });
    return true;
  }

  if (data === "stats_customers") {
    const s = await getStatsByCustomer(db, new Date());
    if (!s.customers.length) {
      await ctx.reply(`👤 Tháng ${s.periodLabel}\nChưa có giao hàng theo khách.`, {
        reply_markup: statsDrilldownMenu(),
      });
      return true;
    }
    const lines = s.customers.map(
      (c, i) =>
        `${i + 1}. ${c.name} (${c.phone}): ${c.deliveryCount} đơn, ${c.cylindersOut} bình`,
    );
    await ctx.reply(`👤 Thống kê theo khách — tháng ${s.periodLabel}\n\n${lines.join("\n")}`, {
      reply_markup: statsDrilldownMenu(),
    });
    return true;
  }

  if (data === "stats_month") {
    const s = await getStatsByMonth(db, new Date());
    const cyl = s.cylinders.length
      ? s.cylinders.map((c) => `· ${c.typeName}: giao ${c.cylindersOut} thu ${c.cylindersIn}`).join("\n")
      : "· Chưa có";
    await ctx.reply(
      [
        `📅 Thống kê tháng ${s.date}`,
        `📦 ${s.orderCount} đơn giao`,
        `💵 TM: ${s.cashRevenue.toLocaleString("vi-VN")}đ`,
        `🏦 CK: ${s.transferRevenue.toLocaleString("vi-VN")}đ`,
        `📒 Nợ thêm: ${s.debtAdded.toLocaleString("vi-VN")}đ`,
        "",
        "🛢 Theo loại bình:",
        cyl,
      ].join("\n"),
      { reply_markup: statsDrilldownMenu() },
    );
    return true;
  }

  if (data === "stats_week") {
    const s = await getStatsByWeek(db, new Date());
    const cyl = s.cylinders.length
      ? s.cylinders.map((c) => `· ${c.typeName}: giao ${c.cylindersOut} thu ${c.cylindersIn}`).join("\n")
      : "· Chưa có";
    await ctx.reply(
      [
        `📅 Thống kê 7 ngày (${s.date})`,
        `📦 ${s.orderCount} đơn giao`,
        `💵 TM: ${s.cashRevenue.toLocaleString("vi-VN")}đ`,
        `🏦 CK: ${s.transferRevenue.toLocaleString("vi-VN")}đ`,
        `📒 Nợ thêm: ${s.debtAdded.toLocaleString("vi-VN")}đ`,
        "",
        "🛢 Theo loại bình:",
        cyl,
      ].join("\n"),
      { reply_markup: statsDrilldownMenu() },
    );
    return true;
  }

  if (data === "stats_web") {
    await sendDashboardLink(ctx, db, user);
    return true;
  }

  if (data === "stats_orders") {
    const { getStatsOrders } = await import("../services/stats.service.js");
    const { orderStatusText } = await import("../../utils/order-status.js");
    const { statsOrdersMenu } = await import("./keyboards.js");
    const s = await getStatsOrders(db);
    const fmt = (o: { customerName: string; status: string; assignedEmployeeName: string | null }) =>
      `· ${o.customerName} — ${orderStatusText(o.status, true)} — ${o.assignedEmployeeName ?? "chưa gán"}`;
    await ctx.reply(
      [
        "📋 Đơn hàng",
        `⏳ Chưa giao: ${s.notDelivered}`,
        `🚚 Đang giao: ${s.delivering}`,
        `✅ Hoàn thành: ${s.completed}`,
        "",
        "Chưa xong:",
        s.openList.length ? s.openList.map(fmt).join("\n") : "· Không có",
      ].join("\n"),
      { reply_markup: statsOrdersMenu() },
    );
    return true;
  }

  return false;
}
