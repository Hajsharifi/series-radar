import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useScheduleContext } from "../hooks/ScheduleContext";
import { useFavorites } from "../hooks/useFavorites";
import { useMovieFavorites } from "../hooks/useMovies";
import { usePullToRefresh } from "../hooks/usePullToRefresh";
import { leadHoursLabel, relativeSyncLabel, toPersianDigits } from "../lib/date";
import { LEAD_OPTIONS, getSettings, setDefaultLeadHours, setQuietHours } from "../lib/settings";
import {
  checkDownloadLinksNow,
  checkMovieWatchlistNow,
  downloadAndInstallApk,
  getDownloadCheckStatus,
  getBackgroundCheckStatus,
  isNativeApp,
  openExactAlarmSettings,
  openExternalUrl,
  requestNotificationPermission,
} from "../lib/native";
import { setAmoled, useAmoled } from "../lib/theme";
import { BackButton } from "../components/BackButton";
import { downloadBackup, importBackup, readBackupFile } from "../lib/backup";

declare const __APP_VERSION__: string;

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-white/6 py-2.5 last:border-0">
      <span className="text-caption text-muted">{label}</span>
      <span className="text-body font-medium text-copy">{value}</span>
    </div>
  );
}

export function SettingsPage() {
  const schedule = useScheduleContext();
  const favorites = useFavorites();
  const movieFavorites = useMovieFavorites();
  const [message, setMessage] = useState("");
  const [updateInfo, setUpdateInfo] = useState<{ version: string; apkUrl: string; pageUrl: string } | null>(null);
  const amoled = useAmoled();
  const [defaultLead, setLead] = useState(() => getSettings().defaultLeadHours);
  const [quietEnabled, setQuietEnabled] = useState(() => getSettings().quietHoursEnabled);
  const [quietStart, setQuietStart] = useState(() => getSettings().quietStart);
  const [quietEnd, setQuietEnd] = useState(() => getSettings().quietEnd);
  const [bgCheck, setBgCheck] = useState(() => getBackgroundCheckStatus());
  const [dlCheck, setDlCheck] = useState(() => getDownloadCheckStatus());

  usePullToRefresh(() => schedule.refresh(), { threshold: 80 });

  useEffect(() => {
    const sync = () => {
      setBgCheck(getBackgroundCheckStatus());
      setDlCheck(getDownloadCheckStatus());
    };
    sync();
    document.addEventListener("visibilitychange", sync);
    return () => document.removeEventListener("visibilitychange", sync);
  }, []);

  function clearScheduleCache() {
    try {
      localStorage.removeItem("sr:schedule:v1");
      localStorage.removeItem("sr:minute:v2");
      for (const key of Object.keys(localStorage)) {
        if (key.startsWith("sr:movies:v1:") || key === "sr:boxoffice:v1") localStorage.removeItem(key);
      }
      setMessage("کش داده پاک شد؛ اپ دوباره از منبع می‌خواند.");
      window.setTimeout(() => window.location.reload(), 600);
    } catch {
      setMessage("پاک کردن کش ممکن نشد.");
    }
  }

  async function checkUpdate() {
    setMessage("در حال بررسی آپدیت…");
    try {
      const res = await fetch(
        "https://api.github.com/repos/Hajsharifi/series-radar/releases/latest",
        { cache: "no-store" },
      );
      if (!res.ok) throw new Error("HTTP " + res.status);
      const data = (await res.json()) as {
        tag_name?: string;
        html_url?: string;
        assets?: Array<{ name?: string; browser_download_url?: string }>;
      };
      const latest = (data.tag_name || "").replace(/^v/, "");
      if (!latest) throw new Error("not found");
      setUpdateInfo(null);
      if (latest === __APP_VERSION__) {
        setMessage(`شما روی آخرین نسخه هستید (${toPersianDigits(__APP_VERSION__)}).`);
      } else {
        const apk = (data.assets || []).find((asset) => asset.name?.endsWith(".apk") && asset.browser_download_url);
        if (apk?.browser_download_url) {
          setUpdateInfo({
            version: latest,
            apkUrl: apk.browser_download_url,
            pageUrl: data.html_url || "https://github.com/Hajsharifi/series-radar/releases",
          });
        }
        setMessage(`نسخهٔ جدید ${toPersianDigits(latest)} موجود است — دانلود از GitHub releases.`);
      }
    } catch {
      setMessage("بررسی آپدیت ممکن نشد — اتصال اینترنت را چک کنید.");
    }
  }

  function reportError() {
    try {
      const logs = localStorage.getItem("sr:error-log:v1") || "هیچ خطایی ثبت نشده است.";
      // Show the log to the user so they can copy/share it with the developer.
      window.prompt("آخرین خطاهای ثبتشده (برای کپی کردن):", logs.slice(0, 4000));
    } catch {
      setMessage("دسترسی به لاگ ممکن نشد.");
    }
  }

  function clearFavorites() {
    if (!window.confirm("همهٔ ستاره‌ها (سریال و فیلم) حذف شوند؟")) return;
    try {
      localStorage.removeItem("sr:favorites:v1");
      localStorage.removeItem("sr:favorites:v2");
      localStorage.removeItem("sr:movie-favorites:v1");
      localStorage.removeItem("sr:movie-track:v1");
      window.dispatchEvent(new Event("sr-favorites-changed"));
      window.dispatchEvent(new Event("sr-movie-favorites-changed"));
      window.dispatchEvent(new Event("sr-movie-track-changed"));
      setMessage("ستاره‌ها پاک شدند.");
    } catch {
      setMessage("پاک کردن ستاره‌ها ممکن نشد.");
    }
  }

  return (
    <div className="space-y-5">
      <BackButton />
      <header>
        <h1 className="text-headline text-white">تنظیمات</h1>
        <p className="mt-1 text-caption text-muted">داده‌ها، یادآوری و وضعیت اپ</p>
      </header>

      <section className="rounded-card border border-amber-400/25 bg-amber-500/10 p-4">
        <h2 className="mb-1 text-title text-amber-200">پیش از به‌روزرسانی</h2>
        <p className="text-caption leading-relaxed text-amber-100/90">
          قبل از نصب نسخهٔ جدید، از تنظیمات پشتیبان بگیرید تا ستاره‌ها و یادآورها از دست نروند.
          در صورت تغییر کلید امضا، باید نسخهٔ قبلی را حذف و نسخهٔ جدید را نصب کنید.
        </p>
        <button
          type="button"
          onClick={downloadBackup}
          className="mt-2 rounded-lg bg-amber-400/20 px-3 py-1.5 text-xs font-semibold text-amber-100 active:bg-amber-400/30"
        >
          دانلود پشتیبان
        </button>
      </section>

      <section className="rounded-card border border-edge/10 bg-panel/70 p-4">
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-title text-white">داده‌ها</h2>
          <span className="rounded-full bg-emerald-400/12 px-2 py-0.5 text-micro font-medium text-emerald-300">
            TMDB
          </span>
        </div>
        <Row label="تعداد سریال‌های زیر رادار" value={`${toPersianDigits(schedule.shows.length)} سریال`} />
        <Row
          label="منبع فعلی"
          value={schedule.source === "network" ? "آنلاین" : schedule.source === "cache" ? "کش‌شده" : "دادهٔ همراه اپ"}
        />
        <div className="flex items-center justify-between gap-3 py-2.5">
          <span className="text-caption text-muted">آخرین به‌روزرسانی</span>
          <span className="text-body font-medium text-copy">{relativeSyncLabel(schedule.updatedAt)}</span>
        </div>
        <div className="mt-2 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={schedule.refresh}
            className="rounded-lg bg-amber-400 px-3.5 py-2 text-xs font-semibold text-ink-950"
          >
            {schedule.refreshing ? "در حال به‌روزرسانی…" : "به‌روزرسانی کامل"}
          </button>
          <button
            type="button"
            onClick={clearScheduleCache}
            className="rounded-lg border border-white/10 bg-white/5 px-3.5 py-2 text-xs text-ink-200"
          >
            پاک کردن کش داده
          </button>
        </div>
        <p className="mt-2 text-caption leading-relaxed text-muted">
          برنامهٔ امروز و فردا هر دقیقه بررسی می‌شود و فهرست کامل هر ۶ ساعت به‌روزرسانی می‌شود. تاریخ‌ها و ساعت
          پخش به وقت تهران هستند.
        </p>
      </section>

      <section className="rounded-card border border-edge/10 bg-panel/70 p-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="text-title text-white">حالت AMOLED</h2>
            <p className="mt-0.5 text-caption leading-relaxed text-muted">
              پسزمینهٔ مشکی مطلق؛ مصرف باتری را در صفحههای OLED کاهش میدهد.
            </p>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={amoled}
            onClick={() => setAmoled(!amoled)}
            className={`relative h-7 w-12 shrink-0 rounded-full transition ${amoled ? "bg-amber-400" : "bg-white/15"}`}
          >
            <span className={`absolute top-1 h-5 w-5 rounded-full bg-white transition ${amoled ? "left-1" : "right-1"}`} />
          </button>
        </div>
      </section>

      <section className="rounded-card border border-edge/10 bg-panel/70 p-4">
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-title text-white">یادآوری</h2>
          <span className="rounded-full bg-emerald-400/12 px-2 py-0.5 text-micro font-medium text-emerald-300">
            {isNativeApp() ? "فعال" : "در اپ اندروید"}
          </span>
        </div>
        <Row label="زمان پیش‌فرض" value={leadHoursLabel(defaultLead)} />
        <Row label="سریال‌های ستاره‌دار" value={`${toPersianDigits(favorites.items.length)} سریال`} />
        <Row label="فیلم‌های ستاره‌دار" value={`${toPersianDigits(movieFavorites.items.length)} فیلم`} />
        <div className="mt-2">
          <p className="mb-1.5 text-caption text-muted">زمان پیش‌فرض یادآوری</p>
          <div className="flex flex-wrap gap-1.5">
            {LEAD_OPTIONS.map((option) => (
              <button
                key={option.hours}
                type="button"
                onClick={() => {
                  setDefaultLeadHours(option.hours);
                  setLead(option.hours);
                }}
                className={`sr-no-tap rounded-lg px-2.5 py-1 text-caption ${
                  defaultLead === option.hours ? "bg-amber-400 font-semibold text-ink-950" : "bg-white/6 text-ink-300"
                }`}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>
        <p className="mt-2 text-caption leading-relaxed text-muted">
          یادآوری هر سریال در صفحهٔ جزئیات آن قابل تنظیم است. یادآوریها در ساعت مناسب ۰۸:۰۰ تا ۲۲:۰۰ به وقت تهران ارسال میشوند تا مزاحم خواب نشوند.
        </p>
        <div className="mt-3 rounded-xl border border-edge/10 bg-black/25 p-3">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-xs font-semibold text-white">ساعت سکوت</p>
              <p className="mt-0.5 text-micro leading-relaxed text-muted">
                اعلان‌های این بازه به پایان آن موکول می‌شوند؛ اگر بعد از پخش بیفتند، ارسال نمی‌شوند.
              </p>
            </div>
            <button
              type="button"
              aria-label="تغییر ساعت سکوت"
              aria-pressed={quietEnabled}
              onClick={() => {
                const next = !quietEnabled;
                setQuietEnabled(next);
                setQuietHours(next, quietStart, quietEnd);
              }}
              className={`relative h-6 w-11 shrink-0 rounded-full transition ${quietEnabled ? "bg-amber-400" : "bg-white/15"}`}
            >
              <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition ${quietEnabled ? "left-0.5" : "right-0.5"}`} />
            </button>
          </div>
          {quietEnabled && (
            <div className="mt-3 grid grid-cols-2 gap-2">
              <label className="text-micro text-muted">
                از
                <input
                  type="time"
                  value={quietStart}
                  onChange={(event) => {
                    setQuietStart(event.target.value);
                    setQuietHours(true, event.target.value, quietEnd);
                  }}
                  className="mt-1 w-full rounded-lg border border-white/10 bg-black/40 px-2 py-1.5 text-xs text-white"
                />
              </label>
              <label className="text-micro text-muted">
                تا
                <input
                  type="time"
                  value={quietEnd}
                  onChange={(event) => {
                    setQuietEnd(event.target.value);
                    setQuietHours(true, quietStart, event.target.value);
                  }}
                  className="mt-1 w-full rounded-lg border border-white/10 bg-black/40 px-2 py-1.5 text-xs text-white"
                />
              </label>
            </div>
          )}
        </div>
        {isNativeApp() && (
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => {
                requestNotificationPermission();
                setMessage("درخواست مجوز اعلان ارسال شد. اگر پنجره‌ای ظاهر نشد، مجوز قبلاً صادر شده است.");
              }}
              className="rounded-lg border border-white/10 bg-white/5 px-3.5 py-2 text-xs text-ink-200"
            >
              درخواست مجوز اعلان
            </button>
            <button
              type="button"
              onClick={() => {
                openExactAlarmSettings();
                setMessage("صفحه تنظیمات آلارم دقیق باز شد.");
              }}
              className="rounded-lg border border-white/10 bg-white/5 px-3.5 py-2 text-xs text-ink-200"
            >
              تنظیم آلارم دقیق
            </button>
          </div>
        )}
      </section>

      {isNativeApp() && (
        <section className="rounded-card border border-edge/10 bg-panel/70 p-4">
          <h2 className="mb-2 text-sm font-bold text-white">بررسی پسزمینهٔ فیلمها</h2>
          <p className="mb-1 text-caption leading-relaxed text-muted">
            فیلمهای ستارهداری که تاریخ دیجیتالشان نامشخص است، هر ۶ ساعت یکبار از سرور بررسی میشوند.
            این بررسی تقریبی است و ممکن است در حالت کممصرف با تأخیر اجرا شود.
          </p>
          <Row
            label="آخرین بررسی"
            value={
              bgCheck?.lastCheck
                ? relativeSyncLabel(new Date(bgCheck.lastCheck).toISOString())
                : "هنوز انجام نشده"
            }
          />
          <Row
            label="نتیجهٔ آخرین بررسی"
            value={
              !bgCheck?.lastCheck
                ? "—"
                : bgCheck.lastOk
                  ? "موفق"
                  : "ناموفق (اتصال)"
            }
          />
          <Row label="فیلمهای تحت بررسی" value={`${toPersianDigits(bgCheck?.watched ?? 0)} فیلم`} />
          {!bgCheck?.armed && (
            <p className="mt-2 text-caption leading-relaxed text-muted">
              با ستارهزدن یک فیلم بررسی پسزمینه فعال میشود؛ اولین بار حدود ۱۵ دقیقه بعد انجام میشود.
            </p>
          )}
          <button
            type="button"
            onClick={() => {
              checkMovieWatchlistNow();
              setMessage("درخواست بررسی ارسال شد؛ چند ثانیه بعد دوباره نگاه کنید.");
              window.setTimeout(() => setBgCheck(getBackgroundCheckStatus()), 2500);
            }}
            className="mt-3 rounded-lg border border-white/10 bg-white/5 px-3.5 py-2 text-xs text-ink-200 active:bg-white/10"
          >
            بررسی فیلمها همین حالا
          </button>
        </section>
      )}

      {isNativeApp() && (
        <section className="rounded-card border border-edge/10 bg-panel/70 p-4">
          <h2 className="mb-2 text-sm font-bold text-white">بررسی لینکهای دانلود</h2>
          <p className="mb-1 text-caption leading-relaxed text-muted">
            سریالها و فیلمهای ستارهشده (و فیلمهای اخیراً آرشیوشده) هر ۱ ساعت یکبار از منبع دانلود چک میشوند.
            لینک جدید فقط یکبار اعلان میدهد؛ خطای منبع یا اینترنت اعلانی ندارد.
          </p>
          <Row
            label="آخرین بررسی"
            value={
              dlCheck?.lastCheck
                ? relativeSyncLabel(new Date(dlCheck.lastCheck).toISOString())
                : "هنوز انجام نشده"
            }
          />
          <Row label="نتیجهٔ آخرین بررسی" value={!dlCheck?.lastCheck ? "—" : dlCheck.lastOk ? "موفق" : "ناموفق (اتصال)"} />
          <Row label="آیتمهای تحت بررسی" value={`${toPersianDigits(dlCheck?.watched ?? 0)} مورد`} />
          {!dlCheck?.armed && (
            <p className="mt-2 text-caption text-muted">
              با ستارهزدن یک عنوان، بررسی لینک دانلود هم فعال میشود.
            </p>
          )}
          <button
            type="button"
            onClick={() => {
              checkDownloadLinksNow();
              setMessage("درخواست بررسی لینکها ارسال شد؛ چند ثانیه بعد دوباره نگاه کنید.");
              window.setTimeout(() => setDlCheck(getDownloadCheckStatus()), 2500);
            }}
            className="mt-3 rounded-lg border border-white/10 bg-white/5 px-3.5 py-2 text-xs text-ink-200 active:bg-white/10"
          >
            بررسی لینکها همین حالا
          </button>
        </section>
      )}

      <section className="rounded-card border border-edge/10 bg-panel/70 p-4">
        <h2 className="mb-2 text-sm font-bold text-white">ستاره‌ها</h2>
        <p className="text-caption leading-relaxed text-muted">
          ستاره‌ها روی همین گوشی ذخیره می‌شوند و با بستن اپ پاک نمی‌شوند.
        </p>
        <button
          type="button"
          onClick={clearFavorites}
          className="mt-3 rounded-lg border border-red-400/25 bg-red-500/10 px-3.5 py-2 text-xs text-red-200"
        >
          حذف همهٔ ستاره‌ها
        </button>
      </section>

      <section className="rounded-card border border-edge/10 bg-panel/70 p-4">
        <h2 className="mb-2 text-sm font-bold text-white">پشتیبان‌گیری و بازیابی</h2>
        <p className="text-caption leading-relaxed text-muted">
          تمام ستاره‌ها (سریال و فیلم) در یک فایل JSON ذخیره یا از فایل بازیابی می‌شوند.
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={downloadBackup}
            className="rounded-lg bg-emerald-400 px-3.5 py-2 text-xs font-semibold text-emerald-950"
          >
            خروجی گرفتن (Export)
          </button>
          <label className="rounded-lg border border-white/10 bg-white/5 px-3.5 py-2 text-xs text-ink-200 cursor-pointer flex items-center gap-1.5">
            بازیابی (Import)
            <input
              type="file"
              accept=".json"
              className="sr-only"
              onChange={async (e) => {
                const file = e.target.files?.[0];
                if (!file) return;
                const text = await readBackupFile(file);
                const result = importBackup(text);
                if (result.ok) {
                  setMessage("بازیابی انجام شد؛ صفحه بازنشانی می‌شود.");
                  window.setTimeout(() => window.location.reload(), 800);
                } else {
                  setMessage("خطا: " + (result.error ?? "نامشخص"));
                }
                e.target.value = "";
              }}
            />
          </label>
        </div>
      </section>

      <section className="rounded-card border border-edge/10 bg-panel/70 p-4">
        <h2 className="mb-2 text-sm font-bold text-white">درباره</h2>
        <Row label="نسخه" value={toPersianDigits(__APP_VERSION__)} />
        <Row label="منبع داده" value="TMDB · TVMaze · Box Office Mojo" />
        <Row label="تقویم" value="شمسی + میلادی" />
        <Row label="یادآوری" value="آلارم اندروید" />
        <Row label="وضعیت ورود" value="محلی، بدون حساب" />
        <p className="mt-2 text-caption leading-relaxed text-muted">
          سریال‌ها و فیلم‌ها (فراداده) و تاریخ‌های انتشار از TMDB و TVMaze، و اعداد گیشه
          از Box Office Mojo گرفته می‌شوند. همهٔ داده‌های تو محلی است و نیازی به ورود یا حساب ابری نیست.
        </p>
        <p className="mt-2 text-caption leading-relaxed text-muted">
          This product uses the TMDB API but is not endorsed or certified by TMDB.
        </p>
        <div className="mt-2 flex flex-wrap gap-2">
          <button type="button" onClick={() => openExternalUrl("https://www.themoviedb.org/")} className="rounded-lg bg-white/6 px-2.5 py-1 text-caption text-ink-200">
            TMDB
          </button>

          <button type="button" onClick={() => openExternalUrl("https://www.boxofficemojo.com/")} className="rounded-lg bg-white/6 px-2.5 py-1 text-caption text-ink-200">
            Box Office Mojo
          </button>

          <button type="button" onClick={() => openExternalUrl("https://www.tvmaze.com/")} className="rounded-lg bg-white/6 px-2.5 py-1 text-caption text-ink-200">
            TVMaze
          </button>
        </div>
        {isNativeApp() && (
          <button
            type="button"
            onClick={checkUpdate}
            className="mt-3 w-full rounded-lg border border-sky-400/30 bg-sky-400/10 px-3.5 py-2 text-xs font-semibold text-sky-200 active:bg-sky-400/20"
          >
            بررسی نسخهٔ جدید
          </button>
        )}
        {updateInfo && (
          <div className="mt-2 space-y-2 rounded-xl border border-sky-400/25 bg-sky-500/10 p-2.5">
            {isNativeApp() && (
              <button
                type="button"
                onClick={() => downloadAndInstallApk(updateInfo.apkUrl, updateInfo.version)}
                className="w-full rounded-lg bg-sky-400 px-3.5 py-2 text-xs font-semibold text-sky-950 active:bg-sky-300"
              >
                دانلود و نصب نسخهٔ {toPersianDigits(updateInfo.version)}
              </button>
            )}
            <button
              type="button"
              onClick={() => openExternalUrl(updateInfo.pageUrl)}
              className="w-full rounded-lg border border-sky-400/30 px-3.5 py-2 text-xs text-sky-200"
            >
              صفحهٔ releases در GitHub
            </button>
          </div>
        )}
        <button
          type="button"
          onClick={reportError}
          className="mt-2 w-full rounded-lg border border-white/10 bg-white/5 px-3.5 py-2 text-xs text-ink-200 active:bg-white/10"
        >
          مشاهدهٔ لاگ خطاها
        </button>
      </section>

      {message && (
        <div role="status" aria-live="polite" className="rounded-xl border border-emerald-400/25 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-200">
          {message}
        </div>
      )}

      <Link to="/" className="block rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-center text-xs text-ink-200">
        بازگشت به رادار
      </Link>
    </div>
  );
}export default SettingsPage;
