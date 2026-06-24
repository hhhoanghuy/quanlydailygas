# Phase 1 — Core MVP

**Trạng thái:** ✅ Hoàn thành (baseline 2026-06-24)

---

## Mục tiêu phase

Customer, Delivery (via orders), Debt, Dashboard cơ bản.

---

## Đã giao

- Telegram bot: auth, customer, orders, fulfill, debt, stats, settings
- REST API `/api/v1`
- Web dashboard: 7 trang + magic link auth
- `debt_ledger`, `payments`
- `delivery_orders` + `deliveries` workflow
- Docs v1.0

---

## Khác kế hoạch ban đầu

- Không giao trực tiếp từ bot (2 bước order → fulfill)
- Web vượt scope "dashboard cơ bản" — full CRUD
- Tra nợ / tìm khách theo địa chỉ

---

## KPI pilot (đề xuất đo)

- Thời gian lên đơn < 60s
- 100% đơn có NV assigned
- Chủ mở dashboard ≥ 1 lần/ngày

---

## Cần xác nhận

- [ ] Phase 1 closed
