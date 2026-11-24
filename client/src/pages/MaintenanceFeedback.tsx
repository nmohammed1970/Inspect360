import { useQuery } from "@tanstack/react-query";
import { formatDistanceToNow } from "date-fns";
import { Link } from "wouter";
import { MessageSquarePlus, Star } from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

type FeedbackRow = {
  id: string;
  workOrderId: string;
  rating: number | null;
  improvementNotes: string | null;
  submittedAt: string | null;
  createdAt: string | null;
  jobTitle: string | null;
  propertyName: string | null;
  propertyAddress: string | null;
};

const StarDisplay = ({ rating }: { rating: number | null }) => {
  if (rating == null) {
    return <span className="text-muted-foreground text-sm">Awaiting response</span>;
  }
  return (
    <div className="flex items-center gap-0.5" aria-label={`${rating} of 5 stars`}>
      {[1, 2, 3, 4, 5].map((n) => (
        <Star
          key={n}
          className={
            n <= rating
              ? "h-4 w-4 fill-amber-400 text-amber-400"
              : "h-4 w-4 text-muted-foreground/30"
          }
        />
      ))}
    </div>
  );
};

const MaintenanceFeedback = () => {
  const { data = [], isLoading, error } = useQuery<FeedbackRow[]>({
    queryKey: ["/api/maintenance/job-feedback"],
    queryFn: async () => {
      const res = await fetch("/api/maintenance/job-feedback", { credentials: "include" });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || "Failed to load feedback");
      }
      return res.json();
    },
  });

  return (
    <div className="space-y-6 p-4 sm:p-6" data-testid="page-maintenance-feedback">
      <PageHeader
        icon={MessageSquarePlus}
        title="Maintenance Feedback"
        description="Customer ratings after jobs are marked complete"
      />

      {isLoading ? (
        <div className="space-y-2">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
        </div>
      ) : error ? (
        <p className="text-sm text-destructive">{(error as Error).message}</p>
      ) : data.length === 0 ? (
        <p className="text-sm text-muted-foreground">No maintenance feedback yet.</p>
      ) : (
        <div className="rounded-md border overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Job</TableHead>
                <TableHead>Property</TableHead>
                <TableHead>Rating</TableHead>
                <TableHead>Comments</TableHead>
                <TableHead>When</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.map((row) => (
                <TableRow key={row.id}>
                  <TableCell>
                    <Link
                      href={`/maintenance/work-orders/${row.workOrderId}`}
                      className="font-medium text-primary hover:underline"
                    >
                      {row.jobTitle || "Work order"}
                    </Link>
                    {!row.submittedAt && (
                      <Badge variant="outline" className="ml-2 text-xs">
                        Pending
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {row.propertyName || row.propertyAddress || "—"}
                  </TableCell>
                  <TableCell>
                    <StarDisplay rating={row.rating} />
                  </TableCell>
                  <TableCell className="max-w-xs text-sm text-muted-foreground">
                    {row.improvementNotes || "—"}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
                    {row.submittedAt
                      ? formatDistanceToNow(new Date(row.submittedAt), { addSuffix: true })
                      : row.createdAt
                        ? `Invited ${formatDistanceToNow(new Date(row.createdAt), { addSuffix: true })}`
                        : "—"}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
};

export default MaintenanceFeedback;
