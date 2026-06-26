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
    .text("❓ Trợ giúp", "help_menu");
}

/** Menu nhân viên — `/nhan_vien` */
export function employeeMenu() {
  return new InlineKeyboard()
    .text("📋 Xem đơn", "orders_list")
    .text("📥 Nhận đơn", "claim_orders")
    .row()
    .text("💰 Kiểm tra công nợ", "debt_check")
    .row()
    .text("❓ Trợ giúp", "help_menu");
}

export function mainMenu(role: string) {
  return role === "employee" ? employeeMenu() : adminMenu();
}

/** Nút drill-down dưới màn Tổng quan Thống kê */
export function statsDrilldownMenu() {
  return new InlineKeyboard()
    .text("👷 Theo NV", "stats_employees")
    .text("👤 Theo khách", "stats_customers")
    .row()
    .text("📅 Theo tháng", "stats_month")
    .text("📆 Theo tuần", "stats_week")
    .row()
    .text("🌐 Đăng nhập web", "stats_web")
    .row()
    .text("◀️ Menu", "menu");
}

export function statsOrdersMenu() {
  return new InlineKeyboard()
    .text("📋 Quản lý đơn mở", "orders_list")
    .row()
    .text("◀️ Thống kê", "stats")
    .text("📋 Menu", "menu");
}

export function backMenu() {
  return new InlineKeyboard().text("◀️ Menu", "menu");
}

export function helpMenu() {
  return backMenu();
}
