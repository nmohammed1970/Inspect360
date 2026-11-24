import { useState } from "react";
import { useParams } from "wouter";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Loader2, Star } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

type FeedbackPayload = {
  jobTitle: string;
  propertyName: string | null;
  contractorName: string | null;
  alreadySubmitted: boolean;
  rating: number | null;
  improvementNotes: string | null;
};

const MaintenanceJobFeedbackPublic = () => {
  const params = useParams<{ token: string }>();
  const token = params.token;
  const [rating, setRating] = useState(0);
  const [hover, setHover] = useState(0);
  const [notes, setNotes] = useState("");
  const [done, setDone] = useState(false);

  const { data, isLoading, error } = useQuery<FeedbackPayload>({
    queryKey: ["/api/public/maintenance-feedback", token],
    queryFn: async () => {
      const res = await fetch(`/api/public/maintenance-feedback/${token}`);
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.message || "Link invalid");
      }
      return res.json();
    },
    enabled: Boolean(token),
  });

  const submitMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/public/maintenance-feedback/${token}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          rating,
          improvementNotes: notes.trim() || null,
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.message || "Failed to submit");
      }
      return res.json();
    },
    onSuccess: () => setDone(true),
  });

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <Card className="max-w-md w-full">
          <CardHeader>
            <CardTitle>Feedback unavailable</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              {(error as Error)?.message || "This link is invalid or expired."}
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (done || data.alreadySubmitted) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4 bg-muted/30">
        <Card className="max-w-md w-full">
          <CardHeader>
            <CardTitle>Thank you</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm text-muted-foreground">
            <p>Your feedback has been recorded.</p>
            {(data.rating || rating) > 0 && (
              <p>
                Rating: {data.rating || rating} / 5
              </p>
            )}
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-muted/30">
      <Card className="max-w-md w-full" data-testid="page-maintenance-job-feedback-public">
        <CardHeader>
          <CardTitle>How did we do?</CardTitle>
          <p className="text-sm text-muted-foreground">
            {data.jobTitle}
            {data.propertyName ? ` · ${data.propertyName}` : ""}
          </p>
          {data.contractorName && (
            <p className="text-xs text-muted-foreground">Completed by {data.contractorName}</p>
          )}
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="space-y-2">
            <Label>Rating</Label>
            <div className="flex gap-1" role="radiogroup" aria-label="Star rating">
              {[1, 2, 3, 4, 5].map((value) => {
                const active = (hover || rating) >= value;
                return (
                  <button
                    key={value}
                    type="button"
                    aria-label={`${value} star${value === 1 ? "" : "s"}`}
                    className="p-1"
                    onMouseEnter={() => setHover(value)}
                    onMouseLeave={() => setHover(0)}
                    onClick={() => setRating(value)}
                    data-testid={`button-star-${value}`}
                  >
                    <Star
                      className={cn(
                        "h-8 w-8 transition-colors",
                        active
                          ? "fill-amber-400 text-amber-400"
                          : "text-muted-foreground/40",
                      )}
                    />
                  </button>
                );
              })}
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="improvement-notes">How could we have improved things</Label>
            <Textarea
              id="improvement-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={4}
              placeholder="Optional comments"
              data-testid="input-improvement-notes"
            />
          </div>

          {submitMutation.error && (
            <p className="text-sm text-destructive">
              {(submitMutation.error as Error).message}
            </p>
          )}

          <Button
            className="w-full"
            disabled={rating < 1 || submitMutation.isPending}
            onClick={() => submitMutation.mutate()}
            data-testid="button-submit-job-feedback"
          >
            {submitMutation.isPending ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Submitting…
              </>
            ) : (
              "Submit feedback"
            )}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
};

export default MaintenanceJobFeedbackPublic;
