import type { ReactNode } from "react";
import { AlertTriangle, ListChecks } from "lucide-react";
import {
  formatInspectionNote,
  parseInspectionNote,
  type InspectionNoteSections,
} from "@shared/inspectionNoteSections";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

type Props = {
  /** Full AI note (labeled or freeform) — parsed into sections */
  note: string;
  /** Controlled description (usually form description field) */
  description: string;
  onDescriptionChange: (value: string) => void;
  className?: string;
  /** Hide the description textarea (caller already renders it) */
  hideDescriptionField?: boolean;
};

function Panel({
  title,
  body,
  variant,
  icon,
}: {
  title: string;
  body: string;
  variant: "maintenance" | "recommended";
  icon: ReactNode;
}) {
  return (
    <div
      className={cn(
        "rounded-lg border px-3 py-2.5 text-sm",
        variant === "maintenance" &&
          "border-red-200 bg-red-50 text-red-950 dark:border-red-900 dark:bg-red-950/40 dark:text-red-50",
        variant === "recommended" &&
          "border-teal-200 bg-teal-50 text-teal-950 dark:border-teal-800 dark:bg-teal-950/40 dark:text-teal-50",
      )}
      data-testid={
        variant === "recommended" ? "panel-recommended-actions" : "panel-maintenance-issues"
      }
    >
      <div
        className={cn(
          "mb-1 flex items-center gap-2 font-bold",
          variant === "maintenance" && "text-red-800 dark:text-red-200",
          variant === "recommended" && "text-teal-800 dark:text-teal-200",
        )}
      >
        {icon}
        {title}
      </div>
      <p className="leading-relaxed whitespace-pre-wrap">{body}</p>
    </div>
  );
}

/** Description textarea + Maintenance Issues / Recommended Actions cards after AI analyze. */
export function MaintenanceAiAnalysisView({
  note,
  description,
  onDescriptionChange,
  className,
  hideDescriptionField,
}: Props) {
  const sections: InspectionNoteSections = parseInspectionNote(note);
  if (!sections.maintenanceIssues && !sections.recommendedActions && !sections.description) {
    return null;
  }

  return (
    <div className={cn("space-y-3", className)} data-testid="maintenance-ai-analysis">
      {!hideDescriptionField ? (
        <div className="space-y-2">
          <Label htmlFor="ai-analysis-description">Description</Label>
          <Textarea
            id="ai-analysis-description"
            value={description}
            onChange={(e) => onDescriptionChange(e.target.value)}
            rows={4}
            className="resize-y"
            data-testid="input-ai-description"
          />
        </div>
      ) : null}

      {sections.maintenanceIssues ? (
        <Panel
          title="Maintenance Issues"
          body={sections.maintenanceIssues}
          variant="maintenance"
          icon={<AlertTriangle className="h-4 w-4 shrink-0" />}
        />
      ) : null}

      {sections.recommendedActions ? (
        <Panel
          title="Recommended Actions"
          body={sections.recommendedActions}
          variant="recommended"
          icon={<ListChecks className="h-4 w-4 shrink-0" />}
        />
      ) : null}
    </div>
  );
}

/** Apply AI note into form fields and rebuild labeled `aiSuggestedFixes` for submit. */
export function applyMaintenanceAiNote(
  note: string,
  opts?: { preferExistingDescription?: string },
): { sections: InspectionNoteSections; description: string; aiSuggestedFixes: string } {
  const sections = parseInspectionNote(note);
  const description =
    sections.description.trim() ||
    (opts?.preferExistingDescription || "").trim() ||
    "";
  const aiSuggestedFixes = formatInspectionNote({
    description,
    maintenanceIssues: sections.maintenanceIssues,
    recommendedActions: sections.recommendedActions,
  });
  return { sections, description, aiSuggestedFixes };
}
