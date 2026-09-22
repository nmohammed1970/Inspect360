import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { parseCreditRequestCreate } from "@shared/creditRequests";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";

type AccountUser = {
  firstName?: string | null;
  lastName?: string | null;
  email?: string | null;
  organizationId?: string | null;
};

type RequestCreditsDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  user: AccountUser | null;
};

export function BuyCreditsButton({ onClick, testId }: { onClick: () => void; testId: string }) {
  return (
    <Button type="button" size="sm" className="shrink-0" onClick={onClick} data-testid={testId}>
      Buy Credits
    </Button>
  );
}

export function RequestCreditsDialog({ open, onOpenChange, user }: RequestCreditsDialogProps) {
  const { toast } = useToast();
  const [credits, setCredits] = useState("");
  const [message, setMessage] = useState("");
  const [creditsError, setCreditsError] = useState("");
  const [messageError, setMessageError] = useState("");

  const { data: organization } = useQuery<{ name?: string }>({
    queryKey: ["/api/organizations", user?.organizationId, "credit-request"],
    enabled: open && !!user?.organizationId,
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/organizations/${user?.organizationId}`);
      return res.json();
    },
    retry: false,
  });

  const fullName = [user?.firstName, user?.lastName].filter(Boolean).join(" ").trim() || user?.email || "";

  const reset = () => {
    setCredits("");
    setMessage("");
    setCreditsError("");
    setMessageError("");
  };

  const submit = useMutation({
    mutationFn: async (payload: { creditsRequested: number; message: string }) => {
      const res = await apiRequest("POST", "/api/credit-requests", payload);
      return res.json() as Promise<{ emailNotified: boolean }>;
    },
    onSuccess: (body) => {
      toast({
        title: "Credit request submitted successfully.",
        description: body.emailNotified
          ? "Your credit request has been submitted successfully. The administration team has been notified."
          : "Your credit request has been submitted successfully.",
      });
      reset();
      onOpenChange(false);
    },
    onError: (error: Error) => {
      toast({
        variant: "destructive",
        title: "Unable to submit your credit request. Please try again.",
        description: error.message || undefined,
      });
    },
  });

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!submit.isPending) { if (!next) reset(); onOpenChange(next); } }}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Request Credits</DialogTitle>
          <DialogDescription>Tell the Inspect360 team how many credits you need. This sends a request. It does not add credits immediately.</DialogDescription>
        </DialogHeader>
        <form
          className="space-y-4"
          onSubmit={(event) => {
            event.preventDefault();
            const parsed = parseCreditRequestCreate({ creditsRequested: credits.trim(), message });
            const messageCheck = parseCreditRequestCreate({ creditsRequested: 6, message });
            setCreditsError(!parsed.ok && parsed.field === "credits" ? parsed.message : "");
            setMessageError(!messageCheck.ok && messageCheck.field === "message" ? messageCheck.message : "");
            if (!parsed.ok || !messageCheck.ok) return;
            submit.mutate({ creditsRequested: parsed.creditsRequested, message: parsed.message });
          }}
        >
          <div className="space-y-1">
            <Label htmlFor="credit-request-name">Full Name</Label>
            <Input id="credit-request-name" value={fullName} readOnly />
          </div>
          <div className="space-y-1">
            <Label htmlFor="credit-request-org">Organization Name</Label>
            <Input id="credit-request-org" value={organization?.name || ""} readOnly />
          </div>
          <div className="space-y-1">
            <Label htmlFor="credit-request-email">Email</Label>
            <Input id="credit-request-email" type="email" value={user?.email || ""} readOnly />
          </div>
          <div className="space-y-1">
            <Label htmlFor="credit-request-credits">Credits Required</Label>
            <Input
              id="credit-request-credits"
              inputMode="numeric"
              value={credits}
              onChange={(event) => {
                setCredits(event.target.value);
                setCreditsError("");
              }}
              aria-invalid={!!creditsError}
              aria-describedby={creditsError ? "credit-request-credits-error" : undefined}
              data-testid="input-credit-request-credits"
            />
            {creditsError ? <p id="credit-request-credits-error" className="text-sm text-destructive">{creditsError}</p> : null}
          </div>
          <div className="space-y-1">
            <Label htmlFor="credit-request-message">Message</Label>
            <Textarea
              id="credit-request-message"
              value={message}
              onChange={(event) => {
                setMessage(event.target.value);
                setMessageError("");
              }}
              rows={4}
              aria-invalid={!!messageError}
              aria-describedby={messageError ? "credit-request-message-error" : undefined}
              data-testid="input-credit-request-message"
            />
            {messageError ? <p id="credit-request-message-error" className="text-sm text-destructive">{messageError}</p> : null}
          </div>
          <DialogFooter>
            <Button type="submit" disabled={submit.isPending} data-testid="button-submit-credit-request">
              {submit.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
              {submit.isPending ? "Submitting..." : "Submit Request"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
