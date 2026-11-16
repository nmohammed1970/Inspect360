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
  /** Optional icon shown in the teal well (Feedback-style header) */
  icon?: IconComponent;
  /** Optional test id on the title */
  titleTestId?: string;
};

/**
 * Shared page chrome — Feedback-style gradient banner with icon well.
 * Visual only — does not change routing or permissions.
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
    <div className={cn("space-y-3 min-w-0 mb-0", className)}>
      {leading}
      <div className="relative overflow-hidden rounded-2xl border bg-gradient-to-br from-primary/10 via-background to-sky-50/60">
        <div className="absolute inset-y-0 right-0 w-1/3 bg-[radial-gradient(ellipse_at_top_right,hsl(var(--primary)/0.18),transparent_70%)] pointer-events-none" />
        <div className="relative p-5 sm:p-7 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="flex items-start gap-3 min-w-0">
            {Icon ? (
              <div className="p-2.5 rounded-2xl bg-primary/15 shrink-0">
                <Icon className="h-6 w-6 text-primary" aria-hidden />
              </div>
            ) : null}
            <div className="min-w-0">
              <h1
                className="text-2xl md:text-3xl font-bold tracking-tight font-heading text-foreground"
                data-testid={titleTestId}
              >
                {title}
              </h1>
              {description ? (
                <p className="text-muted-foreground mt-1 text-sm sm:text-base max-w-2xl leading-relaxed">
                  {description}
                </p>
              ) : null}
            </div>
          </div>
          {actions ? (
            <div className="flex flex-wrap items-center gap-2 shrink-0 w-full sm:w-auto">
              {actions}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
