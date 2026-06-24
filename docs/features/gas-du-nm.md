# Gas dư (trả nhà máy) — Nghiệp vụ thống nhất

**Trạng thái:** ✅ Đã phê duyệt (chủ dự án)  
**Cập nhật:** 2026-06-24

---

## 1. Định nghĩa

**Gas dư** = lượng gas còn trong vỏ bình khách trả lại; đại lý ghi nhận kg để **báo cáo trả nhà máy (NM)** và **trừ vào tiền đơn** lần giao đó.

**Không** có khái niệm riêng “gas credit” / số dư kg khách dùng lần sau. **Không** bảng `gas_credit_ledger`.

---

## 2. Quy tắc

| Rule | Nội dung |
|------|----------|
| BR-GD01 | Lưu trên `delivery_lines.gas_surplus_kg` (tên cột DB giữ nguyên) |
| BR-GD02 | Chỉ bình **≥ 20kg** được nhập gas dư; bình 12kg **luôn 0** |
| BR-GD03 | **Không** phụ thuộc `customer_type` — hộ / quán / CN đều theo loại bình |
| BR-GD04 | Khách **hộ gia đình** thực tế thường không nhập (chỉ bình nhỏ) |
| BR-GD05 | Trừ tiền: `(giá_bình / dung_tích_kg) × kg_dư`, làm tròn dòng/tổng **1.000đ** |
| BR-GD06 | NV nhập lúc hoàn thành đơn (bot); chủ xem/sửa trên web (trong 48h) |
| BR-GD07 | Báo cáo: dashboard **Gas dư trả NM** (tổng / kỳ / theo khách giao dịch) |

---

## 3. Bot (NV)

Cú pháp hoàn thành: `<vỏ thu> <tiền>vnd <tm|ck|no> [gas dư]`

- Gas dư **tuỳ chọn**, chỉ cho dòng bình ≥ 20kg
- Đơn chỉ bình 12kg: **không** nhập gas dư

---

## 4. MVP goal (cập nhật)

| Cũ (bỏ) | Mới |
|---------|-----|
| Khách nào còn bao nhiêu gas dư? (số dư khách) | **Tổng kg gas dư trả NM** (ngày / tháng / theo khách) |

---

## 5. Out of scope

- `gas_credit_ledger`
- Số dư kg khách quán/CN qua nhiều lần giao
- Xuất Excel/PDF NM (dashboard đủ)
