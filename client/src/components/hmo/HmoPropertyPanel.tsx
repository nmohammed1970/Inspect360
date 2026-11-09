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
import { X } from "lucide-react";
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
    <div className="mt-3 space-y-3">
      <div className="rounded-lg border divide-y">
        {rows.map((row) => (
          <div
            key={row.label}
            className="grid grid-cols-1 sm:grid-cols-[11rem_1fr] gap-1 sm:gap-3 px-3 py-2.5"
          >
            <div className="text-xs font-medium text-muted-foreground sm:pt-0.5">{row.label}</div>
            <div>
              <div className="text-sm font-medium break-words">{row.value}</div>
              {row.hint && <div className="text-xs text-muted-foreground mt-0.5">{row.hint}</div>}
            </div>
          </div>
        ))}
      </div>

      {missing.length > 0 && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5">
          <p className="text-xs font-medium text-amber-900">Missing attachments mentioned in the document</p>
          <ul className="mt-1.5 list-disc pl-4 text-sm text-amber-950 space-y-1">
            {missing.map((item: string, i: number) => (
              <li key={i}>{item}</li>
            ))}
          </ul>
        </div>
      )}

      {conditions.length > 0 && (
        <div className="rounded-lg border px-3 py-2.5">
          <p className="text-xs font-medium text-muted-foreground">Conditions noted</p>
          <ul className="mt-1.5 list-disc pl-4 text-sm space-y-1">
            {conditions.slice(0, 8).map((c: any, i: number) => (
              <li key={i}>{typeof c === "string" ? c : c.condition_text || "Condition"}</li>
            ))}
          </ul>
        </div>
      )}

      {warnings.length > 0 && (
        <p className="text-xs text-muted-foreground">
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

  if (isLoading) return <p className="text-sm text-muted-foreground">Loading HMO overview…</p>;
  if (error) {
    return (
      <p className="text-sm text-destructive">
        Unable to load HMO data. Ensure the HMO Compliance module is enabled.
      </p>
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

  return (
    <div className="space-y-6" data-testid="hmo-property-panel">
      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div className="space-y-1 min-w-0">
              <CardTitle className="text-base">Licensing overview</CardTitle>
              <CardDescription>
                Document and evidence status only — not a legal compliance certificate.
              </CardDescription>
            </div>
            <Badge
              variant="outline"
              className={`shrink-0 self-start ${statusMeta.className}`}
            >
              {statusMeta.label}
            </Badge>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="rounded-lg border bg-muted/30 px-3 py-3">
              <p className="text-xs text-muted-foreground">Evidence completeness</p>
              <p className="mt-1 text-xl font-semibold tabular-nums">{evidencePct}%</p>
              <div className="mt-2 h-1.5 w-full rounded-full bg-muted overflow-hidden">
                <div
                  className={`h-full rounded-full ${evidencePct >= 80 ? "bg-emerald-500" : evidencePct >= 40 ? "bg-amber-500" : "bg-rose-500"}`}
                  style={{ width: `${Math.max(0, Math.min(100, evidencePct))}%` }}
                />
              </div>
            </div>
            <div className="rounded-lg border bg-muted/30 px-3 py-3">
              <p className="text-xs text-muted-foreground">Open cases</p>
              <p className="mt-1 text-xl font-semibold tabular-nums">
                {data?.activeCases?.length ?? 0}
              </p>
              <p className="mt-2 text-xs text-muted-foreground">
                {(data?.activeCases?.length ?? 0) === 0
                  ? "No open remediation cases"
                  : "See active cases below"}
              </p>
            </div>
            <div className="rounded-lg border bg-muted/30 px-3 py-3">
              <p className="text-xs text-muted-foreground">Last assessed</p>
              <p className="mt-1 text-sm font-medium">
                {profile?.lastAssessedAt
                  ? new Date(profile.lastAssessedAt).toLocaleDateString(undefined, {
                      day: "numeric",
                      month: "short",
                      year: "numeric",
                    })
                  : "Not assessed yet"}
              </p>
              <p className="mt-2 text-xs text-muted-foreground">
                {profile?.lastAssessedAt
                  ? new Date(profile.lastAssessedAt).toLocaleTimeString(undefined, {
                      hour: "2-digit",
                      minute: "2-digit",
                    })
                  : "Upload a licence to begin"}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Upload / extract licence</CardTitle>
          <CardDescription>
            Upload a PDF or image of the HMO licence. Review the extracted fields, then run assessment.
            If anything looks wrong, upload again.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="space-y-2">
            <Label>Licence file (PDF, JPG/JPEG, PNG, WebP, HEIC/HEIF, GIF, BMP)</Label>
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
              <div className="flex items-center justify-between gap-2 rounded-md border bg-muted/40 px-3 py-2 text-sm">
                <span className="truncate">
                  {selectedFile.name} ({Math.round(selectedFile.size / 1024)} KB)
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
            {lastObjectUrl && (
              <p className="text-xs text-muted-foreground">Stored at {lastObjectUrl}</p>
            )}
          </div>

          <button
            type="button"
            className="text-xs text-muted-foreground underline"
            onClick={() => setShowPasteFallback((v) => !v)}
          >
            {showPasteFallback ? "Hide paste fallback" : "Paste text instead (advanced)"}
          </button>
          {showPasteFallback && (
            <div className="space-y-2">
              <Label htmlFor="hmo-text">Pasted licence text</Label>
              <Textarea
                id="hmo-text"
                rows={6}
                value={extractedText}
                onChange={(e) => setExtractedText(e.target.value)}
                placeholder="Only if you already have OCR text…"
              />
            </div>
          )}

          <div className="flex flex-wrap gap-2">
            <Button
              onClick={() => uploadMutation.mutate()}
              disabled={
                uploadMutation.isPending ||
                (!selectedFile && !extractedText.trim())
              }
            >
              {uploadMutation.isPending ? "Uploading…" : "Upload & extract"}
            </Button>
            <Button
              variant="default"
              onClick={() => currentVersionId && assessMutation.mutate(currentVersionId)}
              disabled={!currentVersionId || assessMutation.isPending || uploadMutation.isPending}
            >
              {assessMutation.isPending ? "Assessing…" : "Run assessment"}
            </Button>
          </div>
        </CardContent>
      </Card>

      {data?.licences && data.licences.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Extracted licence details</CardTitle>
            <CardDescription>
              Review these fields before running assessment. Upload again if anything looks wrong.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            {data.licences.map((lic) => (
              <div key={lic.id} className="border-b last:border-0 pb-5 last:pb-0">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0">
                    <div className="font-medium">
                      {lic.licenceNumber || "Draft licence"}
                    </div>
                    <div className="text-sm text-muted-foreground">
                      {lic.authorityName || "Unknown authority"}
                    </div>
                  </div>
                  <Badge variant="secondary" className="self-start shrink-0">
                    {hmoLifecycleLabel(lic.lifecycleStatus)}
                  </Badge>
                </div>
                <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
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
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Active cases</CardTitle>
            <CardDescription>
              Open remediation work for this property. Click a case to assign tasks or request evidence.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {data.activeCases.map((c) => {
              const sev = hmoSeverityMeta(c.severity);
              return (
                <Link
                  key={c.id}
                  href={`/hmo/cases/${c.id}`}
                  className="block rounded-lg border px-3 py-3 hover:bg-muted/40 transition-colors"
                >
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <div className="min-w-0">
                      <div className="font-medium">{c.caseReference}</div>
                      <div className="text-xs text-muted-foreground mt-0.5">
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

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Room and occupancy</CardTitle>
          <CardDescription>
            Check whether a proposed move-in fits the licence maximum. Leave current occupants blank
            if you are not sure — blank means Unknown, never zero.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid gap-3 md:grid-cols-3">
            <div className="space-y-2">
              <Label>Licence maximum people</Label>
              <Input value={maxPersons} onChange={(e) => setMaxPersons(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>People currently living there</Label>
              <Input
                value={confirmedPersons}
                onChange={(e) => setConfirmedPersons(e.target.value)}
                placeholder="Leave blank if unknown"
              />
            </div>
            <div className="space-y-2">
              <Label>Extra people proposed</Label>
              <Input
                value={proposedAdditional}
                onChange={(e) => setProposedAdditional(e.target.value)}
              />
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              variant="secondary"
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
            <div className="rounded-lg border px-3 py-2.5 text-sm space-y-1">
              <div className="font-medium">{hmoPreTenancyLabel(preTenancyResult.decision)}</div>
              <p className="text-muted-foreground">{preTenancyResult.reason}</p>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Assessment findings</CardTitle>
          <CardDescription>
            Licence checks drive the open case. Later checks stay as “evidence missing” until those
            modules have data — they are not confirmed breaches.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {!data?.recentFindings?.length && (
            <p className="text-sm text-muted-foreground">No findings yet. Run an assessment first.</p>
          )}
          {(() => {
            const findings = data?.recentFindings || [];
            const licence = findings.filter((f) => hmoCheckGroup(f.checkId) === "licence");
            const later = findings.filter((f) => hmoCheckGroup(f.checkId) === "later");
            const renderFinding = (f: (typeof findings)[number]) => {
              const sev = hmoSeverityMeta(f.severity);
              const related = hmoRelatedTaskCodes(f.checkId);
              return (
                <div key={f.id} className="rounded-lg border px-3 py-3 space-y-2">
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0">
                      <div className="font-medium text-sm leading-snug">
                        {hmoCheckLabel(f.checkId)}
                      </div>
                      <div className="text-xs text-muted-foreground mt-0.5">{f.checkId}</div>
                    </div>
                    <div className="flex flex-wrap gap-2 shrink-0">
                      <Badge variant="outline" className={sev.className}>
                        {sev.label}
                      </Badge>
                      <Badge variant="secondary">{hmoFindingStatusLabel(f.status)}</Badge>
                    </div>
                  </div>
                  {f.explanation && (
                    <p className="text-sm text-muted-foreground leading-relaxed">{f.explanation}</p>
                  )}
                  {related.length > 0 && (
                    <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
                      <span className="text-xs text-muted-foreground">Related task:</span>
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
                    <div>
                      <h3 className="text-sm font-semibold">Licence checks</h3>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        These come from the uploaded document and can open / drive the case.
                      </p>
                    </div>
                    {licence.map(renderFinding)}
                  </div>
                )}
                {later.length > 0 && (
                  <div className="space-y-3">
                    <div>
                      <h3 className="text-sm font-semibold">Later checks</h3>
                      <p className="text-xs text-muted-foreground mt-0.5">
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
