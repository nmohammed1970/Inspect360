import type { ReactNode } from "react";
import { Filter } from "lucide-react";
import { cn } from "@/lib/utils";

type FiltersSectionProps = {
  children: ReactNode;
  /** Section heading (default: "Filters") */
  title?: string;
  /** Accessible heading id — must be unique per page */
  headingId?: string;
  className?: string;
  /** Extra classes on the bordered content shell */
  contentClassName?: string;
  /** Optional trailing content in the heading row (e.g. clear button, count) */
  headingEnd?: ReactNode;
};

/**
 * Shared Filters chrome: icon + title + rule, then rounded bordered content.
 * Matches the Maintenance page filter layout for app-wide consistency.
 */
export function FiltersSection({
  children,
  title = "Filters",
  headingId = "filters-heading",
  className,
  contentClassName,
  headingEnd,
}: FiltersSectionProps) {
  return (
    <section className={cn("space-y-3", className)} aria-labelledby={headingId}>
      <div className="flex items-center gap-2">
        <Filter className="h-4 w-4 text-primary shrink-0" />
        <h2 id={headingId} className="text-sm font-semibold tracking-tight">
          {title}
        </h2>
        <div className="h-px flex-1 bg-border" />
        {headingEnd}
      </div>
      <div className={cn("rounded-xl border bg-card px-3 py-3 shadow-sm", contentClassName)}>
        {children}
      </div>
    </section>
  );
}
