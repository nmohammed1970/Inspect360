import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ModernFilePickerInline } from "@/components/ModernFilePickerInline";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import {
  AlertCircle,
  Calendar,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  ClipboardCheck,
  FileText,
  LayoutGrid,
  Link2,
  Shield,
  Users,
  Wrench,
} from "lucide-react";
import { hmoCheckLabel, hmoOverallStatusMeta } from "@/components/hmo/hmoLabels";
import { cn } from "@/lib/utils";

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
    issue_date: field(seed?.issueDate ?? null),
    start_date: field(null),
    expiry_date: field(seed?.expiryDate ?? null),
    licence_status: field(seed?.lifecycleStatus ?? "UNDER_REVIEW"),
    maximum_individuals: field(seed?.maxPersons ?? null),
    maximum_households: field(null),
    holder_name: field(seed?.holderName ?? null),
    manager_name: field(seed?.managerName ?? null),
    conditions: [],
    rooms: [],
    referenced_missing_attachments: [],
    warnings: [],
  };
}

function isOpenMaintenanceStatus(status: string | null | undefined): boolean {
  const s = String(status || "").toLowerCase();
  return !["completed", "closed", "cancelled", "canceled", "resolved", "done"].includes(s);
}

/** Drop legacy "HMO: ROOM-01 — …" / "HMO: LIC-03 — …" check-id prefixes from alert titles. */
function displayMaintenanceTitle(title: string | null | undefined): string {
  const raw = String(title || "").trim();
  if (!raw) return "Maintenance alert";
  const stripped = raw.replace(/^HMO:\s*[A-Z]{2,12}-?\d*\s*[—\-–:]\s*/i, "").trim();
  return stripped || raw;
}

function priorityTone(priority: string | null | undefined): "urgent" | "medium" | "low" {
  const p = String(priority || "").toLowerCase();
  if (p === "urgent" || p === "critical" || p === "high") return "urgent";
  if (p === "medium") return "medium";
  return "low";
}

