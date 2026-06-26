import { InlineKeyboard, type Context } from "grammy";
import type { Db } from "../db/index.js";
import type { users } from "../db/schema.js";
import { createInviteCode, buildInviteDeepLink } from "../services/auth.service.js";
import { listTeamMembers, updateEmployee } from "../services/employee.service.js";
import {
  assignOrderToEmployee,
  findOpenOrderByShortCode,
} from "../services/order.service.js";
import { notifyEmployeesNewOrder } from "../services/notify.service.js";
import { clearSession, getSession, setSession } from "./session.js";
import { backMenu } from "./keyboards.js";
import { AppError } from "../../utils/errors.js";

type BotUser = typeof users.$inferSelect;

function teamMemberButtonLabel(name: string, roleLabel: string) {
  return `${name} — ${roleLabel}`.slice(0, 64);
}

export async function showTeamList(ctx: Context, db: Db) {
  const team = await listTeamMembers(db);
  if (!team.length) {
    await ctx.reply("👷 Chưa có nhân sự.", { reply_markup: backMenu() });
    return;
  }

  const kb = new InlineKeyboard();
  for (const m of team) {
    kb.text(teamMemberButtonLabel(m.name, m.roleLabel), `team_member:${m.id}`).row();
  }
  kb.text("🔗 Tạo mã mời NV", "team_invite").row();
  kb.text("◀️ Menu", "menu");

  await ctx.reply("👷 Đội ngũ — chọn nhân sự:", { reply_markup: kb });
}

async function showTeamMemberDetail(ctx: Context, db: Db, employeeId: string) {
  const team = await listTeamMembers(db);
  const m = team.find((x) => x.id === employeeId);
  if (!m) {
    await ctx.reply("❌ Không tìm thấy nhân sự", { reply_markup: backMenu() });
    return;
  }

  const tg = m.hasTelegram
    ? m.telegramUsername
      ? `@${m.telegramUsername}`
      : "Đã kích hoạt Telegram"
    : "Chưa kích hoạt";

  const kb = new InlineKeyboard()
    .text("✏️ Cập nhật", `team_update:${m.id}`)
    .text("📋 Giao việc", `team_assign:${m.id}`)
    .row()
    .text("◀️ Đội ngũ", "team_menu");

  await ctx.reply(
    [
      `👷 ${m.name}`,
      `Chức vụ: ${m.roleLabel}`,
      `SĐT: ${m.phone}`,
      `Telegram: ${tg}`,
      `Đơn/tháng: ${m.deliveriesThisMonth}`,
      `Trạng thái: ${m.active ? "Hoạt động" : "Ngưng"}`,
    ].join("\n"),
    { reply_markup: kb },
  );
}

export async function handleTeamCallback(
  ctx: Context,
  db: Db,
  user: BotUser,
  data: string,
): Promise<boolean> {
  if (data === "team_menu") {
    await showTeamList(ctx, db);
    return true;
  }

  if (data.startsWith("team_member:")) {
    await showTeamMemberDetail(ctx, db, data.slice("team_member:".length));
    return true;
  }

  if (data.startsWith("team_update:")) {
    const employeeId = data.slice("team_update:".length);
    const team = await listTeamMembers(db);
    const m = team.find((x) => x.id === employeeId);
    if (!m) {
      await ctx.reply("❌ Không tìm thấy nhân sự");
      return true;
    }
    setSession(ctx.from!.id, {
      step: "team_edit",
      teamEditDraft: { employeeId, name: m.name, phone: m.phone },
    });
    await ctx.reply(
      [
        `✏️ Cập nhật — ${m.name}`,
        "",
        "Gửi: Tên | SĐT",
        "VD: Nguyễn Văn A | 0901234567",
        "(Giữ nguyên phần không đổi — gõ lại cả dòng)",
      ].join("\n"),
      { reply_markup: new InlineKeyboard().text("❌ Huỷ", `team_member:${employeeId}`) },
    );
    return true;
  }

  if (data.startsWith("team_assign:")) {
    const employeeId = data.slice("team_assign:".length);
    const team = await listTeamMembers(db);
    const m = team.find((x) => x.id === employeeId);
    if (!m) {
      await ctx.reply("❌ Không tìm thấy nhân sự");
      return true;
    }
    setSession(ctx.from!.id, {
      step: "team_assign_order",
      teamAssignDraft: { employeeId, employeeName: m.name },
    });
    await ctx.reply(
      [
        `📋 Giao việc — ${m.name}`,
        "",
        "Nhập mã đơn (8 ký tự đầu hiển thị trên đơn).",
        "Chỉ gán được đơn **chưa có người nhận**.",
      ].join("\n"),
      { reply_markup: new InlineKeyboard().text("❌ Huỷ", `team_member:${employeeId}`) },
    );
    return true;
  }

  if (data === "team_invite") {
    const invite = await createInviteCode(db, "employee", 72);
    const link = buildInviteDeepLink(invite.code);
    await ctx.reply(
      [
        "🔗 Mã mời nhân viên",
        "",
        `Mã: ${invite.code}`,
        `Link: ${link}`,
        "",
        "Gửi link cho NV → bấm Start trong Telegram.",
      ].join("\n"),
      { reply_markup: new InlineKeyboard().text("◀️ Đội ngũ", "team_menu") },
    );
    return true;
  }

  return false;
}

export async function handleTeamText(
  ctx: Context,
  db: Db,
  step: string,
  text: string,
): Promise<boolean> {
  const telegramId = ctx.from!.id;
  const session = getSession(telegramId);

  if (step === "team_edit" && session.teamEditDraft) {
    const parts = text.split("|").map((s) => s.trim());
    if (parts.length < 2 || !parts[0] || !parts[1]) {
      await ctx.reply("❌ Sai format. Gửi: Tên | SĐT");
      return true;
    }
    try {
      await updateEmployee(db, session.teamEditDraft.employeeId, {
        name: parts[0],
        phone: parts[1],
      });
      clearSession(telegramId);
      await ctx.reply(`✅ Đã cập nhật nhân sự: ${parts[0]}`, {
        reply_markup: new InlineKeyboard().text("◀️ Đội ngũ", "team_menu"),
      });
    } catch (err) {
      const msg = err instanceof AppError ? err.message : "Lỗi cập nhật";
      await ctx.reply(`❌ ${msg}`);
    }
    return true;
  }

  if (step === "team_assign_order" && session.teamAssignDraft) {
    try {
      const detail = await findOpenOrderByShortCode(db, text);
      if (detail.order.assignedEmployeeId) {
        await ctx.reply("❌ Đơn đã có người nhận — chọn đơn khác.");
        return true;
      }
      await assignOrderToEmployee(db, detail.order.id, session.teamAssignDraft.employeeId);
      await notifyEmployeesNewOrder(db, ctx.api, detail.order.id);
      clearSession(telegramId);
      await ctx.reply(
        [
          "✅ Đã giao việc",
          `👷 ${session.teamAssignDraft.employeeName}`,
          `👤 ${detail.order.customerName}`,
          `Mã đơn: ${detail.order.id.slice(0, 8).toUpperCase()}`,
        ].join("\n"),
        { reply_markup: new InlineKeyboard().text("◀️ Đội ngũ", "team_menu") },
      );
    } catch (err) {
      const msg = err instanceof AppError ? err.message : "Không gán được đơn";
      await ctx.reply(`❌ ${msg}`);
    }
    return true;
  }

  return false;
}
