import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

type PageHeaderProps = {
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  className?: string;
  /** Optional leading content (e.g. back link) rendered above the title row */
  leading?: ReactNode;
};

/**
 * Shared page chrome for list/detail screens.
 * Visual only — does not change routing or permissions.
 */
export function PageHeader({
  title,
  description,
  actions,
  className,
  leading,
}: PageHeaderProps) {
  return (
    <div className={cn("space-y-3 min-w-0", className)}>
      {leading}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 sm:gap-4">
        <div className="min-w-0 flex-1 space-y-1">
          <h1 className="text-xl md:text-2xl lg:text-3xl font-bold tracking-tight font-heading text-foreground">
            {title}
          </h1>
          {description ? (
            <p className="text-sm md:text-base text-muted-foreground">{description}</p>
          ) : null}
        </div>
        {actions ? (
          <div className="flex flex-wrap items-center gap-2 shrink-0 w-full sm:w-auto">
            {actions}
          </div>
        ) : null}
      </div>
    </div>
  );
}
