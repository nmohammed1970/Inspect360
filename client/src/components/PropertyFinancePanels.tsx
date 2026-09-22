import { useMemo, useState } from "react";
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
import { ObjectUploader } from "@/components/ObjectUploader";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { billingCurrencySymbol } from "@shared/billingCurrencies";
import { AlertTriangle, Banknote, FileText, Loader2, Mail, Plus, Receipt, Wallet, X } from "lucide-react";
import { PreviewableImage } from "@/components/ImagePreview";

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
}: {
  url: string;
  previewUrl?: string;
  fileName?: string;
  mimeType?: string;
  onRemove: () => void;
}) {
  const href = receiptHref(url);
  const displaySrc = previewUrl || href;
  const label = fileName || url.split("/").pop() || "Receipt";
  const showImage = isImageReceipt(mimeType || fileName || url);

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
            Open receipt
          </a>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-8 w-8 shrink-0"
          aria-label="Remove receipt"
          onClick={onRemove}
        >
          <X className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}

async function getUploadParams() {
  const response = await fetch("/api/objects/upload", { method: "POST", credentials: "include" });
  const { uploadURL } = await response.json();
  return { method: "PUT" as const, url: uploadURL };
}

async function finalizeUpload(uploadURL: string): Promise<string> {
  // Normalize to /objects/<id> path
  let objectPath = uploadURL;
  if (uploadURL.includes("/objects/")) {
    objectPath = `/objects/${uploadURL.split("/objects/")[1]?.split("?")[0]}`;
  } else if (!uploadURL.startsWith("/")) {
    objectPath = `/${uploadURL}`;
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
    const errorData = await response.json().catch(() => ({ error: "Failed to finalize upload" }));
    throw new Error(errorData.error || "Failed to finalize upload");
  }
  const data = await response.json().catch(() => ({}));
  return (data.objectPath as string) || objectPath;
}

