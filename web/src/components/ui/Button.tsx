import { forwardRef, type ButtonHTMLAttributes } from "react";
import { cn } from "../../lib/cn";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";
export type ButtonSize = "sm" | "md" | "lg" | "icon";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
}

const VARIANTS: Record<ButtonVariant, string> = {
  primary: "bg-brand text-ink-950 shadow-card hover:brightness-105 active:brightness-95",
  secondary: "border border-edge/15 bg-white/5 text-copy hover:bg-white/8 active:bg-white/10",
  ghost: "text-muted hover:bg-white/5 hover:text-copy active:bg-white/8",
  danger: "border border-danger/25 bg-danger/12 text-danger hover:bg-danger/18 active:bg-danger/22",
};

const SIZES: Record<ButtonSize, string> = {
  sm: "min-h-9 rounded-control px-3 text-caption",
  md: "min-h-11 rounded-control px-4 text-body",
  lg: "min-h-12 rounded-card px-5 text-body",
  icon: "h-11 w-11 rounded-control",
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = "secondary", size = "md", className, type = "button", ...props },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      className={cn(
        "sr-no-tap inline-flex items-center justify-center gap-2 font-semibold transition",
        "focus-visible:outline-none disabled:pointer-events-none disabled:opacity-40",
        VARIANTS[variant],
        SIZES[size],
        className,
      )}
      {...props}
    />
  );
});
