import { useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import {
  AlertTriangle,
  Check,
  CheckCircle2,
  ExternalLink,
  Globe,
  RefreshCw,
  Scale,
  Shield,
} from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { PageHeader } from "@/components/PageHeader";
import { pagePad } from "@/lib/responsive";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

type RuleRow = {
  id: string;
  ruleCode: string;
  jurisdiction?: string | null;
  classification?: string | null;
  status?: string | null;
  approvedAt?: string | null;
  requirementsJson?: Record<string, unknown> | null;
};

type RegulatoryPayload = {
  sources: Array<{
    id: string;
    authorityName?: string | null;
    sourceUrl?: string | null;
    status?: string | null;
    checkedAt?: string | null;
    contentHash?: string | null;
  }>;
  rules: RuleRow[];
};

type PropertyRow = { id: string; name?: string | null; address?: string | null };

function classificationLabel(value: string | null | undefined): string {
  switch (value) {
    case "national_baseline":
      return "National baseline";
    case "local_standard":
      return "Local council standard";
    case "guidance":
      return "Guidance only";
    default:
      return value?.replace(/_/g, " ") || "Standard";
  }
}

function statusMeta(status: string | null | undefined): { label: string; className: string } {
  switch (status) {
    case "APPROVED":
      return { label: "Approved", className: "border-green-300 bg-green-50 text-green-800" };
    case "DRAFT":
      return { label: "Draft", className: "border-amber-300 bg-amber-50 text-amber-900" };
    case "ANALYST_QUEUE":
      return { label: "Needs review", className: "border-sky-300 bg-sky-50 text-sky-900" };
    case "SOURCE_NOT_VERIFIED":
      return { label: "Source not verified", className: "border-rose-300 bg-rose-50 text-rose-800" };
    case "INFORMATIONAL":
      return { label: "Informational", className: "border-slate-300 bg-slate-50 text-slate-700" };
    case "ACTIVE":
      return { label: "Active", className: "border-green-300 bg-green-50 text-green-800" };
    default:
      return {
        label: status?.replace(/_/g, " ") || "Unknown",
        className: "border-muted-foreground/30 bg-muted text-foreground",
      };
  }
}

function ruleTitle(rule: RuleRow): string {
  const req = rule.requirementsJson || {};
  const citation = typeof req.citation === "string" ? req.citation : null;
  if (citation) return citation;
  return rule.ruleCode.replace(/-/g, " ");
}

function requirementRows(req: Record<string, unknown> | null | undefined): Array<{
  label: string;
  value: string;
}> {
  if (!req) return [];
  const rows: Array<{ label: string; value: string }> = [];
  const map: Array<[string, string, string]> = [
    ["minSleepingRoomM2", "Minimum sleeping room", "m²"],
    ["onePersonAged10OrAboveM2", "1 person aged 10+", "m²"],
    ["twoPersonsAged10OrAboveM2", "2 people aged 10+", "m²"],
    ["oneChildUnder10M2", "1 child under 10", "m²"],
    ["ignoreFloorAreaBelowCeilingM", "Ignore floor area below ceiling height", "m"],
  ];
  for (const [key, label, unit] of map) {
    const v = req[key];
    if (typeof v === "number") rows.push({ label, value: `${v} ${unit}` });
  }
  if (typeof req.localNotes === "string" && req.localNotes.trim()) {
    rows.push({ label: "Local notes", value: req.localNotes });
  }
  if (req.consultationOnly === true || req.guidanceOnly === true) {
    rows.push({
      label: "Effect",
      value: "Guidance / consultation only — will not auto-mark Non-compliant",
    });
  }
  return rows;
}

export default function HmoRulesReview() {
  const { toast } = useToast();
  const [selectedRuleId, setSelectedRuleId] = useState<string | null>(null);
  const [selectedPropertyIds, setSelectedPropertyIds] = useState<string[]>([]);

  const { data, isLoading } = useQuery<RegulatoryPayload>({
    queryKey: ["/api/hmo/regulatory/sources"],
  });

  const { data: properties } = useQuery<PropertyRow[]>({
    queryKey: ["/api/properties"],
  });

  const draftRules = useMemo(
    () => (data?.rules || []).filter((r) => r.status === "DRAFT" || r.status === "ANALYST_QUEUE"),
    [data?.rules],
  );
  const approvedRules = useMemo(
    () => (data?.rules || []).filter((r) => r.status === "APPROVED"),
    [data?.rules],
  );
  const rulesToShow = draftRules.length ? draftRules : data?.rules || [];
  const selectedRule = rulesToShow.find((r) => r.id === selectedRuleId) || null;

  const watchMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/hmo/regulatory/sources/watch", {});
      return res.json();
    },
    onSuccess: (payload: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/hmo/regulatory/sources"] });
      const count = Array.isArray(payload?.results) ? payload.results.length : 0;
      toast({
        title: "Source check complete",
        description: count
          ? `Checked ${count} council / GOV.UK source(s).`
          : "Sources checked.",
      });
    },
    onError: (e: any) =>
      toast({ title: "Watch failed", description: e.message, variant: "destructive" }),
  });

  const approveMutation = useMutation({
    mutationFn: async () => {
      if (!selectedRuleId) throw new Error("Select a rule first");
      if (!selectedPropertyIds.length) {
        throw new Error("Select at least one property to reassess");
      }
      const res = await apiRequest("POST", `/api/hmo/regulatory/rules/${selectedRuleId}/approve`, {
        propertyIds: selectedPropertyIds,
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/hmo/regulatory/sources"] });
      queryClient.invalidateQueries({ queryKey: ["/api/hmo/dashboard"] });
      setSelectedPropertyIds([]);
      toast({
        title: "Rule applied to selected properties",
        description:
          "Those properties were reassessed and marked for rules review where needed. Uploaded licence text was not changed.",
      });
    },
    onError: (e: any) =>
      toast({ title: "Approve failed", description: e.message, variant: "destructive" }),
  });

  const toggleProperty = (id: string, on: boolean) => {
    setSelectedPropertyIds((prev) =>
      on ? Array.from(new Set([...prev, id])) : prev.filter((x) => x !== id),
    );
  };

  return (
    <div className={cn("container mx-auto min-w-0 space-y-4 md:space-y-6", pagePad)}>
      <PageHeader
        icon={Scale}
        title="Council rules"
        description="Watch council sources, review what changed, then approve only for the properties you choose."
        actions={
          <Button asChild variant="outline">
            <Link href="/hmo">Back to portfolio</Link>
          </Button>
        }
      />

      {/* How it works */}
      <Card className="border-l-4 border-l-primary">
        <CardHeader className="pb-2">
          <CardTitle className="text-lg flex items-center gap-2">
            <Shield className="h-5 w-5 text-primary" />
            How this works
          </CardTitle>
          <CardDescription>
            AI / the watcher can propose changes. Only a person can approve them into assessments.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ol className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 text-sm">
            {[
              {
                n: "1",
                t: "Check sources",
                d: "Fetch GOV.UK / council pages. Failed checks show “Source not verified”.",
              },
              {
                n: "2",
                t: "Review the rule",
                d: "Read room sizes and notes in plain English — never raw JSON.",
              },
              {
                n: "3",
                t: "Pick properties",
                d: "Select only the affected cohort. Whole-estate apply is blocked on purpose.",
              },
              {
                n: "4",
                t: "Approve & reassess",
                d: "Those properties get a rules-review alert. Guidance never auto-marks Non-compliant.",
              },
            ].map((s) => (
              <li key={s.n} className="rounded-lg border bg-muted/20 px-3 py-3 space-y-1">
                <div className="flex items-center gap-2">
                  <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary">
                    {s.n}
                  </span>
                  <span className="font-semibold">{s.t}</span>
                </div>
                <p className="text-muted-foreground leading-relaxed pl-8">{s.d}</p>
              </li>
            ))}
          </ol>
          <p className="text-xs text-muted-foreground mt-3 leading-relaxed">
            Scheme renewal (e.g. Westminster) does not automatically invalidate every existing
            licence. Uploaded licence wording and expiry are never rewritten by a rule change.
          </p>
        </CardContent>
      </Card>

      {isLoading && <p className="text-muted-foreground">Loading sources…</p>}

      {/* Sources */}
      <div className="space-y-3">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 className="text-lg font-semibold tracking-tight">Regulatory sources</h2>
            <p className="text-sm text-muted-foreground">
              Weekly automatic checks; you can also run one now.
            </p>
          </div>
          <Button
            onClick={() => watchMutation.mutate()}
            disabled={watchMutation.isPending}
            className="shrink-0"
          >
            <RefreshCw className={cn("h-4 w-4 mr-2", watchMutation.isPending && "animate-spin")} />
            {watchMutation.isPending ? "Checking…" : "Run source check now"}
          </Button>
        </div>

        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {(data?.sources || []).map((s) => {
            const meta = statusMeta(s.status);
            const failed = s.status === "SOURCE_NOT_VERIFIED";
            return (
              <Card
                key={s.id}
                className={cn(
                  failed ? "border-l-4 border-l-destructive" : "border-l-4 border-l-primary",
                )}
              >
                <CardContent className="p-4 space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-semibold text-sm leading-snug">{s.authorityName}</p>
                      <p className="text-xs text-muted-foreground mt-1">
                        Last checked{" "}
                        {s.checkedAt ? new Date(s.checkedAt).toLocaleString() : "never"}
                      </p>
                    </div>
                    <div className="p-1.5 bg-primary/10 rounded-full shrink-0">
                      <Globe className="h-4 w-4 text-primary" />
                    </div>
                  </div>
                  <Badge variant="outline" className={meta.className}>
                    {meta.label}
                  </Badge>
                  {s.sourceUrl && (
                    <a
                      href={s.sourceUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1 text-sm text-primary hover:underline break-all"
                    >
                      Open source <ExternalLink className="h-3.5 w-3.5 shrink-0" />
                    </a>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>

        {!data?.sources?.length && !isLoading && (
          <Card>
            <CardContent className="p-6 text-center text-sm text-muted-foreground space-y-3">
              <p>No sources recorded yet.</p>
              <p>Run a source check to seed GOV.UK and council URLs.</p>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Rules */}
      <div className="space-y-3">
        <div>
          <h2 className="text-lg font-semibold tracking-tight">Rules library</h2>
          <p className="text-sm text-muted-foreground">
            Select a rule, choose properties, then approve to reassess that cohort only.
          </p>
        </div>

        <div className="grid gap-3 lg:grid-cols-2">
          {rulesToShow.slice(0, 20).map((r) => {
            const req = r.requirementsJson || {};
            const rows = requirementRows(req);
            const meta = statusMeta(r.status);
            const selected = selectedRuleId === r.id;
            const isLocal = r.classification === "local_standard";
            return (
              <button
                key={r.id}
                type="button"
                onClick={() => setSelectedRuleId(r.id)}
                className={cn(
                  "text-left rounded-xl border bg-card transition-colors",
                  isLocal ? "border-l-4 border-l-yellow-500" : "border-l-4 border-l-green-500",
                  selected && "ring-2 ring-primary/40 bg-primary/[0.03]",
                )}
              >
                <div className="p-4 space-y-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 space-y-1">
                      <p className="font-semibold text-base leading-snug">{ruleTitle(r)}</p>
                      <p className="text-xs text-muted-foreground font-mono">{r.ruleCode}</p>
                    </div>
                    <div className="p-1.5 bg-muted rounded-full shrink-0">
                      <Scale className="h-4 w-4 text-muted-foreground" />
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    <Badge variant="outline" className={meta.className}>
                      {meta.label}
                    </Badge>
                    <Badge variant="secondary">{classificationLabel(r.classification)}</Badge>
                    <Badge variant="outline">{r.jurisdiction || "England"}</Badge>
                    {selected && (
                      <Badge className="bg-primary text-primary-foreground">
                        <Check className="h-3 w-3 mr-1" /> Selected
                      </Badge>
                    )}
                  </div>

                  {rows.length > 0 ? (
                    <dl className="rounded-lg border bg-muted/20 divide-y text-sm">
                      {rows.map((row) => (
                        <div
                          key={row.label}
                          className="grid grid-cols-1 sm:grid-cols-[11rem_1fr] gap-1 px-3 py-2.5"
                        >
                          <dt className="text-muted-foreground font-medium">{row.label}</dt>
                          <dd className="font-semibold leading-snug">{row.value}</dd>
                        </div>
                      ))}
                    </dl>
                  ) : (
                    <p className="text-sm text-muted-foreground">No detailed requirements listed.</p>
                  )}
                </div>
              </button>
            );
          })}
        </div>

        {!rulesToShow.length && !isLoading && (
          <Card>
            <CardContent className="p-6 text-center text-sm text-muted-foreground">
              No rules in the library yet. Run a source check or seed baselines first.
            </CardContent>
          </Card>
        )}
      </div>

      {/* Approve cohort */}
      <Card className="border-l-4 border-l-primary">
        <CardHeader>
          <CardTitle className="text-lg">Apply to properties</CardTitle>
          <CardDescription>
            {selectedRule
              ? `Selected: ${ruleTitle(selectedRule)}`
              : "Select a rule above first, then tick the properties that should be reassessed."}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {!selectedRule && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 text-sm text-amber-950 flex items-start gap-2">
              <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
              Choose a rule card first. Empty “whole estate” apply is not allowed.
            </div>
          )}

          <div className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <Label className="text-sm font-medium">Properties in this cohort</Label>
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={!properties?.length}
                  onClick={() => setSelectedPropertyIds((properties || []).map((p) => p.id))}
                >
                  Select all
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  disabled={!selectedPropertyIds.length}
                  onClick={() => setSelectedPropertyIds([])}
                >
                  Clear
                </Button>
              </div>
            </div>

            <div className="rounded-xl border max-h-64 overflow-y-auto divide-y">
              {(properties || []).length === 0 && (
                <p className="px-3 py-6 text-sm text-muted-foreground text-center">
                  No properties found for this organisation.
                </p>
              )}
              {(properties || []).map((p) => {
                const checked = selectedPropertyIds.includes(p.id);
                return (
                  <label
                    key={p.id}
                    className={cn(
                      "flex items-start gap-3 px-3 py-2.5 cursor-pointer hover:bg-muted/40",
                      checked && "bg-primary/[0.04]",
                    )}
                  >
                    <Checkbox
                      checked={checked}
                      onCheckedChange={(v) => toggleProperty(p.id, v === true)}
                      className="mt-0.5"
                    />
                    <span className="min-w-0">
                      <span className="block text-sm font-medium truncate">
                        {p.name?.trim() || p.address?.trim() || "Property"}
                      </span>
                      {p.address && p.name && (
                        <span className="block text-xs text-muted-foreground truncate">
                          {p.address}
                        </span>
                      )}
                    </span>
                  </label>
                );
              })}
            </div>
            <p className="text-xs text-muted-foreground">
              {selectedPropertyIds.length} selected · reassessment runs only for these properties
            </p>
          </div>

          <Button
            onClick={() => approveMutation.mutate()}
            disabled={!selectedRuleId || !selectedPropertyIds.length || approveMutation.isPending}
          >
            {approveMutation.isPending ? (
              "Applying…"
            ) : (
              <>
                <CheckCircle2 className="h-4 w-4 mr-2" />
                Approve & reassess {selectedPropertyIds.length || ""}{" "}
                {selectedPropertyIds.length === 1 ? "property" : "properties"}
              </>
            )}
          </Button>
        </CardContent>
      </Card>

      {approvedRules.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-lg font-semibold tracking-tight">Recently approved</h2>
          <div className="grid gap-3 md:grid-cols-2">
            {approvedRules.slice(0, 8).map((r) => (
              <Card key={r.id} className="border-l-4 border-l-green-500">
                <CardContent className="p-4 flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-semibold text-sm">{ruleTitle(r)}</p>
                    <p className="text-xs text-muted-foreground mt-0.5 font-mono">{r.ruleCode}</p>
                    <p className="text-xs text-muted-foreground mt-2">
                      {classificationLabel(r.classification)} · {r.jurisdiction || "England"}
                    </p>
                  </div>
                  <Badge variant="outline" className={statusMeta("APPROVED").className}>
                    {r.approvedAt
                      ? new Date(r.approvedAt).toLocaleDateString()
                      : "Approved"}
                  </Badge>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
