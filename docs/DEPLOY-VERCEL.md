# Deploy GasOS lên Vercel + Telegram Webhook

**Mục tiêu:** Chạy thử miễn phí trên Vercel (HTTPS), bot Telegram dùng **webhook** (không polling).

---

## 1. Yêu cầu

| Dịch vụ | Ghi chú |
|---------|---------|
| [Vercel](https://vercel.com) | Hobby (free) |
| [Neon](https://neon.tech) | PostgreSQL — `DATABASE_URL` |
| Telegram Bot | `@BotFather` → token + username |

---

## 2. Chuẩn bị database

Trên máy local (đã có `.env` với `DATABASE_URL`):

```bash
npm run db:migrate
npm run db:seed
```

Chỉ cần làm **một lần** trên DB Neon production.

---

## 3. Deploy lên Vercel

### Cách A — GitHub (khuyến nghị)

1. Push repo lên GitHub (đã xong).
2. Vercel → **Add New Project** → import repo.
3. **Framework Preset:** Other  
4. **Build Command:** `npm run build` (đã có trong `vercel.json`)  
5. **Output Directory:** để trống (serverless, không static export)

### Biến môi trường (Vercel → Settings → Environment Variables)

| Biến | Ví dụ | Bắt buộc |
|------|-------|----------|
| `DATABASE_URL` | `postgresql://...neon...` | ✅ |
| `TELEGRAM_BOT_TOKEN` | từ BotFather | ✅ |
| `TELEGRAM_BOT_USERNAME` | `quanlydailygas_bot` | ✅ |
| `SESSION_SECRET` | chuỗi random 32+ ký tự | ✅ |
| `NODE_ENV` | `production` | ✅ |
| `PUBLIC_BASE_URL` | `https://ten-app.vercel.app` | ✅ |
| `TELEGRAM_WEBHOOK_SECRET` | chuỗi random (tuỳ chọn, nên có) | Khuyến nghị |
| `AGENCY_NAME` | `Đại lý Gas` | Tuỳ chọn |
| `ENABLE_CYLINDER_LEDGER` | `true` / `false` | Tuỳ chọn |
| `ENABLE_GAS_SURPLUS` | `false` | Tuỳ chọn |

**Quan trọng:**

- `PUBLIC_BASE_URL` = URL Vercel **không** có slash cuối — sau deploy lấy đúng domain (VD `https://gasos-xxx.vercel.app`).
- `NODE_ENV=production` → bot **webhook**, không polling.
- Webhook URL mặc định: `{PUBLIC_BASE_URL}/telegram/webhook`

Deploy xong → copy URL production vào `PUBLIC_BASE_URL` → **Redeploy** nếu lần đầu chưa biết URL.

---

## 4. Kích hoạt webhook Telegram

Sau deploy thành công:

1. Mở trình duyệt: `https://<ten-app>.vercel.app/`  
   → Trang **Deploy thành công** + hướng dẫn Telegram  
   → Hoặc `/health` → `{"status":"ok"}`  
   → Lần gọi đầu khởi tạo serverless + **tự đăng ký webhook** Telegram

2. Kiểm tra webhook (trên máy, thay `TOKEN`):

```bash
curl "https://api.telegram.org/bot<TOKEN>/getWebhookInfo"
```

Kết quả mong đợi: `"url": "https://<ten-app>.vercel.app/telegram/webhook"`

3. Nhắn bot trên Telegram → `/menu` hoặc `/start`.

---

## 5. Magic link Dashboard

- Chủ gõ `/dashboard` hoặc **Thống kê → Web**.
- Link dùng `PUBLIC_BASE_URL` — trên Vercel là **HTTPS** → nút **Mở Dashboard** hoạt động trên điện thoại.

---

## 6. Kiến trúc trên Vercel

```
Telegram → POST /telegram/webhook ──┐
Browser  → GET  /dashboard, /api/* ─┼→ api/index.ts → Fastify (serverless)
                                     └→ Neon PostgreSQL
```

- Dev local: `npm run dev` — **polling** (`NODE_ENV=development`).
- Production Vercel: **webhook** only.

---

## 7. Xử lý sự cố

| Triệu chứng | Cách xử lý |
|--------------|------------|
| Bot không phản hồi | Gọi `/health` → `getWebhookInfo` → kiểm tra `PUBLIC_BASE_URL`, `NODE_ENV=production` |
| Dashboard trắng / 500 | Xem Vercel **Functions** logs; kiểm tra `DATABASE_URL` |
| Magic link lỗi | `PUBLIC_BASE_URL` phải khớp domain Vercel |
| Webhook 401 | `TELEGRAM_WEBHOOK_SECRET` khớp giữa `.env` Vercel và Telegram (nếu bật) |
| Cold start chậm | Bình thường trên free tier (~1–3s lần đầu) |

---

## 8. Giới hạn free tier

- Vercel Hobby: timeout function ~10s (cấu hình `maxDuration: 30` cần Pro nếu vượt 10s).
- Neon free: quota connection — đủ cho pilot nhỏ.

---

## Cần xác nhận sau pilot

- [ ] Domain custom (tuỳ chọn)
- [ ] Nâng Pro nếu webhook/API thường xuyên >10s
