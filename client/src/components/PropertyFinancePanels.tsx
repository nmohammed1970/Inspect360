import { useMemo, useRef, useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { LocaleDateInput } from "@/components/LocaleDateInput";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ModernFilePickerInline } from "@/components/ModernFilePickerInline";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { billingCurrencySymbol } from "@shared/billingCurrencies";
import { AlertTriangle, Banknote, FileText, Loader2, Mail, Pencil, Plus, Receipt, Trash2, Wallet, X } from "lucide-react";
import { PreviewableImage } from "@/components/ImagePreview";
import { DeleteConfirmDialog } from "@/components/DeleteConfirmDialog";
import { cn, extractFileUrlFromUploadResponse } from "@/lib/utils";
import { dialogContentBase, dialogFooterSticky, formGrid2, textBreak } from "@/lib/responsive";

type Props = {
  propertyId: string;
  preferredCurrency?: string;
};

function money(amount: string | number | null | undefined, currency = "GBP") {
  const n = typeof amount === "string" ? parseFloat(amount) : Number(amount);
  return `${billingCurrencySymbol(currency)}${Number.isFinite(n) ? n.toFixed(2) : "0.00"}`;
}

function isImageReceipt(mimeOrName: string): boolean {
  const s = mimeOrName.toLowerCase();
  return s.startsWith("image/") || /\.(png|jpe?g|webp|gif|bmp)$/i.test(s);
}

function receiptHref(path: string): string {
  if (path.startsWith("http") || path.startsWith("/")) return path;
  return `/objects/${path}`;
}

