import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import {
  MessageSquarePlus,
  Bug,
  Lightbulb,
  TrendingUp,
  Clock,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Eye,
} from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { FeedbackForm } from "@/components/FeedbackForm";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { pagePad } from "@/lib/responsive";

interface FeedbackSubmission {
  id: string;
  title: string;
  description: string;
  priority: "low" | "medium" | "high";
  category: "bug" | "feature" | "improvement";
  status: "new" | "in_review" | "in_progress" | "completed" | "rejected";
  resolutionNotes: string | null;
  createdAt: string;
  updatedAt: string;
  resolvedAt: string | null;
}

export default function MyFeedback() {
  const { data: feedback = [], isLoading } = useQuery<FeedbackSubmission[]>({
    queryKey: ["/api/feedback/my"],
  });

  const getCategoryIcon = (category: string) => {
    switch (category) {
      case "bug":
        return <Bug className="h-4 w-4" />;
      case "feature":
        return <Lightbulb className="h-4 w-4" />;
      case "improvement":
        return <TrendingUp className="h-4 w-4" />;
      default:
        return null;
    }
  };

  const getCategoryLabel = (category: string) => {
    switch (category) {
      case "bug":
        return "Bug Report";
      case "feature":
        return "Feature Request";
      case "improvement":
        return "Improvement";
      default:
        return category;
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "new":
        return <Clock className="h-4 w-4" />;
      case "in_review":
        return <Eye className="h-4 w-4" />;
      case "in_progress":
        return <AlertCircle className="h-4 w-4" />;
      case "completed":
        return <CheckCircle2 className="h-4 w-4" />;
      case "rejected":
        return <XCircle className="h-4 w-4" />;
      default:
        return null;
    }
  };

  const getStatusBadgeVariant = (status: string) => {
    switch (status) {
      case "new":
        return "secondary";
      case "in_review":
        return "outline";
      case "in_progress":
        return "default";
      case "completed":
        return "default";
      case "rejected":
        return "destructive";
      default:
        return "secondary";
    }
  };

  const getStatusLabel = (status: string) => {
    switch (status) {
      case "new":
        return "New";
      case "in_review":
        return "In Review";
      case "in_progress":
        return "In Progress";
      case "completed":
        return "Completed";
      case "rejected":
        return "Rejected";
      default:
        return status;
    }
  };

  const getPriorityBadgeVariant = (priority: string) => {
    switch (priority) {
      case "high":
        return "destructive";
      case "medium":
        return "default";
      case "low":
        return "secondary";
      default:
        return "secondary";
    }
  };

  if (isLoading) {
    return (
      <div className={cn("container mx-auto max-w-4xl min-w-0", pagePad)}>
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between mb-6">
          <div className="min-w-0">
            <Skeleton className="h-8 w-48 mb-2" />
            <Skeleton className="h-4 w-72 max-w-full" />
          </div>
          <Skeleton className="h-11 w-32 shrink-0" />
        </div>
        <div className="space-y-4">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-32 w-full" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className={cn("container mx-auto max-w-4xl min-w-0", pagePad)}>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between mb-6">
        <div className="min-w-0">
          <h1 className="text-xl sm:text-2xl font-bold flex items-center gap-2 break-words">
            <MessageSquarePlus className="h-6 w-6 text-primary shrink-0" />
            My Feedback
          </h1>
          <p className="text-muted-foreground mt-1 text-sm sm:text-base break-words">
            Track the status of your submitted feedback and feature requests
          </p>
        </div>
        <FeedbackForm
          trigger={
            <Button data-testid="button-new-feedback" className="min-h-11 w-full sm:w-auto shrink-0">
              <MessageSquarePlus className="h-4 w-4 mr-2 shrink-0" />
              New Feedback
            </Button>
          }
        />
      </div>

      {feedback.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12 px-4">
            <MessageSquarePlus className="h-12 w-12 text-muted-foreground/50 mb-4" />
            <h3 className="text-lg font-medium mb-2 text-center">No feedback submitted yet</h3>
            <p className="text-muted-foreground text-center mb-4 break-words">
              Help us improve Inspect360 by sharing your ideas, reporting bugs, or suggesting improvements.
            </p>
            <FeedbackForm
              trigger={
                <Button data-testid="button-submit-first-feedback" className="min-h-11">
                  <MessageSquarePlus className="h-4 w-4 mr-2 shrink-0" />
                  Submit Your First Feedback
                </Button>
              }
            />
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {feedback.map((item) => (
            <Card key={item.id} data-testid={`card-feedback-${item.id}`} className="min-w-0">
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between gap-4 min-w-0">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2 mb-1">
                      <Badge variant={getStatusBadgeVariant(item.status) as any} className="gap-1">
                        {getStatusIcon(item.status)}
                        {getStatusLabel(item.status)}
                      </Badge>
                      <Badge variant="outline" className="gap-1">
                        {getCategoryIcon(item.category)}
                        {getCategoryLabel(item.category)}
                      </Badge>
                      <Badge variant={getPriorityBadgeVariant(item.priority) as any}>
                        {item.priority.charAt(0).toUpperCase() + item.priority.slice(1)} Priority
                      </Badge>
                    </div>
                    <CardTitle className="text-lg break-words">{item.title}</CardTitle>
                    <CardDescription className="break-words">
                      Submitted {format(new Date(item.createdAt), "MMM d, yyyy 'at' h:mm a")}
                    </CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground whitespace-pre-wrap break-words">
                  {item.description}
                </p>
                {item.resolutionNotes && (
                  <div className="mt-4 p-3 bg-muted rounded-md min-w-0">
                    <p className="text-sm font-medium mb-1">Resolution Notes:</p>
                    <p className="text-sm text-muted-foreground break-words">{item.resolutionNotes}</p>
                  </div>
                )}
                {item.resolvedAt && (
                  <p className="text-xs text-muted-foreground mt-2">
                    Resolved {format(new Date(item.resolvedAt), "MMM d, yyyy 'at' h:mm a")}
                  </p>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
