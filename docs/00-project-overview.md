# GasOS — Tổng quan dự án

**Phiên bản tài liệu:** 1.0  
**Trạng thái:** Phản ánh code triển khai (baseline MVP)  
**Cập nhật:** 2026-06-24  
**Stack:** Node.js + TypeScript, Fastify, grammY (Telegram), Drizzle ORM, PostgreSQL (Neon)

---

## Mục tiêu tài liệu

Mô tả GasOS **đúng với hệ thống đang chạy**: vai trò người dùng, luồng nghiệp vụ, kênh truy cập, và cấu trúc tài liệu.

## Phạm vi

- Tổng quan sản phẩm và kiến trúc cấp cao
- Chi tiết nghiệp vụ → `04-business-rules.md`, `05-user-flow.md`
- Chi tiết kỹ thuật → `07-database-design.md`, `08-api-design.md`

---

## GasOS là gì?

Hệ thống quản lý **vận hành đại lý gas** qua **Telegram Bot** (chủ + nhân viên giao) và **Web Dashboard** (chủ đại lý).

### Không phải

POS, ERP, phần mềm kế toán, CRM.

### Tập trung

| # | Nhu cầu | Cách triển khai hiện tại |
|---|---------|---------------------------|
| 1 | Công nợ | `debt_ledger` — không lưu nợ trên bảng khách |
| 2 | Vỏ bình | `cylinder_ledger` (bật qua `ENABLE_CYLINDER_LEDGER`) |
| 3 | Gas dư trả nhà máy | `delivery_lines.gas_surplus_kg` + báo cáo dashboard |
| 4 | Giao nhận | Luồng **Đơn hàng → NV hoàn thành → Delivery** |
| 5 | Theo dõi vận hành | Thống kê bot + dashboard web |

---

## Vai trò người dùng

| Vai trò | Telegram | Web Dashboard |
|---------|----------|---------------|
| **Chủ đại lý** | Lên đơn, khách, thống kê, cài đặt, tra nợ | ✅ Magic link (chỉ owner) |
| **NV giao hàng** | Đơn cần giao, hoàn thành giao, tra nợ | ❌ Không hỗ trợ |
| **Khách mua gas** | Không dùng app | Chỉ là dữ liệu `customers` |

---

## Kiến trúc triển khai

```
Telegram Bot (grammY)          Web SPA (/dashboard)
        │                              │
        └──────────┬───────────────────┘
                   ▼
            Fastify API /api/v1
                   ▼
         PostgreSQL (Drizzle ORM)
```

- **Dev:** bot polling, `npm run dev` port 3000
- **Production:** Telegram webhook `POST /telegram/webhook`

---

## Trạng thái triển khai (2026-06-24)

| Module | Trạng thái |
|--------|------------|
| Kích hoạt / mã mời | ✅ |
| Khách hàng (CRUD bot + web) | ✅ |
| Đơn hàng + giao hàng NV | ✅ |
| Công nợ + thu nợ | ✅ |
| Dashboard web 7 trang | ✅ |
| Vỏ bình (ledger) | ✅ (feature flag) |
| Gas dư báo cáo | ✅ (bình ≥20kg, NV nhập lúc giao) |
| Gas credit ledger (số dư khách) | ❌ Out of scope — đã thống nhất 2026-06-24 |
| Gửi SMS/Zalo tự động | ❌ Chỉ có preview tin nhắn |

---

## Kết quả test (2026-06-24)

```bash
npm test        # vitest — 42/42 passed
npx tsc --noEmit # 0 errors
```

Chi tiết: `docs/13-test-strategy.md`

---

## Cấu trúc tài liệu

| File | Nội dung |
|------|----------|
| `01-product-vision.md` | Tầm nhìn MVP |
| `02-problem-analysis.md` | Bài toán đại lý |
| `03-target-customer.md` | Đối tượng |
| `04-business-rules.md` | Quy tắc nghiệp vụ |
| `05-user-flow.md` | Luồng bot + web |
| `06-use-cases.md` | Use case |
| `07-database-design.md` | Schema |
| `08-api-design.md` | REST API |
| `09-ui-wireframe.md` | Dashboard + bot UI |
| `10-phase-roadmap.md` | Lộ trình |
| `11-non-functional-requirements.md` | NFR |
| `12-risk-analysis.md` | Rủi ro |
| `13-test-strategy.md` | Chiến lược test |
| `14-definition-of-done.md` | DoD |

---

## Ví dụ thực tế

Chủ lên đơn 4 bình 45kg cho quán Phở Hoa → gán NV An → An nhận Telegram → giao xong nhập `4 3 680000vnd tm` → hệ thống ghi delivery, nợ, vỏ (nếu bật ledger) → chủ xem dashboard hoặc tra nợ bot.

---

## Edge cases đã xử lý trong code

- Đơn phải gán NV trước khi giao
- NV không giao đơn của người khác
- Xoá khách: chỉ khi nợ = 0 và chưa có lịch sử giao
- Magic link hết hạn 5 phút, dùng 1 lần

---

## Câu hỏi mở

1. NV có cần quyền web read-only không?
2. Gửi tin nhắn xác nhận khách qua kênh nào (Zalo OA / SMS)?

---

## Cần chủ dự án xác nhận

- [x] Gas dư trả NM — không gas credit ledger (2026-06-24)
- [ ] Chấp nhận web chỉ dành cho chủ đại lý
- [ ] Phê duyệt baseline docs v1.0 làm source of truth
