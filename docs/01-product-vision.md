# GasOS — Product Vision

**Phiên bản:** 1.0 | **Cập nhật:** 2026-06-24

---

## Mục tiêu

Định nghĩa sản phẩm GasOS MVP **đã và sẽ** phục vụ đại lý gas nhỏ/vừa.

## Phạm vi

Tầm nhìn sản phẩm — không mô tả chi tiết API/schema.

---

## Vision statement

> Giúp chủ đại lý gas trả lời trong 30 giây: **ai nợ bao nhiêu, ai giữ bao nhiêu vỏ, hôm nay giao bao nhiêu, NV nào giao nhiều nhất** — ngay trên điện thoại qua Telegram và dashboard web.

---

## MVP đã triển khai

### Kênh

1. **Telegram Bot** — thao tác hàng ngày (mobile-first)
2. **Web Dashboard** — quản lý, báo cáo, CRUD (chủ đại lý)

### Câu hỏi MVP (chủ trả lời được)

| Câu hỏi | Nguồn dữ liệu |
|---------|---------------|
| Khách nào đang nợ? | Tra nợ bot / Dashboard Doanh thu |
| Khách giữ bao nhiêu vỏ? | Dashboard Quản lý vỏ (flag ledger) |
| Tổng kg gas dư trả NM? | Dashboard Gas dư trả NM |
| Hôm nay giao bao nhiêu? | Thống kê bot / Tổng quan web |
| NV nào giao nhiều? | Thống kê theo NV |

---

## Nguyên tắc sản phẩm (đang áp dụng)

1. **Ledger, không snapshot nợ/vỏ trên customer**
2. **Tối đa 3 thao tác** cho tác vụ bot thường gặp
3. **Đơn hàng tách khỏi giao hàng** — chủ lên đơn, NV xác nhận thực tế
4. **Document-first** — docs phản ánh code

---

## Không làm trong MVP

GPS, route, hóa đơn điện tử, kế toán, app native, AI, chatbot CRM.

---

## Ví dụ thực tế

NV giao quán ăn 2 bình 45kg, thu 1 vỏ, thu 700k TM, ghi nợ phần còn lại → chủ cuối ngày mở dashboard thấy doanh thu TM, nợ mới, danh sách nợ.

---

## Edge cases

- Khách trả thừa → số dư nợ âm hiển thị "Dư"
- Đơn huỷ trước khi giao → không tạo delivery
- Chủ sửa giá từng loại bình trong bot Cài đặt

---

## Câu hỏi mở

- Có cần app Zalo Mini App thay Telegram không?
- Dashboard có cần multi-đại lý (SaaS) không?

---

## Cần xác nhận

- [ ] Vision MVP hiện tại đủ để bán/thu phí pilot
