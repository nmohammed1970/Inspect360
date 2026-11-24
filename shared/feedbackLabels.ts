import type { FeedbackStatus, FeedbackType } from "./feedbackSchema";
import { SEMANTIC_TONE_CLASS } from "./statusPriorityStyles";

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
      return { label: "New", className: SEMANTIC_TONE_CLASS.info };
    case "in_review":
      return { label: "In Review", className: SEMANTIC_TONE_CLASS.warning };
    case "waiting_on_user":
      return { label: "Waiting on User", className: SEMANTIC_TONE_CLASS.action };
    case "planned":
      return { label: "Planned", className: SEMANTIC_TONE_CLASS.primary };
    case "resolved":
      return { label: "Resolved", className: SEMANTIC_TONE_CLASS.success };
    case "closed":
      return { label: "Closed", className: SEMANTIC_TONE_CLASS.muted };
    default:
      return {
        label: feedbackStatusLabel(status),
        className: SEMANTIC_TONE_CLASS.muted,
      };
  }
}

export function feedbackTypeMeta(type: string | null | undefined): {
  label: string;
  className: string;
} {
  switch (type as FeedbackType) {
    case "issue":
      return { label: "Issue", className: SEMANTIC_TONE_CLASS.critical };
    case "feature_request":
      return { label: "Feature Request", className: SEMANTIC_TONE_CLASS.primary };
    case "question":
      return { label: "General Question", className: SEMANTIC_TONE_CLASS.info };
    default:
      return {
        label: feedbackTypeLabel(type),
        className: SEMANTIC_TONE_CLASS.muted,
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
