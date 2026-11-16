import { Badge } from "@/components/ui/badge";
import { feedbackStatusMeta, feedbackTypeMeta } from "@shared/feedbackLabels";
import { cn } from "@/lib/utils";

export function FeedbackStatusBadge({ status }: { status: string }) {
  const meta = feedbackStatusMeta(status);
  return (
    <Badge variant="outline" className={cn("font-medium", meta.className)}>
      {meta.label}
    </Badge>
  );
}

export function FeedbackTypeBadge({ type }: { type: string }) {
  const meta = feedbackTypeMeta(type);
  return (
    <Badge variant="outline" className={cn("font-medium", meta.className)}>
      {meta.label}
    </Badge>
  );
}
