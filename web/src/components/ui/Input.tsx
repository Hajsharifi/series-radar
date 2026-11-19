import { forwardRef, type InputHTMLAttributes, type ReactNode } from "react";
import { cn } from "../../lib/cn";

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  leadingIcon?: ReactNode;
  trailing?: ReactNode;
  invalid?: boolean;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { leadingIcon, trailing, invalid = false, className, ...props },
  ref,
) {
  return (
    <div className="relative">
      {leadingIcon && (
        <span aria-hidden="true" className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 text-muted">
          {leadingIcon}
        </span>
      )}
      <input
        ref={ref}
        aria-invalid={invalid || undefined}
        className={cn(
          "h-11 w-full rounded-control border bg-black/20 text-body text-copy transition",
          "placeholder:text-muted/70 focus:bg-black/30 focus:outline-none",
          leadingIcon ? "pr-10" : "pr-3.5",
          trailing ? "pl-10" : "pl-3.5",
          invalid
            ? "border-danger/50 focus:border-danger/70"
            : "border-edge/12 focus:border-brand/60",
          className,
        )}
        {...props}
      />
      {trailing && <span className="absolute left-2 top-1/2 -translate-y-1/2">{trailing}</span>}
    </div>
  );
});
