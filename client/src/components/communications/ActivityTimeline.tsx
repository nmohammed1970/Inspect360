import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { formatDistanceToNow } from "date-fns";
import { StatusBadge } from "@/components/StatusBadge";
import { Skeleton } from "@/components/ui/skeleton";
import { apiRequest } from "@/lib/queryClient";
import {
  communicationCaseStatusTone,
  priorityTone,
} from "@shared/statusPriorityStyles";

type ActivityItem = {
  type: string;
  id: string;
  reference: string;
  subject: string;
  status: string;
  priority: string;
  at?: string | null;
};

export function CommunicationsActivityTimeline(props: {
  scope: "tenants" | "properties" | "tenancies";
  entityId: string;
}) {
  const query = useQuery<{ items: ActivityItem[] }>({
    queryKey: ["/api/communications", props.scope, props.entityId, "activity"],
    enabled: !!props.entityId,
    queryFn: async () => {
      const res = await apiRequest(
        "GET",
        `/api/communications/${props.scope}/${props.entityId}/activity`,
      );
      return res.json();
    },
  });

  if (query.isLoading) {
    return (
      <div className="space-y-2">
        <Skeleton className="h-12 w-full" />
        <Skeleton className="h-12 w-full" />
      </div>
    );
  }

  const items = query.data?.items || [];
  if (!items.length) {
    return (
      <p className="text-sm text-muted-foreground py-6 text-center">
        No communications activity yet.
      </p>
    );
  }

  return (
    <ul className="space-y-2" data-testid="communications-activity-timeline">
      {items.map((item) => (
        <li
          key={`${item.type}-${item.id}`}
          className="flex flex-wrap items-center gap-2 rounded-lg border border-border/60 bg-card px-3 py-2 text-sm"
        >
          <Link
            href={`/communications/cases/${item.id}`}
            className="text-primary hover:underline tabular-nums shrink-0"
          >
            {item.reference}
          </Link>
          <span className="min-w-0 flex-1 truncate">{item.subject}</span>
          <StatusBadge tone={communicationCaseStatusTone(item.status)}>
            {item.status.replace(/_/g, " ")}
          </StatusBadge>
          <StatusBadge tone={priorityTone(item.priority)}>{item.priority}</StatusBadge>
          <span className="text-xs text-muted-foreground">
            {item.at
              ? formatDistanceToNow(new Date(item.at), { addSuffix: true })
              : ""}
          </span>
        </li>
      ))}
    </ul>
  );
}
