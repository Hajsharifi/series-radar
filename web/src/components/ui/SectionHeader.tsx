import type { ReactNode } from "react";
import { cn } from "../../lib/cn";

export interface SectionHeaderProps {
  eyebrow?: string;
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  className?: string;
  titleAs?: "h1" | "h2" | "h3";
}

export function SectionHeader({
  eyebrow,
  title,
  description,
  action,
  className,
  titleAs: Title = "h2",
}: SectionHeaderProps) {
  return (
    <div className={cn("flex items-end justify-between gap-3", className)}>
      <div className="min-w-0">
        {eyebrow && <p className="text-label text-brand/90">{eyebrow}</p>}
        <Title className="mt-1 text-headline text-copy">{title}</Title>
        {description && <p className="mt-1 text-caption leading-relaxed text-muted">{description}</p>}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}
