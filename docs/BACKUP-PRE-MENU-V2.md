# Backup — trước refactor menu bot v2

**Ngày:** 2026-06-24  
**Git tag:** `backup/pre-bot-menu-v2`  
**Commit:** `62880c6` (`owner_tu_ship`)

---

## Nội dung phiên bản backup

Bot Telegram + web dashboard **trước** roadmap menu v2 (`/menu_admin`, `/nhan_vien`, …).

Menu chủ (inline): Lên đơn, Khách, Đơn mở, Thu nợ, Thống kê, Cài đặt.  
Menu NV: Đơn cần giao, Tra nợ, Thu nợ.

---

## Khôi phục code từ backup

```bash
# Xem tag
git show backup/pre-bot-menu-v2

# Tạo nhánh từ backup (an toàn)
git checkout -b restore-pre-menu-v2 backup/pre-bot-menu-v2

# Hoặc reset hard (mất thay đổi chưa commit — cẩn thận)
git checkout main
git reset --hard backup/pre-bot-menu-v2
```

**Database:** tag không backup dữ liệu Neon. Dùng snapshot Neon hoặc `npm run db:reset` nếu cần DB trống.

---

## Tài liệu mục tiêu sau backup

- `docs/05-user-flow.md` v2 — roadmap menu mới
- Triển khai theo phase P0 → P5 sau khi phê duyệt
