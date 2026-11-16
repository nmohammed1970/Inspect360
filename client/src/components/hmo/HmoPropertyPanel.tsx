import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { ModernFilePickerInline } from "@/components/ModernFilePickerInline";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import {
  AlertCircle,
  CheckCircle2,
  ClipboardList,
  FileUp,
  FolderOpen,
  History,
  Shield,
  Users,
  X,
} from "lucide-react";
import {
  formatHmoDate,
  hmoCaseStatusMeta,
  hmoCheckLabel,
  hmoFindingSpecLabel,
  hmoLifecycleLabel,
  hmoOverallStatusMeta,
  hmoPreTenancyLabel,
  hmoSeverityMeta,
  hmoTaskShortLabel,
  hmoRelatedTaskCodes,
} from "@/components/hmo/hmoLabels";
import { cn } from "@/lib/utils";

function formatDisplayDate(value: string | null | undefined): string {
  if (!value) return "—";
  const formatted = formatHmoDate(value);
  return formatted === "Not set" ? value : formatted;
}

function rawField(extraction: any, key: string): any {
  return extraction?.[key] ?? null;
}

function fieldVal(field: any): string {
  if (field == null) return "";
  if (typeof field === "object" && "value" in field) {
    return field.value == null ? "" : String(field.value);
  }
  return String(field);
}

function setExtractedField(extraction: any, key: string, value: string) {
  const prev = extraction?.[key];
  const numericKeys = new Set(["maximum_individuals", "maximum_households"]);
  let parsed: string | number | null = value.trim() === "" ? null : value;
  if (numericKeys.has(key) && parsed != null) {
    const n = Number(parsed);
    parsed = Number.isFinite(n) ? n : null;
  }
  return {
    ...extraction,
    [key]: {
      ...(typeof prev === "object" && prev ? prev : {}),
      value: parsed,
      human_confirmed: true,
      last_updated: new Date().toISOString(),
    },
  };
}

type Overview = {
  profile: {
    overallStatus?: string | null;
    evidenceCompleteness?: number | null;
    lastAssessedAt?: string | null;
  };
  header?: {
    address?: string | null;
    borough?: string | null;
    licenceStatus?: string | null;
    expiryDate?: string | null;
    occupantsNow?: number | null;
    occupantsPermitted?: number | null;
    attentionCount?: number;
  };
  property?: { address?: string | null; city?: string | null } | null;
  licences: Array<{
    id: string;
    licenceNumber?: string | null;
    authorityName?: string | null;
    expiryDate?: string | null;
    maxPersons?: number | null;
    lifecycleStatus?: string | null;
    currentVersionId?: string | null;
    holderName?: string | null;
    managerName?: string | null;
    versions: Array<{
      id: string;
      status?: string | null;
      fileName?: string | null;
      extractedJson?: any;
      confirmedAt?: string | null;
      originalObjectUrl?: string | null;
      createdAt?: string | null;
      versionNo?: number | null;
    }>;
  }>;
  activeCases: Array<{ id: string; caseReference: string; status: string; severity: string }>;
  recentFindings: Array<{
    id: string;
    checkId: string;
    status: string;
    severity: string;
    explanation?: string | null;
    suggestedActionCode?: string | null;
    actualJson?: Record<string, unknown> | null;
  }>;
  assessments?: Array<{
    id: string;
    overallStatus?: string | null;
    completedAt?: string | null;
    runReason?: string | null;
    createdAt?: string | null;
  }>;
  renewalAlerts?: Array<Record<string, unknown> | null>;
  occupancy?: { personCount?: number | null } | null;
};

