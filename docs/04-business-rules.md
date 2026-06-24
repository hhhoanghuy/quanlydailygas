# GasOS — Business Rules

**Phiên bản:** 1.0 | **Cập nhật:** 2026-06-24  
**Source of truth code:** `src/services/`, `utils/money.ts`, `src/db/schema.ts`

---

## Mục tiêu

Quy tắc nghiệp vụ **đang được code enforce** — không mô tả kế hoạch chưa làm.

---

## 1. Customer

| Rule | Chi tiết |
|------|----------|
| BR-C01 | Bắt buộc: `name`, `phone`, `address` |
| BR-C02 | SĐT chuẩn hoá VN, **unique** |
| BR-C03 | Loại: `household` \| `restaurant` \| `industrial` |
| BR-C04 | **Không** lưu `debt` trên bảng customer |
| BR-C05 | Ẩn khách: `is_active = false` — luôn được phép |
| BR-C06 | Xoá vĩnh viễn: chỉ khi **nợ = 0** AND **chưa có** delivery/order |
| BR-C07 | Tìm kiếm: ILIKE name, phone, address |

**Bot thêm khách:** `Tên \| SĐT \| Địa chỉ` (optional loại quán/cn/nhà ở phần 4).

---

## 2. Debt Ledger

| Rule | Chi tiết |
|------|----------|
| BR-D01 | Số dư = `SUM(debt_ledger.amount)` |
| BR-D02 | Giao hàng ghi nợ: `+debtAmount` (reference delivery) |
| BR-D03 | Thu nợ: `-amount` (reference payment) |
| BR-D04 | Void delivery: bút toán đảo |
| BR-D05 | `debtAmount = orderAmount - cashReceived` |

---

## 3. Delivery Orders (Telegram workflow)

| Rule | Chi tiết |
|------|----------|
| BR-O01 | Chủ tạo đơn; **bắt buộc gán NV** |
| BR-O02 | Trạng thái: `pending` → `delivering` → `completed` \| `cancelled` |
| BR-O03 | NV chỉ thấy đơn được gán |
| BR-O04 | NV không giao đơn của NV khác |
| BR-O05 | Hoàn thành tạo `delivery` + link `delivery_id` |
| BR-O06 | Huỷ: chỉ `pending` / `delivering` |
| BR-O07 | Chủ sửa đơn **completed** trên web: trong **48h**, giữ giá & ngày giao, chỉ sửa số dòng có sẵn; void delivery cũ + tạo mới |

---

## 4. Delivery (giao dịch thực tế)

| Rule | Chi tiết |
|------|----------|
| BR-V01 | Mỗi delivery = 1 lần giao hoàn thành |
| BR-V02 | Dòng: `cylinders_out`, `cylinders_in`, `gas_surplus_kg`, `line_amount` |
| BR-V03 | Giá từ **price period** hiện hành |
| BR-V04 | Làm tròn dòng/tổng **1.000đ** |
| BR-V05 | Gas dư (≥20kg) giảm tiền đơn khi `allowGasSurplus` |
| BR-V06 | Tag thanh toán trong `note`: `payment=tm\|ck\|no` |
| BR-V07 | Void: owner only, đảo ledger |

**Bot fulfill:** luôn `allowGasSurplus: true`. **API:** theo `ENABLE_GAS_SURPLUS`.

---

## 5. Cylinder Ledger (optional)

| Rule | Chi tiết |
|------|----------|
| BR-Y01 | Chỉ ghi khi `ENABLE_CYLINDER_LEDGER=true` |
| BR-Y02 | Giao vỏ: `+cylinders_out`; Thu vỏ: `-cylinders_in` |
| BR-Y03 | Số dư = SUM(quantity) theo loại bình |
| BR-Y04 | **Không** lưu `customer.currentCylinder` |

---

## 6. Gas dư (trả nhà máy)

| Rule | Chi tiết |
|------|----------|
| BR-G01 | Lưu trên `delivery_lines.gas_surplus_kg` |
| BR-G02 | Chỉ bình **≥ 20kg**; bình 12kg luôn 0 |
| BR-G03 | **Không** theo `customer_type` — chỉ theo loại bình |
| BR-G04 | Trừ tiền: `(giá_bình / dung_tích_kg) × kg`, làm tròn 1.000đ |
| BR-G05 | NV nhập lúc hoàn thành đơn; báo cáo dashboard **Gas dư trả NM** |
| BR-G06 | **Không** `gas_credit_ledger` — không số dư kg khách qua nhiều lần giao |

Chi tiết: `docs/features/gas-du-nm.md`

---

## 7. Payment (thu nợ)

| Rule | Chi tiết |
|------|----------|
| BR-P01 | `amount > 0` |
| BR-P02 | Method: `cash` \| `transfer` |
| BR-P03 | Tạo payment + debt ledger `-amount` |

---

## 8. Pricing

| Rule | Chi tiết |
|------|----------|
| BR-$01 | Nhiều price period theo thời gian |
| BR-$02 | Bot Cài đặt: sửa giá **trong period hiện tại** |
| BR-$03 | API: tạo period mới (owner) |

---

## 9. Auth & roles

| Rule | Chi tiết |
|------|----------|
| BR-A01 | 2 role: `owner`, `employee` |
| BR-A02 | Magic link / dashboard: **owner only** |
| BR-A03 | Mã mời NV: TTL 72h; owner seed 8760h |
| BR-A04 | Magic link TTL 5 phút, one-time (chỉ để đăng nhập); sau đổi code → phiên web TTL 8h — link hết hạn **không** kết thúc phiên đang mở |

---

## 10. Dashboard stats

| Rule | Chi tiết |
|------|----------|
| BR-S01 | TM/CK/nợ từ tag `payment=` hoặc fallback cash |
| BR-S02 | Top NV: đơn, bình giao, TM cầm |
| BR-S03 | Chi tiết đơn web: kèm `customerSummary` (tổng mua, vỏ, nợ) |

---

## Ví dụ thực tế

Đơn 4 bình 45kg × 680k = 2.720k; thu 1.000k TM → nợ thêm 1.720k → ledger +1.720.000.

Thu nợ 500k → ledger -500.000 → còn nợ 1.220.000.

---

## Edge cases

| Tình huống | Xử lý |
|------------|--------|
| Ghi nợ full (`0vnd no`) | `cashReceived=0`, toàn bộ vào nợ |
| Trả thừa | debtBalance âm → hiển thị "Dư" |
| Server restart | Session bot in-memory mất — user gõ lại /menu |
| Tên khách có ký tự `<` | Web escape HTML |

---

## Câu hỏi mở

1. Có cho phép void đơn hàng đã completed không?

---

## Cần chủ dự án xác nhận

- [x] Gas dư = trả NM only — không gas credit ledger (2026-06-24)
- [ ] Quy tắc xoá/ẩn khách
- [ ] Công thức gas dư (P3) đúng thực tế đại lý
