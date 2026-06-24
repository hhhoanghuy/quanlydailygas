# GasOS — Đối tượng khách hàng

**Phiên bản:** 1.0 | **Cập nhật:** 2026-06-24

---

## Mục tiêu

Xác định ai mua/dùng GasOS và ai chỉ là dữ liệu trong hệ thống.

---

## Khách hàng sản phẩm (trả tiền dùng GasOS)

| Persona | Quy mô | Kênh dùng |
|---------|--------|-----------|
| **Chủ đại lý** | 50–2000 khách cuối, 1–20 NV | Telegram + Web |
| **NV giao gas** | Giao 10–50 đơn/ngày | Telegram only |

### Không phục vụ

Tổng đại lý quốc gia, ERP lớn, chuỗi có kế toán riêng phức tạp.

---

## Khách hàng cuối (entity `customers`)

| Loại | `customer_type` | Ghi chú code |
|------|-----------------|--------------|
| Hộ gia đình | `household` | Mặc định |
| Quán ăn | `restaurant` | |
| Công nghiệp | `industrial` | |

**Không đăng nhập.** Có thể nhận tin nhắn xác nhận (copy từ dashboard — chưa tích hợp gửi).

---

## Ví dụ thực tế

Đại lý 3 NV, 400 khách hộ + 30 quán → chủ dùng web cuối tháng xem nợ; NV dùng bot khi giao.

---

## Edge cases

- 1 SĐT = 1 khách (unique phone)
- Khách ngừng mua → **Ẩn** (deactivate), không xoá nếu có lịch sử

---

## Câu hỏi mở

- Có segment giá theo loại khách không?

---

## Cần xác nhận

- [ ] Phân loại household/restaurant/industrial đủ cho pilot