export function HmoPropertyPanel({ propertyId }: { propertyId: string }) {
  const { toast } = useToast();
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [showPasteFallback, setShowPasteFallback] = useState(false);
  const [extractedText, setExtractedText] = useState("");
  const [lastVersionId, setLastVersionId] = useState<string | null>(null);
  const [editExtraction, setEditExtraction] = useState<any>(null);
  const [maxPersons, setMaxPersons] = useState("5");
  const [confirmedPersons, setConfirmedPersons] = useState("");
  const [proposedAdditional, setProposedAdditional] = useState("1");
  const [preTenancyResult, setPreTenancyResult] = useState<{
    decision: string;
    reason: string;
  } | null>(null);
  const [alertReason, setAlertReason] = useState<Record<string, string>>({});
  const [reviewerDecision, setReviewerDecision] = useState<Record<string, string>>({});

  const { data, isLoading, error } = useQuery<Overview>({
    queryKey: ["/api/hmo/properties", propertyId, "overview"],
    queryFn: async () => {
      const res = await fetch(`/api/hmo/properties/${propertyId}/overview`, {
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to load HMO overview");
      return res.json();
    },
    enabled: !!propertyId,
  });

  const primaryLicence = data?.licences?.[0];
  const primaryVersion =
    primaryLicence?.versions?.find((v) => v.id === lastVersionId) ||
    primaryLicence?.versions?.find((v) => v.id === primaryLicence.currentVersionId) ||
    primaryLicence?.versions?.[0] ||
    null;

  useEffect(() => {
    if (primaryVersion?.extractedJson) {
      setEditExtraction(primaryVersion.extractedJson);
      const max = fieldVal(primaryVersion.extractedJson.maximum_individuals);
      if (max) setMaxPersons(max);
    }
  }, [primaryVersion?.id, primaryVersion?.extractedJson]);

  useEffect(() => {
    if (data?.occupancy?.personCount != null) {
      setConfirmedPersons(String(data.occupancy.personCount));
    }
  }, [data?.occupancy?.personCount]);

  const isConfirmed = Boolean(
    primaryVersion?.confirmedAt || primaryVersion?.status === "CONFIRMED",
  );

  const uploadMutation = useMutation({
    mutationFn: async () => {
      if (selectedFile) {
        const form = new FormData();
        form.append("file", selectedFile);
        const res = await fetch(`/api/hmo/properties/${propertyId}/licences/uploads`, {
          method: "POST",
          credentials: "include",
          body: form,
        });
        const payload = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(payload.message || `Upload failed (${res.status})`);
        return payload;
      }
      const res = await apiRequest("POST", `/api/hmo/properties/${propertyId}/licences/uploads`, {
        extractedText,
      });
      return res.json();
    },
    onSuccess: (payload) => {
      setLastVersionId(payload.licenceVersionId);
      setSelectedFile(null);
      queryClient.invalidateQueries({
        queryKey: ["/api/hmo/properties", propertyId, "overview"],
      });
      toast({
        title: payload.deduped ? "Duplicate document" : "Licence uploaded",
        description: payload.deduped
          ? "Identical file already stored — using existing version."
          : "Review and confirm extracted fields before assessment.",
      });
    },
    onError: (e: any) =>
      toast({ title: "Upload failed", description: e.message, variant: "destructive" }),
  });

  const confirmMutation = useMutation({
    mutationFn: async (versionId: string) => {
      const res = await apiRequest("POST", `/api/hmo/licence-versions/${versionId}/confirm`, {
        extraction: editExtraction,
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["/api/hmo/properties", propertyId, "overview"],
      });
      queryClient.invalidateQueries({ queryKey: ["/api/hmo/dashboard"] });
      toast({
        title: "Licence confirmed",
        description: "Extracted details saved. Assessment can now run.",
      });
    },
    onError: (e: any) =>
      toast({ title: "Confirm failed", description: e.message, variant: "destructive" }),
  });

  const assessMutation = useMutation({
    mutationFn: async (licenceVersionId: string) => {
      const res = await apiRequest("POST", `/api/hmo/properties/${propertyId}/assessments`, {
        licenceVersionId,
        reason: "manual_ui",
      });
      return res.json();
    },
    onSuccess: (payload) => {
      queryClient.invalidateQueries({
        queryKey: ["/api/hmo/properties", propertyId, "overview"],
      });
      queryClient.invalidateQueries({ queryKey: ["/api/hmo/dashboard"] });
      toast({
        title: "Assessment complete",
        description: payload.case
          ? `Case ${payload.case.caseReference} opened`
          : `Status: ${payload.overallStatus}`,
      });
    },
    onError: (e: any) =>
      toast({ title: "Assessment failed", description: e.message, variant: "destructive" }),
  });

  const alertMutation = useMutation({
    mutationFn: async (opts: {
      findingId: string;
      action: "dismiss" | "snooze";
      reason: string;
      reviewerDecision?: string;
    }) => {
      const res = await apiRequest("POST", `/api/hmo/findings/${opts.findingId}/alert-action`, {
        action: opts.action,
        reason: opts.reason,
        snoozeDays: 7,
        reviewerDecision: opts.reviewerDecision || null,
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["/api/hmo/properties", propertyId, "overview"],
      });
      toast({ title: "Alert updated" });
    },
    onError: (e: any) =>
      toast({ title: "Could not update alert", description: e.message, variant: "destructive" }),
  });

  const editableFields = useMemo(
    () => [
      { key: "licence_number", label: "Licence number" },
      { key: "issuing_authority", label: "Council / authority" },
      { key: "borough", label: "Borough" },
      { key: "property_address", label: "Property address" },
      { key: "issue_date", label: "Grant / issue date" },
      { key: "start_date", label: "Start date" },
      { key: "expiry_date", label: "Expiry date" },
      { key: "maximum_individuals", label: "Maximum persons" },
      { key: "maximum_households", label: "Maximum households" },
      { key: "holder_name", label: "Licence holder" },
      { key: "manager_name", label: "Manager" },
    ],
    [],
  );

  if (isLoading) {
    return <p className="text-base text-muted-foreground py-4">Loading HMO overview…</p>;
  }
  if (error) {
    return (
      <div className="rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-4">
        <p className="text-base font-medium text-destructive">Unable to load HMO data</p>
        <p className="text-sm text-muted-foreground mt-1">
          Ensure the HMO Compliance module is enabled for your organisation.
        </p>
      </div>
    );
  }

  const header = data?.header;
  const statusMeta = hmoOverallStatusMeta(data?.profile?.overallStatus);
  const currentVersionId = lastVersionId || primaryVersion?.id || null;
  const conditions = Array.isArray(editExtraction?.conditions) ? editExtraction.conditions : [];
  const rooms = Array.isArray(editExtraction?.rooms) ? editExtraction.rooms : [];
  const missing = Array.isArray(editExtraction?.referenced_missing_attachments)
    ? editExtraction.referenced_missing_attachments
    : [];

  const alerts = (data?.recentFindings || []).filter((f) => {
    const meta = f.actualJson || {};
    if (meta.dismissedAt) return false;
    if (meta.snoozedUntil && new Date(String(meta.snoozedUntil)).getTime() > Date.now()) return false;
    return (
      f.status === "EVIDENCE_MISSING" ||
      f.status === "REQUIRES_HUMAN_REVIEW" ||
      f.status === "CONFIRMED_NON_COMPLIANT" ||
      f.status === "POTENTIAL_RISK"
    );
  });

  const occupantsLabel =
    header?.occupantsNow == null ? "Unknown" : String(header.occupantsNow);
  const permittedLabel =
    header?.occupantsPermitted == null ? "Unknown" : String(header.occupantsPermitted);

  return (
    <div className="space-y-6 md:space-y-8" data-testid="hmo-property-panel">
      <div className="rounded-xl border bg-muted/20 px-4 py-5 md:px-6 space-y-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0 space-y-1">
            <h2 className="text-lg md:text-xl font-semibold tracking-tight">
              {header?.address || data?.property?.address || "Property"}
            </h2>
            <p className="text-sm text-muted-foreground">
              {header?.borough || data?.property?.city || "Borough unknown"}
            </p>
          </div>
          <Badge variant="outline" className={cn("self-start text-sm", statusMeta.className)}>
            {statusMeta.label}
          </Badge>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <HeaderStat
            label="Licence status"
            value={hmoLifecycleLabel(header?.licenceStatus) || "—"}
          />
          <HeaderStat label="Expiry" value={formatDisplayDate(header?.expiryDate as any)} />
          <HeaderStat label="Occupants / permitted" value={`${occupantsLabel} / ${permittedLabel}`} />
          <HeaderStat
            label="Needs attention"
            value={String(header?.attentionCount ?? alerts.length)}
          />
        </div>
      </div>

      <Accordion type="multiple" defaultValue={["licence", "alerts"]} className="space-y-2">
        <AccordionItem value="licence" className="border rounded-xl px-4">
          <AccordionTrigger className="hover:no-underline">
            <span className="flex items-center gap-2 font-semibold">
              <FileUp className="h-4 w-4 text-primary" /> Licence
            </span>
          </AccordionTrigger>
          <AccordionContent className="space-y-5 pb-5">
            <div className="space-y-2">
              <Label>Upload or replace licence</Label>
              <ModernFilePickerInline
                onFilesSelected={(files) => setSelectedFile(files[0] || null)}
                maxFiles={1}
                maxFileSize={25 * 1024 * 1024}
                accept="image/*,.pdf,application/pdf"
                multiple={false}
                isUploading={uploadMutation.isPending}
                height={160}
              />
              {selectedFile && (
                <div className="flex items-center justify-between gap-2 rounded-lg border px-3 py-2 text-sm">
                  <span className="truncate font-medium">{selectedFile.name}</span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7"
                    onClick={() => setSelectedFile(null)}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              )}
              <button
                type="button"
                className="text-sm text-muted-foreground underline"
                onClick={() => setShowPasteFallback((v) => !v)}
              >
                {showPasteFallback ? "Hide paste fallback" : "Paste text instead"}
              </button>
              {showPasteFallback && (
                <Textarea
                  rows={4}
                  value={extractedText}
                  onChange={(e) => setExtractedText(e.target.value)}
                  placeholder="OCR text…"
                />
              )}
              <Button
                onClick={() => uploadMutation.mutate()}
                disabled={uploadMutation.isPending || (!selectedFile && !extractedText.trim())}
              >
                {uploadMutation.isPending ? "Uploading…" : "Upload & extract"}
              </Button>
            </div>

            {primaryVersion?.originalObjectUrl && (
              <div className="flex flex-wrap gap-2">
                <Button asChild variant="outline" size="sm">
                  <a href={primaryVersion.originalObjectUrl} target="_blank" rel="noreferrer">
                    Preview / download
                  </a>
                </Button>
                {primaryVersion.fileName && (
                  <span className="text-sm text-muted-foreground self-center">
                    {primaryVersion.fileName}
                  </span>
                )}
              </div>
            )}

            {editExtraction && (
              <div className="space-y-3">
                <p className="text-sm text-muted-foreground">
                  Edit extracted fields, then confirm. Assessment stays locked until confirmed.
                </p>
                <div className="grid gap-3 sm:grid-cols-2">
                  {editableFields.map((f) => (
                    <div key={f.key} className="space-y-1.5">
                      <Label className="text-sm">{f.label}</Label>
                      <Input
                        value={fieldVal(rawField(editExtraction, f.key))}
                        onChange={(e) =>
                          setEditExtraction(setExtractedField(editExtraction, f.key, e.target.value))
                        }
                      />
                    </div>
                  ))}
                </div>
                {missing.length > 0 && (
                  <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm">
                    Missing document / schedule: {missing.join("; ")}
                  </div>
                )}
                <div className="flex flex-wrap gap-2">
                  <Button
                    onClick={() => currentVersionId && confirmMutation.mutate(currentVersionId)}
                    disabled={!currentVersionId || confirmMutation.isPending}
                  >
                    {confirmMutation.isPending
                      ? "Confirming…"
                      : isConfirmed
                        ? "Re-confirm details"
                        : "Confirm extracted details"}
                  </Button>
                  <Button
                    variant="secondary"
                    onClick={() => currentVersionId && assessMutation.mutate(currentVersionId)}
                    disabled={!currentVersionId || !isConfirmed || assessMutation.isPending}
                  >
                    {assessMutation.isPending ? "Assessing…" : "Run assessment"}
                  </Button>
                  {!isConfirmed && (
                    <p className="text-sm text-amber-800 self-center">
                      Confirm before assessment
                    </p>
                  )}
                </div>
              </div>
            )}
          </AccordionContent>
        </AccordionItem>

        <AccordionItem value="restrictions" className="border rounded-xl px-4">
          <AccordionTrigger className="hover:no-underline">
            <span className="flex items-center gap-2 font-semibold">
              <Users className="h-4 w-4 text-primary" /> Restrictions
            </span>
          </AccordionTrigger>
          <AccordionContent className="space-y-4 pb-5">
            <div className="grid sm:grid-cols-2 gap-3 text-sm">
              <p>
                <span className="text-muted-foreground">Persons: </span>
                {fieldVal(editExtraction?.maximum_individuals) || "Unknown"}
              </p>
              <p>
                <span className="text-muted-foreground">Households: </span>
                {fieldVal(editExtraction?.maximum_households) || "Unknown"}
              </p>
            </div>
            {rooms.length > 0 && (
              <div className="space-y-2">
                <p className="text-sm font-medium">Sleeping rooms</p>
                <ul className="text-sm space-y-1 list-disc pl-5">
                  {rooms.map((r: any, i: number) => (
                    <li key={i}>
                      {r.room_identifier || `Room ${i + 1}`}
                      {r.floor_area_m2 != null ? ` · ${r.floor_area_m2} m²` : ""}
                      {r.authorised_occupants != null
                        ? ` · up to ${r.authorised_occupants}`
                        : ""}
                      {r.restrictions ? ` · ${r.restrictions}` : ""}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {conditions.length > 0 && (
              <div className="space-y-2">
                <p className="text-sm font-medium">Other conditions</p>
                <ul className="text-sm space-y-1 list-disc pl-5">
                  {conditions.slice(0, 12).map((c: any, i: number) => (
                    <li key={i}>
                      {c.category ? `[${c.category}] ` : ""}
                      {c.condition_text || c.original_text || "Condition"}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {!rooms.length && !conditions.length && (
              <p className="text-sm text-muted-foreground">
                No room restrictions or conditions extracted yet.
              </p>
            )}

            <Card className="shadow-none">
              <CardHeader className="py-3">
                <CardTitle className="text-base">Pre-tenancy occupancy check</CardTitle>
                <CardDescription>
                  Unknown occupants are never treated as zero.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="grid gap-3 sm:grid-cols-3">
                  <div className="space-y-1">
                    <Label>Licence max</Label>
                    <Input
                      value={maxPersons}
                      onChange={(e) => setMaxPersons(e.target.value)}
                      inputMode="numeric"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label>Currently living there</Label>
                    <Input
                      value={confirmedPersons}
                      onChange={(e) => setConfirmedPersons(e.target.value)}
                      placeholder="Blank = Unknown"
                      inputMode="numeric"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label>Extra proposed</Label>
                    <Input
                      value={proposedAdditional}
                      onChange={(e) => setProposedAdditional(e.target.value)}
                      inputMode="numeric"
                    />
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button
                    size="sm"
                    onClick={async () => {
                      try {
                        const res = await apiRequest(
                          "POST",
                          `/api/hmo/properties/${propertyId}/occupancy-check`,
                          {
                            maxPersons: maxPersons === "" ? null : Number(maxPersons),
                            confirmedPersons:
                              confirmedPersons.trim() === "" ? null : Number(confirmedPersons),
                            proposedAdditional: Number(proposedAdditional) || 0,
                            roomEvidenceComplete: false,
                          },
                        );
                        setPreTenancyResult(await res.json());
                      } catch (e: any) {
                        toast({
                          title: "Occupancy check failed",
                          description: e.message,
                          variant: "destructive",
                        });
                      }
                    }}
                  >
                    Check proposed occupancy
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={async () => {
                      try {
                        await apiRequest(
                          "POST",
                          `/api/hmo/properties/${propertyId}/occupancy-snapshots`,
                          {
                            maxPersons: maxPersons === "" ? null : Number(maxPersons),
                          },
                        );
                        queryClient.invalidateQueries({
                          queryKey: ["/api/hmo/properties", propertyId, "overview"],
                        });
                        toast({ title: "Occupancy saved from tenancies" });
                      } catch (e: any) {
                        toast({
                          title: "Could not save occupancy",
                          description: e.message,
                          variant: "destructive",
                        });
                      }
                    }}
                  >
                    Save from current tenancies
                  </Button>
                </div>
                {preTenancyResult && (
                  <div
                    className={cn(
                      "rounded-lg border px-3 py-2 text-sm",
                      preTenancyResult.decision === "ALLOW_FOR_CHECKED_CONSTRAINTS" &&
                        "border-emerald-300 bg-emerald-50",
                      preTenancyResult.decision === "BLOCK_REVIEW_REQUIRED" &&
                        "border-rose-300 bg-rose-50",
                      preTenancyResult.decision === "INSUFFICIENT_EVIDENCE" &&
                        "border-amber-300 bg-amber-50",
                    )}
                  >
                    <div className="flex items-center gap-2 font-medium">
                      {preTenancyResult.decision === "ALLOW_FOR_CHECKED_CONSTRAINTS" ? (
                        <CheckCircle2 className="h-4 w-4" />
                      ) : (
                        <AlertCircle className="h-4 w-4" />
                      )}
                      {hmoPreTenancyLabel(preTenancyResult.decision)}
                    </div>
                    <p className="text-muted-foreground mt-1">{preTenancyResult.reason}</p>
                  </div>
                )}
              </CardContent>
            </Card>
          </AccordionContent>
        </AccordionItem>

        <AccordionItem value="safety" className="border rounded-xl px-4">
          <AccordionTrigger className="hover:no-underline">
            <span className="flex items-center gap-2 font-semibold">
              <Shield className="h-4 w-4 text-primary" /> Safety and evidence
            </span>
          </AccordionTrigger>
          <AccordionContent className="space-y-3 pb-5">
            {(data?.recentFindings || [])
              .filter((f) => ["SAF-01", "AMEN-01", "MGMT-01", "LIC-05"].includes(f.checkId))
              .map((f) => (
                <div key={f.id} className="rounded-lg border px-3 py-3 text-sm space-y-1">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-medium">{hmoCheckLabel(f.checkId)}</span>
                    <Badge variant="secondary">{hmoFindingSpecLabel(f.status)}</Badge>
                  </div>
                  {f.explanation && (
                    <p className="text-muted-foreground">{f.explanation}</p>
                  )}
                  {f.suggestedActionCode && (
                    <p className="text-xs text-muted-foreground">
                      Next: {f.suggestedActionCode}
                    </p>
                  )}
                </div>
              ))}
            {!(data?.recentFindings || []).some((f) =>
              ["SAF-01", "AMEN-01", "MGMT-01", "LIC-05"].includes(f.checkId),
            ) && (
              <p className="text-sm text-muted-foreground">
                Run assessment after confirming the licence to score safety and evidence checks.
              </p>
            )}
          </AccordionContent>
        </AccordionItem>

        <AccordionItem value="alerts" className="border rounded-xl px-4">
          <AccordionTrigger className="hover:no-underline">
            <span className="flex items-center gap-2 font-semibold">
              <AlertCircle className="h-4 w-4 text-amber-700" /> Alerts
              {alerts.length > 0 && (
                <Badge variant="secondary" className="ml-1">
                  {alerts.length}
                </Badge>
              )}
            </span>
          </AccordionTrigger>
          <AccordionContent className="space-y-4 pb-5">
            {(data?.renewalAlerts || []).slice(0, 3).map((a: any, i: number) => (
              <div key={i} className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-3 text-sm">
                <p className="font-medium">
                  {a?.window === "expired"
                    ? "Licence document expired — verify licensing position"
                    : `Renewal due within ${a?.window} days`}
                </p>
                <p className="text-muted-foreground mt-1">
                  Expiry {a?.expiryDate || "—"}. Never treated as automatic unlawful operation.
                </p>
              </div>
            ))}

            {alerts.length === 0 && !(data?.renewalAlerts || []).length && (
              <p className="text-sm text-muted-foreground">No open alerts.</p>
            )}

            {alerts.map((f) => {
              const caseLink = data?.activeCases?.[0];
              const related = hmoRelatedTaskCodes(f.checkId);
              return (
                <div key={f.id} className="rounded-lg border px-3 py-3 space-y-2 text-sm">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <p className="font-medium">{hmoCheckLabel(f.checkId)}</p>
                      <p className="text-muted-foreground">{f.explanation}</p>
                    </div>
                    <div className="flex gap-1.5">
                      <Badge variant="outline" className={hmoSeverityMeta(f.severity).className}>
                        {hmoSeverityMeta(f.severity).label}
                      </Badge>
                      <Badge variant="secondary">{hmoFindingSpecLabel(f.status)}</Badge>
                    </div>
                  </div>
                  <p className="text-muted-foreground">
                    Next action: {f.suggestedActionCode || "Review evidence"}
                    {related[0] ? ` · ${related[0]} (${hmoTaskShortLabel(related[0])})` : ""}
                  </p>
                  {caseLink && (
                    <Link href={`/hmo/cases/${caseLink.id}`} className="text-primary underline text-sm">
                      Open case {caseLink.caseReference}
                    </Link>
                  )}
                  <div className="grid gap-2 sm:grid-cols-2">
                    <Input
                      placeholder="Reason"
                      value={alertReason[f.id] || ""}
                      onChange={(e) =>
                        setAlertReason((m) => ({ ...m, [f.id]: e.target.value }))
                      }
                    />
                    {f.severity === "CRITICAL" && (
                      <Input
                        placeholder="Reviewer decision (required)"
                        value={reviewerDecision[f.id] || ""}
                        onChange={(e) =>
                          setReviewerDecision((m) => ({ ...m, [f.id]: e.target.value }))
                        }
                      />
                    )}
                  </div>
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={alertMutation.isPending || !(alertReason[f.id] || "").trim()}
                      onClick={() =>
                        alertMutation.mutate({
                          findingId: f.id,
                          action: "snooze",
                          reason: alertReason[f.id],
                          reviewerDecision: reviewerDecision[f.id],
                        })
                      }
                    >
                      Snooze 7 days
                    </Button>
                    <Button
                      size="sm"
                      variant="secondary"
                      disabled={alertMutation.isPending || !(alertReason[f.id] || "").trim()}
                      onClick={() =>
                        alertMutation.mutate({
                          findingId: f.id,
                          action: "dismiss",
                          reason: alertReason[f.id],
                          reviewerDecision: reviewerDecision[f.id],
                        })
                      }
                    >
                      Dismiss
                    </Button>
                  </div>
                </div>
              );
            })}

            {data?.activeCases && data.activeCases.length > 0 && (
              <div className="space-y-2 pt-2">
                <p className="text-sm font-medium flex items-center gap-2">
                  <FolderOpen className="h-4 w-4" /> Linked cases
                </p>
                {data.activeCases.map((c) => (
                  <Link
                    key={c.id}
                    href={`/hmo/cases/${c.id}`}
                    className="block rounded-lg border px-3 py-2 hover:bg-muted/40 text-sm"
                  >
                    <span className="font-medium">{c.caseReference}</span>{" "}
                    <Badge variant="outline" className={hmoCaseStatusMeta(c.status).className}>
                      {hmoCaseStatusMeta(c.status).label}
                    </Badge>
                  </Link>
                ))}
              </div>
            )}
          </AccordionContent>
        </AccordionItem>

        <AccordionItem value="history" className="border rounded-xl px-4">
          <AccordionTrigger className="hover:no-underline">
            <span className="flex items-center gap-2 font-semibold">
              <History className="h-4 w-4 text-primary" /> History
            </span>
          </AccordionTrigger>
          <AccordionContent className="space-y-4 pb-5">
            <div className="space-y-2">
              <p className="text-sm font-medium flex items-center gap-2">
                <ClipboardList className="h-4 w-4" /> Licence versions
              </p>
              {(data?.licences || []).flatMap((lic) =>
                (lic.versions || []).map((v) => (
                  <div key={v.id} className="rounded-lg border px-3 py-2 text-sm">
                    <div className="flex flex-wrap justify-between gap-2">
                      <span>
                        v{v.versionNo || "?"} · {v.fileName || "Document"}
                      </span>
                      <Badge variant="secondary">
                        {v.confirmedAt || v.status === "CONFIRMED"
                          ? "Confirmed"
                          : v.status || "Draft"}
                      </Badge>
                    </div>
                    <p className="text-muted-foreground mt-1">
                      Uploaded {formatDisplayDate(v.createdAt)}
                      {v.confirmedAt ? ` · Confirmed ${formatDisplayDate(v.confirmedAt)}` : ""}
                    </p>
                  </div>
                )),
              )}
              {!data?.licences?.length && (
                <p className="text-sm text-muted-foreground">No licence versions yet.</p>
              )}
            </div>
            <div className="space-y-2">
              <p className="text-sm font-medium">Assessments</p>
              {(data?.assessments || []).map((a) => (
                <div key={a.id} className="rounded-lg border px-3 py-2 text-sm flex justify-between gap-2">
                  <span>
                    {formatDisplayDate(a.completedAt || a.createdAt)} · {a.runReason || "run"}
                  </span>
                  <Badge variant="outline" className={hmoOverallStatusMeta(a.overallStatus).className}>
                    {hmoOverallStatusMeta(a.overallStatus).label}
                  </Badge>
                </div>
              ))}
              {!data?.assessments?.length && (
                <p className="text-sm text-muted-foreground">No assessments yet.</p>
              )}
            </div>
          </AccordionContent>
        </AccordionItem>
      </Accordion>
    </div>
  );
}

function HeaderStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border bg-card px-3 py-2.5">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-sm font-semibold mt-0.5 break-words">{value}</p>
    </div>
  );
}
