import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { FileText, Loader2, CheckCircle2, AlertTriangle, Upload } from "lucide-react";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ObjectUploader, COMPLIANCE_DOCUMENT_ACCEPT } from "@/components/ObjectUploader";
import { LocaleDateInput } from "@/components/LocaleDateInput";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { DEFAULT_COMPLIANCE_DOC_TYPES } from "@shared/complianceDocTypes";
import { Badge } from "@/components/ui/badge";

type CertificateRow = {
  id: string;
  workOrderId: string;
  propertyId?: string | null;
  documentUrl: string;
  fileName?: string | null;
  mimeType?: string | null;
  extractionStatus: string;
  certificateType?: string | null;
  expiryDate?: string | null;
  extractionConfidence?: number | null;
  processingError?: string | null;
  complianceDocumentId?: string | null;
};

type Props = {
  workOrderId: string;
  propertyId?: string | null;
  blockId?: string | null;
};

function statusLabel(status: string): string {
  switch (status) {
    case "uploaded":
      return "Uploaded";
    case "analysing":
      return "Analysing…";
    case "needs_info":
      return "Needs information";
    case "ready_to_confirm":
      return "Ready to confirm";
    case "added_to_compliance":
      return "Added to Compliance";
    case "failed":
      return "Analysis failed";
    default:
      return status;
  }
}

function toYmd(value: string | Date | null | undefined): string {
  if (!value) return "";
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}/.test(value)) return value.slice(0, 10);
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

async function finalizeUpload(uploadURL: string): Promise<string> {
  let objectPath = uploadURL;
  if (uploadURL.includes("/objects/")) {
    objectPath = `/objects/${uploadURL.split("/objects/")[1]?.split("?")[0]}`;
  }
  const absoluteUrl = objectPath.startsWith("http")
    ? objectPath
    : `${window.location.origin}${objectPath.startsWith("/") ? objectPath : `/${objectPath}`}`;
  const response = await fetch("/api/objects/set-acl", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ photoUrl: absoluteUrl }),
  });
  if (!response.ok) {
    const err = await response.json().catch(() => ({ error: "Failed to finalize upload" }));
    throw new Error(err.error || "Failed to finalize upload");
  }
  const data = await response.json().catch(() => ({}));
  return (data.objectPath as string) || objectPath;
}

