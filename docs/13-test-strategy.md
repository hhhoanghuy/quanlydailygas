# GasOS — Test Strategy

**Phiên bản:** 1.1 | **Cập nhật:** 2026-06-24

---

## Mục tiêu

Chiến lược test và kết quả chạy test **đầy đủ** trên codebase hiện tại.

---

## Kết quả test 2026-06-24 (đầy đủ)

```bash
npm test        # vitest run — 42/42 passed (~113s)
npx tsc --noEmit # 0 errors
```

**Yêu cầu:** `DATABASE_URL` trong `.env` (integration tests dùng Neon thật, tự dọn data TEST).

---

## Cấu trúc test

```
tests/
  setup.ts                          # dotenv
  helpers/db-test.ts                # fixtures + cleanup
  unit/
    money.test.ts                   # 7 tests — pricing
    phone.test.ts                   # 5 tests — normalizePhone
    customer-display.test.ts        # 4 tests — bot format
    order-status.test.ts            # 3 tests — labels
  integration/
    customer.service.test.ts        # 9 tests — CRUD, search, delete rules
    debt-flow.test.ts               # 5 tests — delivery debt + payment
    order-flow.test.ts              # 5 tests — order lifecycle E2E
    cylinder-ledger.test.ts         # 2 tests — vỏ giữ
    gas-surplus.test.ts             # 2 tests — gas dư
```

**Tổng: 42 tests** (19 unit + 23 integration)

---

## Coverage theo nghiệp vụ

| Nghiệp vụ | Test file | Happy | Validation | Edge |
|-----------|-----------|-------|------------|------|
| Pricing / làm tròn | money.test.ts | ✅ | ✅ allowGasSurplus | ✅ formatVnd Dư |
| Customer CRUD | customer.service | ✅ | ✅ duplicate SĐT | ✅ ẩn/xoá |
| Tìm khách / tra nợ | customer.service | ✅ | ✅ empty name | ✅ search địa chỉ |
| Công nợ ledger | debt-flow | ✅ | ✅ empty delivery | ✅ ghi nợ full |
| Thu nợ | debt-flow | ✅ | ✅ amount ≤ 0 | — |
| Đơn hàng → giao | order-flow | ✅ | ✅ thiếu NV | ✅ complete 2 lần |
| Vỏ bình ledger | cylinder-ledger | ✅ | — | ✅ flag off |
| Gas dư | gas-surplus | ✅ | ✅ bình 12kg | — |
| Bot display utils | phone, customer-display, order-status | ✅ | — | ✅ truncate 64 |

---

## Chưa có test (backlog)

- REST API (`fastify.inject`)
- Bot handlers (grammY mock)
- Auth magic link / invite
- voidDelivery
- stats.service / dashboard aggregations
- notify.service

---

## Chạy test

```bash
# Tất cả
npm test

# Watch mode
npm run test:watch

# Chỉ unit (nhanh, không cần DB cho 4 file unit — money không cần DB)
npx vitest run tests/unit
```

Integration tests **tự skip** nếu không có `DATABASE_URL`.

---

## Test manual checklist (bot + web)

Xem checklist trong phiên bản trước — dùng sau khi `npm test` pass để xác nhận UX Telegram/web.

---

## CI đề xuất

```yaml
- npm test
- npx tsc --noEmit
env:
  DATABASE_URL: ${{ secrets.TEST_DATABASE_URL }}
```

---

## Cần xác nhận

- [ ] Chấp nhận integration test ghi DB Neon dev (có cleanup)
- [ ] Bổ sung API test phase tiếp theo