function formatLongDate(value: string | null | undefined): string {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return String(value);
  return d.toLocaleDateString(undefined, {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

function formatShortDate(value: string | null | undefined): string {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return String(value);
  return d.toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

/** Soft pill styles — prefer calm amber/teal over loud solid red for overview chrome. */
function softStatusPillClass(kind: "ok" | "warn" | "neutral" | "danger"): string {
  switch (kind) {
    case "ok":
      return "bg-teal-50 text-teal-800 border border-teal-100 hover:bg-teal-50";
    case "warn":
      return "bg-amber-50 text-amber-900 border border-amber-100 hover:bg-amber-50";
    case "danger":
      return "bg-rose-50 text-rose-800 border border-rose-100 hover:bg-rose-50";
    default:
      return "bg-slate-50 text-slate-700 border border-slate-200 hover:bg-slate-50";
  }
}

type ComplianceAlert = {
  id: string;
  checkId: string;
  status: string;
  severity: string;
  explanation?: string | null;
  actualJson?: {
    value?: string;
    resolution?: string | null;
    resolutionNote?: string | null;
  } | null;
  requiredJson?: { value?: string } | null;
};

function alertIsResolved(alert: ComplianceAlert): boolean {
  const resolution = alert.actualJson?.resolution;
  return (
    resolution === "force_closed" ||
    resolution === "recheck_passed" ||
    alert.status === "VERIFIED_COMPLIANT"
  );
}

function LicenceAlertList({
  alerts,
  forceClose,
  pendingId,
  onResolve,
  onReopen,
  onNote,
  onForce,
  onDismissForce,
}: {
  alerts: ComplianceAlert[];
  forceClose: { id: string; message: string; note: string } | null;
  pendingId: string | null;
  onResolve: (id: string) => void;
  onReopen: (id: string) => void;
  onNote: (note: string) => void;
  onForce: (id: string, note: string) => void;
  onDismissForce: () => void;
}) {
  const ordered = [...alerts].sort((a, b) => Number(alertIsResolved(a)) - Number(alertIsResolved(b)));
  if (ordered.length === 0) {
    return (
      <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-3 text-sm text-emerald-900">
        No open licence alerts. This property is compliant.
      </div>
    );
  }
  return (
    <div className="divide-y rounded-lg border">
      {ordered.map((alert) => {
        const resolved = alertIsResolved(alert);
        const forcing = forceClose?.id === alert.id;
        const busy = pendingId === alert.id;
        return (
          <div key={alert.id} className="px-3 py-3 space-y-2">
            <div className="flex gap-3">
              <div
                className={cn(
                  "w-1 rounded-full shrink-0 self-stretch",
                  resolved ? "bg-emerald-400" : alert.severity === "CRITICAL" ? "bg-rose-500" : "bg-amber-400",
                )}
              />
              <div className="min-w-0 space-y-1 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-sm font-medium text-slate-900">
                    {alert.explanation || hmoCheckLabel(alert.checkId)}
                  </p>
                  {resolved && (
                    <Badge className="bg-emerald-100 text-emerald-800 hover:bg-emerald-100 border-0">
                      Resolved
                    </Badge>
                  )}
                </div>
                <p className="text-xs font-normal text-[#5B6470]">
                  {hmoCheckLabel(alert.checkId)}
                  {alert.actualJson?.value ? ` · ${alert.actualJson.value}` : ""}
                  {alert.requiredJson?.value ? ` · needs ${alert.requiredJson.value}` : ""}
                </p>
                {resolved && alert.actualJson?.resolutionNote && (
                  <p className="text-xs font-normal text-[#5B6470]">Note: {alert.actualJson.resolutionNote}</p>
                )}
              </div>
            </div>
            {forcing && (
              <div className="space-y-2 pl-4">
                <p className="text-sm text-rose-700">{forceClose?.message}</p>
                <Textarea
                  value={forceClose?.note || ""}
                  onChange={(e) => onNote(e.target.value)}
                  placeholder="Note why this is resolved even though the check still fails"
                  className="min-h-[72px] text-sm"
                />
              </div>
            )}
            <div className="flex flex-wrap gap-2 pl-4">
              {!resolved && !forcing && (
                <Button size="sm" disabled={busy} onClick={() => onResolve(alert.id)}>
                  {busy ? "Checking…" : "Resolve"}
                </Button>
              )}
              {forcing && (
                <Button
                  size="sm"
                  disabled={busy || !(forceClose?.note || "").trim()}
                  onClick={() => onForce(alert.id, forceClose?.note || "")}
                >
                  {busy ? "Saving…" : "Resolve"}
                </Button>
              )}
              <Button
                size="sm"
                variant="outline"
                disabled={busy}
                onClick={() => {
                  if (forcing) {
                    onDismissForce();
                    return;
                  }
                  if (resolved) onReopen(alert.id);
                }}
              >
                Not resolved
              </Button>
            </div>
          </div>
        );
      })}
    </div>
  );
}

type Overview = {
  profile: {
    overallStatus?: string | null;
    licenceEvidenceStatus?: string | null;
    licenceEvidenceNotes?: string | null;
  };
  header?: {
    address?: string | null;
    licenceStatus?: string | null;
    expiryDate?: string | null;
    occupantsNow?: number | null;
    occupantsPermitted?: number | null;
  };
  property?: {
    id?: string;
    address?: string | null;
    name?: string | null;
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
  occupancy?: { personCount?: number | null } | null;
  activeTenantCount?: number | null;
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
  complianceAssessment?: {
    id: string;
    overallStatus?: string | null;
    completedAt?: string | null;
  } | null;
  complianceAlerts?: ComplianceAlert[];
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
};

type PropertyMaintenanceLog = {
  id: string;
  title: string;
  priority: string;
  status: string;
  createdAt: string;
  category?: string;
  description?: string;
  reportedByName?: string;
  assignedToName?: string;
  inspectionId?: string | null;
};

const lifecycleOptions = [
  { value: "DRAFT", label: "Draft" },
  { value: "UNDER_REVIEW", label: "Under review" },
  { value: "CURRENT", label: "Current" },
  { value: "RENEWAL_PENDING_EVIDENCE", label: "Renewal pending evidence" },
  { value: "EXPIRED_DOCUMENT", label: "Expired document" },
  { value: "SUPERSEDED", label: "Superseded" },
];

export function HmoPropertyPanel({ propertyId }: { propertyId: string }) {
  const { toast } = useToast();
  const [manageOpen, setManageOpen] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [lastVersionId, setLastVersionId] = useState<string | null>(null);
  const [editExtraction, setEditExtraction] = useState<any>(() => emptyExtraction());
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
  const [verifiedRoomsOpen, setVerifiedRoomsOpen] = useState(true);
  const [licenceAlertsExpanded, setLicenceAlertsExpanded] = useState(false);
  const [maintenanceAlertsExpanded, setMaintenanceAlertsExpanded] = useState(false);
  const [forceClose, setForceClose] = useState<{
    id: string;
    message: string;
    note: string;
  } | null>(null);
  const didAutoImportRooms = useRef(false);

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

  const { data: maintenanceLogs = [], isLoading: maintenanceLoading } = useQuery<
    PropertyMaintenanceLog[]
  >({
    queryKey: ["/api/properties", propertyId, "maintenance"],
    queryFn: async () => {
      const res = await fetch(`/api/properties/${propertyId}/maintenance`, {
        credentials: "include",
      });
      if (!res.ok) return [];
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
      return;
    }
    if (primaryLicence) {
      const seeded = emptyExtraction({
        address: data?.header?.address || data?.property?.address || null,
        licenceNumber: primaryLicence.licenceNumber,
        authorityName: primaryLicence.authorityName,
        holderName: primaryLicence.holderName,
        managerName: primaryLicence.managerName,
        expiryDate: primaryLicence.expiryDate,
        maxPersons: primaryLicence.maxPersons,
        lifecycleStatus: primaryLicence.lifecycleStatus,
      });
      setEditExtraction(seeded);
      return;
    }
    setEditExtraction(
      emptyExtraction({
        address: data?.header?.address || data?.property?.address || null,
      }),
    );
  }, [
    primaryVersion?.id,
    // Re-apply when re-extraction updates the same version id
    JSON.stringify(primaryVersion?.extractedJson ?? null),
    primaryLicence?.id,
    data?.header?.address,
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
    if (rooms.length > 0) setVerifiedRoomsOpen(false);
  }, [data?.roomProfiles]);

  const isConfirmed = Boolean(
    primaryVersion?.confirmedAt || primaryVersion?.status === "CONFIRMED",
  );

  const uploadMutation = useMutation({
    mutationFn: async (file: File) => {
      const form = new FormData();
      form.append("file", file);
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
      if (payload?.extraction) {
        const extraction = payload.extraction;
        setEditExtraction({
          ...emptyExtraction({
            address: fieldVal(extraction.property_address) || null,
            licenceNumber: fieldVal(extraction.licence_number) || null,
            authorityName: fieldVal(extraction.issuing_authority) || null,
            holderName: fieldVal(extraction.holder_name) || null,
            managerName: fieldVal(extraction.manager_name) || null,
            expiryDate: fieldVal(extraction.expiry_date) || null,
            maxPersons: fieldVal(extraction.maximum_individuals)
              ? Number(fieldVal(extraction.maximum_individuals))
              : null,
            issueDate: fieldVal(extraction.issue_date) || null,
            lifecycleStatus: fieldVal(extraction.licence_status) || "UNDER_REVIEW",
          }),
          ...extraction,
          licence_status: extraction.licence_status || {
            value: "UNDER_REVIEW",
            human_confirmed: true,
          },
        });
      }
      queryClient.invalidateQueries({
        queryKey: ["/api/hmo/properties", propertyId, "overview"],
      });
      toast({
        title: "Licence uploaded",
        description: "Review the extracted fields and save to confirm.",
      });
    },
    onError: (e: any) => {
      setSelectedFile(null);
      const message = String(e?.message || "Upload failed");
      const addressMismatch = /hasn'?t matched to property address/i.test(message);
      toast({
        title: addressMismatch ? "Address does not match" : "Upload failed",
        description: message,
        variant: "destructive",
      });
    },
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
      toast({ title: "Licence details saved" });
    },
    onError: (e: any) =>
      toast({ title: "Save failed", description: e.message, variant: "destructive" }),
  });

  const assessMutation = useMutation({
    mutationFn: async () => {
      const versionId = lastVersionId || primaryVersion?.id || null;
      if (versionId) {
        await apiRequest("POST", `/api/hmo/licence-versions/${versionId}/confirm`, {
          extraction: editExtraction,
        });
      } else {
        await apiRequest("POST", `/api/hmo/properties/${propertyId}/licences/manual`, {
          extraction: editExtraction,
        });
      }
      for (const room of roomDrafts) {
        const hasContent = Boolean(
          room.id || room.roomName.trim() || room.measuredUsableAreaM2.trim(),
        );
        if (!hasContent) continue;
        const areaText = room.measuredUsableAreaM2.trim();
        const area = areaText === "" ? null : Number(areaText);
        if (areaText && !Number.isFinite(area)) {
          throw new Error("Enter a valid room size in m² before running assessment");
        }
        const ceilingText = room.ceilingHeightM.trim();
        const ceiling = ceilingText === "" ? null : Number(ceilingText);
        const declaredText = room.declaredPermittedOccupancy.trim();
        const declared = declaredText === "" ? null : Number(declaredText);
        await apiRequest("POST", `/api/hmo/properties/${propertyId}/rooms`, {
          id: room.id || null,
          roomName: room.roomName.trim() || null,
          roomType: room.roomType.trim() || null,
          measuredUsableAreaM2: area,
          ceilingHeightM: ceiling != null && Number.isFinite(ceiling) ? ceiling : null,
          declaredPermittedOccupancy:
            declared != null && Number.isFinite(declared) ? declared : null,
          sleepingApproved: room.sleepingApproved,
          measurementSource: room.measurementSource || "manual",
          humanConfirmed: room.humanConfirmed,
        });
      }
      const res = await apiRequest(
        "POST",
        `/api/hmo/properties/${propertyId}/run-assessment`,
        {},
      );
      return res.json();
    },
    onSuccess: (payload) => {
      setForceClose(null);
      queryClient.invalidateQueries({
        queryKey: ["/api/hmo/properties", propertyId, "overview"],
      });
      queryClient.invalidateQueries({ queryKey: ["/api/hmo/dashboard"] });
      const open = Number(payload?.openAlertCount || 0);
      if (payload?.overallStatus === "VERIFIED_COMPLIANT") {
        toast({
          title: "Compliant",
          description: "No open licence alerts. The property status is now Compliant.",
        });
        return;
      }
      if (payload?.overallStatus === "REVIEW_REQUIRED") {
        toast({
          title: "Needs attention",
          description:
            open === 1
              ? "1 alert needs a confirmed measurement."
              : `${open} alerts need attention.`,
        });
        return;
      }
      toast({
        title: "Non-compliant",
        description: open === 1 ? "1 licence alert is open." : `${open} licence alerts are open.`,
      });
    },
    onError: (e: any) =>
      toast({ title: "Assessment failed", description: e.message, variant: "destructive" }),
  });

  const resolveMutation = useMutation({
    mutationFn: async (vars: {
      id: string;
      action: "recheck" | "force" | "reopen";
      note?: string;
    }) => {
      const res = await apiRequest("POST", `/api/hmo/findings/${vars.id}/resolve`, {
        action: vars.action,
        note: vars.note ?? null,
      });
      return res.json();
    },
    onSuccess: (payload, vars) => {
      queryClient.invalidateQueries({
        queryKey: ["/api/hmo/properties", propertyId, "overview"],
      });
      queryClient.invalidateQueries({ queryKey: ["/api/hmo/dashboard"] });
      if (payload?.stillFailing && vars.action === "recheck") {
        setForceClose({
          id: vars.id,
          message: payload.message || "This check still fails. Add a note to resolve it anyway.",
          note: "",
        });
        return;
      }
      setForceClose(null);
      if (payload?.overallStatus === "VERIFIED_COMPLIANT") {
        toast({
          title: "Compliant",
          description: "Every licence alert is resolved.",
        });
        return;
      }
      if (vars.action === "reopen") {
        toast({ title: "Marked not resolved" });
        return;
      }
      toast({ title: "Alert resolved" });
    },
    onError: (e: any) =>
      toast({ title: "Could not update alert", description: e.message, variant: "destructive" }),
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
      toast({ title: "Rooms saved" });
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
      didAutoImportRooms.current = true;
      queryClient.invalidateQueries({
        queryKey: ["/api/hmo/properties", propertyId, "overview"],
      });
      const imported = Number(payload?.imported || 0);
      if (imported > 0) {
        setVerifiedRoomsOpen(true);
        toast({
          title: "Rooms imported",
          description: payload?.note || `Imported ${imported} room(s) from the property.`,
        });
      }
    },
    onError: (e: any) => {
      didAutoImportRooms.current = false;
      toast({ title: "Import failed", description: e.message, variant: "destructive" });
    },
  });

  // Auto-import property rooms into HMO the first time (when none exist yet).
  useEffect(() => {
    if (!data || didAutoImportRooms.current || importRoomsMutation.isPending) return;
    if ((data.roomProfiles || []).length > 0) {
      didAutoImportRooms.current = true;
      return;
    }
    didAutoImportRooms.current = true;
    importRoomsMutation.mutate();
  }, [data, importRoomsMutation.isPending]);

  const editableFields = useMemo(
    () => [
      { key: "licence_number", label: "Licence number" },
      { key: "licence_status", label: "Licence status", kind: "lifecycle" as const },
      { key: "issuing_authority", label: "Council / authority" },
      { key: "property_address", label: "Property address" },
      { key: "issue_date", label: "Grant / issue date", kind: "date" as const },
      { key: "expiry_date", label: "Expiry date", kind: "date" as const },
      { key: "maximum_individuals", label: "Maximum persons" },
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

  const address = data?.header?.address || data?.property?.address || "Property";
  const statusMeta = hmoOverallStatusMeta(data?.profile?.overallStatus);
  const licenceAlertOpenCount = (data?.complianceAlerts || []).filter(
    (alert) => !alertIsResolved(alert),
  ).length;
  const lifecycle = primaryLicence?.lifecycleStatus || fieldVal(editExtraction?.licence_status);
  const licenceVerified =
    isConfirmed && (lifecycle === "CURRENT" || lifecycle === "Verified" || !lifecycle);
  const licenceLabel = licenceVerified
    ? "Verified"
    : lifecycle === "EXPIRED_DOCUMENT"
      ? "Expired"
      : lifecycle
        ? lifecycleOptions.find((o) => o.value === lifecycle)?.label || lifecycle.replace(/_/g, " ")
        : statusMeta.label;

  const occupantsNow =
    data?.activeTenantCount ??
    data?.header?.occupantsNow ??
    data?.occupancy?.personCount ??
    null;
  const occupantsPermitted =
    data?.header?.occupantsPermitted ??
    primaryLicence?.maxPersons ??
    (fieldVal(editExtraction?.maximum_individuals)
      ? Number(fieldVal(editExtraction.maximum_individuals))
      : null);
  const expiryDate = data?.header?.expiryDate || primaryLicence?.expiryDate || null;

  const openMaintenance = maintenanceLogs.filter((m) => isOpenMaintenanceStatus(m.status));

  const inspections = data?.hmoInspections || [];
  const hmoInspectionIds = new Set(inspections.map((i) => i.id));
  const hasHmoInspection = inspections.length > 0;
  // Unresolved issues raised from HMO inspections (maintenance linked to those inspections)
  const inspectionFindings = openMaintenance.filter(
    (m) => m.inspectionId && hmoInspectionIds.has(String(m.inspectionId)),
  );
  const urgentFindings = inspectionFindings.filter(
    (m) => priorityTone(m.priority) === "urgent",
  ).length;
  const mediumFindings = inspectionFindings.filter(
    (m) => priorityTone(m.priority) === "medium",
  ).length;
  const lastCompleted = inspections.find(
    (i) => i.displayStatus === "Completed" || i.status === "completed" || i.status === "reviewed",
  );
  const nextScheduled = inspections.find(
    (i) =>
      i.displayStatus === "Scheduled" ||
      i.displayStatus === "Missed / Overdue" ||
      i.status === "scheduled",
  );
  const lastInspectionDate = lastCompleted?.completedDate || lastCompleted?.scheduledDate || null;
  const nextInspectionDate = nextScheduled?.scheduledDate || null;

  const occupancyWithinLimit =
    occupantsNow != null &&
    occupantsPermitted != null &&
    Number.isFinite(occupantsNow) &&
    Number.isFinite(occupantsPermitted) &&
    occupantsNow <= occupantsPermitted;

  const licenceDocUrl = primaryVersion?.originalObjectUrl || null;

  const openLicenceDoc = () => {
    if (licenceDocUrl) {
      window.open(licenceDocUrl, "_blank", "noopener,noreferrer");
      return;
    }
    setManageOpen(true);
  };

  const licencePillKind: "ok" | "warn" | "neutral" | "danger" = licenceVerified
    ? "ok"
    : lifecycle === "EXPIRED_DOCUMENT" || licenceLabel === "Expired"
      ? "danger"
      : lifecycle === "UNDER_REVIEW" || licenceLabel === "Under review"
        ? "warn"
        : "neutral";

  const setupIncomplete =
    !primaryLicence ||
    !isConfirmed ||
    lifecycle === "UNDER_REVIEW" ||
    lifecycle === "EXPIRED_DOCUMENT" ||
    licenceLabel === "Expired";

  const hmoBanner = (() => {
    if (setupIncomplete) {
      return {
        title: "HMO setup incomplete — review licence and schedule inspection.",
        nextStep: !hasHmoInspection
          ? "Next step: confirm licence details, then schedule an HMO inspection"
          : "Next step: confirm licence details in Manage licence",
      };
    }
    if (!hasHmoInspection) {
      return {
        title: "No HMO inspection scheduled yet.",
        nextStep: "Next step: schedule an HMO inspection for this property",
      };
    }
    if (inspectionFindings.length > 0) {
      return {
        title: `${inspectionFindings.length} HMO inspection ${
          inspectionFindings.length === 1 ? "finding needs" : "findings need"
        } attention.`,
        nextStep: "Next step: review findings and update maintenance",
      };
    }
    return null;
  })();

  const occupancyHeadline =
    occupantsNow != null
      ? occupantsNow === 0
        ? "0 active tenants"
        : occupantsPermitted != null
          ? `${occupantsNow} of ${occupantsPermitted} people`
          : `${occupantsNow} active tenant${occupantsNow === 1 ? "" : "s"}`
      : "Not recorded";

  const lastInspectionHeadline = lastInspectionDate
    ? formatShortDate(lastInspectionDate)
    : nextInspectionDate
      ? "Scheduled"
      : "Not scheduled";

  const findingsHeadline = !hasHmoInspection
    ? "Not assessed"
    : inspectionFindings.length === 0
      ? "None open"
      : `${inspectionFindings.length} open`;

  const activityItems: Array<{
    id: string;
    title: string;
    meta: string;
    tone: "ok" | "warn" | "neutral";
  }> = [];
  if (primaryLicence) {
    activityItems.push({
      id: "licence",
      title: isConfirmed ? "Licence on file" : "HMO setup started",
      meta: [licenceLabel, expiryDate ? `Expires ${formatShortDate(expiryDate)}` : null]
        .filter(Boolean)
        .join(" · "),
      tone: licenceVerified ? "ok" : "warn",
    });
  }
  if (lastCompleted) {
    activityItems.push({
      id: `insp-done-${lastCompleted.id}`,
      title: "HMO inspection completed",
      meta: formatShortDate(lastInspectionDate),
      tone: "ok",
    });
  } else if (nextScheduled) {
    activityItems.push({
      id: `insp-next-${nextScheduled.id}`,
      title: "HMO inspection scheduled",
      meta: formatShortDate(nextInspectionDate),
      tone: "neutral",
    });
  } else if (primaryLicence) {
    activityItems.push({
      id: "insp-none",
      title: "HMO inspection not scheduled",
      meta: "Awaiting first inspection",
      tone: "warn",
    });
  }
  if (inspectionFindings[0]) {
    activityItems.push({
      id: `finding-${inspectionFindings[0].id}`,
      title: inspectionFindings[0].title || "Open HMO finding",
      meta: "Needs follow-up",
      tone: "warn",
    });
  }
  const recentActivity = activityItems.slice(0, 4);

  return (
    <div className="space-y-6" data-testid="hmo-property-panel">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 space-y-1">
          <h2 className="text-2xl md:text-3xl font-semibold tracking-tight text-slate-900">
            HMO overview
          </h2>
          <p className="text-sm font-normal text-[#5B6470]">
            {address}
            <span className="font-normal text-[#5B6470]"> · </span>
            All HMO information in one place
          </p>
        </div>
        <div className="flex flex-wrap gap-2.5 shrink-0">
          <Button variant="outline" type="button" onClick={openLicenceDoc}>
            View licence
          </Button>
          <Button
            variant="outline"
            type="button"
            onClick={() => setManageOpen(true)}
          >
            Manage licence
          </Button>
          <Button variant="brand" type="button" asChild>
            <Link href={`/inspections?propertyId=${propertyId}&create=true`}>
              + Schedule HMO inspection
            </Link>
          </Button>
        </div>
      </div>

      {/* HMO-focused next-step banner (calm setup / follow-up copy) */}
      {hmoBanner && (
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between rounded-lg border border-amber-200/80 bg-amber-50/90 px-4 py-3.5">
          <div className="flex items-start gap-2.5 text-amber-950 min-w-0">
            <AlertCircle className="h-4 w-4 mt-0.5 shrink-0 text-amber-700" />
            <p className="text-sm font-medium leading-snug">{hmoBanner.title}</p>
          </div>
          <p className="text-sm text-amber-900/75 sm:text-right sm:max-w-xs shrink-0 pl-6 sm:pl-0">
            {hmoBanner.nextStep}
          </p>
        </div>
      )}

      {/* KPI cards — soft status language, pills instead of loud red headlines */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <div className="rounded-xl border border-slate-200/80 bg-white px-5 py-5 space-y-3">
          <div className="flex items-center justify-between gap-2">
            <p className="text-sm font-normal text-[#5B6470]">HMO licence</p>
            <Shield className="h-4 w-4 text-[#5B6470] shrink-0" />
          </div>
          <Badge className={cn("font-medium px-2.5 py-0.5", softStatusPillClass(licencePillKind))}>
            {licenceLabel}
          </Badge>
          <p className="text-sm font-normal text-[#5B6470]">
            {expiryDate ? `Expires ${formatLongDate(expiryDate)}` : "Expiry not set"}
            {" · "}
            <button
              type="button"
              className="text-teal-700 hover:underline"
              onClick={openLicenceDoc}
            >
              View
            </button>
          </p>
        </div>

        <div className="rounded-xl border border-slate-200/80 bg-white px-5 py-5 space-y-3">
          <div className="flex items-center justify-between gap-2">
            <p className="text-sm font-normal text-[#5B6470]">Occupancy</p>
            <Users className="h-4 w-4 text-[#5B6470] shrink-0" />
          </div>
          <p className="text-xl font-semibold text-slate-900 tracking-tight">{occupancyHeadline}</p>
          <p className="text-sm font-normal text-[#5B6470]">
            {occupantsPermitted == null
              ? "Licence limit not set"
              : occupancyWithinLimit
                ? "Within recorded licence limit"
                : "Over recorded licence limit"}
            {" · "}
            <Link
              href={`/properties/${propertyId}?tab=tenants`}
              className="text-teal-700 hover:underline"
            >
              Details
            </Link>
          </p>
        </div>

        <div className="rounded-xl border border-slate-200/80 bg-white px-5 py-5 space-y-3">
          <div className="flex items-center justify-between gap-2">
            <p className="text-sm font-normal text-[#5B6470]">Last HMO inspection</p>
            <ClipboardCheck className="h-4 w-4 text-[#5B6470] shrink-0" />
          </div>
          <p className="text-xl font-semibold text-slate-900 tracking-tight">
            {lastInspectionHeadline}
          </p>
          <p className="text-sm font-normal text-[#5B6470]">
            {nextInspectionDate
              ? `Next due ${formatShortDate(nextInspectionDate)}`
              : lastInspectionDate
                ? "No next date scheduled"
                : "Schedule to start assessment"}
            {" · "}
            {lastCompleted ? (
              <Link href={`/inspections/${lastCompleted.id}`} className="text-teal-700 hover:underline">
                View
              </Link>
            ) : (
              <Link
                href={`/properties/${propertyId}?tab=inspection-schedule`}
                className="text-teal-700 hover:underline"
              >
                View
              </Link>
            )}
          </p>
        </div>

        <div className="rounded-xl border border-slate-200/80 bg-white px-5 py-5 space-y-3">
          <div className="flex items-center justify-between gap-2">
            <p className="text-sm font-normal text-[#5B6470]">Unresolved HMO findings</p>
            <AlertCircle className="h-4 w-4 text-[#5B6470] shrink-0" />
          </div>
          <p className="text-xl font-semibold text-slate-900 tracking-tight">{findingsHeadline}</p>
          <p className="text-sm font-normal text-[#5B6470]">
            {!hasHmoInspection
              ? "Findings appear after an HMO inspection"
              : inspectionFindings.length === 0
                ? "No open inspection findings"
                : [
                    urgentFindings ? `${urgentFindings} urgent` : null,
                    mediumFindings ? `${mediumFindings} medium` : null,
                  ]
                    .filter(Boolean)
                    .join(" · ") || "From linked HMO inspections"}
          </p>
        </div>
      </div>

      {/* Main grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 space-y-4">
          {/* Issues requiring attention — HMO inspection findings */}
          <section className="rounded-xl border border-slate-200/80 bg-white overflow-hidden">
            <div className="px-6 py-5 border-b border-slate-100">
              <div className="min-w-0 space-y-1.5">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="font-semibold text-slate-900 text-base flex items-center gap-2">
                    <AlertCircle className="h-4 w-4 text-[#5B6470] shrink-0" />
                    Issues requiring attention
                  </h3>
                  <Badge
                    className={cn(
                      "font-medium px-2 py-0.5",
                      softStatusPillClass(
                        inspectionFindings.length > 0
                          ? "warn"
                          : hasHmoInspection
                            ? "ok"
                            : "neutral",
                      ),
                    )}
                  >
                    {!hasHmoInspection
                      ? "Not assessed"
                      : inspectionFindings.length === 0
                        ? "Clear"
                        : `${inspectionFindings.length} open`}
                  </Badge>
                </div>
                <p className="text-sm font-normal text-[#5B6470]">
                  Only unresolved findings from HMO inspections are shown here
                </p>
              </div>
            </div>

            {inspectionFindings.length === 0 ? (
              <div className="flex flex-col items-center text-center px-8 py-14 space-y-5">
                <div className="h-16 w-16 rounded-full bg-slate-50 border border-slate-100 flex items-center justify-center">
                  <CheckCircle2 className="h-8 w-8 text-[#5B6470]" />
                </div>
                <div className="space-y-2 max-w-md">
                  <p className="text-base font-semibold text-slate-900">
                    No HMO inspection findings available
                  </p>
                  <p className="text-sm font-normal text-[#5B6470] leading-relaxed">
                    {hasHmoInspection
                      ? "No unresolved findings from HMO inspections yet. New issues raised during an HMO inspection will appear here."
                      : "No HMO inspection has been linked to this property. Schedule one to start capturing issues here automatically."}
                  </p>
                </div>
                <Button className="mt-1 bg-teal-600 hover:bg-teal-700" asChild>
                  <Link href={`/inspections?propertyId=${propertyId}&create=true`}>
                    Schedule HMO inspection
                  </Link>
                </Button>
              </div>
            ) : (
              <div className="divide-y">
                {inspectionFindings.slice(0, 12).map((m) => {
                  const tone = priorityTone(m.priority);
                  const linkedInsp = hmoInspectionIds.has(String(m.inspectionId))
                    ? (data?.hmoInspections || []).find((i) => i.id === m.inspectionId)
                    : null;
                  return (
                    <div
                      key={m.id}
                      className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between px-5 py-3.5"
                    >
                      <div className="flex gap-3 min-w-0">
                        <div
                          className={cn(
                            "w-1 rounded-full shrink-0 self-stretch min-h-[2.5rem]",
                            tone === "urgent" && "bg-rose-500",
                            tone === "medium" && "bg-amber-400",
                            tone === "low" && "bg-slate-300",
                          )}
                        />
                        <div className="min-w-0 space-y-0.5">
                          <p className="font-medium text-slate-900 text-sm">
                            {displayMaintenanceTitle(m.title)}
                          </p>
                          <p className="text-sm font-normal text-[#5B6470] truncate">
                            {[
                              linkedInsp
                                ? `Inspection ${formatShortDate(
                                    linkedInsp.completedDate ||
                                      linkedInsp.scheduledDate ||
                                      linkedInsp.createdAt,
                                  )}`
                                : null,
                              m.assignedToName
                                ? `Assigned to ${m.assignedToName}`
                                : "Assigned to maintenance",
                            ]
                              .filter(Boolean)
                              .join(" · ")}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center justify-between sm:justify-end gap-4 pl-4 sm:pl-0">
                        <span
                          className={cn(
                            "text-sm font-medium capitalize",
                            tone === "urgent" && "text-rose-600",
                            tone === "medium" && "text-amber-700",
                            tone === "low" && "text-slate-600",
                          )}
                        >
                          {tone === "urgent"
                            ? "Urgent"
                            : tone === "medium"
                              ? "Medium"
                              : m.priority || "Normal"}{" "}
                          · {String(m.status || "").replace(/_/g, " ")}
                        </span>
                        <Link
                          href={`/maintenance/${m.id}`}
                          className="text-sm text-teal-700 hover:underline whitespace-nowrap"
                        >
                          View issue →
                        </Link>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </section>

          {/* Recent activity — light timeline instead of a dense alerts dump */}
          <section className="rounded-xl border border-slate-200/80 bg-white overflow-hidden">
            <div className="px-6 py-5 border-b border-slate-100">
              <h3 className="font-semibold text-slate-900 flex items-center gap-2">
                <Calendar className="h-4 w-4 text-[#5B6470] shrink-0" />
                Recent HMO activity
              </h3>
              <p className="text-sm font-normal text-[#5B6470] mt-1">
                Licence, inspections, and follow-ups in one quiet timeline
              </p>
            </div>
            <div className="px-6 py-5">
              {recentActivity.length === 0 ? (
                <p className="text-sm font-normal text-[#5B6470] py-2">No HMO activity recorded yet.</p>
              ) : (
                <ul className="space-y-4">
                  {recentActivity.map((item, index) => (
                    <li key={item.id} className="flex gap-3">
                      <div className="flex flex-col items-center pt-1">
                        <span
                          className={cn(
                            "h-2.5 w-2.5 rounded-full shrink-0",
                            item.tone === "ok" && "bg-teal-500",
                            item.tone === "warn" && "bg-amber-400",
                            item.tone === "neutral" && "bg-slate-300",
                          )}
                        />
                        {index < recentActivity.length - 1 && (
                          <span className="w-px flex-1 bg-slate-200 mt-1 min-h-[1.25rem]" />
                        )}
                      </div>
                      <div className="min-w-0 pb-1">
                        <p className="text-sm font-medium text-slate-900">{item.title}</p>
                        <p className="text-sm font-normal text-[#5B6470] mt-0.5">{item.meta}</p>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </section>

          {data?.complianceAssessment && (
            <section className="rounded-xl border border-slate-200/80 bg-white overflow-hidden">
              <button
                type="button"
                className="flex w-full items-center justify-between gap-3 px-6 py-4 text-left hover:bg-slate-50/80 transition-colors"
                onClick={() => setLicenceAlertsExpanded((v) => !v)}
                aria-expanded={licenceAlertsExpanded}
              >
                <div className="flex items-center gap-2 min-w-0">
                  {licenceAlertsExpanded ? (
                    <ChevronDown className="h-4 w-4 text-[#5B6470] shrink-0" />
                  ) : (
                    <ChevronRight className="h-4 w-4 text-[#5B6470] shrink-0" />
                  )}
                  <h3 className="font-semibold text-slate-900">Licence alerts</h3>
                  {licenceAlertOpenCount > 0 && (
                    <Badge
                      className={cn("font-medium px-2 py-0.5", softStatusPillClass("warn"))}
                    >
                      {licenceAlertOpenCount} open
                    </Badge>
                  )}
                </div>
                <span className="text-xs font-normal text-[#5B6470] shrink-0">
                  {licenceAlertsExpanded ? "Hide" : "Show"}
                </span>
              </button>
              {licenceAlertsExpanded && (
                <div className="px-4 pb-4 border-t border-slate-100">
                  <LicenceAlertList
                    alerts={data.complianceAlerts || []}
                    forceClose={forceClose}
                    pendingId={
                      resolveMutation.isPending ? resolveMutation.variables?.id || null : null
                    }
                    onResolve={(id) => resolveMutation.mutate({ id, action: "recheck" })}
                    onReopen={(id) => resolveMutation.mutate({ id, action: "reopen" })}
                    onNote={(note) =>
                      setForceClose((current) => (current ? { ...current, note } : current))
                    }
                    onForce={(id, note) => resolveMutation.mutate({ id, action: "force", note })}
                    onDismissForce={() => setForceClose(null)}
                  />
                </div>
              )}
            </section>
          )}

          {/* Maintenance alerts — collapsed by default to keep overview calm */}
          <section className="rounded-xl border border-slate-200/80 bg-white overflow-hidden">
            <button
              type="button"
              className="flex w-full items-center justify-between gap-3 px-6 py-4 text-left hover:bg-slate-50/80 transition-colors"
              onClick={() => setMaintenanceAlertsExpanded((v) => !v)}
              aria-expanded={maintenanceAlertsExpanded}
            >
              <div className="flex items-center gap-2 min-w-0">
                {maintenanceAlertsExpanded ? (
                  <ChevronDown className="h-4 w-4 text-[#5B6470] shrink-0" />
                ) : (
                  <ChevronRight className="h-4 w-4 text-[#5B6470] shrink-0" />
                )}
                <h3 className="font-semibold text-slate-900">Maintenance alerts</h3>
                {openMaintenance.length > 0 && (
                  <Badge className={cn("font-medium px-2 py-0.5", softStatusPillClass("warn"))}>
                    {openMaintenance.length} open
                  </Badge>
                )}
              </div>
              <Link
                href={`/maintenance?propertyId=${propertyId}`}
                className="text-sm text-teal-700 hover:underline shrink-0"
                onClick={(e) => e.stopPropagation()}
              >
                View all →
              </Link>
            </button>
            {maintenanceAlertsExpanded && (
              <div className="divide-y border-t border-slate-100 max-h-[18rem] overflow-y-auto">
                {maintenanceLoading ? (
                  <p className="px-6 py-6 text-sm font-normal text-[#5B6470]">Loading maintenance logs…</p>
                ) : openMaintenance.length === 0 ? (
                  <p className="px-6 py-6 text-sm font-normal text-[#5B6470]">
                    No open maintenance items for this property.
                  </p>
                ) : (
                  openMaintenance.slice(0, 8).map((m) => {
                    const tone = priorityTone(m.priority);
                    return (
                      <div
                        key={m.id}
                        className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between px-6 py-3.5"
                      >
                        <div className="flex gap-3 min-w-0">
                          <div
                            className={cn(
                              "w-1 rounded-full shrink-0 self-stretch min-h-[2.5rem]",
                              tone === "urgent" && "bg-rose-400",
                              tone === "medium" && "bg-amber-300",
                              tone === "low" && "bg-slate-200",
                            )}
                          />
                          <div className="min-w-0 space-y-0.5">
                            <p className="font-medium text-slate-900 text-sm">
                              {displayMaintenanceTitle(m.title)}
                            </p>
                            <p className="text-sm font-normal text-[#5B6470] truncate">
                              {[
                                m.category,
                                formatShortDate(m.createdAt),
                                m.assignedToName
                                  ? `Assigned to ${m.assignedToName}`
                                  : m.reportedByName
                                    ? `Reported by ${m.reportedByName}`
                                    : null,
                              ]
                                .filter(Boolean)
                                .join(" · ")}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center justify-between sm:justify-end gap-3 pl-4 sm:pl-0">
                          <Badge
                            className={cn(
                              "font-medium capitalize px-2 py-0.5",
                              softStatusPillClass(
                                tone === "urgent" ? "danger" : tone === "medium" ? "warn" : "neutral",
                              ),
                            )}
                          >
                            {tone === "urgent"
                              ? "Urgent"
                              : tone === "medium"
                                ? "Medium"
                                : m.priority || "Open"}
                          </Badge>
                          <Link
                            href={`/maintenance/${m.id}`}
                            className="text-sm text-teal-700 hover:underline whitespace-nowrap"
                          >
                            View →
                          </Link>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            )}
          </section>
        </div>

        {/* Right column */}
        <div className="space-y-4">
          <section className="rounded-xl border border-slate-200/80 bg-white px-5 py-5 space-y-4">
            <div className="flex items-center justify-between gap-2">
              <h3 className="font-semibold text-slate-900 flex items-center gap-2">
                <Shield className="h-4 w-4 text-[#5B6470] shrink-0" />
                Licence & permitted use
              </h3>
              <button
                type="button"
                className="text-sm font-semibold text-teal-700 hover:underline"
                onClick={openLicenceDoc}
              >
                View licence →
              </button>
            </div>
            <dl className="space-y-3 text-sm">
              <div className="flex items-center justify-between gap-3">
                <dt className="font-medium text-[#5B6470]">Licence status</dt>
                <dd>
                  <Badge
                    className={cn(
                      "font-semibold px-2.5 py-0.5",
                      softStatusPillClass(licencePillKind),
                    )}
                  >
                    {licenceLabel}
                  </Badge>
                </dd>
              </div>
              <div className="flex items-center justify-between gap-3">
                <dt className="font-medium text-[#5B6470]">Licence expiry</dt>
                <dd className="font-semibold text-slate-900">
                  {expiryDate ? formatShortDate(expiryDate) : "—"}
                </dd>
              </div>
              <div className="flex items-center justify-between gap-3">
                <dt className="font-medium text-[#5B6470]">Max permitted people</dt>
                <dd className="font-semibold text-slate-900">
                  {occupantsPermitted != null ? occupantsPermitted : "Needs confirmation"}
                </dd>
              </div>
              <div className="flex items-center justify-between gap-3">
                <dt className="font-medium text-[#5B6470]">Source</dt>
                <dd className="font-semibold text-slate-900 text-right">
                  {primaryVersion?.fileName || primaryLicence
                    ? "Uploaded HMO licence"
                    : "Not uploaded"}
                </dd>
              </div>
            </dl>
          </section>

          <section className="rounded-xl border border-slate-200/80 bg-white px-5 py-5 space-y-4">
            <div className="flex items-center justify-between gap-2">
              <h3 className="font-semibold text-slate-900 flex items-center gap-2">
                <ClipboardCheck className="h-4 w-4 text-[#5B6470] shrink-0" />
                HMO inspection
              </h3>
              {lastCompleted ? (
                <Link
                  href={`/inspections/${lastCompleted.id}`}
                  className="text-sm font-semibold text-teal-700 hover:underline"
                >
                  View inspection →
                </Link>
              ) : (
                <Link
                  href={`/properties/${propertyId}?tab=inspection-schedule`}
                  className="text-sm font-semibold text-teal-700 hover:underline"
                >
                  View schedule →
                </Link>
              )}
            </div>
            <div className="rounded-lg bg-slate-50/80 border border-slate-100 px-4 py-3.5 space-y-2.5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm font-semibold text-slate-900 flex items-center gap-2">
                  <Calendar className="h-3.5 w-3.5 text-[#5B6470] shrink-0" />
                  {lastCompleted
                    ? `Completed · ${formatLongDate(lastInspectionDate)}`
                    : nextScheduled
                      ? `${nextScheduled.displayStatus} · ${formatLongDate(nextInspectionDate)}`
                      : "Not scheduled"}
                </p>
                <Badge
                  className={cn(
                    "font-semibold px-2 py-0.5",
                    softStatusPillClass(
                      inspectionFindings.length > 0
                        ? "warn"
                        : hasHmoInspection
                          ? "ok"
                          : "neutral",
                    ),
                  )}
                >
                  {inspectionFindings.length > 0
                    ? "Follow-up needed"
                    : hasHmoInspection
                      ? "Assessed"
                      : "Not assessed"}
                </Badge>
              </div>
              <p className="text-sm font-medium text-[#5B6470] leading-relaxed">
                {!hasHmoInspection
                  ? "Schedule an HMO inspection to assess this property. Photos and notes will live on the inspection record."
                  : inspectionFindings.length > 0
                    ? `${inspectionFindings.length} open finding${
                        inspectionFindings.length === 1 ? "" : "s"
                      } from HMO inspections need follow-up.`
                    : "All photos and inspector notes are saved on the inspection record."}
              </p>
            </div>
            <div className="flex items-center justify-between gap-2 text-sm">
              <span className="font-medium text-[#5B6470]">
                Next scheduled:{" "}
                <span className="font-semibold text-slate-900">
                  {nextInspectionDate ? formatLongDate(nextInspectionDate) : "—"}
                </span>
              </span>
              <Link
                href={`/properties/${propertyId}?tab=inspection-schedule`}
                className="font-semibold text-teal-700 hover:underline"
              >
                Manage →
              </Link>
            </div>
          </section>

          <section className="rounded-xl border border-slate-200/80 bg-white px-5 py-5 space-y-4">
            <div className="flex items-center justify-between gap-2">
              <h3 className="font-semibold text-slate-900 flex items-center gap-2">
                <Link2 className="h-4 w-4 text-[#5B6470] shrink-0" />
                Linked records
              </h3>
              <span className="text-xs font-medium text-[#5B6470]">No duplicate data entry</span>
            </div>
            <div className="space-y-3 text-sm">
              {(
                [
                  {
                    label: "Tenants",
                    href: `/properties/${propertyId}?tab=tenants`,
                    action: "View occupancy →",
                    Icon: Users,
                  },
                  {
                    label: "Floor plan",
                    href: `/properties/${propertyId}`,
                    action: "Open floor plan →",
                    Icon: LayoutGrid,
                  },
                  {
                    label: "Maintenance",
                    href: `/maintenance?propertyId=${propertyId}`,
                    action: "View work orders →",
                    Icon: Wrench,
                  },
                  {
                    label: "Documents",
                    href: `/properties/${propertyId}?tab=compliance-schedule`,
                    action: "Compliance documents →",
                    Icon: FileText,
                  },
                ] as const
              ).map((row) => (
                <div key={row.label} className="flex items-center justify-between gap-3">
                  <span className="font-medium text-[#5B6470] flex items-center gap-2 min-w-0">
                    <row.Icon className="h-4 w-4 shrink-0 text-[#5B6470]" />
                    {row.label}
                  </span>
                  <Link
                    href={row.href}
                    className="font-semibold text-teal-700 hover:underline shrink-0"
                  >
                    {row.action}
                  </Link>
                </div>
              ))}
            </div>
          </section>
        </div>
      </div>

      {/* Manage licence / rooms / occupancy */}
      <Dialog
        open={manageOpen}
        onOpenChange={(open) => {
          setManageOpen(open);
          if (
            open &&
            (data?.roomProfiles || []).length === 0 &&
            !importRoomsMutation.isPending
          ) {
            didAutoImportRooms.current = true;
            importRoomsMutation.mutate();
          }
        }}
      >
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Manage HMO licence & rooms</DialogTitle>
          </DialogHeader>
          <div className="space-y-5 pt-1">
            <div className="flex flex-wrap gap-2">
              <Badge variant="outline" className={statusMeta.className}>
                {statusMeta.label}
              </Badge>
            </div>

            <div className="space-y-2">
              <Label>Upload or replace licence</Label>
              {(primaryVersion?.fileName || primaryVersion?.originalObjectUrl) &&
                !uploadMutation.isPending && (
                  <div className="flex items-center justify-between gap-3 rounded-lg border border-teal-200 bg-teal-50 px-3 py-2.5 text-sm">
                    <div className="flex items-center gap-2 min-w-0">
                      <CheckCircle2 className="h-4 w-4 text-teal-700 shrink-0" />
                      <FileText className="h-4 w-4 text-teal-700 shrink-0" />
                      <div className="min-w-0">
                        <p className="font-medium text-teal-950 truncate">
                          {primaryVersion.fileName || "Licence document"}
                        </p>
                        <p className="text-xs text-teal-800/80">Uploaded</p>
                      </div>
                    </div>
                    {licenceDocUrl && (
                      <button
                        type="button"
                        className="text-sm font-medium text-teal-800 hover:underline shrink-0"
                        onClick={openLicenceDoc}
                      >
                        View →
                      </button>
                    )}
                  </div>
                )}
              <ModernFilePickerInline
                onFilesSelected={(files) => {
                  const file = files[0];
                  if (!file || uploadMutation.isPending) return;
                  setSelectedFile(file);
                  uploadMutation.mutate(file);
                }}
                maxFiles={1}
                maxFileSize={25 * 1024 * 1024}
                accept="image/*,.pdf,application/pdf"
                multiple={false}
                isUploading={uploadMutation.isPending}
                height={140}
              />
              {uploadMutation.isPending && selectedFile && (
                <p className="text-sm text-muted-foreground truncate">
                  Uploading {selectedFile.name}…
                </p>
              )}
            </div>

            <div className="grid sm:grid-cols-2 gap-3">
              {editableFields.map((f) => (
                <div key={f.key} className="space-y-1.5">
                  <Label className="text-xs">{f.label}</Label>
                  {f.kind === "lifecycle" ? (
                    <select
                      className="flex h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
                      value={fieldVal(editExtraction?.[f.key]) || "UNDER_REVIEW"}
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
                      className="h-9"
                      value={fieldVal(editExtraction?.[f.key])}
                      onChange={(e) => {
                        setEditExtraction(
                          setExtractedField(editExtraction, f.key, e.target.value),
                        );
                      }}
                    />
                  )}
                </div>
              ))}
            </div>

            <div className="flex flex-wrap gap-2">
              <Button
                size="sm"
                onClick={() => saveFieldsMutation.mutate()}
                disabled={saveFieldsMutation.isPending || assessMutation.isPending}
              >
                {saveFieldsMutation.isPending ? "Saving…" : "Save"}
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => assessMutation.mutate()}
                disabled={assessMutation.isPending || saveFieldsMutation.isPending}
              >
                {assessMutation.isPending ? "Running…" : "Run assessment"}
              </Button>
            </div>
            <p className="text-xs font-normal text-[#5B6470]">
              Saves these details, then compares the licence with confirmed room sizes, active
              tenants, and the expiry date. The licence status dropdown stays as you saved it.
            </p>
            {data?.complianceAssessment && (
              <LicenceAlertList
                alerts={data.complianceAlerts || []}
                forceClose={forceClose}
                pendingId={resolveMutation.isPending ? resolveMutation.variables?.id || null : null}
                onResolve={(id) => resolveMutation.mutate({ id, action: "recheck" })}
                onReopen={(id) => resolveMutation.mutate({ id, action: "reopen" })}
                onNote={(note) => setForceClose((current) => (current ? { ...current, note } : current))}
                onForce={(id, note) => resolveMutation.mutate({ id, action: "force", note })}
                onDismissForce={() => setForceClose(null)}
              />
            )}

            <div className="rounded-lg border px-3 py-3 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <button
                  type="button"
                  className="flex items-center gap-2 text-sm font-medium"
                  onClick={() => setVerifiedRoomsOpen((o) => !o)}
                >
                  {verifiedRoomsOpen ? (
                    <ChevronDown className="h-4 w-4" />
                  ) : (
                    <ChevronRight className="h-4 w-4" />
                  )}
                  Verified rooms
                  <Badge variant="secondary">{roomDrafts.length}</Badge>
                </button>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant="outline"
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
              {verifiedRoomsOpen && (
                <>
                  {roomDrafts.map((room, idx) => (
                    <div
                      key={room.id || idx}
                      className="grid gap-2 sm:grid-cols-2 border-t pt-3"
                    >
                      <Input
                        placeholder="Name"
                        value={room.roomName}
                        onChange={(e) =>
                          setRoomDrafts((rows) =>
                            rows.map((r, i) =>
                              i === idx ? { ...r, roomName: e.target.value } : r,
                            ),
                          )
                        }
                      />
                      <Input
                        placeholder="Usable m²"
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
                      <label className="flex items-center gap-2 text-sm sm:col-span-2">
                        <input
                          type="checkbox"
                          checked={room.humanConfirmed}
                          onChange={(e) =>
                            setRoomDrafts((rows) =>
                              rows.map((r, i) =>
                                i === idx ? { ...r, humanConfirmed: e.target.checked } : r,
                              ),
                            )
                          }
                        />
                        Confirm m²
                      </label>
                    </div>
                  ))}
                  <Button
                    size="sm"
                    disabled={saveRoomsMutation.isPending || roomDrafts.length === 0}
                    onClick={() => saveRoomsMutation.mutate()}
                  >
                    {saveRoomsMutation.isPending ? "Saving…" : "Save rooms"}
                  </Button>
                </>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

