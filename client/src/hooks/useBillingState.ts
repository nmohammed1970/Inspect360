import { useState, useMemo, useEffect, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "./useAuth";
import {
  TIER_ORDER,
  getTierByInspections,
  compareTiers,
  SNAP_POINTS,
  SNAP_THRESHOLD,
  SLIDER_MIN,
  SLIDER_MAX,
  FREE_TRIAL_INSPECTIONS,
  SIGNUP_CREDIT_GRANT,
  isEnterpriseQuoteVolume,
  type TierId,
} from "@/config/billingTiers";
import { MODULES } from "@/config/billingModules";

export type PlanStatus = "none" | "trialing" | "active" | "past_due" | "canceled";
export type BillingPeriod = "monthly" | "annual";

export interface CurrentPlan {
  tier: string;
  tierName: string;
  tierId: string | null;
  billingPeriod: BillingPeriod;
  /** Monthly credit allowance (BILL-08 credits) */
  includedPerMonth: number;
  usedThisPeriod: number;
  topUpCredits: number;
  /** Property/unit count for Tenant Portal banding */
  unitsUnderMgmt: number;
  renewsOn: string;
  status: PlanStatus;
}

export interface SelectedPlan {
  tier: string;
  tierName: string;
  inspections: number;
  billingPeriod: BillingPeriod;
  modules: string[];
}

interface CTAState {
  label: string;
  action: "disabled" | "upgrade" | "downgrade" | "start" | "trial" | "quote";
  disabled: boolean;
}

function mapSubscriptionStatus(raw: string | undefined | null): PlanStatus {
  if (!raw) return "none";
  const s = raw.toLowerCase();
  if (s === "active") return "active";
  if (s === "trialing" || s === "trial") return "trialing";
  if (s === "past_due" || s === "payment_failed") return "past_due";
  if (s === "canceled" || s === "cancelled") return "canceled";
  return "none";
}

function tierCodeFromName(name: string | undefined | null): string {
  if (!name) return "none";
  const lower = name.toLowerCase();
  const match = TIER_ORDER.find((id) => lower.includes(id));
  return match || "starter";
}

function modulesForTier(tierId: string): string[] {
  return MODULES.filter((m) => compareTiers(tierId, m.minTier) >= 0).map((m) => m.id);
}

export function useBillingState() {
  const { user } = useAuth();

  const { data: subscription, isLoading: subLoading } = useQuery<any>({
    queryKey: ["/api/billing/subscription"],
  });

  const { data: balance } = useQuery<any>({
    queryKey: ["/api/billing/inspection-balance"],
  });

  const { data: properties } = useQuery<any[]>({
    queryKey: ["/api/properties"],
  });

  const unitsUnderMgmt = Array.isArray(properties) ? properties.length : 0;

  const currentPlan: CurrentPlan = useMemo(() => {
    const status = mapSubscriptionStatus(subscription?.status ?? subscription?.subscriptionStatus);

    if (!subscription || status === "none") {
      return {
        tier: "none",
        tierName: "No active plan",
        tierId: null,
        billingPeriod: "annual" as BillingPeriod,
        includedPerMonth: 0,
        usedThisPeriod: 0,
        topUpCredits: balance?.total ?? 0,
        unitsUnderMgmt,
        renewsOn: "",
        status: "none" as PlanStatus,
      };
    }

    const tierName = subscription.planSnapshotJson?.planName || "Custom Plan";
    const tierCode = tierCodeFromName(tierName);
    const billingPeriod: BillingPeriod =
      subscription.billingCycle === "annual" || subscription.billingCycle === "yearly"
        ? "annual"
        : "monthly";

    const included = subscription.inspectionQuotaIncluded ?? balance?.tierQuotaIncluded ?? 0;
    const used = balance?.totalUsed ?? 0;
    const walletTotal = Number(balance?.totalAvailable ?? balance?.total ?? 0);
    const addonPurchased = Number(balance?.addonCreditsRemaining ?? 0);
    // Signup reward + other non-plan credits still in the wallet
    const topUp = Math.max(0, addonPurchased, walletTotal - Number(included || 0));

    const renewsOn = subscription.currentPeriodEnd
      ? new Date(subscription.currentPeriodEnd).toISOString()
      : subscription.subscriptionRenewalDate
        ? new Date(subscription.subscriptionRenewalDate).toISOString()
        : "";

    return {
      tier: tierCode,
      tierName,
      tierId: subscription.currentTierId ?? null,
      billingPeriod,
      includedPerMonth: included,
      usedThisPeriod: used,
      topUpCredits: topUp,
      unitsUnderMgmt,
      renewsOn,
      status,
    };
  }, [subscription, balance, unitsUnderMgmt]);

  const [billingPeriod, setBillingPeriod] = useState<BillingPeriod>("annual");
  const [inspectionsNeeded, setInspectionsNeeded] = useState<number>(SLIDER_MIN);

  const [hasSyncedPeriod, setHasSyncedPeriod] = useState(false);
  useEffect(() => {
    if (!hasSyncedPeriod && !subLoading && subscription !== undefined) {
      if (currentPlan.status !== "none") {
        setBillingPeriod(currentPlan.billingPeriod);
      }
      setHasSyncedPeriod(true);
    }
  }, [hasSyncedPeriod, subLoading, subscription, currentPlan.status, currentPlan.billingPeriod]);

  const handleSliderChange = useCallback((value: number) => {
    let v = Math.max(value, SLIDER_MIN);
    v = Math.min(v, SLIDER_MAX);
    for (const snap of SNAP_POINTS) {
      if (Math.abs(snap - v) <= SNAP_THRESHOLD) {
        v = snap;
        break;
      }
    }
    setInspectionsNeeded(v);
  }, []);

  const resolvedTier = useMemo(
    () => getTierByInspections(inspectionsNeeded),
    [inspectionsNeeded]
  );

  const selectedPlan: SelectedPlan = useMemo(
    () => ({
      tier: resolvedTier.id,
      tierName: resolvedTier.label,
      inspections: inspectionsNeeded,
      billingPeriod,
      modules: modulesForTier(resolvedTier.id),
    }),
    [resolvedTier, inspectionsNeeded, billingPeriod]
  );

  const trialUsed = useMemo(() => {
    if (currentPlan.status !== "none") return true;
    const remaining = balance?.total ?? SIGNUP_CREDIT_GRANT;
    const usedFree = Math.max(0, SIGNUP_CREDIT_GRANT - remaining);
    return usedFree >= FREE_TRIAL_INSPECTIONS;
  }, [currentPlan.status, balance?.total]);

  const trialAvailable = currentPlan.status === "none" && !trialUsed;

  const ctaState: CTAState = useMemo(() => {
    // 200 = Enterprise: slider may land here; CTA becomes Request a quote (not Subscribe)
    if (isEnterpriseQuoteVolume(inspectionsNeeded)) {
      return { label: "Request a quote", action: "quote", disabled: false };
    }

    if (currentPlan.status === "none") {
      return {
        label: "Subscribe & Pay",
        action: "start",
        disabled: false,
      };
    }

    if (currentPlan.status === "past_due") {
      return { label: "Update payment method", action: "disabled", disabled: false };
    }

    const cmp = compareTiers(selectedPlan.tier, currentPlan.tier);
    if (cmp === 0 && selectedPlan.billingPeriod === currentPlan.billingPeriod) {
      return { label: "This is your current plan", action: "disabled", disabled: true };
    }
    if (cmp > 0) {
      return { label: "Upgrade plan", action: "upgrade", disabled: false };
    }
    return { label: "Change plan", action: "downgrade", disabled: false };
  }, [currentPlan, selectedPlan, inspectionsNeeded, trialUsed]);

  const usageRatio =
    currentPlan.includedPerMonth > 0
      ? currentPlan.usedThisPeriod / currentPlan.includedPerMonth
      : 0;
  const showUpgradeBanner = currentPlan.status === "active" && usageRatio >= 0.8;

  // Wallet truth = all credit batches (plan inclusion + signup reward + top-ups)
  const walletTotal = Number(balance?.totalAvailable ?? balance?.total ?? 0);
  const planIncluded = currentPlan.includedPerMonth;
  // Extra credits beyond the plan line (signup bonus, purchased packs, etc.)
  const bonusCredits = Math.max(
    0,
    walletTotal - planIncluded,
    Number(balance?.addonCreditsRemaining ?? currentPlan.topUpCredits ?? 0),
  );

  const inspectionsLeft = walletTotal;
  const inspectionsTotal =
    currentPlan.status === "none"
      ? walletTotal
      : Math.max(walletTotal, planIncluded + bonusCredits);

  return {
    currentPlan,
    selectedPlan,
    billingPeriod,
    setBillingPeriod,
    inspectionsNeeded,
    setInspectionsNeeded: handleSliderChange,
    setInspectionsNeededRaw: setInspectionsNeeded,
    ctaState,
    showUpgradeBanner,
    usageRatio,
    inspectionsLeft,
    inspectionsTotal,
    trialAvailable,
    trialUsed,
    subscription,
    balance,
    isLoading: subLoading,
  };
}
