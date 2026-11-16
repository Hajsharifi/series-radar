import { useState } from "react";
import { Link } from "react-router-dom";
import { useScheduleContext } from "../hooks/ScheduleContext";
import { useFavorites } from "../hooks/useFavorites";
import { useMovieFavorites } from "../hooks/useMovies";
import { useMovieTrack } from "../hooks/useMovieTrack";
import { usePullToRefresh } from "../hooks/usePullToRefresh";
import { relativeSyncLabel, toPersianDigits } from "../lib/date";
import { isNativeApp, openExactAlarmSettings, requestNotificationPermission } from "../lib/native";
import { downloadBackup, importBackup, readBackupFile } from "../lib/backup";

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-white/6 py-2.5 last:border-0">
      <span className="text-xs text-ink-400">{label}</span>
      <span className="text-xs font-medium text-ink-100">{value}</span>
    </div>
  );
}

export function SettingsPage() {
  const schedule = useScheduleContext();
  const favorites = useFavorites();
  const movieFavorites = useMovieFavorites();
  const movieTrack = useMovieTrack();
  const [message, setMessage] = useState("");

  usePullToRefresh(() => schedule.refresh(), { threshold: 80 });

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

  function clearFavorites() {
    if (!window.confirm("همهٔ ستاره‌ها (سریال، فیلم و در انتظار) حذف شوند؟")) return;
    try {
      localStorage.removeItem("sr:favorites:v1");
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
      <header>
        <h1 className="text-xl font-extrabold text-white">تنظیمات</h1>
        <p className="mt-1 text-xs text-ink-400">داده‌ها، یادآوری و وضعیت اپ</p>
      </header>

      <section className="rounded-2xl border border-white/8 bg-ink-850/60 p-4">
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-sm font-bold text-white">داده‌ها</h2>
          <span className="rounded-full bg-emerald-400/12 px-2 py-0.5 text-[10px] font-medium text-emerald-300">
            TVMaze + TMDB
          </span>
        </div>
        <Row label="تعداد سریال‌های زیر رادار" value={`${toPersianDigits(schedule.shows.length)} سریال`} />
        <Row
          label="منبع فعلی"
          value={schedule.source === "network" ? "آنلاین" : schedule.source === "cache" ? "کش‌شده" : "دادهٔ همراه اپ"}
        />
        <div className="flex items-center justify-between gap-3 py-2.5">
          <span className="text-xs text-ink-400">آخرین به‌روزرسانی</span>
          <span className="text-xs font-medium text-ink-100">{relativeSyncLabel(schedule.updatedAt)}</span>
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
        <p className="mt-2 text-[11px] leading-relaxed text-ink-400">
          برنامهٔ امروز و فردا هر دقیقه بررسی می‌شود و فهرست کامل هر ۶ ساعت به‌روزرسانی می‌شود. تاریخ‌ها و ساعت
          پخش به وقت تهران هستند.
        </p>
      </section>

      <section className="rounded-2xl border border-white/8 bg-ink-850/60 p-4">
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-sm font-bold text-white">یادآوری</h2>
          <span className="rounded-full bg-emerald-400/12 px-2 py-0.5 text-[10px] font-medium text-emerald-300">
            {isNativeApp() ? "فعال" : "در اپ اندروید"}
          </span>
        </div>
        <Row label="زمان پیش‌فرض" value="۲۴ ساعت قبل" />
        <Row label="ساعت ارسال" value="۰۹:۰۰ به وقت تهران" />
        <Row label="سریال‌های ستاره‌دار" value={`${toPersianDigits(favorites.items.length)} سریال`} />
        <Row label="فیلم‌های ستاره‌دار" value={`${toPersianDigits(movieFavorites.items.length)} فیلم`} />
        <Row label="فیلم‌های در انتظار کیفیت" value={`${toPersianDigits(movieTrack.items.length)} فیلم`} />
        <p className="mt-2 text-[11px] leading-relaxed text-ink-400">
          یادآوری برای هر مورد به‌صورت جداگانه قابل فعال/غیرفعال کردن است (در صفحه جزئیات یا ستاره‌ها).
          همه یادآوری‌ها ۲۴ ساعت قبل، ساعت ۰۹:۰۰ به وقت تهران ارسال می‌شوند.
        </p>
        {isNativeApp() && (
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={requestNotificationPermission}
              className="rounded-lg border border-white/10 bg-white/5 px-3.5 py-2 text-xs text-ink-200"
            >
              درخواست مجوز اعلان
            </button>
            <button
              type="button"
              onClick={openExactAlarmSettings}
              className="rounded-lg border border-white/10 bg-white/5 px-3.5 py-2 text-xs text-ink-200"
            >
              تنظیم آلارم دقیق
            </button>
          </div>
        )}
      </section>

      <section className="rounded-2xl border border-white/8 bg-ink-850/60 p-4">
        <h2 className="mb-2 text-sm font-bold text-white">ستاره‌ها</h2>
        <p className="text-[11px] leading-relaxed text-ink-400">
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

      <section className="rounded-2xl border border-white/8 bg-ink-850/60 p-4">
        <h2 className="mb-2 text-sm font-bold text-white">پشتیبان‌گیری و بازیابی</h2>
        <p className="text-[11px] leading-relaxed text-ink-400">
          تمام ستاره‌ها (سریال، فیلم، در انتظار) در یک فایل JSON ذخیره یا از فایل بازیابی می‌شوند.
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

      <section className="rounded-2xl border border-white/8 bg-ink-850/60 p-4">
        <h2 className="mb-2 text-sm font-bold text-white">درباره</h2>
        <Row label="نسخه" value="۱.۴.۰" />
        <Row label="منبع داده" value="TVMaze · TMDB · Box Office Mojo" />
        <Row label="تقویم" value="شمسی + میلادی" />
        <Row label="یادآوری" value="آلارم اندروید" />
        <Row label="وضعیت ورود" value="محلی، بدون حساب" />
        <p className="mt-2 text-[11px] leading-relaxed text-ink-400">
          سریال‌ها از TVMaze، فیلم‌ها و تاریخ‌های دیجیتال/بلوری از TMDB و اعداد گیشه از Box Office Mojo گرفته
          می‌شوند. فعلاً نیازی به ورود یا Firebase نیست.
        </p>
      </section>

      {message && (
        <div className="rounded-xl border border-emerald-400/25 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-200">
          {message}
        </div>
      )}

      <Link to="/" className="block rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-center text-xs text-ink-200">
        بازگشت به رادار
      </Link>
    </div>
  );
}