# GasOS — Definition of Done

**Phiên bản:** 1.0 | **Cập nhật:** 2026-06-24

---

## Mục tiêu

Tiêu chí hoàn thành feature/release cho GasOS MVP baseline.

---

## DoD — Feature mới

- [ ] Docs cập nhật (`docs/` hoặc `docs/features/`)
- [ ] Code + typecheck pass
- [ ] Unit test nghiệp vụ (nếu có logic money/ledger)
- [ ] Self review: bug, security, không phá phase cũ
- [ ] Manual test flow liên quan
- [ ] CHANGELOG entry (khi release)

---

## DoD — MVP Baseline (2026-06-24)

| Hạng mục | Trạng thái |
|----------|------------|
| Docs 00–14 sync code | ✅ v1.0 |
| Bot owner + employee flows | ✅ |
| Web dashboard 7 trang | ✅ |
| Debt ledger | ✅ |
| Order workflow | ✅ |
| Unit tests money | ✅ 7/7 |
| Unit tests services + utils | ✅ 42 tests |
| gas_credit_ledger | ❌ out of scope |
| Auto SMS/Zalo | ❌ backlog |

**Baseline = pilot-ready với test gap đã ghi nhận.**

---

## DoD — Release tag

1. `npm test` pass
2. `npx tsc --noEmit` pass
3. `.env.example` đầy đủ flags
4. `db:migrate` + seed tested
5. Chủ dự án ký **"TÔI PHÊ DUYỆT"** (cho release chính thức)

---

## Không coi là Done

- Chỉ code không docs
- Breaking API phase cũ không versioning
- Feature không test happy path manual

---

## Cần xác nhận

- [ ] Baseline MVP đạt DoD để triển khai pilot
