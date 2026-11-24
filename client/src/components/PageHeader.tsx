import type { ReactNode, ComponentType, SVGProps } from "react";
import { cn } from "@/lib/utils";

type IconComponent = ComponentType<SVGProps<SVGSVGElement> & { className?: string }>;

type PageHeaderProps = {
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  className?: string;
  /** Optional leading content (e.g. back link) rendered above the title row */
  leading?: ReactNode;
  /** Optional icon shown beside the title (quiet, no gradient well) */
  icon?: IconComponent;
  /** Optional test id on the title */
  titleTestId?: string;
};

/**
 * Shared workspace page chrome — flat title + muted subtitle + actions.
 * Matches the HMO portfolio template (no gradient banner).
 */
export function PageHeader({
  title,
  description,
  actions,
  className,
  leading,
  icon: Icon,
  titleTestId,
}: PageHeaderProps) {
  return (
    <div className={cn("space-y-3 min-w-0 mb-1", className)}>
      {leading}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
        <div className="flex min-w-0 flex-1 items-start gap-3">
          {Icon ? (
            <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-border/80 bg-card text-primary shadow-sm">
              <Icon className="h-4.5 w-4.5 h-[18px] w-[18px]" aria-hidden />
            </div>
          ) : null}
          <div className="min-w-0 flex-1">
            <h1
              className="text-xl font-bold tracking-tight font-heading text-foreground text-balance break-words md:text-2xl lg:text-[1.65rem]"
              data-testid={titleTestId}
            >
              {title}
            </h1>
            {description ? (
              <p className="mt-1 max-w-2xl text-sm leading-relaxed text-muted-foreground text-pretty">
                {description}
              </p>
            ) : null}
          </div>
        </div>
        {actions ? (
          <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto sm:shrink-0 sm:justify-end">
            {actions}
          </div>
        ) : null}
      </div>
    </div>
  );
}
