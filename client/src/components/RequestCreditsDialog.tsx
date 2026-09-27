import { useEffect, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { parseCreditRequestCreate } from "@shared/creditRequests";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { PhoneInput } from "@/components/PhoneInput";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";

type AccountUser = {
  firstName?: string | null;
  lastName?: string | null;
  email?: string | null;
  phone?: string | null;
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
  const [units, setUnits] = useState("");
  const [contactPhone, setContactPhone] = useState("");
  const [message, setMessage] = useState("");
  const [unitsError, setUnitsError] = useState("");
  const [phoneError, setPhoneError] = useState("");
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

  useEffect(() => {
    if (open) {
      setContactPhone((user?.phone || "").trim());
    }
  }, [open, user?.phone]);

  const reset = () => {
    setUnits("");
    setContactPhone((user?.phone || "").trim());
    setMessage("");
    setUnitsError("");
    setPhoneError("");
    setMessageError("");
  };

  const submit = useMutation({
    mutationFn: async (payload: { creditsRequested: number; contactPhone: string; message: string }) => {
      const res = await apiRequest("POST", "/api/credit-requests", payload);
      return res.json() as Promise<{ emailNotified: boolean }>;
    },
    onSuccess: (body) => {
      toast({
        title: "Purchase request submitted successfully.",
        description: body.emailNotified
          ? "Your request has been submitted. The administration team has been notified and will allocate credits based on your units."
          : "Your request has been submitted. An admin will allocate credits based on your units.",
      });
      reset();
      onOpenChange(false);
    },
    onError: (error: Error) => {
      toast({
        variant: "destructive",
        title: "Unable to submit your purchase request. Please try again.",
        description: error.message || undefined,
      });
    },
  });

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!submit.isPending) { if (!next) reset(); onOpenChange(next); } }}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Purchase Credits</DialogTitle>
          <DialogDescription>
            Tell us how many properties / units you manage. This sends a request — an admin will allocate credits based on your units. Credits are not added immediately.
          </DialogDescription>
        </DialogHeader>
        <form
          className="space-y-4"
          onSubmit={(event) => {
            event.preventDefault();
            const parsed = parseCreditRequestCreate({
              creditsRequested: units.trim(),
              contactPhone,
              message,
            });
            setUnitsError(!parsed.ok && parsed.field === "credits" ? parsed.message : "");
            setPhoneError(!parsed.ok && parsed.field === "contactPhone" ? parsed.message : "");
            setMessageError(!parsed.ok && parsed.field === "message" ? parsed.message : "");
            if (!parsed.ok) return;
            submit.mutate({
              creditsRequested: parsed.creditsRequested,
              contactPhone: parsed.contactPhone,
              message: parsed.message,
            });
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
            <Label htmlFor="credit-request-phone">Contact Number</Label>
            <PhoneInput
              id="credit-request-phone"
              value={contactPhone}
              onChange={(value) => {
                setContactPhone(value);
                setPhoneError("");
              }}
              data-testid="input-credit-request-phone"
            />
            {phoneError ? <p className="text-sm text-destructive">{phoneError}</p> : null}
          </div>
          <div className="space-y-1">
            <Label htmlFor="credit-request-units">Number of Properties / Units</Label>
            <Input
              id="credit-request-units"
              inputMode="numeric"
              value={units}
              onChange={(event) => {
                setUnits(event.target.value);
                setUnitsError("");
              }}
              placeholder="e.g. 12"
              aria-invalid={!!unitsError}
              aria-describedby={unitsError ? "credit-request-units-error" : undefined}
              data-testid="input-credit-request-credits"
            />
            {unitsError ? <p id="credit-request-units-error" className="text-sm text-destructive">{unitsError}</p> : null}
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
