# GasOS — Database Design

**Phiên bản:** 1.0 | **Cập nhật:** 2026-06-24  
**Schema file:** `src/db/schema.ts`

---

## Mục tiêu

Mô tả schema PostgreSQL **đang triển khai**.

---

## Enums

| Enum | Values |
|------|--------|
| user_role | owner, employee |
| customer_type | household, restaurant, industrial |
| delivery_status | active, voided |
| order_status | pending, delivering, completed, cancelled |
| payment_method | cash, transfer |
| ledger_reference | delivery, payment, void |
| session_type | telegram, magic_link, web |

---

## Bảng

### Auth & users

| Bảng | Mục đích |
|------|----------|
| employees | NV giao (name, phone, active) |
| users | Telegram user ↔ role ↔ employee_id |
| invite_codes | Mã kích hoạt one-time |
| sessions | Bearer token + expiry |

### Master data

| Bảng | Mục đích |
|------|----------|
| customers | Khách cuối (unique phone, is_active) |
| cylinder_types | Loại bình + capacity_kg |
| price_periods | Kỳ giá |
| cylinder_prices | Giá theo loại/kỳ |

### Giao dịch

| Bảng | Mục đích |
|------|----------|
| delivery_orders | Đơn (Telegram workflow) |
| delivery_order_lines | Dòng đơn (cylinders_out) |
| deliveries | Giao dịch hoàn thành |
| delivery_lines | Chi tiết giao/thu/gas/line_amount |
| payments | Thu nợ |
| debt_ledger | Công nợ (append-only) |
| cylinder_ledger | Vỏ (append-only, optional) |

---

## Quan hệ chính

```
customers ─┬─ delivery_orders ── delivery (optional link)
           ├─ deliveries ── delivery_lines
           ├─ debt_ledger
           ├─ cylinder_ledger
           └─ payments
```

---

## Nguyên tắc thiết kế

1. **Không** cột `customers.debt_balance` hoặc `customers.cylinder_count`
2. **Không** bảng `gas_credit_ledger` — gas dư chỉ trên `delivery_lines.gas_surplus_kg` (trả NM)
3. Snapshot giá trên `delivery_lines.price_per_cylinder_snapshot`

---

## Ví dụ dữ liệu

**debt_ledger:** delivery +500000, payment -300000 → balance 200000

**cylinder_ledger:** +4 (giao), -3 (thu) → balance 1 vỏ

---

## Edge cases

- Void delivery: thêm ledger entries đảo
- Hard delete customer: CASCADE không dùng — chặn ở service

---

## Migration

```bash
npm run db:generate
npm run db:migrate
npm run db:seed   # owner invite + cylinder types + giá mặc định
```

---

## Câu hỏi mở

- Gas credit ledger: **out of scope** (xem `docs/features/gas-du-nm.md`)

---

## Cần xác nhận

- [ ] Schema v1.0 đủ cho 6 tháng vận hành pilot
