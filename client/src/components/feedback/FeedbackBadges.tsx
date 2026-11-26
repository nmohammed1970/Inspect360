import { feedbackStatusMeta, feedbackTypeMeta } from "@shared/feedbackLabels";
import { cn } from "@/lib/utils";

export function FeedbackStatusBadge({ status }: { status: string }) {
  const meta = feedbackStatusMeta(status);
  return (
    <span
      className={cn(
        "whitespace-nowrap inline-flex items-center rounded-full border px-2.5 py-0.5 text-[11px] font-medium leading-none shadow-none",
        meta.className,
      )}
    >
      {meta.label}
    </span>
  );
}

export function FeedbackTypeBadge({ type }: { type: string }) {
  const meta = feedbackTypeMeta(type);
  return (
    <span
      className={cn(
        "whitespace-nowrap inline-flex items-center rounded-full border px-2.5 py-0.5 text-[11px] font-medium leading-none shadow-none",
        meta.className,
      )}
    >
      {meta.label}
    </span>
  );
}
