# GasOS — Phân tích vấn đề

**Phiên bản:** 1.0 | **Cập nhật:** 2026-06-24

---

## Mục tiêu

Liệt kê nỗi đau vận hành đại lý gas và cách GasOS **đã giải quyết** trong code hiện tại.

## Phạm vi

Đại lý nhỏ/vừa (50–2000 khách, 1–20 NV giao).

---

## Bảng vấn đề → giải pháp

| # | Nỗi đau | Hệ quả | GasOS giải quyết |
|---|---------|--------|------------------|
| P1 | Ghi nợ nhớ miệng | Tranh cãi, thất thu | `debt_ledger` + tra nợ theo tên/SĐT/địa chỉ |
| P2 | Không biết ai giữ vỏ | Mất vỏ | `cylinder_ledger` + trang Quản lý vỏ |
| P3 | Không tổng hợp cuối ngày | Mù doanh thu | Thống kê bot + dashboard |
| P4 | NV giao không đồng bộ | Chủ không biết ai đang giao | Đơn gán NV + thông báo Telegram |
| P5 | Gas dư vỏ trả NM lộn xộn | Sai số với nhà máy | `gas_surplus_kg` + báo cáo Gas dư |
| P6 | Tìm khách chậm | Lên đơn chậm | Tìm theo tên/SĐT/địa chỉ + nút lên đơn |

---

## Ví dụ thực tế

**Trước:** Sổ ghi "Hoa nợ 2tr" — không biết nợ từ lần nào.  
**Sau:** Mỗi lần giao ghi nợ vào ledger; tra "Phở Hoa" hoặc `/no Phở Hoa` → tổng nợ hiện tại.

---

## Edge cases ngoài phạm vi MVP

- Đối soát kế toán thuế
- Quản lý kho bình tại đại lý (tồn kho tổng)
- Giá khác nhau từng khách (chưa có — dùng chung price period)

---

## Câu hỏi mở

1. Có cần nhắc nợ tự động (push) không?
2. Có cần in phiếu giao không?

---

## Cần xác nhận

- [ ] Danh sách pain point đủ cho pitch khách hàng pilot
