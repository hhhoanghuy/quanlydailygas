# GasOS — UI Wireframe

**Phiên bản:** 1.0 | **Cập nhật:** 2026-06-24  
**Files:** `src/web/dashboard.html`, `app.js`, `app.css` | `src/bot/keyboards.ts`

---

## Mục tiêu

Mô tả giao diện **đang triển khai** (không mockup tương lai).

---

## Telegram Bot

### Owner — Menu inline

```
[📞 Lên đơn] [👤 Khách]
[📋 Đơn mở] [📊 Thống kê]
[⚙️ Cài đặt]
```

### Employee — Menu inline

```
[📋 Đơn cần giao] [💰 Tra nợ]
```

### Khách hàng submenu

```
[➕ Thêm khách] [🔍 Tìm khách]
[◀️ Menu]
```

### Thống kê submenu

```
[📅 Theo ngày] [👷 Theo NV]
[📋 Đơn hàng] [🌐 Web]
[◀️ Menu]
```

### Cài đặt

```
[💰 Đơn giá] [🔗 Mã mời NV]
[◀️ Menu]
```

### Pattern UI bot

- Inline keyboard cho mọi lựa chọn
- Kết quả tìm kiếm: text + **nút bấm từng khách** (lên đơn / tra nợ)
- Fulfill: text input compact → preview → ✅/❌

---

## Web Dashboard

### Layout

```
┌─────────────┬──────────────────────────────────┐
│ Sidebar     │ Header (title + actions)         │
│ - Brand     ├──────────────────────────────────┤
│ - User      │ Content area                     │
│ - Nav 7 trang│ stat cards / tables / modals    │
│ - Logout    │                                  │
└─────────────┴──────────────────────────────────┘
```

### Sidebar nav

1. Tổng quan
2. Doanh thu / Công nợ
3. Khách hàng
4. Nhân viên
5. Quản lý vỏ
6. **Đơn hàng**
7. **Gas dư trả NM**

### Trang Tổng quan

- Filter ngày/tháng
- Stat cards: đơn, thu, nợ thêm, tổng nợ, (vỏ, gas nếu có data)
- Chart SVG 14 ngày
- Bảng NV + đơn mở

### Trang Đơn hàng

- Filter trạng thái
- Table: thời gian, khách, bình, trạng thái, NV
- **Row click → modal wide** (scroll)

### Modal chi tiết đơn

1. Grid thông tin khách/đơn
2. **Tổng hợp khách (lịch sử):** bình mua, vỏ giữ, nợ, tiền mua, bảng theo loại
3. Dòng đơn lần này
4. Kết quả giao (nếu completed)
5. Tin nhắn preview + **Sao chép**

### Trang Khách hàng

- Search tên/SĐT/địa chỉ
- Table + Sửa / Ẩn / Xoá
- Modal form thêm/sửa

### Login

- Chỉ hiện khi không có token
- Hướng dẫn lấy link từ bot `/dashboard`

---

## Design tokens (CSS)

- Sidebar sáng, accent `#2563eb`
- Stat cards màu: blue, green, amber, red, purple
- Mobile: sidebar sticky; modal scroll

---

## Ví dụ thực tế

Chủ mở Đơn hàng → filter "Đã giao" → click → thấy tổng nợ khách 2.5tr + copy tin nhắn.

---

## Edge cases

- Modal dài → scroll trong `.modal-body`
- Không có nút Xoá → hiện `—` + tooltip

---

## Cần xác nhận

- [ ] 7 trang đủ cho vận hành hàng ngày không cần Excel
