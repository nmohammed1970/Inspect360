import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ContextualLink } from "@/navigation";
import { format } from "date-fns";
import { MessageSquarePlus, Plus, Inbox } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { FeedbackSubmitForm } from "@/components/feedback/FeedbackSubmitForm";
import { FeedbackStatusBadge, FeedbackTypeBadge } from "@/components/feedback/FeedbackBadges";
import { PageHeader } from "@/components/PageHeader";
import { pagePad } from "@/lib/responsive";
import { cn } from "@/lib/utils";

type FeedbackRow = {
  id: string;
  reference: string;
  type: string;
  subject: string;
  status: string;
  updatedAt: string;
  createdAt: string;
};

export default function FeedbackPage() {
  const [showForm, setShowForm] = useState(true);
  const { data: rows = [], isLoading } = useQuery<FeedbackRow[]>({
    queryKey: ["/api/feedback/mine"],
  });

  return (
    <div className={cn("container mx-auto min-w-0 space-y-6 md:space-y-8", pagePad)}>
      <PageHeader
        icon={MessageSquarePlus}
        title="Feedback"
        description="Report issues, request features, or ask questions — and track every case you send."
        actions={
          !showForm ? (
            <Button
              onClick={() => setShowForm(true)}
              className="shrink-0"
              size="lg"
              data-testid="button-new-feedback"
            >
              <Plus className="h-4 w-4 mr-2" />
              Submit Feedback
            </Button>
          ) : undefined
        }
      />

      <div className="space-y-6">
        {showForm && (
          <Card className="border shadow-sm overflow-hidden">
            <CardHeader className="border-b bg-muted/30 pb-4">
              <CardTitle className="text-lg">Submit feedback</CardTitle>
              <CardDescription>
                Choose a type, describe what you need, and attach screenshots if helpful.
              </CardDescription>
            </CardHeader>
            <CardContent className="pt-6">
              <FeedbackSubmitForm
                onCancel={rows.length > 0 ? () => setShowForm(false) : undefined}
              />
            </CardContent>
          </Card>
        )}

        <Card className="border shadow-sm overflow-hidden">
          <CardHeader className="border-b bg-muted/20 pb-4">
            <div className="flex items-center gap-2">
              <Inbox className="h-4 w-4 text-muted-foreground" />
              <CardTitle className="text-lg">My feedback</CardTitle>
            </div>
            <CardDescription>Cases you have submitted</CardDescription>
          </CardHeader>
          <CardContent className="pt-4">
            {isLoading ? (
              <div className="space-y-2">
                <Skeleton className="h-11 w-full rounded-lg" />
                <Skeleton className="h-11 w-full rounded-lg" />
              </div>
            ) : rows.length === 0 ? (
              <div className="text-center py-10 px-4 space-y-3">
                <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-lg bg-muted">
                  <Inbox className="h-6 w-6 text-muted-foreground" />
                </div>
                <p className="text-muted-foreground text-sm">You have not submitted any feedback yet.</p>
                {!showForm && (
                  <Button onClick={() => setShowForm(true)}>
                    <Plus className="h-4 w-4 mr-2" />
                    Submit Feedback
                  </Button>
                )}
              </div>
            ) : (
              <div className="overflow-x-auto -mx-2 sm:mx-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Reference</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Subject</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Last updated</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rows.map((row) => (
                      <TableRow key={row.id} className="hover:bg-muted/40">
                        <TableCell>
                          <ContextualLink
                            href={`/feedback/${row.id}`}
                            fromLabel="Feedback"
                            className="font-mono text-sm text-primary hover:underline"
                          >
                            {row.reference}
                          </ContextualLink>
                        </TableCell>
                        <TableCell>
                          <FeedbackTypeBadge type={row.type} />
                        </TableCell>
                        <TableCell className="max-w-[280px] truncate">
                          <ContextualLink
                            href={`/feedback/${row.id}`}
                            fromLabel="Feedback"
                            className="hover:underline font-medium"
                          >
                            {row.subject}
                          </ContextualLink>
                        </TableCell>
                        <TableCell>
                          <FeedbackStatusBadge status={row.status} />
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
                          {row.updatedAt ? format(new Date(row.updatedAt), "dd MMM yyyy HH:mm") : "—"}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