function ReceiptAttachmentPreview({
  url,
  previewUrl,
  fileName,
  mimeType,
  onRemove,
  kind = "receipt",
}: {
  url: string;
  previewUrl?: string;
  fileName?: string;
  mimeType?: string;
  onRemove: () => void;
  /** Distinguishes picture vs receipt copy in the preview */
  kind?: "receipt" | "picture";
}) {
  const href = receiptHref(url);
  const displaySrc = previewUrl || href;
  const defaultName = kind === "picture" ? "Picture" : "Receipt";
  const label = fileName || url.split("/").pop() || defaultName;
  const showImage = isImageReceipt(mimeType || fileName || url);
  const openLabel = kind === "picture" ? "Open picture" : "Open receipt";
  const removeLabel = kind === "picture" ? "Remove picture" : "Remove receipt";

  return (
    <div className="mt-2 rounded-md border bg-muted/30 p-2">
      <div className="flex items-start gap-3">
        {showImage ? (
          <PreviewableImage
            src={displaySrc}
            alt={label}
            title={label}
            className="h-20 w-20 rounded object-cover border bg-background"
          />
        ) : (
          <a
            href={href}
            target="_blank"
            rel="noreferrer"
            className="flex h-20 w-20 shrink-0 flex-col items-center justify-center gap-1 rounded border bg-background text-muted-foreground hover:text-foreground"
          >
            <FileText className="h-7 w-7" />
            <span className="text-[10px] uppercase">PDF</span>
          </a>
        )}
        <div className="min-w-0 flex-1 pt-0.5">
          <p className="truncate text-sm font-medium" title={label}>
            {label}
          </p>
          <p className="text-xs text-muted-foreground">Uploaded — will be saved with the form</p>
          <a href={href} target="_blank" rel="noreferrer" className="text-xs text-primary underline">
            {openLabel}
          </a>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-8 w-8 shrink-0"
          aria-label={removeLabel}
          onClick={onRemove}
        >
          <X className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}

async function uploadSelectedFile(
  file: File,
  onProgress?: (n: number) => void,
): Promise<{ path: string; previewUrl: string; fileName: string; mimeType: string }> {
  const response = await fetch("/api/objects/upload", { method: "POST", credentials: "include" });
  if (!response.ok) throw new Error("Failed to get upload URL");
  const data = await response.json();
  let uploadURL: string = data.uploadURL;
  if (!uploadURL) throw new Error("Invalid upload URL response");
  if (uploadURL.startsWith("/")) uploadURL = `${window.location.origin}${uploadURL}`;

  onProgress?.(25);
  const uploadResponse = await fetch(uploadURL, {
    method: "PUT",
    body: file,
    headers: { "Content-Type": file.type || "application/octet-stream" },
    credentials: "include",
  });
  if (!uploadResponse.ok) throw new Error("Upload failed");

  onProgress?.(70);

  // Prefer the /objects/<id> path from the PUT JSON body.
  // Do NOT parse paths from the upload-direct URL — that wrongly becomes "/objects/upload-direct?...".
  let objectPath: string | null = null;
  try {
    const text = await uploadResponse.text();
    let responseBody: any = null;
    if (text) {
      try {
        responseBody = JSON.parse(text);
      } catch {
        responseBody = text;
      }
    }
    const mockFile = {
      response: {
        body: responseBody,
        url: uploadResponse.headers.get("Location") || undefined,
      },
      meta: { originalUploadURL: uploadURL },
    };
    objectPath = extractFileUrlFromUploadResponse(mockFile, responseBody);
  } catch {
    objectPath = null;
  }

  if (!objectPath) {
    // Fallback: objectId query param on the signed upload URL
    try {
      const urlObj = new URL(uploadURL);
      const objectId = urlObj.searchParams.get("objectId");
      if (objectId) objectPath = `/objects/${objectId}`;
    } catch {
      /* ignore */
    }
  }

  if (!objectPath?.startsWith("/objects/")) {
    throw new Error("Upload succeeded but object path was not returned");
  }

  // ACL is already applied by /api/objects/upload-direct — skip a second set-acl call.

  onProgress?.(100);

  return {
    path: objectPath,
    previewUrl: file.type.startsWith("image/") ? URL.createObjectURL(file) : "",
    fileName: file.name || "File",
    mimeType: file.type || "",
  };
}

function todayYmdLocal(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function toYmdLocal(value: string | Date | null | undefined): string {
  if (!value) return "";
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}/.test(value)) {
    return value.slice(0, 10);
  }
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function moneyField(value: string | number | null | undefined): string {
  if (value == null || value === "") return "";
  const n = typeof value === "string" ? parseFloat(value) : Number(value);
  return Number.isFinite(n) ? String(n) : "";
}

export function PropertyDepositPanel({ propertyId, preferredCurrency = "GBP" }: Props) {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [isUploadingReceipt, setIsUploadingReceipt] = useState(false);
  const [receiptUploadProgress, setReceiptUploadProgress] = useState(0);
  const todayYmd = useMemo(() => todayYmdLocal(), []);
  const [form, setForm] = useState({
    tenantAssignmentId: "",
    amount: "",
    currency: preferredCurrency,
    receivedDate: "",
    paymentMethod: "bank_transfer",
    status: "held",
    returnedAmount: "",
    deductedAmount: "",
    deductionReason: "",
    notes: "",
    receiptUrl: "",
    receiptPreviewUrl: "",
    receiptFileName: "",
    receiptMimeType: "",
  });

  const resetDepositForm = () => {
    setEditingId(null);
    setForm({
      tenantAssignmentId: "",
      amount: "",
      currency: preferredCurrency,
      receivedDate: "",
      paymentMethod: "bank_transfer",
      status: "held",
      returnedAmount: "",
      deductedAmount: "",
      deductionReason: "",
      notes: "",
      receiptUrl: "",
      receiptPreviewUrl: "",
      receiptFileName: "",
      receiptMimeType: "",
    });
  };

  const openCreate = () => {
    resetDepositForm();
    setOpen(true);
  };

  const openEdit = (d: any) => {
    setEditingId(d.id);
    setForm({
      tenantAssignmentId: d.tenantAssignmentId || "",
      amount: moneyField(d.amount),
      currency: d.currency || preferredCurrency,
      receivedDate: toYmdLocal(d.receivedDate),
      paymentMethod: d.paymentMethod || "bank_transfer",
      status: d.status || "held",
      returnedAmount: moneyField(d.returnedAmount),
      deductedAmount: moneyField(d.deductedAmount),
      deductionReason: d.deductionReason || "",
      notes: d.notes || "",
      receiptUrl: d.receiptUrl || "",
      receiptPreviewUrl: "",
      receiptFileName: d.receiptUrl ? d.receiptUrl.split("/").pop() || "Receipt" : "",
      receiptMimeType: "",
    });
    setOpen(true);
  };

  const { data: deposits = [], isLoading } = useQuery<any[]>({
    queryKey: ["/api/properties", propertyId, "deposits"],
    queryFn: async () => {
      const res = await fetch(`/api/properties/${propertyId}/deposits`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load deposits");
      return res.json();
    },
  });

  const { data: tenants = [] } = useQuery<any[]>({
    queryKey: ["/api/properties", propertyId, "tenants"],
  });

  const buildDepositPayload = () => {
    if (form.receivedDate && form.receivedDate > todayYmdLocal()) {
      throw new Error("Received date cannot be in the future");
    }
    const amount = parseFloat(form.amount);
    const returned = form.returnedAmount ? parseFloat(form.returnedAmount) : 0;
    const deducted = form.deductedAmount ? parseFloat(form.deductedAmount) : 0;
    if (!Number.isFinite(amount) || amount <= 0) {
      throw new Error("Deposit amount must be greater than zero");
    }
    if (returned < 0 || deducted < 0) {
      throw new Error("Returned and deducted amounts cannot be negative");
    }
    if (returned > 0 || deducted > 0) {
      const settled = Math.round((returned + deducted) * 100) / 100;
      const total = Math.round(amount * 100) / 100;
      if (settled !== total) {
        throw new Error(
          `Returned + deducted (${settled.toFixed(2)}) must equal the deposit amount (${total.toFixed(2)})`,
        );
      }
    }
    if (deducted > 0 && !form.deductionReason.trim()) {
      throw new Error("Deduction reason is required when a deduction amount is set");
    }
    return {
      tenantAssignmentId: form.tenantAssignmentId,
      amount: form.amount,
      currency: form.currency,
      paymentMethod: form.paymentMethod,
      status: form.status,
      returnedAmount: form.returnedAmount || null,
      deductedAmount: form.deductedAmount || null,
      deductionReason: form.deductionReason || null,
      notes: form.notes || null,
      receivedDate: form.receivedDate || null,
      receiptUrl: form.receiptUrl || null,
    };
  };

  const createMutation = useMutation({
    mutationFn: async () =>
      apiRequest("POST", `/api/properties/${propertyId}/deposits`, buildDepositPayload()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/properties", propertyId, "deposits"] });
      resetDepositForm();
      setOpen(false);
      toast({ title: "Deposit recorded" });
    },
    onError: (e: Error) => toast({ variant: "destructive", title: "Error", description: e.message }),
  });

  const updateMutation = useMutation({
    mutationFn: async () => {
      if (!editingId) throw new Error("No deposit selected");
      return apiRequest(
        "PATCH",
        `/api/properties/${propertyId}/deposits/${editingId}`,
        buildDepositPayload(),
      );
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/properties", propertyId, "deposits"] });
      resetDepositForm();
      setOpen(false);
      toast({ title: "Deposit updated" });
    },
    onError: (e: Error) => toast({ variant: "destructive", title: "Error", description: e.message }),
  });

  const isSaving = createMutation.isPending || updateMutation.isPending;
  const isEditing = !!editingId;

  const returnedNum = form.returnedAmount ? parseFloat(form.returnedAmount) : 0;
  const deductedNum = form.deductedAmount ? parseFloat(form.deductedAmount) : 0;
  const amountNum = form.amount ? parseFloat(form.amount) : 0;
  const settlementActive = returnedNum > 0 || deductedNum > 0;
  const settlementSum = Math.round((returnedNum + deductedNum) * 100) / 100;
  const settlementOk =
    !settlementActive ||
    (Number.isFinite(amountNum) &&
      Number.isFinite(settlementSum) &&
      settlementSum === Math.round(amountNum * 100) / 100);

  return (
    <Card>
      <CardHeader className="flex flex-col sm:flex-row items-start justify-between gap-4">
        <div className={cn("min-w-0", textBreak)}>
          <CardTitle className="flex items-center gap-2">
            <Wallet className="h-5 w-5 shrink-0" />
            Deposit
          </CardTitle>
          <CardDescription>
            Record deposits held, returned, or deducted for tenancies on this property.
          </CardDescription>
        </div>
        <Button
          size="sm"
          className="shrink-0"
          onClick={openCreate}
          data-testid="button-add-deposit"
        >
          <Plus className="h-4 w-4 mr-1" />
          Add Deposit
        </Button>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        ) : deposits.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No deposits recorded yet. The lease deposit amount on a tenancy is only a guide — use{" "}
            <span className="font-medium text-foreground">Add Deposit</span> and click{" "}
            <span className="font-medium text-foreground">Save</span> when money is received.
          </p>
        ) : (
          <div className="space-y-3">
            {deposits.map((d) => (
              <div
                key={d.id}
                className="rounded-lg border p-3 flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 min-w-0"
              >
                <div className={cn("min-w-0 flex-1", textBreak)}>
                  <div className="font-medium">{money(d.amount, d.currency)}</div>
                  <div className="text-xs text-muted-foreground capitalize">
                    {String(d.status || "").replace(/_/g, " ")}
                  </div>
                  {d.deductedAmount && parseFloat(d.deductedAmount) > 0 && (
                    <div className="text-xs mt-1 text-red-700 dark:text-red-300">
                      Deduction {money(d.deductedAmount, d.currency)}
                      {d.deductionReason ? ` — ${d.deductionReason}` : ""}
                    </div>
                  )}
                  {d.returnedAmount && parseFloat(d.returnedAmount) > 0 && (
                    <div className="text-xs text-muted-foreground">
                      Returned {money(d.returnedAmount, d.currency)}
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-2 shrink-0 self-start">
                  {d.receiptUrl ? (
                    <a
                      href={receiptHref(d.receiptUrl)}
                      target="_blank"
                      rel="noreferrer"
                      className="text-sm text-primary underline"
                    >
                      Receipt
                    </a>
                  ) : (
                    <span className="text-xs text-muted-foreground">No receipt</span>
                  )}
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    aria-label="Edit deposit"
                    data-testid={`button-edit-deposit-${d.id}`}
                    onClick={() => openEdit(d)}
                  >
                    <Pencil className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>

      <Dialog
        open={open}
        onOpenChange={(next) => {
          setOpen(next);
          if (!next) resetDepositForm();
        }}
      >
        <DialogContent className={cn(dialogContentBase, "max-w-lg flex flex-col gap-0 p-0 overflow-hidden")}>
          <DialogHeader className="px-4 sm:px-6 pt-6 pb-2">
            <DialogTitle>{isEditing ? "Edit Deposit" : "Add Deposit"}</DialogTitle>
            <DialogDescription>
              {isEditing
                ? "Update the deposit record for this property."
                : "Record money actually received. Choosing a tenant with a lease deposit only fills the amount — click Save to add it to the list."}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 px-4 sm:px-6 py-2 overflow-y-auto flex-1 min-h-0">
            <div>
              <Label>Tenant assignment</Label>
              <Select
                value={form.tenantAssignmentId}
                onValueChange={(v) => {
                  const tenant = tenants.find(
                    (t: any) => (t.assignment?.id || t.assignmentId) === v,
                  );
                  const leaseDeposit = tenant?.assignment?.depositAmount ?? tenant?.depositAmount;
                  setForm((f) => ({
                    ...f,
                    tenantAssignmentId: v,
                    amount:
                      f.amount ||
                      (leaseDeposit != null && leaseDeposit !== "" ? String(leaseDeposit) : f.amount),
                  }));
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select tenant" />
                </SelectTrigger>
                <SelectContent>
                  {tenants.map((t: any) => {
                    const assignmentId = t.assignment?.id || t.assignmentId;
                    if (!assignmentId) return null;
                    const leaseDeposit = t.assignment?.depositAmount ?? t.depositAmount;
                    return (
                      <SelectItem key={assignmentId} value={assignmentId}>
                        {t.firstName || ""} {t.lastName || ""}
                        {leaseDeposit ? ` (lease deposit ${leaseDeposit})` : ""}
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
            </div>
            <div className={formGrid2}>
              <div>
                <Label required>Amount</Label>
                <Input value={form.amount} onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))} />
              </div>
              <div>
                <Label>Currency</Label>
                <Select value={form.currency} onValueChange={(v) => setForm((f) => ({ ...f, currency: v }))}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {["GBP", "USD", "EUR", "AED"].map((c) => (
                      <SelectItem key={c} value={c}>
                        {c}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className={formGrid2}>
              <div>
                <Label>Received date</Label>
                <LocaleDateInput
                  value={form.receivedDate || null}
                  max={todayYmd}
                  onChange={(ymd) => setForm((f) => ({ ...f, receivedDate: ymd || "" }))}
                />
              </div>
              <div>
                <Label>Payment method</Label>
                <Select
                  value={form.paymentMethod}
                  onValueChange={(v) => setForm((f) => ({ ...f, paymentMethod: v }))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="cash">Cash</SelectItem>
                    <SelectItem value="bank_transfer">Bank transfer</SelectItem>
                    <SelectItem value="card">Card</SelectItem>
                    <SelectItem value="other">Other</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <Label>Status</Label>
              <Select value={form.status} onValueChange={(v) => setForm((f) => ({ ...f, status: v }))}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="held">Held</SelectItem>
                  <SelectItem value="partially_returned">Partially returned</SelectItem>
                  <SelectItem value="returned">Returned</SelectItem>
                  <SelectItem value="deducted">Deducted</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className={formGrid2}>
              <div>
                <Label>Returned amount</Label>
                <Input
                  value={form.returnedAmount}
                  onChange={(e) => setForm((f) => ({ ...f, returnedAmount: e.target.value }))}
                />
              </div>
              <div>
                <Label>Deducted amount</Label>
                <Input
                  value={form.deductedAmount}
                  onChange={(e) => setForm((f) => ({ ...f, deductedAmount: e.target.value }))}
                />
              </div>
            </div>
            {settlementActive && (
              <p className={`text-xs ${settlementOk ? "text-muted-foreground" : "text-destructive"}`}>
                {settlementOk
                  ? `Returned + deducted equals deposit (${amountNum.toFixed(2)}).`
                  : `Returned + deducted (${Number.isFinite(settlementSum) ? settlementSum.toFixed(2) : "—"}) must equal deposit amount (${Number.isFinite(amountNum) ? amountNum.toFixed(2) : "—"}).`}
              </p>
            )}
            <div>
              <Label>Deduction reason</Label>
              <Input
                value={form.deductionReason}
                onChange={(e) => setForm((f) => ({ ...f, deductionReason: e.target.value }))}
                placeholder="e.g. Carpet damage"
              />
            </div>
            <div>
              <Label>Notes</Label>
              <Textarea value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} />
            </div>
            <div>
              <Label>Receipt (optional)</Label>
              {!form.receiptUrl ? (
                <ModernFilePickerInline
                  onFilesSelected={async (files) => {
                    const file = files[0];
                    if (!file) return;
                    setIsUploadingReceipt(true);
                    setReceiptUploadProgress(0);
                    try {
                      const uploaded = await uploadSelectedFile(file, setReceiptUploadProgress);
                      setForm((f) => ({
                        ...f,
                        receiptUrl: uploaded.path,
                        receiptPreviewUrl: uploaded.previewUrl,
                        receiptFileName: uploaded.fileName || "Receipt",
                        receiptMimeType: uploaded.mimeType,
                      }));
                      toast({ title: "Receipt uploaded" });
                    } catch (e: any) {
                      toast({
                        variant: "destructive",
                        title: "Upload failed",
                        description: e?.message || "Could not attach receipt",
                      });
                    } finally {
                      setIsUploadingReceipt(false);
                      setReceiptUploadProgress(0);
                    }
                  }}
                  maxFiles={1}
                  accept="image/*,.pdf,application/pdf"
                  multiple={false}
                  isUploading={isUploadingReceipt}
                  uploadProgress={receiptUploadProgress}
                  height={200}
                />
              ) : (
                <ReceiptAttachmentPreview
                  url={form.receiptUrl}
                  previewUrl={form.receiptPreviewUrl || undefined}
                  fileName={form.receiptFileName}
                  mimeType={form.receiptMimeType}
                  onRemove={() => {
                    if (form.receiptPreviewUrl) URL.revokeObjectURL(form.receiptPreviewUrl);
                    setForm((f) => ({
                      ...f,
                      receiptUrl: "",
                      receiptPreviewUrl: "",
                      receiptFileName: "",
                      receiptMimeType: "",
                    }));
                  }}
                />
              )}
            </div>
          </div>
          <DialogFooter className="px-4 sm:px-6 py-4 border-t shrink-0 bg-background flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button
              variant="outline"
              onClick={() => {
                setOpen(false);
                resetDepositForm();
              }}
            >
              Cancel
            </Button>
            <Button
              disabled={
                !form.tenantAssignmentId ||
                !form.amount ||
                !settlementOk ||
                (deductedNum > 0 && !form.deductionReason.trim()) ||
                isSaving
              }
              onClick={() => (isEditing ? updateMutation.mutate() : createMutation.mutate())}
            >
              {isSaving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              {isEditing ? "Save Changes" : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

export function PropertyExpensesPanel({ propertyId, preferredCurrency = "GBP" }: Props) {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [linkedAssetId, setLinkedAssetId] = useState<string | null>(null);
  const [expenseToDelete, setExpenseToDelete] = useState<{ id: string; description: string } | null>(null);
  const [isUploadingPhoto, setIsUploadingPhoto] = useState(false);
  const [photoUploadProgress, setPhotoUploadProgress] = useState(0);
  const [isUploadingReceipt, setIsUploadingReceipt] = useState(false);
  const [receiptUploadProgress, setReceiptUploadProgress] = useState(0);
  const saveInFlightRef = useRef(false);
  const [form, setForm] = useState({
    description: "",
    category: "appliance",
    expenseDate: new Date().toISOString().slice(0, 10),
    supplier: "",
    supplierContact: "",
    amount: "",
    currency: preferredCurrency,
    warrantyExpiry: "",
    warrantyNotes: "",
    photoUrl: "",
    photoPreviewUrl: "",
    photoFileName: "",
    receiptUrl: "",
    receiptPreviewUrl: "",
    receiptFileName: "",
    receiptMimeType: "",
    notes: "",
  });

  const resetExpenseForm = () => {
    setEditingId(null);
    setLinkedAssetId(null);
    saveInFlightRef.current = false;
    setForm({
      description: "",
      category: "appliance",
      expenseDate: new Date().toISOString().slice(0, 10),
      supplier: "",
      supplierContact: "",
      amount: "",
      currency: preferredCurrency,
      warrantyExpiry: "",
      warrantyNotes: "",
      photoUrl: "",
      photoPreviewUrl: "",
      photoFileName: "",
      receiptUrl: "",
      receiptPreviewUrl: "",
      receiptFileName: "",
      receiptMimeType: "",
      notes: "",
    });
  };

  const openCreate = () => {
    resetExpenseForm();
    setOpen(true);
  };

  const openEdit = (e: any) => {
    setEditingId(e.id);
    setLinkedAssetId(e.assetInventoryId || null);
    setForm({
      description: e.description || "",
      category: e.category || "other",
      expenseDate: toYmdLocal(e.expenseDate) || new Date().toISOString().slice(0, 10),
      supplier: e.supplier || "",
      supplierContact: e.supplierContact || "",
      amount: moneyField(e.amount),
      currency: e.currency || preferredCurrency,
      warrantyExpiry: toYmdLocal(e.warrantyExpiry),
      warrantyNotes: e.warrantyNotes || "",
      photoUrl: e.photoUrl || "",
      photoPreviewUrl: "",
      photoFileName: e.photoUrl ? e.photoUrl.split("/").pop() || "Photo" : "",
      receiptUrl: e.receiptUrl || "",
      receiptPreviewUrl: "",
      receiptFileName: e.receiptUrl ? e.receiptUrl.split("/").pop() || "Receipt" : "",
      receiptMimeType: "",
      notes: e.notes || "",
    });
    setOpen(true);
  };

  const isEditing = !!editingId;
  const createsInventory =
    !isEditing && form.category !== "repair" && form.category !== "insurance";

  const { data: expenses = [], isLoading } = useQuery<any[]>({
    queryKey: ["/api/properties", propertyId, "expenses"],
    queryFn: async () => {
      const res = await fetch(`/api/properties/${propertyId}/expenses`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load expenses");
      return res.json();
    },
  });

  const buildExpensePayload = () => ({
    description: form.description,
    category: form.category,
    expenseDate: form.expenseDate,
    amount: form.amount,
    currency: form.currency,
    warrantyExpiry: form.warrantyExpiry || null,
    warrantyNotes: form.warrantyNotes || null,
    photoUrl: form.photoUrl || null,
    receiptUrl: form.receiptUrl || null,
    supplier: form.supplier || null,
    supplierContact: form.supplierContact || null,
    notes: form.notes || null,
  });

  const createMutation = useMutation({
    mutationFn: async () =>
      apiRequest("POST", `/api/properties/${propertyId}/expenses`, buildExpensePayload()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/properties", propertyId, "expenses"] });
      if (createsInventory) {
        queryClient.invalidateQueries({ queryKey: ["/api/asset-inventory"] });
        queryClient.invalidateQueries({ queryKey: ["/api/asset-inventory/property", propertyId] });
      }
      resetExpenseForm();
      setOpen(false);
      toast({
        title: "Expense saved",
        description: createsInventory
          ? "An inventory item was also created for this purchase."
          : undefined,
      });
    },
    onError: (err: Error) => {
      saveInFlightRef.current = false;
      toast({ variant: "destructive", title: "Error", description: err.message });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async () => {
      if (!editingId) throw new Error("No expense selected");
      return apiRequest(
        "PATCH",
        `/api/properties/${propertyId}/expenses/${editingId}`,
        buildExpensePayload(),
      );
    },
    onSuccess: () => {
      resetExpenseForm();
      queryClient.invalidateQueries({ queryKey: ["/api/properties", propertyId, "expenses"] });
      setOpen(false);
      toast({ title: "Expense updated" });
    },
    onError: (err: Error) => {
      saveInFlightRef.current = false;
      toast({ variant: "destructive", title: "Error", description: err.message });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (expenseId: string) =>
      apiRequest("DELETE", `/api/properties/${propertyId}/expenses/${expenseId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/properties", propertyId, "expenses"] });
      queryClient.invalidateQueries({ queryKey: ["/api/asset-inventory"] });
      queryClient.invalidateQueries({ queryKey: ["/api/asset-inventory/property", propertyId] });
      setExpenseToDelete(null);
      toast({ title: "Expense deleted" });
    },
    onError: (err: Error) =>
      toast({ variant: "destructive", title: "Error", description: err.message }),
  });

  const isSaving = createMutation.isPending || updateMutation.isPending;

  const handleSaveExpense = () => {
    if (saveInFlightRef.current || isSaving) return;
    saveInFlightRef.current = true;
    if (isEditing) updateMutation.mutate();
    else createMutation.mutate();
  };

  return (
    <Card>
      <CardHeader className="flex flex-col sm:flex-row items-start justify-between gap-4">
        <div className={cn("min-w-0", textBreak)}>
          <CardTitle className="flex items-center gap-2">
            <Receipt className="h-5 w-5 shrink-0" />
            Expenses
          </CardTitle>
          <CardDescription>
            Log property spend (e.g. appliances). Purchases outside repair/insurance also add an inventory item.
          </CardDescription>
        </div>
        <Button
          size="sm"
          className="shrink-0"
          onClick={openCreate}
          data-testid="button-add-expense"
        >
          <Plus className="h-4 w-4 mr-1" />
          Add Expense
        </Button>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        ) : expenses.length === 0 ? (
          <p className="text-sm text-muted-foreground">No expenses recorded yet.</p>
        ) : (
          <div className="space-y-3">
            {expenses.map((e) => (
              <div
                key={e.id}
                className="rounded-lg border p-3 flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 min-w-0"
              >
                <div className="flex gap-3 min-w-0 flex-1">
                  {e.photoUrl ? (
                    <PreviewableImage
                      src={receiptHref(e.photoUrl)}
                      alt={e.description || "Expense photo"}
                      title={e.description || "Expense photo"}
                      className="h-14 w-14 rounded object-cover border bg-background shrink-0"
                    />
                  ) : null}
                  <div className={cn("min-w-0", textBreak)}>
                    <div className="font-medium">{e.description}</div>
                    <div className="text-xs text-muted-foreground capitalize">
                      {e.category} · {e.expenseDate ? new Date(e.expenseDate).toLocaleDateString() : ""}
                      {e.supplier ? ` · ${e.supplier}` : ""}
                    </div>
                    <div className="text-sm mt-1">{money(e.amount, e.currency)}</div>
                    {e.warrantyExpiry && (
                      <div className="text-xs text-muted-foreground">
                        Warranty until {new Date(e.warrantyExpiry).toLocaleDateString()}
                      </div>
                    )}
                    {e.assetInventoryId ? (
                      <div className="text-xs text-muted-foreground mt-1">Linked to inventory</div>
                    ) : null}
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0 self-start">
                  {e.receiptUrl ? (
                    <a
                      href={receiptHref(e.receiptUrl)}
                      target="_blank"
                      rel="noreferrer"
                      className="text-sm text-primary underline"
                    >
                      Receipt
                    </a>
                  ) : (
                    <span className="text-xs text-muted-foreground">No receipt</span>
                  )}
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    aria-label="Edit expense"
                    data-testid={`button-edit-expense-${e.id}`}
                    onClick={() => openEdit(e)}
                  >
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-destructive hover:text-destructive"
                    aria-label="Delete expense"
                    data-testid={`button-delete-expense-${e.id}`}
                    onClick={() =>
                      setExpenseToDelete({ id: e.id, description: e.description || "Expense" })
                    }
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>

      <DeleteConfirmDialog
        open={!!expenseToDelete}
        onOpenChange={(next) => {
          if (!next) setExpenseToDelete(null);
        }}
        title="Delete expense?"
        description="This cannot be undone. You are about to delete"
        itemName={expenseToDelete?.description}
        isPending={deleteMutation.isPending}
        onConfirm={() => {
          if (expenseToDelete) deleteMutation.mutate(expenseToDelete.id);
        }}
      />

      <Dialog
        open={open}
        onOpenChange={(next) => {
          setOpen(next);
          if (!next) resetExpenseForm();
        }}
      >
        <DialogContent className={cn(dialogContentBase, "max-w-lg")}>
          <DialogHeader>
            <DialogTitle>{isEditing ? "Edit Expense" : "Add Expense"}</DialogTitle>
            <DialogDescription>
              {isEditing ? "Update this property expense." : "Record a property expense."}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label required>Description</Label>
              <Input
                value={form.description}
                onChange={(ev) => setForm((f) => ({ ...f, description: ev.target.value }))}
                placeholder="e.g. Washing machine"
              />
            </div>
            <div className={formGrid2}>
              <div>
                <Label required>Category</Label>
                <Select value={form.category} onValueChange={(v) => setForm((f) => ({ ...f, category: v }))}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {["appliance", "repair", "furnishing", "utilities", "insurance", "other"].map((c) => (
                      <SelectItem key={c} value={c}>
                        {c}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label required>Date</Label>
                <LocaleDateInput
                  value={form.expenseDate || null}
                  onChange={(ymd) => setForm((f) => ({ ...f, expenseDate: ymd || "" }))}
                />
              </div>
            </div>
            {isEditing ? (
              linkedAssetId ? (
                <p className="text-xs text-muted-foreground">
                  This expense is linked to an inventory item. Editing here updates the expense only.
                </p>
              ) : null
            ) : createsInventory ? (
              <p className="text-xs text-muted-foreground">
                This category will also create an inventory item using the description, amount, date, supplier, and photo.
              </p>
            ) : (
              <p className="text-xs text-muted-foreground">
                Repair and insurance expenses are not added to inventory.
              </p>
            )}
            <div className={formGrid2}>
              <div>
                <Label>Supplier</Label>
                <Input value={form.supplier} onChange={(ev) => setForm((f) => ({ ...f, supplier: ev.target.value }))} />
              </div>
              <div>
                <Label>Supplier contact</Label>
                <Input
                  value={form.supplierContact}
                  onChange={(ev) => setForm((f) => ({ ...f, supplierContact: ev.target.value }))}
                />
              </div>
            </div>
            <div className={formGrid2}>
              <div>
                <Label required>Amount</Label>
                <Input value={form.amount} onChange={(ev) => setForm((f) => ({ ...f, amount: ev.target.value }))} />
              </div>
              <div>
                <Label required>Currency</Label>
                <Select value={form.currency} onValueChange={(v) => setForm((f) => ({ ...f, currency: v }))}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {["GBP", "USD", "EUR", "AED"].map((c) => (
                      <SelectItem key={c} value={c}>
                        {c}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className={formGrid2}>
              <div>
                <Label>Warranty expiry</Label>
                <LocaleDateInput
                  value={form.warrantyExpiry || null}
                  onChange={(ymd) => setForm((f) => ({ ...f, warrantyExpiry: ymd || "" }))}
                  disablePast={!isEditing}
                />
              </div>
              <div>
                <Label>Warranty notes</Label>
                <Input
                  value={form.warrantyNotes}
                  onChange={(ev) => setForm((f) => ({ ...f, warrantyNotes: ev.target.value }))}
                />
              </div>
            </div>
            <div>
              <Label>Notes</Label>
              <Textarea value={form.notes} onChange={(ev) => setForm((f) => ({ ...f, notes: ev.target.value }))} />
            </div>
            <div>
              <Label>Picture (optional)</Label>
              {!form.photoUrl ? (
                <ModernFilePickerInline
                  onFilesSelected={async (files) => {
                    const file = files[0];
                    if (!file) return;
                    setIsUploadingPhoto(true);
                    setPhotoUploadProgress(0);
                    try {
                      const uploaded = await uploadSelectedFile(file, setPhotoUploadProgress);
                      setForm((f) => ({
                        ...f,
                        photoUrl: uploaded.path,
                        photoPreviewUrl: uploaded.previewUrl,
                        photoFileName: uploaded.fileName || "Photo",
                      }));
                      toast({ title: "Picture uploaded" });
                    } catch (err: any) {
                      toast({
                        variant: "destructive",
                        title: "Upload failed",
                        description: err?.message || "Could not attach picture",
                      });
                    } finally {
                      setIsUploadingPhoto(false);
                      setPhotoUploadProgress(0);
                    }
                  }}
                  maxFiles={1}
                  accept="image/*"
                  multiple={false}
                  isUploading={isUploadingPhoto}
                  uploadProgress={photoUploadProgress}
                  height={200}
                />
              ) : (
                <ReceiptAttachmentPreview
                  kind="picture"
                  url={form.photoUrl}
                  previewUrl={form.photoPreviewUrl || undefined}
                  fileName={form.photoFileName || "Photo"}
                  mimeType="image/jpeg"
                  onRemove={() => {
                    if (form.photoPreviewUrl) URL.revokeObjectURL(form.photoPreviewUrl);
                    setForm((f) => ({
                      ...f,
                      photoUrl: "",
                      photoPreviewUrl: "",
                      photoFileName: "",
                    }));
                  }}
                />
              )}
            </div>
            <div>
              <Label>Receipt (optional)</Label>
              {!form.receiptUrl ? (
                <ModernFilePickerInline
                  onFilesSelected={async (files) => {
                    const file = files[0];
                    if (!file) return;
                    setIsUploadingReceipt(true);
                    setReceiptUploadProgress(0);
                    try {
                      const uploaded = await uploadSelectedFile(file, setReceiptUploadProgress);
                      setForm((f) => ({
                        ...f,
                        receiptUrl: uploaded.path,
                        receiptPreviewUrl: uploaded.previewUrl,
                        receiptFileName: uploaded.fileName || "Receipt",
                        receiptMimeType: uploaded.mimeType,
                      }));
                      toast({ title: "Receipt uploaded" });
                    } catch (err: any) {
                      toast({
                        variant: "destructive",
                        title: "Upload failed",
                        description: err?.message || "Could not attach receipt",
                      });
                    } finally {
                      setIsUploadingReceipt(false);
                      setReceiptUploadProgress(0);
                    }
                  }}
                  maxFiles={1}
                  accept="image/*,.pdf,application/pdf"
                  multiple={false}
                  isUploading={isUploadingReceipt}
                  uploadProgress={receiptUploadProgress}
                  height={200}
                />
              ) : (
                <ReceiptAttachmentPreview
                  url={form.receiptUrl}
                  previewUrl={form.receiptPreviewUrl || undefined}
                  fileName={form.receiptFileName}
                  mimeType={form.receiptMimeType}
                  onRemove={() => {
                    if (form.receiptPreviewUrl) URL.revokeObjectURL(form.receiptPreviewUrl);
                    setForm((f) => ({
                      ...f,
                      receiptUrl: "",
                      receiptPreviewUrl: "",
                      receiptFileName: "",
                      receiptMimeType: "",
                    }));
                  }}
                />
              )}
            </div>
          </div>
          <DialogFooter className={cn(dialogFooterSticky)}>
            <Button
              variant="outline"
              onClick={() => {
                setOpen(false);
                resetExpenseForm();
              }}
            >
              Cancel
            </Button>
            <Button
              disabled={!form.description || !form.amount || !form.expenseDate || isSaving}
              onClick={handleSaveExpense}
            >
              {isSaving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              {isEditing ? "Save Changes" : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

export function PropertyRentCollectionPanel({ propertyId }: { propertyId: string }) {
  const { toast } = useToast();
  const [filter, setFilter] = useState<"outstanding" | "all" | "collected">("outstanding");
  const [confirmPeriod, setConfirmPeriod] = useState<any | null>(null);

  const { data: periods = [], isLoading } = useQuery<any[]>({
    queryKey: ["/api/properties", propertyId, "rent-periods"],
    queryFn: async () => {
      const res = await fetch(`/api/properties/${propertyId}/rent-periods`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load rent periods");
      return res.json();
    },
  });

  const filtered = useMemo(() => {
    return periods.filter((p) => {
      if (filter === "all") return true;
      if (filter === "collected") return p.status === "collected";
      return p.status === "due" || p.status === "partial";
    });
  }, [periods, filter]);

  const collectMutation = useMutation({
    mutationFn: async (periodId: string) =>
      apiRequest("PATCH", `/api/properties/${propertyId}/rent-periods/${periodId}`, {
        status: "collected",
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/properties", propertyId, "rent-periods"] });
      toast({ title: "Marked as collected" });
    },
    onError: (e: Error) => toast({ variant: "destructive", title: "Error", description: e.message }),
  });

  const reminderMutation = useMutation({
    mutationFn: async (periodId: string) =>
      apiRequest("POST", `/api/properties/${propertyId}/rent-periods/${periodId}/send-reminder`, {}),
    onSuccess: () => {
      setConfirmPeriod(null);
      toast({ title: "Reminder sent successfully." });
    },
    onError: (e: Error) => toast({ variant: "destructive", title: "Error", description: e.message }),
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Banknote className="h-5 w-5" />
          Rent Collection
        </CardTitle>
        <CardDescription>
          Outstanding rent for this property. Amounts are full monthly rent (no automatic proration) — edit a
          period to adjust. Periods are created when a lease is saved, not when you open this tab.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap gap-2">
          {(["outstanding", "all", "collected"] as const).map((f) => (
            <Button
              key={f}
              size="sm"
              variant={filter === f ? "default" : "outline"}
              onClick={() => setFilter(f)}
              className="capitalize"
            >
              {f}
            </Button>
          ))}
        </div>

        {isLoading ? (
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        ) : filtered.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No rent periods yet. Set monthly rent and lease dates on the Tenants tab, then save the lease.
          </p>
        ) : (
          <div className="overflow-x-auto -mx-1 px-1 min-w-0">
            <Table className="[&_th]:bg-muted/40 [&_td]:py-3">
              <TableHeader>
                <TableRow>
                  <TableHead className="min-w-[8rem]">Tenant</TableHead>
                  <TableHead className="min-w-[6rem] hidden sm:table-cell">Period</TableHead>
                  <TableHead className="hidden md:table-cell">Due</TableHead>
                  <TableHead>Rent</TableHead>
                  <TableHead className="hidden sm:table-cell">Paid</TableHead>
                  <TableHead>Outstanding</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right min-w-[10rem]">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((p) => {
                  const canRemind =
                    (p.status === "due" || p.status === "partial") && p.hasTenantEmail;
                  const statusLabel = p.isOverdue ? "Overdue" : p.status;
                  return (
                    <TableRow key={p.id}>
                      <TableCell className={cn(textBreak, "max-w-[12rem]")}>
                        <div className="font-medium">{p.tenantName}</div>
                        {!p.hasTenantEmail && (
                          <div className="flex items-center gap-1 text-xs text-amber-700 dark:text-amber-400 mt-1">
                            <AlertTriangle className="h-3 w-3" />
                            No tenant email address
                          </div>
                        )}
                      </TableCell>
                      <TableCell className="hidden sm:table-cell">{p.periodLabel}</TableCell>
                      <TableCell className="hidden md:table-cell">{new Date(p.dueDate).toLocaleDateString()}</TableCell>
                      <TableCell>{money(p.amountDue, p.currency)}</TableCell>
                      <TableCell className="hidden sm:table-cell">{money(p.amountPaid, p.currency)}</TableCell>
                      <TableCell className="font-medium">{money(p.amountOutstanding, p.currency)}</TableCell>
                      <TableCell>
                        <Badge variant={p.isOverdue ? "destructive" : "secondary"} className="capitalize">
                          {statusLabel}
                          {p.isOverdue && p.daysOverdue > 0 ? ` (${p.daysOverdue}d)` : ""}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex flex-col sm:flex-row sm:justify-end gap-1">
                        {(p.status === "due" || p.status === "partial") && (
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={collectMutation.isPending}
                            onClick={() => collectMutation.mutate(p.id)}
                          >
                            Mark Collected
                          </Button>
                        )}
                        {(p.status === "due" || p.status === "partial") && (
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={!canRemind || reminderMutation.isPending}
                            title={!p.hasTenantEmail ? "No tenant email address" : undefined}
                            onClick={() => setConfirmPeriod(p)}
                          >
                            <Mail className="h-3 w-3 mr-1" />
                            Send Reminder
                          </Button>
                        )}
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>

      <Dialog open={!!confirmPeriod} onOpenChange={(o) => !o && setConfirmPeriod(null)}>
        <DialogContent className={cn(dialogContentBase, "max-w-md")}>
          <DialogHeader>
            <DialogTitle>Send Rent Reminder?</DialogTitle>
            <DialogDescription>Uses the overdue reminder template from Settings.</DialogDescription>
          </DialogHeader>
          {confirmPeriod && (
            <div className={cn("space-y-2 text-sm", textBreak)}>
              <p>
                <span className="text-muted-foreground">Tenant:</span> {confirmPeriod.tenantName}
              </p>
              <p>
                <span className="text-muted-foreground">Rent period:</span> {confirmPeriod.periodLabel}
              </p>
              <p>
                <span className="text-muted-foreground">Amount outstanding:</span>{" "}
                {money(confirmPeriod.amountOutstanding, confirmPeriod.currency)}
              </p>
            </div>
          )}
          <DialogFooter className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button variant="outline" onClick={() => setConfirmPeriod(null)}>
              Cancel
            </Button>
            <Button
              disabled={reminderMutation.isPending}
              onClick={() => confirmPeriod && reminderMutation.mutate(confirmPeriod.id)}
            >
              {reminderMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Send Reminder
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
