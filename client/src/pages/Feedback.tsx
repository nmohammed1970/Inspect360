import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { format } from "date-fns";
import { MessageSquarePlus, Plus } from "lucide-react";
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
import { pagePad } from "@/lib/responsive";

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
  const [showForm, setShowForm] = useState(false);
  const { data: rows = [], isLoading } = useQuery<FeedbackRow[]>({
    queryKey: ["/api/feedback/mine"],
  });

  return (
    <div className={pagePad}>
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold flex items-center gap-2">
            <MessageSquarePlus className="h-7 w-7 text-primary" />
            Feedback
          </h1>
          <p className="text-muted-foreground mt-1">
            Report issues, request features, or ask questions. Track everything you have sent.
          </p>
        </div>
        {!showForm && (
          <Button onClick={() => setShowForm(true)} className="shrink-0" data-testid="button-new-feedback">
            <Plus className="h-4 w-4 mr-2" />
            Submit Feedback
          </Button>
        )}
      </div>

      {showForm && (
        <Card className="mb-6">
          <CardHeader>
            <CardTitle>Submit Feedback</CardTitle>
            <CardDescription>Choose a type, describe what you need, and attach screenshots if helpful.</CardDescription>
          </CardHeader>
          <CardContent>
            <FeedbackSubmitForm onCancel={() => setShowForm(false)} />
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>My Feedback</CardTitle>
          <CardDescription>Cases you have submitted</CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-2">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
            </div>
          ) : rows.length === 0 ? (
            <div className="text-center py-12 space-y-3">
              <p className="text-muted-foreground">You have not submitted any feedback yet.</p>
              <Button onClick={() => setShowForm(true)}>
                <Plus className="h-4 w-4 mr-2" />
                Submit Feedback
              </Button>
            </div>
          ) : (
            <div className="overflow-x-auto">
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
                    <TableRow key={row.id} className="cursor-pointer hover:bg-muted/40">
                      <TableCell>
                        <Link href={`/feedback/${row.id}`} className="font-mono text-sm text-primary hover:underline">
                          {row.reference}
                        </Link>
                      </TableCell>
                      <TableCell>
                        <FeedbackTypeBadge type={row.type} />
                      </TableCell>
                      <TableCell className="max-w-[280px] truncate">
                        <Link href={`/feedback/${row.id}`} className="hover:underline">
                          {row.subject}
                        </Link>
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
  );
}
