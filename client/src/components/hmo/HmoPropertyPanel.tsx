import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
  ChevronDown,
  ChevronRight,
  ClipboardList,
  FileUp,
  History,
  Shield,
  Users,
  X,
} from "lucide-react";
import {
  formatHmoDate,
  hmoCheckLabel,
  hmoFindingSpecLabel,
  hmoOverallStatusMeta,
  hmoPreTenancyLabel,
  hmoRuleSourceLabel,
  hmoSeverityMeta,
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

function emptyExtraction(seed?: {
  address?: string | null;
  licenceNumber?: string | null;
  authorityName?: string | null;
  holderName?: string | null;
  managerName?: string | null;
  issueDate?: string | null;
  expiryDate?: string | null;
  maxPersons?: number | null;
  lifecycleStatus?: string | null;
}) {
  const field = (value: string | number | null | undefined) => ({
    value: value ?? null,
    human_confirmed: true,
    last_updated: new Date().toISOString(),
  });
  return {
    document_id: `manual_${Date.now()}`,
    document_type: "HMO_LICENCE",
    extraction_version: "manual_v1",
    property_address: field(seed?.address ?? null),
    borough: field(null),
    licence_number: field(seed?.licenceNumber ?? null),
    issuing_authority: field(seed?.authorityName ?? null),
    issue_date: field(seed?.issueDate ? String(seed.issueDate).slice(0, 10) : null),
    start_date: field(null),
    expiry_date: field(seed?.expiryDate ? String(seed.expiryDate).slice(0, 10) : null),
    licence_status: field(seed?.lifecycleStatus ?? "UNDER_REVIEW"),
    maximum_individuals: field(seed?.maxPersons ?? null),
    maximum_households: field(null),
    holder_name: field(seed?.holderName ?? null),
    manager_name: field(seed?.managerName ?? null),
    conditions: [],
    referenced_missing_attachments: [],
    warnings: [],
  };
}

type Overview = {
  profile: {
    overallStatus?: string | null;
    evidenceCompleteness?: number | null;
    lastAssessedAt?: string | null;
    licenceEvidenceStatus?: string | null;
    licenceEvidenceNotes?: string | null;
  };
  header?: {
    address?: string | null;
    borough?: string | null;
    licenceStatus?: string | null;
    licenceEvidenceStatus?: string | null;
    expiryDate?: string | null;
    occupantsNow?: number | null;
    occupantsPermitted?: number | null;
    hmoClassification?: string | null;
    setupIncomplete?: boolean;
    attentionCount?: number;
  };
  property?: {
    address?: string | null;
    city?: string | null;
    hmoClassification?: string | null;
  } | null;
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
  activeTenantCount?: number | null;
  evidenceItems?: Array<{
    id: string;
    label: string;
    status: string;
    source: string;
    link?: string | null;
    detail?: string | null;
  }>;
  roomProfiles?: Array<{
    id: string;
    roomName?: string | null;
    roomType?: string | null;
    measuredUsableAreaM2?: number | null;
    ceilingHeightM?: number | null;
    declaredPermittedOccupancy?: number | null;
    sleepingApproved?: boolean | null;
    measurementSource?: string | null;
    humanConfirmed?: boolean | null;
  }>;
  linkedMaintenance?: Array<{
    id: string;
    title: string;
    status: string;
    priority: string;
    findingId?: string | null;
    verificationStatus?: string | null;
  }>;
  hmoInspections?: Array<{
    id: string;
    type?: string | null;
    status: string;
    displayStatus: string;
    scheduledDate?: string | null;
    completedDate?: string | null;
    createdAt?: string | null;
    templateName?: string | null;
  }>;
  complianceTimeline?: Array<{
    id: string;
    at: string;
    kind: string;
    title: string;
    detail?: string | null;
    link?: string | null;
  }>;
};

export function HmoPropertyPanel({ propertyId }: { propertyId: string }) {
  const { toast } = useToast();
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [lastVersionId, setLastVersionId] = useState<string | null>(null);
  const [editExtraction, setEditExtraction] = useState<any>(() => emptyExtraction());
  const [maxPersons, setMaxPersons] = useState("5");
  const [confirmedPersons, setConfirmedPersons] = useState("");
  const [occupancyOverridden, setOccupancyOverridden] = useState(false);
  const [preTenancyResult, setPreTenancyResult] = useState<{
    decision: string;
    reason: string;
  } | null>(null);
  const [alertReason, setAlertReason] = useState<Record<string, string>>({});
  const [reviewerDecision, setReviewerDecision] = useState<Record<string, string>>({});
  const [headerBorough, setHeaderBorough] = useState("");
  const [headerLicenceStatus, setHeaderLicenceStatus] = useState("UNDER_REVIEW");
  const [headerExpiry, setHeaderExpiry] = useState("");
  const [headerOccupantsNow, setHeaderOccupantsNow] = useState("");
  const [headerPermitted, setHeaderPermitted] = useState("");
  const [licenceEvidenceStatus, setLicenceEvidenceStatus] = useState("UNKNOWN");
  const [licenceEvidenceNotes, setLicenceEvidenceNotes] = useState("");
  const [roomDrafts, setRoomDrafts] = useState<
    Array<{
      id?: string;
      roomName: string;
      roomType: string;
      measuredUsableAreaM2: string;
      ceilingHeightM: string;
      declaredPermittedOccupancy: string;
      sleepingApproved: boolean;
      measurementSource?: string;
      humanConfirmed: boolean;
    }>
  >([]);
  /** Whole Verified rooms editor — collapsed by default when rooms already exist. */
  const [verifiedRoomsOpen, setVerifiedRoomsOpen] = useState(true);

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
      const next = {
        ...emptyExtraction(),
        ...primaryVersion.extractedJson,
        licence_status:
          primaryVersion.extractedJson.licence_status ||
          {
            value: primaryLicence?.lifecycleStatus || "UNDER_REVIEW",
            human_confirmed: true,
          },
      };
      setEditExtraction(next);
      const max = fieldVal(next.maximum_individuals);
      if (max) setMaxPersons(max);
      return;
    }
    if (primaryLicence) {
      const seeded = emptyExtraction({
        address: data?.header?.address || data?.property?.address || null,
        licenceNumber: primaryLicence.licenceNumber,
        authorityName: primaryLicence.authorityName,
        holderName: primaryLicence.holderName,
        managerName: primaryLicence.managerName,
        issueDate: null,
        expiryDate: primaryLicence.expiryDate,
        maxPersons: primaryLicence.maxPersons,
        lifecycleStatus: primaryLicence.lifecycleStatus,
      });
      setEditExtraction(seeded);
      if (primaryLicence.maxPersons != null) setMaxPersons(String(primaryLicence.maxPersons));
      return;
    }
    setEditExtraction(
      emptyExtraction({
        address: data?.header?.address || data?.property?.address || null,
      }),
    );
  }, [primaryVersion?.id, primaryVersion?.extractedJson, primaryLicence?.id, data?.header?.address]);

  useEffect(() => {
    if (occupancyOverridden) return;
    const live =
      data?.activeTenantCount != null
        ? data.activeTenantCount
        : data?.header?.occupantsNow != null
          ? data.header.occupantsNow
          : data?.occupancy?.personCount;
    if (live != null) {
      setConfirmedPersons(String(live));
      setHeaderOccupantsNow(String(live));
    } else {
      setConfirmedPersons("");
    }
  }, [
    occupancyOverridden,
    data?.activeTenantCount,
    data?.header?.occupantsNow,
    data?.occupancy?.personCount,
  ]);

  useEffect(() => {
    setHeaderBorough(data?.header?.borough || data?.property?.city || "");
    setHeaderLicenceStatus(data?.header?.licenceStatus || "UNDER_REVIEW");
    setHeaderExpiry(
      data?.header?.expiryDate ? String(data.header.expiryDate).slice(0, 10) : "",
    );
    setHeaderOccupantsNow(
      data?.header?.occupantsNow == null ? "" : String(data.header.occupantsNow),
    );
    setHeaderPermitted(
      data?.header?.occupantsPermitted == null ? "" : String(data.header.occupantsPermitted),
    );
    setLicenceEvidenceStatus(
      data?.profile?.licenceEvidenceStatus ||
        data?.header?.licenceEvidenceStatus ||
        "UNKNOWN",
    );
    setLicenceEvidenceNotes(data?.profile?.licenceEvidenceNotes || "");
  }, [
    data?.header?.borough,
    data?.property?.city,
    data?.header?.licenceStatus,
    data?.header?.expiryDate,
    data?.header?.occupantsNow,
    data?.header?.occupantsPermitted,
    data?.profile?.licenceEvidenceStatus,
    data?.header?.licenceEvidenceStatus,
    data?.profile?.licenceEvidenceNotes,
  ]);

  useEffect(() => {
    const rooms = data?.roomProfiles || [];
    setRoomDrafts(
      rooms.map((r) => ({
        id: r.id,
        roomName: r.roomName || "",
        roomType: r.roomType || "",
        measuredUsableAreaM2:
          r.measuredUsableAreaM2 == null ? "" : String(r.measuredUsableAreaM2),
        ceilingHeightM: r.ceilingHeightM == null ? "" : String(r.ceilingHeightM),
        declaredPermittedOccupancy:
          r.declaredPermittedOccupancy == null ? "" : String(r.declaredPermittedOccupancy),
        sleepingApproved: r.sleepingApproved !== false,
        measurementSource: r.measurementSource || "manual",
        humanConfirmed: r.humanConfirmed !== false,
      })),
    );
    // Collapse the whole Verified rooms block when rooms already exist.
    if (rooms.length > 0) setVerifiedRoomsOpen(false);
  }, [data?.roomProfiles]);

  const isConfirmed = Boolean(
    primaryVersion?.confirmedAt || primaryVersion?.status === "CONFIRMED",
  );

  const uploadMutation = useMutation({
    mutationFn: async () => {
      if (!selectedFile) throw new Error("Choose a licence file first");
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
    },
    onSuccess: (payload) => {
      setLastVersionId(payload.licenceVersionId);
      setSelectedFile(null);
      queryClient.invalidateQueries({
        queryKey: ["/api/hmo/properties", propertyId, "overview"],
      });
      toast({
        title: payload.deduped
          ? payload.reextracted
            ? "Same file — extraction refreshed"
            : "Duplicate document"
          : "Licence uploaded",
        description: payload.deduped
          ? payload.reextracted
            ? "Identical bytes reuse the stored original. Fields were re-extracted — review and Save, then assess."
            : "Identical file already stored — using existing version. You can still overwrite fields below."
          : "Review and save fields below, then run assessment.",
      });
    },
    onError: (e: any) =>
      toast({ title: "Upload failed", description: e.message, variant: "destructive" }),
  });

  const saveFieldsMutation = useMutation({
    mutationFn: async () => {
      const versionId = lastVersionId || primaryVersion?.id || null;
      if (versionId) {
        const res = await apiRequest("POST", `/api/hmo/licence-versions/${versionId}/confirm`, {
          extraction: editExtraction,
        });
        return res.json();
      }
      const res = await apiRequest("POST", `/api/hmo/properties/${propertyId}/licences/manual`, {
        extraction: editExtraction,
      });
      return res.json();
    },
    onSuccess: (payload) => {
      if (payload?.licenceVersionId) setLastVersionId(payload.licenceVersionId);
      queryClient.invalidateQueries({
        queryKey: ["/api/hmo/properties", propertyId, "overview"],
      });
      queryClient.invalidateQueries({ queryKey: ["/api/hmo/dashboard"] });
      toast({
        title: "Licence details saved",
        description: "Fields overwritten and confirmed. Assessment can now run.",
      });
    },
    onError: (e: any) =>
      toast({ title: "Save failed", description: e.message, variant: "destructive" }),
  });

  const saveHeaderMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("PATCH", `/api/hmo/properties/${propertyId}/summary`, {
        borough: headerBorough.trim() ? headerBorough.trim() : null,
        lifecycleStatus: headerLicenceStatus || null,
        expiryDate: headerExpiry.trim() ? headerExpiry.trim() : null,
        maxPersons: headerPermitted.trim() === "" ? null : Number(headerPermitted),
        occupantsNow: headerOccupantsNow.trim() === "" ? null : Number(headerOccupantsNow),
        licenceEvidenceStatus: licenceEvidenceStatus || "UNKNOWN",
        licenceEvidenceNotes: licenceEvidenceNotes.trim() || null,
      });
      return res.json();
    },
    onSuccess: (payload) => {
      if (payload?.licenceVersionId) setLastVersionId(payload.licenceVersionId);
      if (payload?.extraction) setEditExtraction(payload.extraction);
      if (headerPermitted.trim() !== "") setMaxPersons(headerPermitted.trim());
      if (headerOccupantsNow.trim() !== "") setConfirmedPersons(headerOccupantsNow.trim());
      queryClient.invalidateQueries({
        queryKey: ["/api/hmo/properties", propertyId, "overview"],
      });
      queryClient.invalidateQueries({ queryKey: ["/api/hmo/dashboard"] });
      toast({
        title: "Summary updated",
        description: "Borough, licence status, expiry, and occupancy were overwritten.",
      });
    },
    onError: (e: any) =>
      toast({ title: "Could not update summary", description: e.message, variant: "destructive" }),
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
      const mrCount = (payload.maintenance?.results || []).filter((r: any) => r.created).length;
      toast({
        title: "Assessment complete",
        description:
          mrCount > 0
            ? `Status: ${payload.overallStatus}. ${mrCount} maintenance request(s) raised.`
            : payload.maintenance?.maintenanceDisabled
              ? `Status: ${payload.overallStatus}. Enable Maintenance module to raise work orders.`
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

  const raiseMrMutation = useMutation({
    mutationFn: async (findingId: string) => {
      const res = await apiRequest("POST", `/api/hmo/findings/${findingId}/maintenance-request`, {});
      return res.json();
    },
    onSuccess: (payload) => {
      queryClient.invalidateQueries({
        queryKey: ["/api/hmo/properties", propertyId, "overview"],
      });
      if (payload?.maintenanceDisabled) {
        toast({
          title: "Maintenance module required",
          description: "Enable Maintenance to raise work orders from HMO findings.",
          variant: "destructive",
        });
        return;
      }
      const id = payload?.maintenanceRequest?.id;
      toast({
        title: payload?.created ? "Maintenance request created" : "Maintenance request already open",
        description: id ? `Open /maintenance/${id}` : undefined,
      });
    },
    onError: (e: any) =>
      toast({
        title: "Could not create maintenance request",
        description: e.message,
        variant: "destructive",
      }),
  });

  const saveRoomsMutation = useMutation({
    mutationFn: async () => {
      for (const room of roomDrafts) {
        await apiRequest("POST", `/api/hmo/properties/${propertyId}/rooms`, {
          id: room.id || null,
          roomName: room.roomName.trim() || null,
          roomType: room.roomType.trim() || null,
          measuredUsableAreaM2:
            room.measuredUsableAreaM2.trim() === "" ? null : Number(room.measuredUsableAreaM2),
          ceilingHeightM:
            room.ceilingHeightM.trim() === "" ? null : Number(room.ceilingHeightM),
          declaredPermittedOccupancy:
            room.declaredPermittedOccupancy.trim() === ""
              ? null
              : Number(room.declaredPermittedOccupancy),
          sleepingApproved: room.sleepingApproved,
          measurementSource: room.measurementSource || "manual",
          humanConfirmed: room.humanConfirmed,
        });
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["/api/hmo/properties", propertyId, "overview"],
      });
      toast({ title: "Rooms saved", description: "Assessment will refresh if a licence is confirmed." });
    },
    onError: (e: any) =>
      toast({ title: "Could not save rooms", description: e.message, variant: "destructive" }),
  });

  const importRoomsMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest(
        "POST",
        `/api/hmo/properties/${propertyId}/rooms/import-from-property`,
        {},
      );
      return res.json();
    },
    onSuccess: (payload) => {
      queryClient.invalidateQueries({
        queryKey: ["/api/hmo/properties", propertyId, "overview"],
      });
      toast({
        title: "Rooms imported",
        description:
          payload?.note ||
          `Imported ${payload?.imported || 0} room(s). Confirm measurements before assessment uses m².`,
      });
    },
    onError: (e: any) =>
      toast({
        title: "Import failed",
        description: e.message,
        variant: "destructive",
      }),
  });

  const editableFields = useMemo(
    () => [
      { key: "licence_number", label: "Licence number" },
      { key: "licence_status", label: "Licence status", kind: "lifecycle" as const },
      { key: "issuing_authority", label: "Council / authority" },
      { key: "borough", label: "Borough" },
      { key: "property_address", label: "Property address" },
      { key: "issue_date", label: "Grant / issue date", kind: "date" as const },
      { key: "start_date", label: "Start date", kind: "date" as const },
      { key: "expiry_date", label: "Expiry date", kind: "date" as const },
      { key: "maximum_individuals", label: "Maximum persons" },
      { key: "maximum_households", label: "Maximum households" },
      { key: "holder_name", label: "Licence holder" },
      { key: "manager_name", label: "Manager" },
    ],
    [],
  );

  const lifecycleOptions = [
    { value: "DRAFT", label: "Draft" },
    { value: "UNDER_REVIEW", label: "Under review" },
    { value: "CURRENT", label: "Current" },
    { value: "RENEWAL_PENDING_EVIDENCE", label: "Renewal pending evidence" },
    { value: "EXPIRED_DOCUMENT", label: "Expired document" },
    { value: "SUPERSEDED", label: "Superseded" },
  ];

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

  return (
    <div className="space-y-6 md:space-y-8" data-testid="hmo-property-panel">
      <div className="rounded-xl border bg-muted/20 px-4 py-5 md:px-6 space-y-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0 space-y-1.5 flex-1">
            <h2 className="text-lg md:text-xl font-semibold tracking-tight">
              {header?.address || data?.property?.address || "Property"}
            </h2>
            <div className="max-w-md space-y-1">
              <Label className="text-xs text-muted-foreground">Borough</Label>
              <Input
                className="h-9"
                placeholder="e.g. Camden"
                value={headerBorough}
                onChange={(e) => setHeaderBorough(e.target.value)}
              />
            </div>
          </div>
          <Badge variant="outline" className={cn("self-start text-sm", statusMeta.className)}>
            {statusMeta.label}
          </Badge>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <div className="rounded-lg border bg-card px-3 py-2.5 space-y-1.5">
            <Label className="text-xs text-muted-foreground">Licence status</Label>
            <select
              className="flex h-9 w-full rounded-md border border-input bg-background px-2 text-sm font-medium"
              value={headerLicenceStatus || "UNDER_REVIEW"}
              onChange={(e) => setHeaderLicenceStatus(e.target.value)}
            >
              {lifecycleOptions.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>
          <div className="rounded-lg border bg-card px-3 py-2.5 space-y-1.5">
            <Label className="text-xs text-muted-foreground">Expiry</Label>
            <Input
              type="date"
              className="h-9 font-medium"
              value={headerExpiry}
              onChange={(e) => setHeaderExpiry(e.target.value)}
            />
          </div>
          <div className="rounded-lg border bg-card px-3 py-2.5 space-y-1.5">
            <Label className="text-xs text-muted-foreground">Occupants / permitted</Label>
            <div className="flex items-center gap-1.5">
              <Input
                className="h-9 font-medium"
                inputMode="numeric"
                placeholder="Now"
                value={headerOccupantsNow}
                onChange={(e) => setHeaderOccupantsNow(e.target.value)}
              />
              <span className="text-muted-foreground text-sm">/</span>
              <Input
                className="h-9 font-medium"
                inputMode="numeric"
                placeholder="Max"
                value={headerPermitted}
                onChange={(e) => setHeaderPermitted(e.target.value)}
              />
            </div>
          </div>
          <div className="rounded-lg border bg-card px-3 py-2.5 space-y-1.5">
            <p className="text-xs text-muted-foreground">Needs attention</p>
            <p className="text-sm font-semibold mt-0.5">
              {String(header?.attentionCount ?? alerts.length)}
            </p>
            <p className="text-[11px] text-muted-foreground">Calculated from open alerts</p>
          </div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="rounded-lg border bg-card px-3 py-2.5 space-y-1.5">
            <Label className="text-xs text-muted-foreground">Licence evidence status</Label>
            <select
              className="flex h-9 w-full rounded-md border border-input bg-background px-2 text-sm font-medium"
              value={licenceEvidenceStatus}
              onChange={(e) => setLicenceEvidenceStatus(e.target.value)}
            >
              <option value="UNKNOWN">Unknown — status to confirm</option>
              <option value="REQUIRED_MISSING">Licence evidence required</option>
              <option value="APPLIED_PENDING">Applied / pending</option>
              <option value="NOT_REQUIRED">Not required</option>
              <option value="ISSUED">Issued</option>
            </select>
          </div>
          <div className="rounded-lg border bg-card px-3 py-2.5 space-y-1.5">
            <Label className="text-xs text-muted-foreground">Evidence notes</Label>
            <Input
              className="h-9"
              placeholder="Reason if not required / pending reference"
              value={licenceEvidenceNotes}
              onChange={(e) => setLicenceEvidenceNotes(e.target.value)}
            />
          </div>
        </div>
        {header?.setupIncomplete && (
          <div className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-950">
            HMO setup incomplete — set licence evidence to Issued, or Not required with a note.
            Classification: {header?.hmoClassification || data?.property?.hmoClassification || "—"}.
          </div>
        )}
        {(header?.licenceEvidenceStatus === "REQUIRED_MISSING" ||
          licenceEvidenceStatus === "REQUIRED_MISSING" ||
          licenceEvidenceStatus === "UNKNOWN") && (
          <p className="text-sm text-muted-foreground">
            Licence evidence required / status to confirm — this does not assert unlawful operation.
          </p>
        )}
        <div className="flex justify-end">
          <Button
            size="sm"
            onClick={() => saveHeaderMutation.mutate()}
            disabled={saveHeaderMutation.isPending}
          >
            {saveHeaderMutation.isPending ? "Saving…" : "Save summary"}
          </Button>
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
              <Button
                onClick={() => uploadMutation.mutate()}
                disabled={uploadMutation.isPending || !selectedFile}
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

            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">
                Enter or overwrite licence fields below, then save. Upload is optional.
              </p>
              <div className="grid gap-3 sm:grid-cols-2">
                {editableFields.map((f) => (
                  <div key={f.key} className="space-y-1.5">
                    <Label className="text-sm">{f.label}</Label>
                    {f.kind === "lifecycle" ? (
                      <select
                        className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                        value={fieldVal(rawField(editExtraction, f.key)) || "UNDER_REVIEW"}
                        onChange={(e) =>
                          setEditExtraction(
                            setExtractedField(editExtraction, f.key, e.target.value),
                          )
                        }
                      >
                        {lifecycleOptions.map((opt) => (
                          <option key={opt.value} value={opt.value}>
                            {opt.label}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <Input
                        type={f.kind === "date" ? "date" : "text"}
                        value={
                          f.kind === "date"
                            ? fieldVal(rawField(editExtraction, f.key)).slice(0, 10)
                            : fieldVal(rawField(editExtraction, f.key))
                        }
                        onChange={(e) =>
                          setEditExtraction(
                            setExtractedField(editExtraction, f.key, e.target.value),
                          )
                        }
                      />
                    )}
                  </div>
                ))}
              </div>
              <div className="flex flex-wrap gap-2">
                <Button
                  onClick={() => saveFieldsMutation.mutate()}
                  disabled={saveFieldsMutation.isPending}
                >
                  {saveFieldsMutation.isPending
                    ? "Saving…"
                    : isConfirmed
                      ? "Save overwritten details"
                      : "Save licence details"}
                </Button>
                <Button
                  variant="secondary"
                  onClick={() => currentVersionId && assessMutation.mutate(currentVersionId)}
                  disabled={!currentVersionId || !isConfirmed || assessMutation.isPending}
                >
                  {assessMutation.isPending ? "Assessing…" : "Run assessment"}
                </Button>
                {!isConfirmed && (
                  <p className="text-sm text-amber-800 self-center">Save before assessment</p>
                )}
              </div>
            </div>
          </AccordionContent>
        </AccordionItem>

        <AccordionItem value="restrictions" className="border rounded-xl px-4">
          <AccordionTrigger className="hover:no-underline">
            <span className="flex items-center gap-2 font-semibold">
              <Users className="h-4 w-4 text-primary" /> Restrictions
            </span>
          </AccordionTrigger>
          <AccordionContent className="space-y-4 pb-5">
            <div className="grid sm:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-sm">Maximum persons</Label>
                <Input
                  inputMode="numeric"
                  placeholder="Blank = Unknown"
                  value={fieldVal(editExtraction?.maximum_individuals)}
                  onChange={(e) => {
                    const next = setExtractedField(
                      editExtraction,
                      "maximum_individuals",
                      e.target.value,
                    );
                    setEditExtraction(next);
                    setMaxPersons(e.target.value);
                    setHeaderPermitted(e.target.value);
                  }}
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-sm">Maximum households</Label>
                <Input
                  inputMode="numeric"
                  placeholder="Blank = Unknown"
                  value={fieldVal(editExtraction?.maximum_households)}
                  onChange={(e) =>
                    setEditExtraction(
                      setExtractedField(editExtraction, "maximum_households", e.target.value),
                    )
                  }
                />
              </div>
            </div>
            <Button
              size="sm"
              onClick={() => saveFieldsMutation.mutate()}
              disabled={saveFieldsMutation.isPending}
            >
              {saveFieldsMutation.isPending ? "Saving…" : "Save restrictions"}
            </Button>
            <div className="space-y-3 rounded-lg border px-3 py-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <button
                  type="button"
                  className="flex min-w-0 items-center gap-2 text-left"
                  onClick={() => setVerifiedRoomsOpen((o) => !o)}
                  aria-expanded={verifiedRoomsOpen}
                >
                  {verifiedRoomsOpen ? (
                    <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
                  ) : (
                    <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                  )}
                  <span className="text-sm font-medium">Verified rooms</span>
                  <Badge variant="secondary" className="shrink-0">
                    {roomDrafts.length}
                  </Badge>
                </button>
                <div className="flex flex-wrap gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    type="button"
                    disabled={importRoomsMutation.isPending}
                    onClick={() => {
                      setVerifiedRoomsOpen(true);
                      importRoomsMutation.mutate();
                    }}
                  >
                    {importRoomsMutation.isPending
                      ? "Importing…"
                      : "Import from property rooms"}
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    type="button"
                    onClick={() => {
                      setVerifiedRoomsOpen(true);
                      setRoomDrafts((rows) => [
                        ...rows,
                        {
                          roomName: "",
                          roomType: "bedroom",
                          measuredUsableAreaM2: "",
                          ceilingHeightM: "",
                          declaredPermittedOccupancy: "1",
                          sleepingApproved: true,
                          measurementSource: "manual",
                          humanConfirmed: true,
                        },
                      ]);
                    }}
                  >
                    Add room
                  </Button>
                </div>
              </div>
              {!verifiedRoomsOpen && roomDrafts.length > 0 && (
                <p className="text-xs text-muted-foreground pl-6">
                  {roomDrafts.length} room{roomDrafts.length === 1 ? "" : "s"} hidden — expand to
                  edit.
                </p>
              )}
              {verifiedRoomsOpen && (
                <>
                  <p className="text-xs text-muted-foreground">
                    Floor-plan imports stay suggested until you tick Confirm m². Unconfirmed AI
                    areas are ignored by ROOM-01 assessment.
                  </p>
                  {roomDrafts.length === 0 && (
                    <p className="text-sm text-muted-foreground">
                      No room profiles yet — add sleeping rooms with usable m² and permitted
                      occupants.
                    </p>
                  )}
                  {roomDrafts.map((room, idx) => (
                    <div
                      key={room.id || idx}
                      className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3 border-t pt-3"
                    >
                      <div className="space-y-1">
                        <Label className="text-xs">Name</Label>
                        <Input
                          value={room.roomName}
                          onChange={(e) =>
                            setRoomDrafts((rows) =>
                              rows.map((r, i) =>
                                i === idx ? { ...r, roomName: e.target.value } : r,
                              ),
                            )
                          }
                          placeholder={`Room ${idx + 1}`}
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">Type</Label>
                        <Input
                          value={room.roomType}
                          onChange={(e) =>
                            setRoomDrafts((rows) =>
                              rows.map((r, i) =>
                                i === idx ? { ...r, roomType: e.target.value } : r,
                              ),
                            )
                          }
                          placeholder="bedroom"
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">Usable m²</Label>
                        <Input
                          inputMode="decimal"
                          value={room.measuredUsableAreaM2}
                          onChange={(e) =>
                            setRoomDrafts((rows) =>
                              rows.map((r, i) =>
                                i === idx
                                  ? { ...r, measuredUsableAreaM2: e.target.value }
                                  : r,
                              ),
                            )
                          }
                        />
                        {room.measurementSource === "floor_plan_ai" && !room.humanConfirmed && (
                          <p className="text-[11px] text-amber-800">
                            Suggested (AI) — confirm before assess
                          </p>
                        )}
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">Ceiling height (m)</Label>
                        <Input
                          inputMode="decimal"
                          value={room.ceilingHeightM}
                          onChange={(e) =>
                            setRoomDrafts((rows) =>
                              rows.map((r, i) =>
                                i === idx ? { ...r, ceilingHeightM: e.target.value } : r,
                              ),
                            )
                          }
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">Permitted occupants</Label>
                        <Input
                          inputMode="numeric"
                          value={room.declaredPermittedOccupancy}
                          onChange={(e) =>
                            setRoomDrafts((rows) =>
                              rows.map((r, i) =>
                                i === idx
                                  ? { ...r, declaredPermittedOccupancy: e.target.value }
                                  : r,
                              ),
                            )
                          }
                        />
                      </div>
                      <div className="flex flex-wrap items-end gap-3 pb-1">
                        <label className="flex items-center gap-2 text-sm">
                          <input
                            type="checkbox"
                            checked={room.sleepingApproved}
                            onChange={(e) =>
                              setRoomDrafts((rows) =>
                                rows.map((r, i) =>
                                  i === idx
                                    ? { ...r, sleepingApproved: e.target.checked }
                                    : r,
                                ),
                              )
                            }
                          />
                          Sleeping approved
                        </label>
                        <label className="flex items-center gap-2 text-sm">
                          <input
                            type="checkbox"
                            checked={room.humanConfirmed}
                            onChange={(e) =>
                              setRoomDrafts((rows) =>
                                rows.map((r, i) =>
                                  i === idx
                                    ? { ...r, humanConfirmed: e.target.checked }
                                    : r,
                                ),
                              )
                            }
                          />
                          Confirm m²
                        </label>
                        {!room.id && (
                          <Button
                            size="sm"
                            variant="ghost"
                            type="button"
                            onClick={() =>
                              setRoomDrafts((rows) => rows.filter((_, i) => i !== idx))
                            }
                          >
                            Remove
                          </Button>
                        )}
                      </div>
                    </div>
                  ))}
                  <Button
                    size="sm"
                    onClick={() => saveRoomsMutation.mutate()}
                    disabled={saveRoomsMutation.isPending || roomDrafts.length === 0}
                  >
                    {saveRoomsMutation.isPending ? "Saving rooms…" : "Save rooms"}
                  </Button>
                </>
              )}
            </div>
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
            {rooms.length > 0 && (
              <p className="text-xs text-muted-foreground">
                Licence extraction listed {rooms.length} sleeping room(s) — use verified rooms above for assessment.
              </p>
            )}

            <Card className="shadow-none">
              <CardHeader className="py-3">
                <CardTitle className="text-base">Pre-tenancy occupancy check</CardTitle>
                <CardDescription>
                  Current occupants are filled from active tenants on this property. Unknown is
                  never treated as zero.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {header?.occupantsNow != null &&
                  header?.occupantsPermitted != null &&
                  Number(header.occupantsNow) > Number(header.occupantsPermitted) && (
                    <div className="rounded-lg border border-rose-300 bg-rose-50 px-3 py-2 text-sm text-rose-950">
                      {header.occupantsNow} residents recorded; licence permits{" "}
                      {header.occupantsPermitted}.
                    </div>
                  )}
                <div className="grid gap-3 sm:grid-cols-2">
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
                      onChange={(e) => {
                        setOccupancyOverridden(true);
                        setConfirmedPersons(e.target.value);
                      }}
                      placeholder="Enter count or refresh from tenants"
                      inputMode="numeric"
                    />
                    <p className="text-xs text-muted-foreground">
                      {occupancyOverridden
                        ? "Manual overwrite — use Refresh to restore active tenant count"
                        : "Auto-filled from active tenants"}
                      {!occupancyOverridden && data?.activeTenantCount != null
                        ? ` (${data.activeTenantCount})`
                        : occupancyOverridden && data?.activeTenantCount != null
                          ? ` · tenants on file: ${data.activeTenantCount}`
                          : ""}
                    </p>
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
                            proposedAdditional: 0,
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
                    Check occupancy
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={async () => {
                      try {
                        const res = await apiRequest(
                          "POST",
                          `/api/hmo/properties/${propertyId}/occupancy-snapshots`,
                          {
                            maxPersons: maxPersons === "" ? null : Number(maxPersons),
                          },
                        );
                        const payload = await res.json();
                        const fromTenants =
                          typeof payload?.confirmedPersons === "number"
                            ? payload.confirmedPersons
                            : typeof payload?.personCount === "number"
                              ? payload.personCount
                              : data?.activeTenantCount;
                        setOccupancyOverridden(false);
                        if (fromTenants != null) {
                          setConfirmedPersons(String(fromTenants));
                          setHeaderOccupantsNow(String(fromTenants));
                        }
                        queryClient.invalidateQueries({
                          queryKey: ["/api/hmo/properties", propertyId, "overview"],
                        });
                        toast({ title: "Occupancy restored from active tenants" });
                      } catch (e: any) {
                        toast({
                          title: "Could not save occupancy",
                          description: e.message,
                          variant: "destructive",
                        });
                      }
                    }}
                  >
                    Refresh from active tenants
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

        <AccordionItem value="inspections" className="border rounded-xl px-4">
          <AccordionTrigger className="hover:no-underline">
            <span className="flex items-center gap-2 font-semibold">
              <ClipboardList className="h-4 w-4 text-primary" /> Inspections
              {(data?.hmoInspections || []).length > 0 && (
                <Badge variant="secondary" className="ml-1">
                  {(data?.hmoInspections || []).length}
                </Badge>
              )}
            </span>
          </AccordionTrigger>
          <AccordionContent className="space-y-3 pb-5">
            <p className="text-sm text-muted-foreground">
              Visits from templates marked as HMO template. Schedule more on the property Inspection
              Schedule tab.
            </p>
            <Link
              href={`/properties/${propertyId}?tab=inspection-schedule`}
              className="text-sm text-primary underline"
            >
              Open inspection schedule
            </Link>
            {(data?.hmoInspections || []).length === 0 && (
              <div className="rounded-xl border border-dashed px-4 py-6 text-center text-sm text-muted-foreground">
                No HMO-linked inspections yet. Mark a template as HMO and schedule it for this
                property.
              </div>
            )}
            {(data?.hmoInspections || []).map((insp) => (
              <Link
                key={insp.id}
                href={`/inspections/${insp.id}`}
                className="block rounded-lg border px-3 py-3 hover:bg-muted/40 text-sm space-y-1"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-medium text-primary">
                    {insp.templateName || "HMO inspection"}
                  </span>
                  <Badge
                    variant="secondary"
                    className={
                      insp.displayStatus.includes("Missed")
                        ? "border-rose-300 text-rose-800"
                        : undefined
                    }
                  >
                    {insp.displayStatus}
                  </Badge>
                </div>
                <p className="text-muted-foreground">
                  {insp.completedDate
                    ? `Completed ${formatDisplayDate(insp.completedDate)}`
                    : insp.scheduledDate
                      ? `Scheduled ${formatDisplayDate(insp.scheduledDate)}`
                      : `Created ${formatDisplayDate(insp.createdAt)}`}
                </p>
              </Link>
            ))}
          </AccordionContent>
        </AccordionItem>

        <AccordionItem value="safety" className="border rounded-xl px-4">
          <AccordionTrigger className="hover:no-underline">
            <span className="flex items-center gap-2 font-semibold">
              <Shield className="h-4 w-4 text-primary" /> Evidence
              {(data?.evidenceItems || []).length > 0 && (
                <Badge variant="secondary" className="ml-1">
                  {(data?.evidenceItems || []).length}
                </Badge>
              )}
            </span>
          </AccordionTrigger>
          <AccordionContent className="space-y-3 pb-5">
            <p className="text-sm text-muted-foreground">
              Safety certificates, fire/gas/electrical documents, and licence-condition evidence.
            </p>
            {(data?.evidenceItems || []).length === 0 && (
              <div className="rounded-xl border border-dashed px-4 py-8 text-center">
                <p className="text-sm font-medium">No evidence items yet</p>
                <p className="text-sm text-muted-foreground mt-1">
                  Upload compliance documents on the property Compliance tab, or run an assessment.
                </p>
              </div>
            )}
            {(data?.evidenceItems || []).map((item) => (
              <div key={item.id} className="rounded-lg border px-3 py-3 text-sm space-y-1">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-medium">{item.label}</span>
                  <Badge variant="secondary">{item.status}</Badge>
                </div>
                <p className="text-muted-foreground">
                  {item.source.replace(/_/g, " ")}
                  {item.detail ? ` · ${item.detail}` : ""}
                </p>
                <div className="flex flex-wrap gap-2 pt-1">
                  {item.link && (
                    <Link href={item.link} className="text-primary underline text-sm">
                      Open compliance documents
                    </Link>
                  )}
                  {(item.status === "Missing" || item.status === "Needs review") && (
                    <Link
                      href={`/properties/${propertyId}?tab=compliance`}
                      className="text-sm text-muted-foreground underline"
                    >
                      Upload
                    </Link>
                  )}
                </div>
              </div>
            ))}
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
              const linkedMr = (data?.linkedMaintenance || []).find((m) => m.findingId === f.id);
              const alertKind =
                f.status === "CONFIRMED_NON_COMPLIANT"
                  ? "Confirmed breach"
                  : f.status === "POTENTIAL_RISK" || f.status === "REQUIRES_HUMAN_REVIEW"
                    ? "Potential—verify"
                    : "Data missing";
              return (
                <div key={f.id} className="rounded-lg border px-3 py-3 space-y-2 text-sm">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <p className="font-medium">{hmoCheckLabel(f.checkId)}</p>
                      <p className="text-muted-foreground">{f.explanation}</p>
                    </div>
                    <div className="flex gap-1.5 flex-wrap justify-end">
                      <Badge variant="outline">{alertKind}</Badge>
                      <Badge variant="outline" className={hmoSeverityMeta(f.severity).className}>
                        {hmoSeverityMeta(f.severity).label}
                      </Badge>
                      <Badge variant="secondary">{hmoFindingSpecLabel(f.status)}</Badge>
                    </div>
                  </div>
                  <p className="text-muted-foreground">
                    Next action: {f.suggestedActionCode || "Review evidence"} · Source:{" "}
                    {hmoRuleSourceLabel(f.checkId, (f as any).ruleVersionId)}
                  </p>
                  {linkedMr ? (
                    <div className="flex flex-wrap items-center gap-2">
                      <Link href="/maintenance" className="text-primary underline text-sm">
                        {linkedMr.verificationStatus === "awaiting_verification"
                          ? "Open MR (awaiting verification)"
                          : "Open maintenance request"}
                      </Link>
                      {linkedMr.verificationStatus === "awaiting_verification" && (
                        <Badge variant="outline">Awaiting verification</Badge>
                      )}
                    </div>
                  ) : (
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={raiseMrMutation.isPending}
                      onClick={() => raiseMrMutation.mutate(f.id)}
                    >
                      Create maintenance request
                    </Button>
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

          </AccordionContent>
        </AccordionItem>

        <AccordionItem value="timeline" className="border rounded-xl px-4">
          <AccordionTrigger className="hover:no-underline">
            <span className="flex items-center gap-2 font-semibold">
              <History className="h-4 w-4 text-primary" /> Compliance Timeline
              {(data?.complianceTimeline || []).length > 0 && (
                <Badge variant="secondary" className="ml-1">
                  {(data?.complianceTimeline || []).length}
                </Badge>
              )}
            </span>
          </AccordionTrigger>
          <AccordionContent className="space-y-4 pb-5">
            <div className="flex flex-wrap gap-2">
              <Button
                size="sm"
                variant="outline"
                type="button"
                onClick={() => {
                  window.open(
                    `/api/hmo/properties/${propertyId}/export`,
                    "_blank",
                    "noopener,noreferrer",
                  );
                }}
              >
                Export evidence pack (PDF)
              </Button>
            </div>
            {(data?.complianceTimeline || []).length === 0 && (
              <p className="text-sm text-muted-foreground">
                Timeline fills as licences, assessments, findings, MRs, and HMO inspections are
                recorded.
              </p>
            )}
            {(data?.complianceTimeline || []).map((ev) => (
              <div key={ev.id} className="rounded-lg border px-3 py-2 text-sm space-y-1">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-medium">{ev.title}</span>
                  <Badge variant="outline">{ev.kind.replace(/_/g, " ")}</Badge>
                </div>
                <p className="text-muted-foreground">
                  {formatDisplayDate(ev.at)}
                  {ev.detail ? ` · ${ev.detail}` : ""}
                </p>
                {ev.link && (
                  <Link href={ev.link} className="text-primary underline text-sm">
                    Open
                  </Link>
                )}
              </div>
            ))}
            <div className="space-y-2 border-t pt-3">
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
          </AccordionContent>
        </AccordionItem>
      </Accordion>
    </div>
  );
}

