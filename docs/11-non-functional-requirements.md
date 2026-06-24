# GasOS — Non-Functional Requirements

**Phiên bản:** 1.0 | **Cập nhật:** 2026-06-24

---

## Mục tiêu

Yêu cầu phi chức năng áp dụng cho deployment hiện tại.

---

## Performance

| ID | Yêu cầu | Hiện trạng |
|----|---------|------------|
| NFR-P1 | API dashboard < 2s trên 200 khách | Chưa benchmark formal |
| NFR-P2 | Bot reply < 3s | Phụ thuộc Neon latency |

---

## Security

| ID | Yêu cầu | Hiện trạng |
|----|---------|------------|
| NFR-S1 | Bearer token mọi API secured | ✅ |
| NFR-S2 | Magic link one-time 5 phút | ✅ |
| NFR-S3 | Owner gate dashboard + CRUD | ✅ |
| NFR-S4 | Không lộ stack trace client | ✅ AppError |
| NFR-S5 | SESSION_SECRET trong .env | ⚠️ Chưa dùng trong code |
| NFR-S6 | Webhook secret (prod) | Optional TELEGRAM_WEBHOOK_SECRET |

---

## Availability

| ID | Yêu cầu | Hiện trạng |
|----|---------|------------|
| NFR-A1 | Neon PostgreSQL managed | ✅ |
| NFR-A2 | Bot session in-memory | ⚠️ Mất khi restart |

---

## Usability

| ID | Yêu cầu | Hiện trạng |
|----|---------|------------|
| NFR-U1 | Mobile-first bot | ✅ |
| NFR-U2 | ≤3 thao tác tác vụ thường | ✅ hầu hết flow |
| NFR-U3 | Dashboard tiếng Việt | ✅ |

---

## Maintainability

| ID | Yêu cầu | Hiện trạng |
|----|---------|------------|
| NFR-M1 | Monolith TypeScript | ✅ |
| NFR-M2 | docs = source of truth | ✅ v1.0 sync |
| NFR-M3 | Utils tái sử dụng | ✅ utils/money, phone, customer-display |

---

## Scalability (MVP)

1 đại lý / 1 deployment — multi-tenant **chưa** thiết kế.

---

## Cần xác nhận

- [ ] Chấp nhận in-memory bot session cho pilot
- [ ] SLA uptime mục tiêu
