import { InlineKeyboard } from "grammy";

export function mainMenu(role: string) {
  if (role === "employee") {
    return new InlineKeyboard()
      .text("📋 Đơn cần giao", "orders_list")
      .text("💰 Tra nợ", "debt_check")
      .row()
      .text("💵 Thu nợ", "payment_collect");
  }
  return new InlineKeyboard()
    .text("📞 Lên đơn", "order_new")
    .text("👤 Khách", "customers")
    .row()
    .text("📋 Đơn mở", "orders_list")
    .text("💵 Thu nợ", "payment_collect")
    .row()
    .text("📊 Thống kê", "stats")
    .row()
    .text("⚙️ Cài đặt", "settings");
}

export function statsMenu() {
  return new InlineKeyboard()
    .text("📅 Theo ngày", "stats_day")
    .text("👷 Theo NV", "stats_employees")
    .row()
    .text("📋 Đơn hàng", "stats_orders")
    .text("🌐 Web", "stats_web")
    .row()
    .text("◀️ Menu", "menu");
}

export function backMenu() {
  return new InlineKeyboard().text("◀️ Menu", "menu");
}