export function WorkOrderCertificatePanel({ workOrderId, propertyId, blockId }: Props) {
  const { toast } = useToast();
  const [activeId, setActiveId] = useState<string | null>(null);
  const [manualType, setManualType] = useState("");
  const [manualExpiry, setManualExpiry] = useState("");
  const [busy, setBusy] = useState(false);

  const { data: certificates = [], isLoading } = useQuery<CertificateRow[]>({
    queryKey: ["/api/work-orders", workOrderId, "certificates"],
    queryFn: async () => {
      const res = await fetch(`/api/work-orders/${workOrderId}/certificates`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load certificates");
      return res.json();
    },
    enabled: Boolean(workOrderId),
  });

  const { data: customTypes = [] } = useQuery<any[]>({
    queryKey: ["/api/compliance/document-types"],
  });

  const typeOptions = useMemo(() => {
    const names = [
      ...DEFAULT_COMPLIANCE_DOC_TYPES,
      ...(customTypes || []).map((t: any) => t.name).filter(Boolean),
      "Other",
    ];
    return Array.from(new Set(names));
  }, [customTypes]);

  const active = certificates.find((c) => c.id === activeId) || certificates[0] || null;

  useEffect(() => {
    if (!active) return;
    setManualType(active.certificateType || "");
    setManualExpiry(toYmd(active.expiryDate));
  }, [active?.id, active?.certificateType, active?.expiryDate]);

  const confirmMutation = useMutation({
    mutationFn: async () => {
      if (!active) throw new Error("No certificate");
      return apiRequest("POST", `/api/work-orders/${workOrderId}/certificates/${active.id}/confirm`, {
        certificateType: manualType,
        expiryDate: manualExpiry,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/work-orders", workOrderId, "certificates"] });
      queryClient.invalidateQueries({ queryKey: ["/api/compliance"] });
      toast({ title: "Added to Compliance" });
    },
    onError: (e: Error) => toast({ variant: "destructive", title: "Error", description: e.message }),
  });

  const handleUploadComplete = async (result: any) => {
    const uploaded = result?.successful?.[0];
    if (!uploaded?.uploadURL) {
      toast({ variant: "destructive", title: "Upload failed" });
      return;
    }
    setBusy(true);
    try {
      const path = await finalizeUpload(uploaded.uploadURL);
      const createRes = await apiRequest("POST", `/api/work-orders/${workOrderId}/certificates`, {
        documentUrl: path,
        fileName: uploaded.name || "Certificate",
        mimeType: uploaded.type || uploaded.data?.type || null,
      });
      const created = await createRes.json();
      setActiveId(created.id);
      toast({ title: "Certificate uploaded" });
      const analyseRes = await apiRequest(
        "POST",
        `/api/work-orders/${workOrderId}/certificates/${created.id}/analyse`,
        {},
      );
      await analyseRes.json();
      queryClient.invalidateQueries({ queryKey: ["/api/work-orders", workOrderId, "certificates"] });
    } catch (e: any) {
      toast({
        variant: "destructive",
        title: "Upload failed",
        description: e?.message || "Could not process certificate",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/work-orders", workOrderId, "certificates"] });
    } finally {
      setBusy(false);
    }
  };

  const showConfirmForm =
    active &&
    (active.extractionStatus === "ready_to_confirm" ||
      active.extractionStatus === "needs_info" ||
      active.extractionStatus === "failed");

  return (
    <div className="space-y-3 border-t pt-4">
      <Label className="flex items-center gap-2">
        <FileText className="h-4 w-4" />
        Certificate / Compliance Document
      </Label>
      <p className="text-xs text-muted-foreground">
        Upload a certificate related to this work order. We will try to read the type and expiry date, then you confirm
        before it is added to Compliance.
      </p>

      {!active || active.extractionStatus === "added_to_compliance" ? (
        <ObjectUploader
          maxNumberOfFiles={1}
          accept={COMPLIANCE_DOCUMENT_ACCEPT}
          onGetUploadParameters={async () => {
            const response = await fetch("/api/objects/upload", { method: "POST", credentials: "include" });
            const { uploadURL } = await response.json();
            return { method: "PUT" as const, url: uploadURL };
          }}
          onComplete={handleUploadComplete}
          buttonVariant="outline"
        >
          <Upload className="h-4 w-4 mr-2" />
          {busy ? "Uploading…" : "Upload Certificate"}
        </ObjectUploader>
      ) : null}

      {isLoading ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading certificates…
        </div>
      ) : null}

      {active ? (
        <div className="rounded-lg border p-3 space-y-3 bg-muted/20">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="text-sm font-medium truncate">{active.fileName || "Certificate"}</p>
              <a
                href={active.documentUrl}
                target="_blank"
                rel="noreferrer"
                className="text-xs text-primary underline"
              >
                Open file
              </a>
            </div>
            <Badge variant={active.extractionStatus === "added_to_compliance" ? "default" : "secondary"}>
              {statusLabel(active.extractionStatus)}
            </Badge>
          </div>

          {active.extractionStatus === "analysing" || busy ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Checking certificate…
            </div>
          ) : null}

          {active.extractionStatus === "added_to_compliance" ? (
            <div className="flex items-start gap-2 text-sm text-green-700 dark:text-green-400">
              <CheckCircle2 className="h-4 w-4 mt-0.5 shrink-0" />
              <div>
                <p className="font-medium">Added to Compliance</p>
                <p className="text-xs">
                  {active.certificateType}
                  {active.expiryDate ? ` · Expiry ${toYmd(active.expiryDate)}` : ""}
                </p>
                {(propertyId || active.propertyId || blockId) && (
                  <Link
                    href={
                      propertyId || active.propertyId
                        ? `/compliance?propertyId=${propertyId || active.propertyId}`
                        : `/compliance?blockId=${blockId}`
                    }
                    className="text-xs text-primary underline"
                  >
                    View in Compliance
                  </Link>
                )}
              </div>
            </div>
          ) : null}

          {showConfirmForm ? (
            <div className="space-y-3">
              {(active.extractionStatus === "needs_info" || active.extractionStatus === "failed") && (
                <div className="flex items-start gap-2 text-sm text-amber-800 dark:text-amber-200">
                  <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
                  <p>
                    {active.processingError ||
                      "We could not determine all certificate details automatically. Please confirm or enter them below."}
                  </p>
                </div>
              )}
              {active.extractionStatus === "ready_to_confirm" && (
                <p className="text-xs text-muted-foreground">Certificate analysed — confirm details to add to Compliance.</p>
              )}
              <div className="space-y-2">
                <Label required>Certificate Type</Label>
                <Select value={manualType} onValueChange={setManualType}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select type" />
                  </SelectTrigger>
                  <SelectContent>
                    {typeOptions.map((t) => (
                      <SelectItem key={t} value={t}>
                        {t}
                      </SelectItem>
                    ))}
                    {manualType && !typeOptions.includes(manualType) ? (
                      <SelectItem value={manualType}>{manualType}</SelectItem>
                    ) : null}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label required>Expiry Date</Label>
                <LocaleDateInput
                  value={manualExpiry || null}
                  onChange={(ymd) => setManualExpiry(ymd || "")}
                  disablePast
                />
              </div>
              <Button
                type="button"
                disabled={!manualType || !manualExpiry || confirmMutation.isPending}
                onClick={() => confirmMutation.mutate()}
              >
                {confirmMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Confirm &amp; Add to Compliance
              </Button>
            </div>
          ) : null}

          {active.extractionStatus !== "added_to_compliance" &&
            active.extractionStatus !== "analysing" &&
            !busy && (
              <ObjectUploader
                maxNumberOfFiles={1}
                accept={COMPLIANCE_DOCUMENT_ACCEPT}
                onGetUploadParameters={async () => {
                  const response = await fetch("/api/objects/upload", { method: "POST", credentials: "include" });
                  const { uploadURL } = await response.json();
                  return { method: "PUT" as const, url: uploadURL };
                }}
                onComplete={handleUploadComplete}
                buttonVariant="ghost"
                buttonClassName="h-8 text-xs"
              >
                Upload another
              </ObjectUploader>
            )}
        </div>
      ) : null}
    </div>
  );
}
