import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { MessageSquare } from "lucide-react";
import { StatusBadge } from "@/components/StatusBadge";
import { Skeleton } from "@/components/ui/skeleton";
import { useCompanyModules } from "@/hooks/useCompanyModules";
import { apiRequest } from "@/lib/queryClient";
import {
  communicationCaseStatusTone,
  priorityTone,
} from "@shared/statusPriorityStyles";

type LinkedCase = {
  id: string;
  reference: string;
  subject: string;
  status: string;
  priority: string;
  relationship: string;
};

/**
 * Spec §2: linked case panel on maintenance / inspection / work-order records.
 */
export function LinkedCasesPanel(props: {
  entityType: "maintenance_request" | "work_order" | "inspection" | "tenancy";
  entityId: string;
  className?: string;
}) {
  const { communicationsEnabled } = useCompanyModules();

  const query = useQuery<{ items: LinkedCase[] }>({
    queryKey: ["/api/communications/links", props.entityType, props.entityId],
    enabled: !!communicationsEnabled && !!props.entityId,
    queryFn: async () => {
      const params = new URLSearchParams({
        entityType: props.entityType,
        entityId: props.entityId,
      });
      const res = await apiRequest("GET", `/api/communications/links?${params}`);
      return res.json();
    },
  });

  if (!communicationsEnabled) return null;

  return (
    <div
      className={props.className ?? "rounded-lg border border-border/80 bg-card p-4 space-y-3"}
      data-testid="linked-cases-panel"
    >
      <div className="flex items-center gap-2 text-sm font-medium">
        <MessageSquare className="w-4 h-4" />
        Linked communications cases
      </div>
      {query.isLoading ? (
        <Skeleton className="h-10 w-full" />
      ) : !query.data?.items?.length ? (
        <p className="text-sm text-muted-foreground">No linked cases.</p>
      ) : (
        <ul className="space-y-2">
          {query.data.items.map((c) => (
            <li key={c.id} className="flex flex-wrap items-center gap-2 text-sm">
              <Link
                href={`/communications/cases/${c.id}`}
                className="text-primary hover:underline tabular-nums"
              >
                {c.reference}
              </Link>
              <span className="truncate max-w-[14rem]">{c.subject}</span>
              <StatusBadge tone={communicationCaseStatusTone(c.status)}>
                {c.status.replace(/_/g, " ")}
              </StatusBadge>
              <StatusBadge tone={priorityTone(c.priority)}>{c.priority}</StatusBadge>
              <span className="text-xs text-muted-foreground">{c.relationship}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
