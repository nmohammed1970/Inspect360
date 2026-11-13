import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ModernFilePickerInline } from "@/components/ModernFilePickerInline";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import {
  AlertCircle,
  CheckCircle2,
  ClipboardList,
  FileUp,
  FolderOpen,
  HelpCircle,
  Users,
  X,
} from "lucide-react";
import {
  formatHmoDate,
  hmoCaseStatusMeta,
  hmoCheckGroup,
  hmoCheckLabel,
  hmoFindingStatusLabel,
  hmoLifecycleLabel,
  hmoOverallStatusMeta,
  hmoPreTenancyLabel,
  hmoRelatedTaskCodes,
  hmoSeverityMeta,
  hmoTaskShortLabel,
} from "@/components/hmo/hmoLabels";
import { cn } from "@/lib/utils";

function formatDisplayDate(value: string | null | undefined): string {
  if (!value) return "Not found";
  const formatted = formatHmoDate(value);
  return formatted === "Not set" ? value : formatted;
}

function fieldValue(field: any): string {
  if (field == null) return "Not found";
  if (typeof field === "object" && "value" in field) {
    const v = field.value;
    if (v == null || v === "") return "Not found";
    return String(v);
  }
  if (field === "") return "Not found";
  return String(field);
}

function confidenceLabel(field: any): string | null {
  const c = field?.confidence;
  if (typeof c !== "number" || !Number.isFinite(c)) return null;
  const pct = Math.round(c * 100);
  if (pct >= 85) return "High confidence";
  if (pct >= 60) return "Medium confidence";
  return "Low confidence";
}

function LicenceExtractionSummary({ extraction }: { extraction: any }) {
  if (!extraction || typeof extraction !== "object") {
    return <p className="text-sm text-muted-foreground mt-2">No extracted details yet.</p>;
  }

  const rows: Array<{ label: string; value: string; hint?: string | null }> = [
    { label: "Licence number", value: fieldValue(extraction.licence_number), hint: confidenceLabel(extraction.licence_number) },
    { label: "Issuing authority", value: fieldValue(extraction.issuing_authority), hint: confidenceLabel(extraction.issuing_authority) },
    { label: "Property address", value: fieldValue(extraction.property_address), hint: confidenceLabel(extraction.property_address) },
    { label: "Issue date", value: formatDisplayDate(fieldValue(extraction.issue_date) === "Not found" ? null : fieldValue(extraction.issue_date)), hint: confidenceLabel(extraction.issue_date) },
    { label: "Expiry date", value: formatDisplayDate(fieldValue(extraction.expiry_date) === "Not found" ? null : fieldValue(extraction.expiry_date)), hint: confidenceLabel(extraction.expiry_date) },
    { label: "Maximum individuals", value: fieldValue(extraction.maximum_individuals), hint: confidenceLabel(extraction.maximum_individuals) },
    { label: "Licence holder", value: fieldValue(extraction.holder_name), hint: confidenceLabel(extraction.holder_name) },
    { label: "Manager", value: fieldValue(extraction.manager_name), hint: confidenceLabel(extraction.manager_name) },
  ];

  const missing = Array.isArray(extraction.referenced_missing_attachments)
    ? extraction.referenced_missing_attachments.filter(Boolean)
    : [];
  const warnings = Array.isArray(extraction.warnings) ? extraction.warnings.filter(Boolean) : [];
  const conditions = Array.isArray(extraction.conditions) ? extraction.conditions : [];

  return (
    <div className="mt-5 space-y-4">
      <div className="rounded-xl border bg-card overflow-hidden divide-y">
        {rows.map((row) => (
          <div
            key={row.label}
            className="grid grid-cols-1 sm:grid-cols-[14rem_1fr] gap-1.5 sm:gap-5 px-4 py-3.5 md:px-5 md:py-4"
          >
            <div className="text-sm font-semibold text-muted-foreground sm:pt-0.5">
              {row.label}
            </div>
            <div>
              <div
                className={cn(
                  "text-base font-semibold break-words leading-snug",
                  row.value === "Not found" && "text-amber-800",
                )}
              >
                {row.value}
              </div>
              {row.hint && (
                <div
                  className={cn(
                    "text-sm mt-1",
                    row.hint.startsWith("Low")
                      ? "text-amber-700 font-medium"
                      : "text-muted-foreground",
                  )}
                >
                  {row.hint}
                </div>
              )}
            </div>
          </div>
        ))}
      </div>

      {missing.length > 0 && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3.5">
          <p className="text-sm font-semibold text-amber-900">
            Missing attachments mentioned in the document
          </p>
          <ul className="mt-2 list-disc pl-5 text-sm md:text-base text-amber-950 space-y-1.5 leading-relaxed">
            {missing.map((item: string, i: number) => (
              <li key={i}>{item}</li>
            ))}
          </ul>
        </div>
      )}

      {conditions.length > 0 && (
        <div className="rounded-xl border px-4 py-3.5">
          <p className="text-sm font-semibold text-muted-foreground">Conditions noted</p>
          <ul className="mt-2 list-disc pl-5 text-sm md:text-base space-y-1.5 leading-relaxed">
            {conditions.slice(0, 8).map((c: any, i: number) => (
              <li key={i}>{typeof c === "string" ? c : c.condition_text || "Condition"}</li>
            ))}
          </ul>
        </div>
      )}

      {warnings.length > 0 && (
        <p className="text-sm text-muted-foreground leading-relaxed">
          Note: {warnings[0]}
        </p>
      )}
    </div>
  );
}

