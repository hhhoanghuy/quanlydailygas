# GasOS — API Design

**Phiên bản:** 1.0 | **Cập nhật:** 2026-06-24  
**Prefix:** `/api/v1` | **File:** `src/routes/api.ts`

---

## Mục tiêu

Liệt kê REST API **đang expose**.

---

## Auth

| Method | Path | Auth | Mô tả |
|--------|------|------|-------|
| POST | /auth/telegram | Public | Kích hoạt invite |
| POST | /auth/magic-link | Public | Đổi code → token web |
| POST | /auth/logout | Bearer | Revoke |
| GET | /auth/me | Bearer | User hiện tại |

---

## Customers (owner)

| Method | Path | Mô tả |
|--------|------|-------|
| GET | /customers | List + debtBalance + canDelete |
| POST | /customers | Tạo |
| PUT | /customers/:id | Sửa |
| PATCH | /customers/:id/deactivate | Ẩn |
| DELETE | /customers/:id | Xoá (có điều kiện) |
| GET | /customers/:id | Detail |
| GET | /customers/by-phone/:phone/debt | Tra nợ SĐT |

---

## Deliveries

| Method | Path | Auth | Mô tả |
|--------|------|------|-------|
| GET | /deliveries | Owner | List |
| POST | /deliveries/preview | Bearer | Preview giá |
| POST | /deliveries | Bearer | Tạo (employee auto) |
| POST | /deliveries/:id/void | Owner | Void |

---

## Orders (owner, web)

| Method | Path | Mô tả |
|--------|------|-------|
| GET | /orders/stats | Thống kê trạng thái |
| GET | /orders | List (?status, limit) |
| GET | /orders/:id | Chi tiết + customerSummary + messagePreview |

---

## Payments (owner)

| GET/POST | /payments | List / thu nợ |

---

## Dashboard (owner)

| GET | /dashboard | Stats day/month |
| GET | /dashboard/trend | Chart N ngày |
| GET | /dashboard/debtors | Khách nợ |
| GET | /dashboard/zero-debt-customers | Khách hết nợ |
| GET | /gas-surplus | Báo cáo gas dư trả NM |

---

## Cylinders (owner)

| GET | /cylinders/holders | Khách giữ vỏ |
| GET | /cylinders/summary | Tổng theo loại |

---

## Employees & invites (owner)

| GET | /employees | |
| PATCH | /employees/:id/active | |
| POST | /invite-codes | Tạo mã NV |

---

## Pricing

| GET | /cylinder-types | |
| GET | /price-periods/current | |
| POST | /price-periods | Owner tạo kỳ mới |

---

## Admin

| POST | /admin/backfill-cylinder-ledger | Cần ENABLE_CYLINDER_LEDGER |

---

## Response errors

```json
{ "error": { "code": "...", "message": "..." } }
```

---

## Feature flags (request body / env)

- `ENABLE_CYLINDER_LEDGER` — cylinder APIs có data
- `ENABLE_GAS_SURPLUS` — API delivery gas discount

---

## Ví dụ

```http
GET /api/v1/orders/uuid?Authorization: Bearer xxx
→ { order, lines, fulfillment, customerSummary, messagePreview }
```

---

## Edge cases

- Employee POST delivery: employee_id forced từ profile
- Owner POST delivery: phải gửi employee_id

---

## Cần xác nhận

- [ ] API surface ổn định cho phase 2 (không breaking)
