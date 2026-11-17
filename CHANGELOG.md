# Changelog

All notable changes to Series Radar are documented here.

## [v1.9.5] - 2026-11-17

- حذف کامل میراث Firebase/Firestore و اپ Flutter
- انتقال API پایتون به `server/` با تست pytest و اسکریپت deploy
- بازنویسی README و افزودن ARCHITECTURE / ATTRIBUTION / PRIVACY
- متمرکزکردن آدرس API در `web/src/lib/api.ts` و مهاجرت به HTTPS
- انتشار API و APK روی `https://radar.hajsharifi.online:8443` با Cloudflare
- Rate limit، prune خودکار کش، لاگ زمان‌دار و Network Security Config
- CI: oxlint + Vitest + pytest + بررسی APK و SHA-256 در Release
- نسخه‌دارکردن APK روی سرور برای rollback

## [v1.9.4] - 2026-11-17

- اصلاح تگ «فصل جدید» برای قسمت‌های فصل در حال پخش
- انتخاب چندمعیاره و سخت‌گیرانه برای پیشنهاد رادار
- نمایش کارگردان/سازنده و بازیگران اصلی فیلم و سریال
- اصلاح خواندن فیلدهای API در `normalizeTMDBTV`

## [v1.5.1] - 2026-11-16

- chore: release v1.5.1 (6eb59fc)

## [v1.5.0] - 2026-11-16

- v1.5.0: Code Splitting + React Query Foundation (875bd83)

## [v1.4.0] - 2026-11-16

- v1.4.0: Fix online tab logic - only show movies waiting for digital/physical release (3425b33)
- Add workflow_dispatch trigger for manual release (cf64ba9)

## [v1.3.0] - 2026-11-16

- Fix workflow: fetch all tags for changelog generation (1b79afb)
- Add GitHub Actions workflow for automatic APK release (2b65ecf)
- Series Radar v1.3.0 (8e4e9ed)
