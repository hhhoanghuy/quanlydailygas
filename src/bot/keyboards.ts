import { InlineKeyboard } from "grammy";

/** Menu chủ đại lý — `/menu_admin` */
export function adminMenu() {
  return new InlineKeyboard()
    .text("👷 Đội ngũ", "team_menu")
    .text("👤 Khách hàng", "customers")
    .row()
    .text("📊 Thống kê", "stats")
    .text("⚙️ Cài đặt", "settings")
    .row()
    .text("📋 Đơn mở", "orders_list")
    .text("💵 Thu nợ", "payment_collect")
    .row()
    .text("📞 Lên đơn", "order_new");
}

/** Menu nhân viên — `/nhan_vien` */
export function employeeMenu() {
  return new InlineKeyboard()
    .text("📋 Xem đơn", "orders_list")
    .text("📥 Nhận đơn", "claim_orders")
    .row()
    .text("💰 Kiểm tra công nợ", "debt_check");
}

export function mainMenu(role: string) {
  return role === "employee" ? employeeMenu() : adminMenu();
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
