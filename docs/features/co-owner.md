# Feature — Co-owner (Quản trị viên)

**Phiên bản:** 0.1 (Draft)  
**Trạng thái:** Đã triển khai (2026-06-24)  
**Ngày:** 2026-06-24

---

## Mục tiêu

Cho phép **vợ / con / người tin cậy** cùng quản lý đại lý (lên đơn, khách, thu nợ, thống kê, web) mà **không** cần dùng chung Telegram chủ.

---

## User

| Persona | Nhu cầu |
|---------|---------|
| Chủ chính | Giữ quyền mời thêm quản trị viên |
| Co-owner (tối đa 3) | Full quyền vận hành, **không** mời co-owner mới |

---

## Quyết định đã chốt (2026-06-24)

| # | Quyết định |
|---|------------|
| 1 | **1 chủ chính + tối đa 3 co-owner** (tối đa 4 tài khoản admin) |
| 2 | Co-owner **bằng quyền chủ**, trừ **mời co-owner** — chỉ **chủ chính** |
| 3 | MVP **không** thu hồi quyền co-owner |
| 4 | Mã mời co-owner TTL **72h**, one-time |

---

## Phân vai trò (database)

| Role | Số lượng | Mô tả |
|------|----------|--------|
| `owner` | **Đúng 1** | Chủ chính — kích hoạt từ seed / mã owner bootstrap |
| `co_owner` | **0–3** | Quản trị viên — mời từ bot **Đội ngũ** |
| `employee` | Không đổi | Nhân viên giao |

**Không** dùng nhiều user `role = owner`. Chủ chính = user duy nhất có `role = owner`.

---

## Flow bot — Đội ngũ

```
Đội ngũ
├── Nguyễn Văn A — Chủ đại lý          (role owner)
├── Trần Thị B — Quản trị viên         (role co_owner)
├── Lê Văn C — Nhân viên
├── 👑 Mời quản trị viên               ← CHỈ chủ chính; ẩn khi đủ 3 co-owner
├── 🔗 Tạo mã mời NV
└── ◀️ Menu
```

**Mời quản trị viên (chủ chính only):**

1. Kiểm tra `count(co_owner) < 3`
2. Tạo mã `GAS-…`, role `co_owner`, TTL 72h
3. Gửi mã + deep link
4. Người nhận `/start` → menu admin (`/menu_admin`)

**Co-owner** thấy nút **Mời quản trị viên** → **không hiện** (hoặc từ chối nếu gọi callback).

---

## Quyền (ma trận)

| Thao tác | Chủ chính | Co-owner | NV |
|----------|-----------|----------|-----|
| Menu admin | ✅ | ✅ | ❌ |
| Khách / lên đơn / thu nợ | ✅ | ✅ | ❌ |
| Thống kê / web dashboard | ✅ | ✅ | ❌ |
| Cài đặt giá | ✅ | ✅ | ❌ |
| Mời co-owner | ✅ | ❌ | ❌ |
| Mời NV | ✅ | ✅ | ❌ |
| Giao hàng / nhận đơn | ✅ | ✅ | ✅ (theo gán) |

---

## Business rules

| ID | Rule |
|----|------|
| BR-CO01 | Tối đa **1** user `role = owner` |
| BR-CO02 | Tối đa **3** user `role = co_owner` |
| BR-CO03 | Chỉ `role = owner` tạo mã mời `co_owner` |
| BR-CO04 | Mã co_owner: TTL 72h, one-time |
| BR-CO05 | Kích hoạt khi đã 3 co_owner → từ chối |
| BR-CO06 | MVP không thu hồi co_owner |
| BR-CO07 | Thống kê hiển thị: co-owner **X/3** (+ chủ chính riêng hoặc gộp dòng) |

---

## API / code

| Thay đổi | Chi tiết |
|----------|----------|
| Enum `user_role` | Thêm `co_owner` |
| `assertAdmin(user)` | `owner` \| `co_owner` — thay `assertOwner` ở chỗ vận hành chung |
| `assertPrimaryOwner(user)` | Chỉ `role === owner` — mời co-owner |
| `createInviteCode` | Nhận `co_owner`; guard count |
| `activateInvite` | Guard co_owner count; owner bootstrap chỉ khi chưa có owner |
| `listTeamMembers` | Liệt kê 1 owner + tất cả co_owner + NV |
| Bot `team-flow` | Nút mời QT; ẩn với co_owner |

---

## Edge cases

| Tình huống | Xử lý |
|------------|--------|
| Đủ 3 co-owner | Ẩn nút mời; báo lỗi nếu kích hoạt mã thứ 4 |
| Co-owner bấm mời QT | Không hiện nút / forbidden |
| 1 Telegram đã là NV | Không đổi role MVP — cần Telegram khác |
| Mã co_owner hết hạn | Tạo mã mới (chủ chính) |
| Server restart | Không ảnh hưởng role DB |

---

## KPI

- ≥1 đại lý pilot dùng ≥2 admin Telegram trong 30 ngày
- 0 lỗi kích hoạt vượt quota co-owner

---

## Test bắt buộc

- Chủ tạo mã co_owner thành công (< 3)
- Co-owner kích hoạt → menu admin
- Co-owner **không** tạo được mã co_owner
- Kích hoạt co_owner thứ 4 → lỗi
- `listTeamMembers` hiển thị đủ owner + co_owner
- Web dashboard: co_owner đăng nhập được

---

## Out of scope (backlog)

- Thu hồi quyền co-owner
- Đổi NV → co-owner cùng Telegram
- Phân quyền co-owner (chỉ lên đơn, không thu nợ)

---

## Cần chủ dự án xác nhận

- [ ] 「TÔI PHÊ DUYỆT」 triển khai code + migration enum
