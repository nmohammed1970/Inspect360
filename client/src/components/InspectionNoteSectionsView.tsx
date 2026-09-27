import type { ReactNode } from "react";
import { AlertTriangle, FileText, ListChecks } from "lucide-react";
import {
  hasNoteSections,
  parseInspectionNote,
  type InspectionNoteSections,
} from "@shared/inspectionNoteSections";
import { cn } from "@/lib/utils";

type Props = {
  note: string | null | undefined;
  className?: string;
  /** When true, hide the description block (caller already shows it). */
  hideDescription?: boolean;
};

function SectionPanel({
  title,
  body,
  variant,
  icon,
}: {
  title: string;
  body: string;
  variant: "description" | "recommended" | "maintenance";
  icon: ReactNode;
}) {
  return (
    <div
      className={cn(
        "rounded-lg border px-3 py-2.5 text-sm",
        variant === "description" && "border-border bg-muted/40 text-foreground",
        variant === "recommended" &&
          "border-teal-200 bg-teal-50 text-teal-950 dark:border-teal-800 dark:bg-teal-950/40 dark:text-teal-50",
        variant === "maintenance" &&
          "border-red-200 bg-red-50 text-red-950 dark:border-red-900 dark:bg-red-950/40 dark:text-red-50",
      )}
      data-testid={
        variant === "recommended"
          ? "panel-recommended-actions"
          : variant === "maintenance"
            ? "panel-maintenance-issues"
            : "panel-description"
      }
    >
      <div className="mb-1 flex items-center gap-2 font-bold">
        {icon}
        {title}
      </div>
      <p className="leading-relaxed whitespace-pre-wrap">{body}</p>
    </div>
  );
}

export function InspectionNoteSectionsView({ note, className, hideDescription }: Props) {
  const sections: InspectionNoteSections = parseInspectionNote(note);
  if (!hasNoteSections(sections)) return null;

  const showDescription = !hideDescription && Boolean(sections.description);
  const showMaintenance = Boolean(sections.maintenanceIssues);
  const showRecommended = Boolean(sections.recommendedActions);

  if (!showDescription && !showMaintenance && !showRecommended) return null;

  return (
    <div className={cn("mt-2 space-y-2", className)} data-testid="inspection-note-sections">
      {showDescription ? (
        <SectionPanel
          title="Description"
          body={sections.description}
          variant="description"
          icon={<FileText className="h-4 w-4 shrink-0" />}
        />
      ) : null}
      {showMaintenance ? (
        <SectionPanel
          title="Maintenance Issues"
          body={sections.maintenanceIssues}
          variant="maintenance"
          icon={<AlertTriangle className="h-4 w-4 shrink-0" />}
        />
      ) : null}
      {showRecommended ? (
        <SectionPanel
          title="Recommended Actions"
          body={sections.recommendedActions}
          variant="recommended"
          icon={<ListChecks className="h-4 w-4 shrink-0" />}
        />
      ) : null}
    </div>
  );
}
