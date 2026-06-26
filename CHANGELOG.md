## [Unreleased]

### Added

- Bot menu v2 **P0**: `/menu_admin`, `/nhan_vien`, `/help`, `/weblogin`, `/menu_super_admin` (placeholder)
- `docs/BACKUP-PRE-MENU-V2.md` + git tag `backup/pre-bot-menu-v2`
- `npm run db:reset` — xoá data + seed owner invite
- `docs/05-user-flow.md` v2 — roadmap menu bot

### Changed

- Menu chủ **chỉ 4 nút** (roadmap): Đội ngũ · Khách hàng · Thống kê · Cài đặt
- Lên đơn / Thu nợ chuyển vào **chi tiết khách**; Top 10 khách theo lần giao
- Đơn mở: **Thống kê → Đơn hàng → Quản lý đơn mở**
- Menu NV: Xem đơn, Nhận đơn (stub P2), Kiểm tra công nợ — bỏ Thu nợ

---

## [0.1.0] - 2026-06-24

### Added

- Project scaffold: Node/TS, Fastify, Drizzle, Neon
- Pricing: `ROUND_1000`, multi-line `delivery_lines`
- Debt ledger + Payment (Phương án C tiền dư)
- Price periods + cylinder types
- Auth: Telegram invite codes + sessions
- REST API `/api/v1` (P1 core)
- Cylinder ledger + backfill endpoint (P2, `ENABLE_CYLINDER_LEDGER`)
- Telegram bot skeleton (`/start`, `/no`)
- Unit tests: pricing/money

### Changed

- Docs G7 approved — analysis → build

### Fixed

- (none)
