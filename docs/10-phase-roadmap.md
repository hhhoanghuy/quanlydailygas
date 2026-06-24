# GasOS — Phase Roadmap

**Phiên bản:** 1.0 | **Cập nhật:** 2026-06-24

---

## Mục tiêu

Lộ trình phase với **trạng thái thực tế** triển khai.

---

## Phase 1 — Core MVP ✅ (baseline)

| Module | Trạng thái |
|--------|------------|
| Auth invite + Telegram bot | ✅ |
| Customer CRUD | ✅ |
| Delivery orders + NV fulfill | ✅ |
| Debt ledger + payments | ✅ |
| Dashboard web + magic link | ✅ |
| Stats bot + web | ✅ |

**Delivered beyond original Phase 1 scope:**
- Web dashboard full CRUD
- Order entity riêng
- Tra nợ / tìm theo địa chỉ
- Trang đơn hàng + chi tiết + message preview

---

## Phase 2 — Cylinder ✅ (flag)

| Module | Trạng thái |
|--------|------------|
| cylinder_ledger | ✅ code |
| Dashboard Quản lý vỏ | ✅ |
| ENABLE_CYLINDER_LEDGER | Default **false** — bật khi pilot sẵn sàng |

Chi tiết: `docs/phases/phase-2.md`

---

## Phase 3 — Gas ✅ (partial)

| Module | Trạng thái |
|--------|------------|
| gas_surplus_kg on delivery | ✅ |
| Dashboard Gas dư trả NM | ✅ |
| gas_credit_ledger | ❌ out of scope (2026-06-24) |

---

## Phase 4 — GPS / Maps ❌

Backlog — chưa code.

---

## Phase 5 — Điều phối giao ❌

Backlog — chưa code.

---

## Backlog ưu tiên tiếp theo

1. Test coverage services (debt, cylinder, orders)
4. Gửi tin nhắn khách (Zalo/SMS) từ messagePreview
5. Bật cylinder ledger production
6. Session bot persistent (Redis)

---

## Phase protection

Phase mới **chỉ mở rộng** — không đổi API/behavior phase cũ đã dùng production.

---

## Cần xác nhận

- [ ] Coi baseline hiện tại là "Phase 1 complete" cho pilot
- [ ] Thứ tự backlog phase 3–5
