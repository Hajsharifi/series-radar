# زیر رادار سریال‌ها

PWA برای پیگیری سریال‌هایی که پخششان به‌زودی شروع می‌شود یا فصل جدید دارند. همهٔ سریال‌ها در بخش «زیر رادار» نمایش داده می‌شوند و فقط سریال‌های ستاره‌خورده یادآوری می‌گیرند.

## پیش‌نیازها

- Node.js 22+
- پروژهٔ Firebase
- کلید Bearer مربوط به TMDB
- فعال‌سازی Blaze Billing برای Cloud Scheduler

## راه‌اندازی Frontend

```bash
cd web
cp .env.example .env
# مقادیر Firebase را در .env قرار دهید
npm install
npm run dev
```

## راه‌اندازی Functions

```bash
cd functions
cp .env.example .env
# TMDB_BEARER_TOKEN را قرار دهید
npm install
npm run build
```

## Deploy

```bash
cp .firebaserc.example .firebaserc
# projectId را تنظیم کنید
firebase deploy
```

## مجوزها و اعلان‌ها

- اعلان وب در Android Chrome و Desktop پشتیبانی می‌شود.
- در iOS، اعلان وب فقط در صورت نصب PWA روی Home Screen و نسخهٔ جدید iOS کار می‌کند.
- مجوز اعلان پس از فعال‌سازی توسط کاربر درخواست می‌شود.
- کلید TMDB فقط در Cloud Functions استفاده می‌شود.

## محدودیت‌های نسخهٔ اول

- زمان پخش TMDB تقریبی است و معمولاً فقط تاریخ دارد، نه ساعت.
- یادآوری پیش‌فرض ۲۴ ساعت قبل از پخش، ساعت ۹ صبح به وقت تهران ارسال می‌شود.
- سریال‌های قدیمی که دوباره برمی‌گردند ممکن است در TMDB وضعیت «تمام‌شده» داشته باشند؛ برای پیگیری آن‌ها باید به علاقه‌مندی‌ها اضافه شوند.
```

Now build web to catch errors. Run npm run build. Could take. Need maybe run tsc. Let's do.<|end|><|start|>Assistant to=shell<|channel|>analysis <|constrain|>xml<|message|><rfl:parameter name="command">
cd web && npm run build