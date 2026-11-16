import type { FeedbackStatus, FeedbackType } from "./feedbackSchema";

export function feedbackTypeLabel(type: string | null | undefined): string {
  switch (type) {
    case "issue":
      return "Issue";
    case "feature_request":
      return "Feature Request";
    case "question":
      return "General Question";
    default:
      return type?.replace(/_/g, " ") || "Unknown";
  }
}

export function feedbackStatusLabel(status: string | null | undefined): string {
  switch (status) {
    case "new":
      return "New";
    case "in_review":
      return "In Review";
    case "waiting_on_user":
      return "Waiting on User";
    case "planned":
      return "Planned";
    case "resolved":
      return "Resolved";
    case "closed":
      return "Closed";
    default:
      return status?.replace(/_/g, " ") || "Unknown";
  }
}

export function feedbackStatusMeta(status: string | null | undefined): {
  label: string;
  className: string;
} {
  switch (status as FeedbackStatus) {
    case "new":
      return { label: "New", className: "border-sky-300 bg-sky-50 text-sky-900" };
    case "in_review":
      return { label: "In Review", className: "border-amber-300 bg-amber-50 text-amber-950" };
    case "waiting_on_user":
      return { label: "Waiting on User", className: "border-orange-300 bg-orange-50 text-orange-950" };
    case "planned":
      return { label: "Planned", className: "border-violet-300 bg-violet-50 text-violet-950" };
    case "resolved":
      return { label: "Resolved", className: "border-emerald-300 bg-emerald-50 text-emerald-900" };
    case "closed":
      return { label: "Closed", className: "border-slate-300 bg-slate-50 text-slate-700" };
    default:
      return {
        label: feedbackStatusLabel(status),
        className: "border-muted-foreground/30 bg-muted text-foreground",
      };
  }
}

export function feedbackTypeMeta(type: string | null | undefined): {
  label: string;
  className: string;
} {
  switch (type as FeedbackType) {
    case "issue":
      return { label: "Issue", className: "border-rose-300 bg-rose-50 text-rose-900" };
    case "feature_request":
      return { label: "Feature Request", className: "border-violet-300 bg-violet-50 text-violet-950" };
    case "question":
      return { label: "General Question", className: "border-sky-300 bg-sky-50 text-sky-900" };
    default:
      return {
        label: feedbackTypeLabel(type),
        className: "border-muted-foreground/30 bg-muted text-foreground",
      };
  }
}

export function sanitizeFeedbackSourcePage(raw: string | null | undefined): string | null {
  if (!raw) return null;
  try {
    const url = raw.startsWith("http") ? new URL(raw) : new URL(raw, "https://app.local");
    const path = url.pathname || "/";
    // Drop sensitive query params entirely for MVP safety
    return path.slice(0, 500);
  } catch {
    return String(raw).split("?")[0]?.slice(0, 500) || null;
  }
}
