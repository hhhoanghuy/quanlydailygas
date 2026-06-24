# GasOS — Use Cases

**Phiên bản:** 1.0 | **Cập nhật:** 2026-06-24

---

## Mục tiêu

Liệt kê use case chính với actor, pre/post condition theo hệ thống hiện tại.

---

## UC-01 Kích hoạt NV

| | |
|---|---|
| **Actor** | NV mới |
| **Flow** | Nhận mã → /start → menu NV |
| **Post** | Có user role employee, linked employee_id |

---

## UC-02 Thêm khách

| | |
|---|---|
| **Actor** | Chủ |
| **Flow** | Khách → Thêm → `Tên \| SĐT \| Địa chỉ` → Lưu |
| **Alt** | Web: Khách hàng → + Thêm khách |
| **Rule** | SĐT unique |

---

## UC-03 Tìm khách & lên đơn

| | |
|---|---|
| **Actor** | Chủ |
| **Flow** | Tìm khách → query → nút khách → chọn bình → NV → đơn pending |
| **Post** | NV nhận Telegram |

---

## UC-04 NV hoàn thành giao

| | |
|---|---|
| **Actor** | NV được gán |
| **Pre** | Order pending/delivering, assigned |
| **Flow** | Giao hàng → nhập compact → confirm → completed |
| **Post** | delivery active, debt updated |

---

## UC-05 Tra nợ

| | |
|---|---|
| **Actor** | Chủ / NV |
| **Flow** | Tra nợ → tên/SĐT/địa chỉ → xem số nợ |
| **Alt** | `/no Phở Hoa` |

---

## UC-06 Thu nợ (web)

| | |
|---|---|
| **Actor** | Chủ |
| **Flow** | Doanh thu → + Thu nợ → chọn khách, số tiền, TM/CK |
| **Post** | payment + debt ledger giảm |

---

## UC-07 Xem dashboard

| | |
|---|---|
| **Actor** | Chủ |
| **Flow** | /dashboard → magic link → Tổng quan |
| **Post** | Session 8h |

---

## UC-08 Xem chi tiết đơn (web)

| | |
|---|---|
| **Actor** | Chủ |
| **Flow** | Đơn hàng → click row → modal |
| **Post** | Thấy tổng hợp khách + tin nhắn preview |

---

## UC-09 Sửa giá bình

| | |
|---|---|
| **Actor** | Chủ |
| **Flow** | Cài đặt → Đơn giá → chọn loại → nhập giá |

---

## UC-10 Ẩn / xoá khách

| | |
|---|---|
| **Actor** | Chủ (web) |
| **Ẩn** | Luôn được |
| **Xoá** | nợ=0, chưa có lịch sử |

---

## UC-11 Báo cáo gas dư trả NM

| | |
|---|---|
| **Actor** | Chủ |
| **Pre** | NV đã nhập gas dư (bình ≥20kg) khi giao |
| **Flow** | Dashboard Gas dư trả NM |

---

## UC-12 Void delivery

| | |
|---|---|
| **Actor** | Chủ (API) |
| **Flow** | POST void → đảo debt + cylinder |

---

## Edge cases

- UC-04 fail nếu NV sai người
- UC-10 xoá fail nếu còn nợ

---

## Câu hỏi mở

- UC gửi SMS khách?

---

## Cần xác nhận

- [ ] Danh sách UC đủ coverage pilot
