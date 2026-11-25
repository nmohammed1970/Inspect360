import { useState } from "react";
import { useParams } from "wouter";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Loader2, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { PreviewableImage } from "@/components/ImagePreview";

type AcceptPayload = {
  workOrderId: string;
  status: string;
  title: string;
  description: string | null;
  priority: string;
  propertyName: string | null;
  propertyAddress: string | null;
  photoUrls: string[];
  slaDue: string | null;
  canAccept: boolean;
  alreadyAssigned: boolean;
};

const PublicWorkOrderAccept = () => {
  const params = useParams<{ token: string }>();
  const token = params.token;
  const [done, setDone] = useState(false);

  const { data, isLoading, error, refetch } = useQuery<AcceptPayload>({
    queryKey: ["/api/public/work-orders/accept", token],
    queryFn: async () => {
      const res = await fetch(`/api/public/work-orders/accept/${token}`);
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.message || "Link invalid");
      }
      return res.json();
    },
    enabled: Boolean(token),
  });

  const acceptMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/public/work-orders/accept/${token}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{}",
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.message || "Failed to accept");
      }
      return res.json();
    },
    onSuccess: () => {
      setDone(true);
      void refetch();
    },
  });

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-muted/30">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4 bg-muted/30">
        <Card className="max-w-md w-full">
          <CardHeader>
            <CardTitle>Link unavailable</CardTitle>
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

  if (done) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4 bg-muted/30">
        <Card className="max-w-md w-full">
          <CardHeader className="flex flex-row items-center gap-2">
            <CheckCircle2 className="h-6 w-6 text-emerald-600" />
            <CardTitle>Work order accepted</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            You are now assigned to this job. Open Inspect360 to continue.
          </CardContent>
        </Card>
      </div>
    );
  }

  if (data.alreadyAssigned || !data.canAccept) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4 bg-muted/30">
        <Card className="max-w-md w-full">
          <CardHeader>
            <CardTitle>Already assigned</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            This work order has already been assigned to another team member.
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-muted/30">
      <Card className="max-w-lg w-full">
        <CardHeader className="space-y-2">
          <div className="flex items-center justify-between gap-2">
            <CardTitle className="text-xl">{data.title}</CardTitle>
            <Badge variant="secondary" className="uppercase">
              {data.priority}
            </Badge>
          </div>
          {(data.propertyName || data.propertyAddress) && (
            <p className="text-sm text-muted-foreground">
              {[data.propertyName, data.propertyAddress].filter(Boolean).join(" · ")}
            </p>
          )}
        </CardHeader>
        <CardContent className="space-y-4">
          {data.description && (
            <p className="text-sm whitespace-pre-wrap">{data.description}</p>
          )}
          {data.photoUrls?.length > 0 && (
            <div className="grid grid-cols-2 gap-2">
              {data.photoUrls.slice(0, 6).map((url) => (
                <PreviewableImage
                  key={url}
                  src={url}
                  alt="Maintenance"
                  className="w-full h-28 object-cover rounded-md"
                />
              ))}
            </div>
          )}
          {acceptMutation.isError && (
            <p className="text-sm text-destructive">
              {(acceptMutation.error as Error).message}
            </p>
          )}
          <Button
            className="w-full"
            size="lg"
            disabled={acceptMutation.isPending}
            onClick={() => acceptMutation.mutate()}
            data-testid="button-accept-work-order"
          >
            {acceptMutation.isPending ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Accepting…
              </>
            ) : (
              "Accept Work Order"
            )}
          </Button>
          <p className="text-xs text-muted-foreground text-center">
            Opening this page does not assign the job. Tap Accept to claim it.
          </p>
        </CardContent>
      </Card>
    </div>
  );
};

export default PublicWorkOrderAccept;
