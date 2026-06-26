import { InlineKeyboard } from "grammy";

/** Menu chủ đại lý — `/menu_admin` (khớp roadmap) */
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

export function statsMenu() {
  return new InlineKeyboard()
    .text("📅 Theo ngày", "stats_day")
    .text("👷 Theo NV", "stats_employees")
    .row()
    .text("📋 Đơn hàng", "stats_orders")
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

export function customersMenu() {
  return new InlineKeyboard()
    .text("🏆 Top 10 khách", "customers_top10")
    .text("🔍 Tìm khách", "customer_search")
    .row()
    .text("➕ Thêm khách", "customer_add")
    .row()
    .text("◀️ Menu", "menu");
}

export function backMenu() {
  return new InlineKeyboard().text("◀️ Menu", "menu");
}

export function helpMenu() {
  return backMenu();
}
