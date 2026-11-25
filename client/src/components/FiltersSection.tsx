import type { ReactNode } from "react";
import { Filter } from "lucide-react";
import { cn } from "@/lib/utils";
import { FilterToolbar } from "@/components/workspace/FilterToolbar";

type FiltersSectionProps = {
  children: ReactNode;
  /** Section heading (default: "Filters") — ignored in toolbar mode */
  title?: string;
  /** Accessible heading id — must be unique per page */
  headingId?: string;
  className?: string;
  /** Extra classes on the bordered content shell */
  contentClassName?: string;
  /** Optional trailing content in the heading row (e.g. clear button, count) */
  headingEnd?: ReactNode;
  /**
   * `section` = legacy titled chrome; `toolbar` = compact template filter bar.
   * Default `toolbar` for workspace template look.
   */
  variant?: "section" | "toolbar";
};

/**
 * Shared filters chrome. Prefer `toolbar` (compact) for portfolio-style pages.
 */
export function FiltersSection({
  children,
  title = "Filters",
  headingId = "filters-heading",
  className,
  contentClassName,
  headingEnd,
  variant = "toolbar",
}: FiltersSectionProps) {
  if (variant === "toolbar") {
    return (
      <FilterToolbar className={cn(className, contentClassName)} end={headingEnd}>
        {children}
      </FilterToolbar>
    );
  }

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
      <div className={cn("rounded-lg border bg-card px-3 py-3 shadow-sm", contentClassName)}>
        {children}
      </div>
    </section>
  );
}
