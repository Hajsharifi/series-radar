# رادار سریال‌ها — Series Radar

اپ اندروید فارسی/RTL برای دنبال‌کردن سریال‌ها و فیلم‌هایی که پخش یا انتشارشان
نزدیک است. همه‌چیز روی خود گوشی ذخیره می‌شود: بدون ورود، بدون حساب ابری و
بدون همگام‌سازی اجباری.

## معماری واقعی

| لایه | فناوری | محل |
|---|---|---|
| رابط کاربری | React 19 + Vite + HashRouter | `web/src` |
| پوستهٔ اندروید | Java + WebView + AlarmManager | `android-native/` |
| API داده | Python 3 (`http.server`) + کش فایلی | `server/server.py` |
| داده‌ها | TMDB (فرادادهٔ سریال‌ها و فیلم‌ها)، TVMaze (تاریخ پخش قسمت‌ها)، Box Office Mojo، OMDB (اختیاری) | از طریق API |
| ذخیره‌سازی کاربر | `localStorage` + `sessionStorage` | روی دستگاه |

اپ وب داخل WebView اجرا می‌شود. اعلان‌ها و آلارم‌ها کاملاً محلی‌اند
(`AlarmManager` + `NotificationManager`) و هیچ سرور ارسال اعلان وجود ندارد.

## توسعهٔ رابط وب

پیش‌نیاز: **Node.js 22+** (Vite 8 و Vitest روی Node 18 اجرا نمی‌شوند).

```bash
cd web
npm install
npm run dev
```

در حالت توسعه، API روی `http://127.0.0.1:8090` انتظار می‌رود. در نسخهٔ
منتشرشده، آدرس از `web/src/lib/api.ts` می‌آید و پیش‌فرض آن
`https://radar.hajsharifi.online:8443` است. پورت ۴۴۳ در حال حاضر توسط فایروال میزبان به این سرویس باز نیست؛ پس از باز شدن، فقط همین یک مقدار عوض می‌شود.

```bash
npm run lint     # oxlint
npm test         # Vitest
npm run build    # typecheck + build + بررسی متن فارسی
```

## API داده

```bash
cd server
cp env.example env          # سپس مقادیر را پر کنید
mkdir -p cache
echo "<TMDB bearer token>" > token
chmod 600 token

# اجرای محلی
SERIES_RADAR_HOME=$PWD python3 server.py

# تست‌ها
python3 -m pytest tests -q

# استقرار روی سرور (systemd)
./deploy.sh
```

مسیرهای مهم:

- `GET /api/health`
- `GET /api/metrics` — uptime، درخواست‌ها، خطاها و آمار کش
- `GET /api/tv/popular`، `/api/tv/on_the_air`، `/api/tv/<id>`
- `GET /api/movies/quality`، `/api/movies/upcoming`
- `GET /api/movie/<id>`، `/api/movie/<id>/similar`
- `GET /api/tv/<id>`، `/api/person/<id>` (فیلموگرافی عوامل)
- `GET /api/boxoffice`
- `GET /api/search/multi?q=...`

کلید TMDB و `env` هرگز در گیت نیستند. کش در `server/cache/` قرار می‌گیرد و
فایل‌های قدیمی‌تر از ۳۰ روز به‌صورت خودکار پاک می‌شوند.

## ساخت APK

```bash
export JAVA_HOME=/usr/lib/jvm/java-17-openjdk-amd64
export ANDROID_HOME=/usr/lib/android-sdk
export GRADLE_OPTS="-Xmx2g"

cd web && npm run build
cd ../android-native
./gradlew assembleRelease --no-daemon -x lintVitalAnalyzeRelease -x lintVitalRelease
```

خروجی: `android-native/app/build/outputs/apk/release/app-release.apk`

- امضای release با `android-native/app/debug.keystore` انجام می‌شود؛ همین
  امضا برای نصب روی نسخهٔ قبلی الزامی است.
- تسک `syncWebAssets` قبل از هر build، `web/dist` را داخل assets کپی می‌کند.

## انتشار

```bash
python3 scripts/version-bump.py patch
cd web && npm run build
cd ../android-native && ./gradlew assembleRelease ...
git add -A && git commit -m "chore: release vX.Y.Z"
git tag -a vX.Y.Z -m "Release vX.Y.Z"
git push origin master --tags
```

گردش‌کار GitHub Actions تگ‌های `v*` را می‌بیند، APK را می‌سازد، امضا و
نسخه را بررسی می‌کند و Release می‌سازد. فایل هم روی
`http://31.56.229.237:8080/series-radar.apk` منتشر می‌شود.

## مستندات

- [`ARCHITECTURE.md`](ARCHITECTURE.md) — تصمیم‌های معماری و جریان داده
- [`ATTRIBUTION.md`](ATTRIBUTION.md) — منابع داده و الزامات نمایش
- [`PRIVACY.md`](PRIVACY.md) — داده‌های محلی و حریم خصوصی
- [`deploy/README.md`](deploy/README.md) — DNS، TLS، nginx و استقرار

## منابع داده

این محصول از APIی TMDB استفاده می‌کند اما توسط آن تأیید یا
پشتیبانی نشده است. جزئیات در `ATTRIBUTION.md`.
