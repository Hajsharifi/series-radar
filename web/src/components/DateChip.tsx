import {
  gregorianShort,
  jalaliDateParts,
  relativeSyncLabel,
  tehranDateFromStamp,
  weekdayName,
} from "../lib/date";

interface DateChipProps {
  stamp?: string | null;
  size?: "sm" | "md";
}

/** Jalali date rendered as separate boxes so RTL never reorders the parts. */
export function DateChip({ stamp, size = "sm" }: DateChipProps) {
  const date = tehranDateFromStamp(stamp);
  if (!date) {
    return <span className="text-xs text-ink-400">زمان پخش نامشخص</span>;
  }
  const parts = jalaliDateParts(date);
  const weekday = weekdayName(stamp);
  const compact = size === "sm";

  return (
    <div className="flex flex-col gap-0.5">
      <div className="sr-date-box flex items-center gap-1.5" dir="rtl">
        <span className={compact ? "text-sm font-semibold text-white" : "text-lg font-bold text-white"}>
          {parts.day}
        </span>
        <span className={compact ? "text-sm text-ink-200" : "text-lg text-ink-200"}>{parts.month}</span>
        <span className={compact ? "text-xs text-ink-400" : "text-sm text-ink-400"}>{parts.year}</span>
      </div>
      <span className="text-[11px] text-ink-400" dir="ltr" style={{ unicodeBidi: "isolate" }}>
        {weekday ? `${weekday} · ` : ""}
        {gregorianShort(date)}
      </span>
    </div>
  );
}

/** Inline day/month/year boxes; used on cards and in the details header. */
export function JalaliSpans({
  stamp,
  date,
  className = "",
  yearClassName = "text-ink-400",
}: {
  stamp?: string | null;
  date?: Date | null;
  className?: string;
  yearClassName?: string;
}) {
  const value = date ?? tehranDateFromStamp(stamp);
  if (!value) return <span className={`text-ink-400 ${className}`}>نامشخص</span>;
  const parts = jalaliDateParts(value);
  return (
    <span className={`sr-date-box inline-flex items-baseline gap-1 ${className}`} dir="rtl">
      <span>{parts.day}</span>
      <span>{parts.month}</span>
      <span className={yearClassName}>{parts.year}</span>
    </span>
  );
}

export function JalaliInline({ stamp }: { stamp?: string | null }) {
  return <JalaliSpans stamp={stamp} className="text-sm" />;
}

export function RelativeUpdated({ iso }: { iso?: string | null }) {
  return (
    <span className="text-[11px] text-ink-400">
      آخرین به‌روزرسانی: <span className="text-ink-300">{relativeSyncLabel(iso)}</span>
    </span>
  );
}