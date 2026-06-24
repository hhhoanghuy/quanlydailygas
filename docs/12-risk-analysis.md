# GasOS — Risk Analysis

**Phiên bản:** 1.0 | **Cập nhật:** 2026-06-24

---

## Bảng rủi ro

| ID | Rủi ro | Mức | Mitigation hiện tại |
|----|--------|-----|---------------------|
| R1 | Mất session bot khi restart | Trung bình | User /menu; docs ghi rõ |
| R2 | Test coverage thấp | Cao | 7 test money only — cần bổ sung |
| R3 | Cylinder ledger tắt mặc định | Trung bình | Flag + backfill endpoint |
| R4 | NV nhập sai compact syntax | Trung bình | Preview trước confirm |
| R5 | Magic link lộ qua chat Telegram | Thấp | TTL 5 phút, one-time |
| R6 | Không gas credit ledger | Thấp | Chỉ gas dư trả NM — đã thống nhất 2026-06-24 |
| R7 | Hard delete customer nhầm | Thấp | Rule canDelete + confirm |
| R8 | Single DB no backup policy | Cao | Neon backup — CẦN CHỦ XÁC NHẬN policy |
| R9 | /no command không check auth | Thấp | Chỉ lộ nợ nếu biết query |

---

## Rủi ro kỹ thuật nợ

Ledger sai → mất tin khách. **Mitigation:** append-only, void đảo, không sửa trực tiếp.

---

## Rủi ro vỏ

Ledger tắt → dashboard vỏ trống dù có giao. **Mitigation:** bật ENABLE_CYLINDER_LEDGER + backfill.

---

## Cần xác nhận

- [x] Gas dư trả NM only (2026-06-24)
- [ ] Backup/restore procedure
