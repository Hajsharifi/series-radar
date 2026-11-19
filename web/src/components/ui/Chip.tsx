import type { ButtonHTMLAttributes, ReactNode } from "react";
import { cn } from "../../lib/cn";

export type ChipTone = "brand" | "info" | "success" | "neutral";

export interface ChipProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  selected?: boolean;
  tone?: ChipTone;
  leadingIcon?: ReactNode;
}

const SELECTED: Record<ChipTone, string> = {
  brand: "border-brand/40 bg-brand/15 text-brand",
  info: "border-info/35 bg-info/12 text-info",
  success: "border-success/35 bg-success/12 text-success",
  neutral: "border-edge/20 bg-white/8 text-copy",
};

export function Chip({
  selected = false,
  tone = "brand",
  leadingIcon,
  className,
  type = "button",
  children,
  ...props
}: ChipProps) {
  return (
    <button
      type={type}
      aria-pressed={selected}
      className={cn(
        "sr-no-tap inline-flex min-h-8 items-center gap-1.5 rounded-full border px-3 text-label transition",
        "focus-visible:outline-none active:scale-[0.98]",
        selected
          ? SELECTED[tone]
          : "border-edge/12 bg-white/4 text-muted hover:bg-white/6 hover:text-copy",
        className,
      )}
      {...props}
    >
      {leadingIcon && <span aria-hidden="true" className="shrink-0">{leadingIcon}</span>}
      <span>{children}</span>
    </button>
  );
}
