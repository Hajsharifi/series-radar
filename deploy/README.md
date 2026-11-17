# استقرار زیرساخت

این پوشه تنظیمات زندهٔ سرور را در گیت نگه می‌دارد تا بازسازی و rollback ممکن
باشد.

## پیش‌نیازها

- دامنه: `radar.hajsharifi.online`
- رکورد DNS از نوع A به `31.56.229.237` (در Cloudflare، **Proxied**)
- توکن DNS کلودفلر برای certbot: `/etc/letsencrypt/cloudflare.ini`
- nginx نصب‌شده

## گام ۱ — DNS و گواهی

رکورد A را در Cloudflare بساز و سپس:

```bash
certbot certonly --dns-cloudflare \
  --dns-cloudflare-credentials /etc/letsencrypt/cloudflare.ini \
  --dns-cloudflare-propagation-seconds 15 \
  -d radar.hajsharifi.online --non-interactive --agree-tos --keep-until-expiring
```

تمدید خودکار توسط تایمر certbot انجام می‌شود.

## گام ۲ — nginx

```bash
cp deploy/nginx/series-radar-limit.conf /etc/nginx/conf.d/
cp deploy/nginx/series-radar.conf /etc/nginx/sites-available/series-radar
ln -sf /etc/nginx/sites-available/series-radar /etc/nginx/sites-enabled/series-radar
systemctl reload nginx
```

**نکتهٔ پورت:** پورت ۴۴۳ در حال حاضر از سمت فایروال میزبان به این سرویس باز
نیست. برای همین nginx روی `8443` گوش می‌دهد و Cloudflare در لبه TLS را
ترمینیت می‌کند:

- `https://radar.hajsharifi.online:8443/api/...`
- `https://radar.hajsharifi.online:8443/apk/series-radar.apk`

اگر بعداً ۴۴۳ باز شد یا Origin Rule در Cloudflare به 8443 تنظیم شد، فقط
`listen`ها و `web/src/lib/api.ts` را به ۴۴۳ تغییر بده.

## گام ۳ — سرویس APK

```bash
cp deploy/systemd/series-radar-share.service /etc/systemd/system/
systemctl daemon-reload
systemctl enable --now series-radar-share.service
```

فایل‌ها در `/var/www/apk/` قرار می‌گیرند:

- `series-radar.apk` — آخرین نسخه
- `series-radar-<version>.apk` — نسخه‌دار برای rollback

## گام ۴ — API

```bash
./server/deploy.sh
# یا برای به‌روزرسانی unit:
INSTALL_UNIT=1 ./server/deploy.sh
```

تنظیمات حساس در `/opt/series-radar-api/env` و `/opt/series-radar-api/token`
هستند (خارج از گیت، mode 600).

## نکتهٔ محیط فعلی

روی این سرور، workerهای nginx با کاربر `nobody` اجرا می‌شوند و لاگ‌ها به
`/tmp/nginx-*.log` منتقل شده‌اند تا فرایند استقرار بدون دسترسی chown کار کند.
روی یک هاست معمولی می‌توانید `user www-data;` و مسیرهای
`/var/log/nginx/` را برگردانید.

## بررسی سلامت

```bash
curl -fsS https://radar.hajsharifi.online:8443/api/health
curl -fsSI https://radar.hajsharifi.online:8443/apk/series-radar.apk
```
