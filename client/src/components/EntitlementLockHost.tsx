import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { isLockedAppPath, type LockCode } from "@shared/entitlements";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useEntitlement } from "@/hooks/useEntitlement";
import { useAuth } from "@/hooks/useAuth";
import { subscribeEntitlementLock } from "@/lib/queryClient";

const COPY: Record<LockCode, { title: string; body: string }> = {
  TRIAL_EXPIRED: {
    title: "Your trial has ended",
    body: "Your 7-day trial period has expired. Access to Property, Block, Inspection, Comparison Reports, and Maintenance is currently locked. Please contact your administrator to purchase credits and continue using the system.",
  },
  CREDITS_EXPIRED: {
    title: "Your credits have expired",
    body: "Your credits have expired. Access to Property, Block, Inspection, Comparison Reports, and Maintenance is currently locked. Please contact your administrator to purchase credits and continue using the system.",
  },
};

export function EntitlementLockHost() {
  const [open, setOpen] = useState(false);
  const [code, setCode] = useState<LockCode>("TRIAL_EXPIRED");
  const [location, navigate] = useLocation();
  const { user } = useAuth();
  const { data } = useEntitlement();

  useEffect(() => {
    return subscribeEntitlementLock((next) => {
      setCode(next);
      setOpen(true);
    });
  }, []);

  useEffect(() => {
    if (!data?.locked || !isLockedAppPath(location)) return;
    const next: LockCode = data.code === "CREDITS_EXPIRED" ? "CREDITS_EXPIRED" : "TRIAL_EXPIRED";
    setCode(next);
    setOpen(true);
    const fallback = user?.role === "clerk" ? "/profile" : "/dashboard";
    if (location !== fallback) {
      navigate(fallback);
    }
  }, [data?.locked, data?.code, location, navigate, user?.role]);

  const copy = COPY[code];

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{copy.title}</DialogTitle>
          <DialogDescription>{copy.body}</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button onClick={() => setOpen(false)} data-testid="button-contact-admin">
            Contact Admin
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
