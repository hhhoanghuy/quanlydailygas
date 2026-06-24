# Phase 2 — Cylinder Ledger

**Trạng thái:** ✅ Code complete | ⚠️ Flag off by default

---

## Mục tiêu

Theo dõi vỏ bình khách đang giữ qua ledger.

---

## Đã giao

- `cylinder_ledger` table + service
- Ghi ledger khi `ENABLE_CYLINDER_LEDGER=true`
- Dashboard: Quản lý vỏ (holders + summary)
- Bot fulfill success: hiện vỏ nếu flag on
- Admin backfill endpoint

---

## Bật production

```env
ENABLE_CYLINDER_LEDGER=true
```

Sau đó chạy backfill nếu có delivery cũ:

```http
POST /api/v1/admin/backfill-cylinder-ledger
Authorization: Bearer <owner>
```

---

## Edge cases

- Flag off: giao vẫn chạy, không ghi vỏ
- Void delivery: đảo cylinder entries

---

## Cần xác nhận

- [ ] Bật flag cho pilot đại lý đầu tiên