function todayYmdLocal(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function PropertyDepositPanel({ propertyId, preferredCurrency = "GBP" }: Props) {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
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

  const resetDepositForm = () =>
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

  const createMutation = useMutation({
    mutationFn: async () => {
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
      return apiRequest("POST", `/api/properties/${propertyId}/deposits`, {
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
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/properties", propertyId, "deposits"] });
      resetDepositForm();
      setOpen(false);
      toast({ title: "Deposit recorded" });
    },
    onError: (e: Error) => toast({ variant: "destructive", title: "Error", description: e.message }),
  });

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
      <CardHeader className="flex flex-row items-start justify-between gap-4">
        <div>
          <CardTitle className="flex items-center gap-2">
            <Wallet className="h-5 w-5" />
            Deposit
          </CardTitle>
          <CardDescription>
            Record deposits held, returned, or deducted for tenancies on this property.
          </CardDescription>
        </div>
        <Button
          size="sm"
          onClick={() => {
            resetDepositForm();
            setOpen(true);
          }}
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
              <div key={d.id} className="rounded-lg border p-3 flex flex-wrap justify-between gap-2">
                <div>
                  <div className="font-medium">{money(d.amount, d.currency)}</div>
                  <div className="text-xs text-muted-foreground capitalize">{d.status.replace(/_/g, " ")}</div>
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
                {d.receiptUrl ? (
                  <a href={d.receiptUrl} target="_blank" rel="noreferrer" className="text-sm text-primary underline">
                    Receipt
                  </a>
                ) : (
                  <span className="text-xs text-muted-foreground">No receipt</span>
                )}
              </div>
            ))}
          </div>
        )}
      </CardContent>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] flex flex-col gap-0 p-0 overflow-hidden">
          <DialogHeader className="px-6 pt-6 pb-2">
            <DialogTitle>Add Deposit</DialogTitle>
            <DialogDescription>
              Record money actually received. Choosing a tenant with a lease deposit only fills the amount — click Save to add it to the list.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 px-6 py-2 overflow-y-auto flex-1 min-h-0">
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
            <div className="grid grid-cols-2 gap-3">
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
            <div className="grid grid-cols-2 gap-3">
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
            <div className="grid grid-cols-2 gap-3">
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
                <ObjectUploader
                  maxNumberOfFiles={1}
                  accept=".pdf,.png,.jpg,.jpeg,.webp,application/pdf,image/*"
                  onGetUploadParameters={getUploadParams}
                  onComplete={async (result: any) => {
                    const uploaded = result?.successful?.[0];
                    if (!uploaded?.uploadURL) {
                      toast({
                        variant: "destructive",
                        title: "Upload failed",
                        description: "No file was returned from the uploader.",
                      });
                      return;
                    }
                    try {
                      const mime = uploaded.type || uploaded.data?.type || "";
                      let previewUrl = "";
                      if (uploaded.data instanceof File && mime.startsWith("image/")) {
                        previewUrl = URL.createObjectURL(uploaded.data);
                      }
                      const path = await finalizeUpload(uploaded.uploadURL);
                      setForm((f) => ({
                        ...f,
                        receiptUrl: path,
                        receiptPreviewUrl: previewUrl,
                        receiptFileName: uploaded.name || "Receipt",
                        receiptMimeType: mime,
                      }));
                      toast({ title: "Receipt uploaded" });
                    } catch (e: any) {
                      toast({
                        variant: "destructive",
                        title: "Upload failed",
                        description: e?.message || "Could not attach receipt",
                      });
                    }
                  }}
                >
                  Upload receipt
                </ObjectUploader>
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
          <DialogFooter className="px-6 py-4 border-t shrink-0">
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button
              disabled={
                !form.tenantAssignmentId ||
                !form.amount ||
                !settlementOk ||
                (deductedNum > 0 && !form.deductionReason.trim()) ||
                createMutation.isPending
              }
              onClick={() => createMutation.mutate()}
            >
              {createMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Save
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
    receiptUrl: "",
    receiptPreviewUrl: "",
    receiptFileName: "",
    receiptMimeType: "",
    notes: "",
  });

  const resetExpenseForm = () =>
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
      receiptUrl: "",
      receiptPreviewUrl: "",
      receiptFileName: "",
      receiptMimeType: "",
      notes: "",
    });

  const { data: expenses = [], isLoading } = useQuery<any[]>({
    queryKey: ["/api/properties", propertyId, "expenses"],
    queryFn: async () => {
      const res = await fetch(`/api/properties/${propertyId}/expenses`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load expenses");
      return res.json();
    },
  });

  const createMutation = useMutation({
    mutationFn: async () =>
      apiRequest("POST", `/api/properties/${propertyId}/expenses`, {
        description: form.description,
        category: form.category,
        expenseDate: form.expenseDate,
        amount: form.amount,
        currency: form.currency,
        warrantyExpiry: form.warrantyExpiry || null,
        warrantyNotes: form.warrantyNotes || null,
        receiptUrl: form.receiptUrl || null,
        supplier: form.supplier || null,
        supplierContact: form.supplierContact || null,
        notes: form.notes || null,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/properties", propertyId, "expenses"] });
      resetExpenseForm();
      setOpen(false);
      toast({ title: "Expense saved" });
    },
    onError: (e: Error) => toast({ variant: "destructive", title: "Error", description: e.message }),
  });

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-4">
        <div>
          <CardTitle className="flex items-center gap-2">
            <Receipt className="h-5 w-5" />
            Expenses
          </CardTitle>
          <CardDescription>
            Log property spend (e.g. appliances).
          </CardDescription>
        </div>
        <Button
          size="sm"
          onClick={() => {
            resetExpenseForm();
            setOpen(true);
          }}
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
              <div key={e.id} className="rounded-lg border p-3 flex flex-wrap justify-between gap-2">
                <div>
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
                </div>
                {e.receiptUrl ? (
                  <a href={e.receiptUrl} target="_blank" rel="noreferrer" className="text-sm text-primary underline">
                    Receipt
                  </a>
                ) : (
                  <span className="text-xs text-muted-foreground">No receipt</span>
                )}
              </div>
            ))}
          </div>
        )}
      </CardContent>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Add Expense</DialogTitle>
            <DialogDescription>Record a property expense.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label required>Description</Label>
              <Input
                value={form.description}
                onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                placeholder="e.g. Washing machine"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
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
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Supplier</Label>
                <Input value={form.supplier} onChange={(e) => setForm((f) => ({ ...f, supplier: e.target.value }))} />
              </div>
              <div>
                <Label>Supplier contact</Label>
                <Input
                  value={form.supplierContact}
                  onChange={(e) => setForm((f) => ({ ...f, supplierContact: e.target.value }))}
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label required>Amount</Label>
                <Input value={form.amount} onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))} />
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
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Warranty expiry</Label>
                <LocaleDateInput
                  value={form.warrantyExpiry || null}
                  onChange={(ymd) => setForm((f) => ({ ...f, warrantyExpiry: ymd || "" }))}
                  disablePast
                />
              </div>
              <div>
                <Label>Warranty notes</Label>
                <Input
                  value={form.warrantyNotes}
                  onChange={(e) => setForm((f) => ({ ...f, warrantyNotes: e.target.value }))}
                />
              </div>
            </div>
            <div>
              <Label>Notes</Label>
              <Textarea value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} />
            </div>
            <div>
              <Label>Receipt (optional)</Label>
              {!form.receiptUrl ? (
                <ObjectUploader
                  maxNumberOfFiles={1}
                  accept=".pdf,.png,.jpg,.jpeg,.webp,application/pdf,image/*"
                  onGetUploadParameters={getUploadParams}
                  onComplete={async (result: any) => {
                    const uploaded = result?.successful?.[0];
                    if (!uploaded?.uploadURL) {
                      toast({
                        variant: "destructive",
                        title: "Upload failed",
                        description: "No file was returned from the uploader.",
                      });
                      return;
                    }
                    try {
                      const mime = uploaded.type || uploaded.data?.type || "";
                      let previewUrl = "";
                      if (uploaded.data instanceof File && mime.startsWith("image/")) {
                        previewUrl = URL.createObjectURL(uploaded.data);
                      }
                      const path = await finalizeUpload(uploaded.uploadURL);
                      setForm((f) => ({
                        ...f,
                        receiptUrl: path,
                        receiptPreviewUrl: previewUrl,
                        receiptFileName: uploaded.name || "Receipt",
                        receiptMimeType: mime,
                      }));
                      toast({ title: "Receipt uploaded" });
                    } catch (e: any) {
                      toast({
                        variant: "destructive",
                        title: "Upload failed",
                        description: e?.message || "Could not attach receipt",
                      });
                    }
                  }}
                >
                  Upload receipt
                </ObjectUploader>
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
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button
              disabled={!form.description || !form.amount || !form.expenseDate || createMutation.isPending}
              onClick={() => createMutation.mutate()}
            >
              {createMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Save
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
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Tenant</TableHead>
                  <TableHead>Period</TableHead>
                  <TableHead>Due</TableHead>
                  <TableHead>Rent</TableHead>
                  <TableHead>Paid</TableHead>
                  <TableHead>Outstanding</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((p) => {
                  const canRemind =
                    (p.status === "due" || p.status === "partial") && p.hasTenantEmail;
                  const statusLabel = p.isOverdue ? "Overdue" : p.status;
                  return (
                    <TableRow key={p.id}>
                      <TableCell>
                        <div className="font-medium">{p.tenantName}</div>
                        {!p.hasTenantEmail && (
                          <div className="flex items-center gap-1 text-xs text-amber-700 dark:text-amber-400 mt-1">
                            <AlertTriangle className="h-3 w-3" />
                            No tenant email address
                          </div>
                        )}
                      </TableCell>
                      <TableCell>{p.periodLabel}</TableCell>
                      <TableCell>{new Date(p.dueDate).toLocaleDateString()}</TableCell>
                      <TableCell>{money(p.amountDue, p.currency)}</TableCell>
                      <TableCell>{money(p.amountPaid, p.currency)}</TableCell>
                      <TableCell className="font-medium">{money(p.amountOutstanding, p.currency)}</TableCell>
                      <TableCell>
                        <Badge variant={p.isOverdue ? "destructive" : "secondary"} className="capitalize">
                          {statusLabel}
                          {p.isOverdue && p.daysOverdue > 0 ? ` (${p.daysOverdue}d)` : ""}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right space-x-1">
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
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Send Rent Reminder?</DialogTitle>
            <DialogDescription>Uses the overdue reminder template from Settings.</DialogDescription>
          </DialogHeader>
          {confirmPeriod && (
            <div className="space-y-2 text-sm">
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
          <DialogFooter>
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