type Overview = {
  profile: {
    overallStatus?: string | null;
    evidenceCompleteness?: number | null;
    lastAssessedAt?: string | null;
  };
  licences: Array<{
    id: string;
    licenceNumber?: string | null;
    authorityName?: string | null;
    expiryDate?: string | null;
    maxPersons?: number | null;
    lifecycleStatus?: string | null;
    currentVersionId?: string | null;
    versions: Array<{
      id: string;
      status?: string | null;
      fileName?: string | null;
      extractedJson?: any;
      confirmedAt?: string | null;
    }>;
  }>;
  activeCases: Array<{ id: string; caseReference: string; status: string; severity: string }>;
  recentFindings: Array<{
    id: string;
    checkId: string;
    status: string;
    severity: string;
    explanation?: string | null;
  }>;
};

export function HmoPropertyPanel({ propertyId }: { propertyId: string }) {
  const { toast } = useToast();
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [showPasteFallback, setShowPasteFallback] = useState(false);
  const [extractedText, setExtractedText] = useState("");
  const [lastVersionId, setLastVersionId] = useState<string | null>(null);
  const [lastObjectUrl, setLastObjectUrl] = useState<string | null>(null);
  const [maxPersons, setMaxPersons] = useState("5");
  const [confirmedPersons, setConfirmedPersons] = useState("");
  const [proposedAdditional, setProposedAdditional] = useState("1");
  const [preTenancyResult, setPreTenancyResult] = useState<{
    decision: string;
    reason: string;
  } | null>(null);

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
        if (!res.ok) {
          throw new Error(payload.message || `Upload failed (${res.status})`);
        }
        return payload;
      }

      const res = await apiRequest(
        "POST",
        `/api/hmo/properties/${propertyId}/licences/uploads`,
        { extractedText },
      );
      return res.json();
    },
    onSuccess: (payload) => {
      setLastVersionId(payload.licenceVersionId);
      if (payload.objectUrl) setLastObjectUrl(payload.objectUrl);
      queryClient.invalidateQueries({
        queryKey: ["/api/hmo/properties", propertyId, "overview"],
      });
      toast({
        title: payload.deduped ? "Duplicate document" : "Licence uploaded",
        description: payload.deduped
          ? "Identical file already stored — using existing version."
          : payload.extractWarning
            ? `Extracted with warning: ${payload.extractWarning}`
            : "Extraction complete — review the fields below, then run assessment. Re-upload if anything looks wrong.",
      });
    },
    onError: (e: any) =>
      toast({ title: "Upload failed", description: e.message, variant: "destructive" }),
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

  if (isLoading) {
    return <p className="text-base text-muted-foreground py-4">Loading HMO overview…</p>;
  }
  if (error) {
    return (
      <div className="rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-4">
        <p className="text-base font-medium text-destructive">Unable to load HMO data</p>
        <p className="text-sm text-muted-foreground mt-1 leading-relaxed">
          Ensure the HMO Compliance module is enabled for your organisation.
        </p>
      </div>
    );
  }

  const profile = data?.profile;
  const currentVersionId =
    lastVersionId ||
    data?.licences?.[0]?.currentVersionId ||
    data?.licences?.[0]?.versions?.[0]?.id ||
    null;
  const overallStatus = profile?.overallStatus || "NOT_ASSESSED";
  const evidencePct = profile?.evidenceCompleteness ?? 0;
  const statusMeta = hmoOverallStatusMeta(overallStatus);

  const openCases = data?.activeCases?.length ?? 0;

  return (
    <div className="space-y-8 md:space-y-10" data-testid="hmo-property-panel">
      <div className="rounded-xl border bg-muted/30 px-4 py-5 md:px-6 md:py-6 space-y-4">
        <div className="flex items-start gap-3">
          <span className="inline-flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 shrink-0">
            <HelpCircle className="h-5 w-5 text-primary" />
          </span>
          <div className="min-w-0 space-y-1.5">
            <h2 className="text-lg md:text-xl font-semibold tracking-tight">
              How HMO licensing works here
            </h2>
            <p className="text-sm md:text-base text-muted-foreground leading-relaxed">
              This panel tracks{" "}
              <span className="font-medium text-foreground">licence documents and evidence</span> —
              not a legal certificate. Follow the steps in order: upload the licence, review
              extracted fields, run assessment, then check occupancy before a move-in.
            </p>
          </div>
        </div>
        <ol className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 text-sm md:text-base">
          {[
            { n: "1", t: "Upload & extract", d: "Add the PDF or photo of the licence" },
            { n: "2", t: "Review fields", d: "Confirm number, dates, authority, max persons" },
            { n: "3", t: "Run assessment", d: "Score licence checks and open cases if needed" },
            { n: "4", t: "Occupancy check", d: "Test a proposed move-in against the max" },
          ].map((s) => (
            <li key={s.n} className="rounded-lg border bg-card px-3.5 py-3">
              <div className="flex items-center gap-2.5">
                <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-primary/10 text-sm font-bold text-primary">
                  {s.n}
                </span>
                <span className="font-semibold">{s.t}</span>
              </div>
              <p className="text-sm text-muted-foreground mt-2 pl-9 leading-relaxed">{s.d}</p>
            </li>
          ))}
        </ol>
      </div>

      <section className="space-y-4">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div className="space-y-1">
            <h2 className="text-lg md:text-xl font-semibold tracking-tight">Licensing overview</h2>
            <p className="text-sm md:text-base text-muted-foreground leading-relaxed">
              Current status for this property’s HMO evidence pack.
            </p>
          </div>
          <Badge
            variant="outline"
            className={cn("self-start sm:self-auto text-sm px-2.5 py-1", statusMeta.className)}
          >
            {statusMeta.label}
          </Badge>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 md:gap-4">
          <Card className="border-l-4 border-l-primary shadow-none">
            <CardContent className="p-4 md:p-5">
              <p className="text-sm font-medium text-muted-foreground">Evidence completeness</p>
              <p className="mt-1 text-2xl md:text-3xl font-bold tabular-nums">{evidencePct}%</p>
              <div className="mt-3 h-2.5 w-full rounded-full bg-muted overflow-hidden">
                <div
                  className={cn(
                    "h-full rounded-full",
                    evidencePct >= 80
                      ? "bg-emerald-500"
                      : evidencePct >= 40
                        ? "bg-amber-500"
                        : "bg-rose-500",
                  )}
                  style={{ width: `${Math.max(0, Math.min(100, evidencePct))}%` }}
                />
              </div>
              <p className="text-sm text-muted-foreground mt-2 leading-relaxed">
                How much of the expected evidence set is present
              </p>
            </CardContent>
          </Card>
          <Card
            className={cn(
              "border-l-4 shadow-none",
              openCases > 0 ? "border-l-amber-500" : "border-l-emerald-500",
            )}
          >
            <CardContent className="p-4 md:p-5">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Open cases</p>
                  <p
                    className={cn(
                      "mt-1 text-2xl md:text-3xl font-bold tabular-nums",
                      openCases > 0 ? "text-amber-700" : "text-emerald-700",
                    )}
                  >
                    {openCases}
                  </p>
                  <p className="text-sm text-muted-foreground mt-2 leading-relaxed">
                    {openCases === 0 ? "No open remediation cases" : "See Active cases below"}
                  </p>
                </div>
                <span className="p-2.5 rounded-full bg-muted">
                  <FolderOpen className="h-5 w-5 text-muted-foreground" />
                </span>
              </div>
            </CardContent>
          </Card>
          <Card className="border-l-4 border-l-primary shadow-none">
            <CardContent className="p-4 md:p-5">
              <p className="text-sm font-medium text-muted-foreground">Last assessed</p>
              <p className="mt-1 text-xl md:text-2xl font-semibold tracking-tight">
                {profile?.lastAssessedAt
                  ? new Date(profile.lastAssessedAt).toLocaleDateString(undefined, {
                      day: "numeric",
                      month: "short",
                      year: "numeric",
                    })
                  : "Not assessed yet"}
              </p>
              <p className="text-sm text-muted-foreground mt-2 leading-relaxed">
                {profile?.lastAssessedAt
                  ? new Date(profile.lastAssessedAt).toLocaleTimeString(undefined, {
                      hour: "2-digit",
                      minute: "2-digit",
                    })
                  : "Upload a licence, then run assessment"}
              </p>
            </CardContent>
          </Card>
        </div>
      </section>

      <Card className="shadow-none">
        <CardHeader className="space-y-1.5">
          <div className="flex items-start gap-3">
            <span className="inline-flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 shrink-0">
              <FileUp className="h-5 w-5 text-primary" />
            </span>
            <div>
              <CardTitle className="text-lg md:text-xl">Step 1 — Upload & extract licence</CardTitle>
              <CardDescription className="mt-1 text-sm md:text-base leading-relaxed">
                Add the HMO licence PDF or photo. The system reads key fields into a draft for you to
                review in Step 2.
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="rounded-xl border border-dashed bg-muted/20 px-4 py-3 text-sm md:text-base text-muted-foreground leading-relaxed">
            Tip: include schedules/annexes in the same upload when possible. Clear multi-page PDFs
            extract better than blurry photos.
          </div>
          <div className="space-y-2">
            <Label className="text-base font-medium">Licence file</Label>
            <p className="text-sm text-muted-foreground">
              Accepted: PDF, JPG/JPEG, PNG, WebP, HEIC/HEIF, GIF, BMP · Max 25 MB
            </p>
            <ModernFilePickerInline
              onFilesSelected={(files) => {
                const file = files[0] || null;
                setSelectedFile(file);
              }}
              maxFiles={1}
              maxFileSize={25 * 1024 * 1024}
              accept="image/*,.pdf,application/pdf,.jpg,.jpeg,.jpe,.png,.webp,.heic,.heif,.gif,.bmp,image/jpeg,image/png,image/webp,image/heic,image/heif"
              multiple={false}
              isUploading={uploadMutation.isPending}
              height={220}
              className="mt-1"
            />
            {selectedFile && (
              <div className="flex items-center justify-between gap-2 rounded-lg border bg-muted/40 px-3 py-2.5 text-sm">
                <span className="truncate font-medium">
                  {selectedFile.name}{" "}
                  <span className="text-muted-foreground font-normal">
                    ({Math.round(selectedFile.size / 1024)} KB)
                  </span>
                </span>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 shrink-0"
                  onClick={() => setSelectedFile(null)}
                  aria-label="Clear selected file"
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            )}
          </div>

          <button
            type="button"
            className="text-sm text-muted-foreground underline underline-offset-2"
            onClick={() => setShowPasteFallback((v) => !v)}
          >
            {showPasteFallback ? "Hide paste fallback" : "Paste text instead (advanced)"}
          </button>
          {showPasteFallback && (
            <div className="space-y-2 rounded-xl border bg-muted/20 p-4">
              <Label htmlFor="hmo-text" className="text-base">
                Pasted licence text
              </Label>
              <Textarea
                id="hmo-text"
                rows={6}
                value={extractedText}
                onChange={(e) => setExtractedText(e.target.value)}
                placeholder="Only if you already have OCR text…"
              />
            </div>
          )}

          <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center pt-1">
            <Button
              size="lg"
              onClick={() => uploadMutation.mutate()}
              disabled={
                uploadMutation.isPending ||
                (!selectedFile && !extractedText.trim())
              }
            >
              {uploadMutation.isPending ? "Uploading…" : "Upload & extract"}
            </Button>
            <Button
              size="lg"
              variant="secondary"
              onClick={() => currentVersionId && assessMutation.mutate(currentVersionId)}
              disabled={!currentVersionId || assessMutation.isPending || uploadMutation.isPending}
            >
              {assessMutation.isPending ? "Assessing…" : "Step 3 — Run assessment"}
            </Button>
            {!currentVersionId && (
              <p className="text-sm text-muted-foreground sm:ml-1 leading-relaxed">
                Assessment unlocks after a successful extract.
              </p>
            )}
          </div>
        </CardContent>
      </Card>

      {data?.licences && data.licences.length > 0 && (
        <Card className="shadow-none">
          <CardHeader className="space-y-1.5">
            <div className="flex items-start gap-3">
              <span className="inline-flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 shrink-0">
                <ClipboardList className="h-5 w-5 text-primary" />
              </span>
              <div>
                <CardTitle className="text-lg md:text-xl">Step 2 — Review extracted details</CardTitle>
                <CardDescription className="mt-1 text-sm md:text-base leading-relaxed">
                  Confirm these fields before assessment. Yellow “Not found” or low confidence usually
                  means re-upload a clearer file.
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-6">
            {data.licences.map((lic) => (
              <div key={lic.id} className="rounded-xl border p-4 md:p-6 space-y-4">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0 space-y-1">
                    <div className="text-lg font-semibold">
                      {lic.licenceNumber || "Draft licence"}
                    </div>
                    <div className="text-base text-muted-foreground">
                      {lic.authorityName || "Unknown authority"}
                    </div>
                  </div>
                  <Badge variant="secondary" className="self-start shrink-0 text-sm">
                    {hmoLifecycleLabel(lic.lifecycleStatus)}
                  </Badge>
                </div>
                <div className="flex flex-wrap gap-x-5 gap-y-1.5 text-sm md:text-base text-muted-foreground">
                  {lic.expiryDate && (
                    <span>Expires {formatDisplayDate(String(lic.expiryDate))}</span>
                  )}
                  {lic.maxPersons != null && <span>Max persons: {lic.maxPersons}</span>}
                  {lic.versions?.[0]?.fileName && <span>File: {lic.versions[0].fileName}</span>}
                </div>
                <LicenceExtractionSummary extraction={lic.versions?.[0]?.extractedJson} />
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {data?.activeCases && data.activeCases.length > 0 && (
        <Card className="shadow-none">
          <CardHeader className="space-y-1.5">
            <div className="flex items-start gap-3">
              <span className="inline-flex h-10 w-10 items-center justify-center rounded-lg bg-amber-500/10 shrink-0">
                <FolderOpen className="h-5 w-5 text-amber-700" />
              </span>
              <div>
                <CardTitle className="text-lg md:text-xl">Active remediation cases</CardTitle>
                <CardDescription className="mt-1 text-sm md:text-base leading-relaxed">
                  Open work for this property. Click a case to assign tasks or request evidence.
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            {data.activeCases.map((c) => {
              const sev = hmoSeverityMeta(c.severity);
              return (
                <Link
                  key={c.id}
                  href={`/hmo/cases/${c.id}`}
                  className="block rounded-xl border px-4 py-4 hover:bg-muted/40 transition-colors"
                >
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <div className="min-w-0 space-y-1">
                      <div className="text-base font-semibold">{c.caseReference}</div>
                      <div className="text-sm text-muted-foreground">
                        Click to open tasks and evidence requests
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-2 items-center shrink-0">
                      <Badge variant="outline" className={sev.className}>
                        {sev.label} priority
                      </Badge>
                      <Badge variant="outline" className={hmoCaseStatusMeta(c.status).className}>
                        {hmoCaseStatusMeta(c.status).label}
                      </Badge>
                    </div>
                  </div>
                </Link>
              );
            })}
          </CardContent>
        </Card>
      )}

      <Card className="shadow-none">
        <CardHeader className="space-y-1.5">
          <div className="flex items-start gap-3">
            <span className="inline-flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 shrink-0">
              <Users className="h-5 w-5 text-primary" />
            </span>
            <div>
              <CardTitle className="text-lg md:text-xl">Step 4 — Room and occupancy</CardTitle>
              <CardDescription className="mt-1 text-sm md:text-base leading-relaxed">
                Before a move-in, check whether current + proposed people fit the licence maximum.
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="rounded-xl border bg-muted/20 px-4 py-4 text-sm md:text-base text-muted-foreground leading-relaxed">
            <p className="font-semibold text-foreground mb-2">How to read the fields</p>
            <ul className="list-disc pl-5 space-y-2">
              <li>
                <span className="font-medium text-foreground">Licence maximum</span> — max people
                allowed on the HMO licence.
              </li>
              <li>
                <span className="font-medium text-foreground">Currently living there</span> — leave
                blank if unsure. Blank means <em>Unknown</em>, never treated as zero.
              </li>
              <li>
                <span className="font-medium text-foreground">Extra people proposed</span> — how many
                new people you want to add.
              </li>
            </ul>
          </div>
          <div className="grid gap-4 md:grid-cols-3">
            <div className="space-y-2 rounded-xl border p-4 md:p-5">
              <Label className="text-base font-semibold">Licence maximum people</Label>
              <Input
                inputMode="numeric"
                value={maxPersons}
                onChange={(e) => setMaxPersons(e.target.value)}
                className="text-base font-semibold tabular-nums h-11"
              />
              <p className="text-sm text-muted-foreground leading-relaxed">
                Usually taken from the extracted licence.
              </p>
            </div>
            <div className="space-y-2 rounded-xl border p-4 md:p-5">
              <Label className="text-base font-semibold">People currently living there</Label>
              <Input
                inputMode="numeric"
                value={confirmedPersons}
                onChange={(e) => setConfirmedPersons(e.target.value)}
                placeholder="Leave blank if unknown"
                className="text-base tabular-nums h-11"
              />
              <p className="text-sm text-muted-foreground leading-relaxed">
                Or use “Save from current tenancies”.
              </p>
            </div>
            <div className="space-y-2 rounded-xl border p-4 md:p-5">
              <Label className="text-base font-semibold">Extra people proposed</Label>
              <Input
                inputMode="numeric"
                value={proposedAdditional}
                onChange={(e) => setProposedAdditional(e.target.value)}
                className="text-base font-semibold tabular-nums h-11"
              />
              <p className="text-sm text-muted-foreground leading-relaxed">
                New occupants you plan to place.
              </p>
            </div>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
            <Button
              size="lg"
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
                  const json = await res.json();
                  setPreTenancyResult(json);
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
              size="lg"
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
                  toast({ title: "Current occupancy saved from tenancies" });
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
                "rounded-xl border px-4 py-4 text-sm md:text-base space-y-2",
                preTenancyResult.decision === "ALLOW_FOR_CHECKED_CONSTRAINTS" &&
                  "border-emerald-300 bg-emerald-50",
                preTenancyResult.decision === "BLOCK_REVIEW_REQUIRED" &&
                  "border-rose-300 bg-rose-50",
                preTenancyResult.decision === "INSUFFICIENT_EVIDENCE" &&
                  "border-amber-300 bg-amber-50",
              )}
            >
              <div className="flex items-center gap-2.5 font-semibold text-base">
                {preTenancyResult.decision === "ALLOW_FOR_CHECKED_CONSTRAINTS" ? (
                  <CheckCircle2 className="h-5 w-5 text-emerald-700" />
                ) : (
                  <AlertCircle className="h-5 w-5 text-amber-800" />
                )}
                {hmoPreTenancyLabel(preTenancyResult.decision)}
              </div>
              <p className="text-muted-foreground leading-relaxed pl-7">
                {preTenancyResult.reason}
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="shadow-none">
        <CardHeader className="space-y-1.5">
          <div className="flex items-start gap-3">
            <span className="inline-flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 shrink-0">
              <ClipboardList className="h-5 w-5 text-primary" />
            </span>
            <div>
              <CardTitle className="text-lg md:text-xl">Assessment findings</CardTitle>
              <CardDescription className="mt-1 text-sm md:text-base leading-relaxed">
                Licence checks can open a case. Later checks stay “evidence missing” until occupancy,
                rooms, or safety data exists — that is not a confirmed breach by itself.
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          {!data?.recentFindings?.length && (
            <div className="rounded-xl border border-dashed px-4 py-8 text-center space-y-1">
              <p className="text-base font-semibold">No findings yet</p>
              <p className="text-sm md:text-base text-muted-foreground leading-relaxed">
                Upload a licence and run assessment to score licence checks here.
              </p>
            </div>
          )}
          {(() => {
            const findings = data?.recentFindings || [];
            const licence = findings.filter((f) => hmoCheckGroup(f.checkId) === "licence");
            const later = findings.filter((f) => hmoCheckGroup(f.checkId) === "later");
            const renderFinding = (f: (typeof findings)[number]) => {
              const sev = hmoSeverityMeta(f.severity);
              const related = hmoRelatedTaskCodes(f.checkId);
              return (
                <div key={f.id} className="rounded-xl border px-4 py-4 space-y-2.5">
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0 space-y-1">
                      <div className="font-semibold text-base leading-snug">
                        {hmoCheckLabel(f.checkId)}
                      </div>
                      <div className="text-sm text-muted-foreground">{f.checkId}</div>
                    </div>
                    <div className="flex flex-wrap gap-2 shrink-0">
                      <Badge variant="outline" className={sev.className}>
                        {sev.label}
                      </Badge>
                      <Badge variant="secondary">{hmoFindingStatusLabel(f.status)}</Badge>
                    </div>
                  </div>
                  {f.explanation && (
                    <p className="text-sm md:text-base text-muted-foreground leading-relaxed">
                      {f.explanation}
                    </p>
                  )}
                  {related.length > 0 && (
                    <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
                      <span className="text-sm text-muted-foreground">Related task:</span>
                      {related.map((code) => (
                        <Badge key={code} variant="outline" className="font-normal">
                          {code} · {hmoTaskShortLabel(code)}
                        </Badge>
                      ))}
                    </div>
                  )}
                </div>
              );
            };
            return (
              <>
                {licence.length > 0 && (
                  <div className="space-y-3">
                    <div className="space-y-1">
                      <h3 className="text-base font-semibold">Licence checks</h3>
                      <p className="text-sm text-muted-foreground leading-relaxed">
                        These come from the uploaded document and can open / drive the case.
                      </p>
                    </div>
                    {licence.map(renderFinding)}
                  </div>
                )}
                {later.length > 0 && (
                  <div className="space-y-3">
                    <div className="space-y-1">
                      <h3 className="text-base font-semibold">Later checks</h3>
                      <p className="text-sm text-muted-foreground leading-relaxed">
                        Placeholders until occupancy, rooms, safety, or local evidence is supplied.
                        Use the matching case task when you collect that evidence.
                      </p>
                    </div>
                    {later.map(renderFinding)}
                  </div>
                )}
              </>
            );
          })()}
        </CardContent>
      </Card>
    </div>
  );
}
