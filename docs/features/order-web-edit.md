# Feature: Chủ sửa đơn hàng trên Web Dashboard

**Trạng thái:** ✅ Đã triển khai  
**Người dùng:** Chủ đại lý (owner)

---

## Quy tắc đã xác nhận

| Rule | Nội dung |
|------|----------|
| BR-OE01 | Chỉ owner sửa qua web |
| BR-OE02 | Chủ **thường sửa đơn đã giao xong** (`completed`) |
| BR-OE03 | **Giá không đổi** — giữ `price_period_id` + `price_per_cylinder_snapshot` giao dịch cũ |
| BR-OE04 | Chỉ sửa **số trên dòng có sẵn** — không thêm/xoá dòng |
| BR-OE05 | **Không đổi** `delivered_at` |
| BR-OE06 | **Không đổi khách** — huỷ + tạo đơn mới nếu cần |
| BR-OE07 | Giới hạn **48 giờ** kể từ `completed_at` (fallback `delivered_at`) |
| BR-OE08 | Không audit log (chỉ owner có quyền) |
| BR-OE09 | Xem trước chênh lệch: tổng đơn, thu tiền, nợ, vỏ giữ (lần giao) |

---

## Kỹ thuật

- `POST /api/v1/orders/:id/preview-correction` — preview delta
- `POST /api/v1/orders/:id/correct` — void delivery cũ + `createDeliveryFromSnapshots` + relink
- Web: nút **Sửa đơn** trong modal chi tiết (khi `canCorrect`)

---

## Test

`tests/integration/order-correction.test.ts`
