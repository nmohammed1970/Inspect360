import { useState, useRef } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useParams, Link } from "wouter";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import SignatureCanvas from "react-signature-canvas";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  FileText,
  ArrowLeft,
  MessageSquare,
  Pen,
  TrendingDown,
  Calculator,
  Image as ImageIcon,
  AlertCircle,
  Check,
  User,
  Send,
  Save,
  Lock,
  Eye,
  EyeOff,
  Settings,
  CheckCircle,
  Download,
  Loader2,
  Mail,
  Paperclip,
  Trash2
} from "lucide-react";
import { format } from "date-fns";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useAuth } from "@/hooks/useAuth";
import { useLocale } from "@/contexts/LocaleContext";

interface ComparisonReport {
  id: string;
  propertyId: string;
  tenantId: string;
  status: string;
  totalEstimatedCost: string;
  aiAnalysisJson: any;
  operatorSignature: string | null;
  operatorSignedAt: string | null;
  tenantSignature: string | null;
  tenantSignedAt: string | null;
  createdAt: string;
  items: ComparisonReportItem[];
}

interface ComparisonReportItem {
  id: string;
  comparisonReportId: string;
  sectionRef: string;
  fieldKey: string;
  itemRef: string | null;
  aiComparisonJson: any;
  aiSummary: string | null;
  estimatedCost: string;
  depreciation: string;
  finalCost: string;
  liabilityDecision: string;
  status: string;
  checkInEntryId: string | null;
  checkOutEntryId: string;
  checkInPhotos?: string[];
  checkOutPhotos?: string[];
}

interface Comment {
  id: string;
  userId: string;
  authorName: string;
  authorRole: string;
  content: string;
  isInternal: boolean;
  createdAt: string;
}

const statusConfig: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  draft: { label: "Draft", variant: "secondary" },
  under_review: { label: "Under Review", variant: "default" },
  awaiting_signatures: { label: "Awaiting Signatures", variant: "destructive" },
  signed: { label: "Signed", variant: "outline" },
  filed: { label: "Filed", variant: "secondary" },
};

const itemStatusOptions = [
  { value: "pending", label: "Pending Review" },
  { value: "reviewed", label: "Reviewed" },
  { value: "disputed", label: "Disputed" },
  { value: "resolved", label: "Resolved" },
  { value: "waived", label: "Waived" },
];

const liabilityOptions = [
  { value: "tenant", label: "Tenant Liable" },
  { value: "landlord", label: "Landlord Responsible" },
  { value: "shared", label: "Shared Responsibility" },
  { value: "waived", label: "Waived" },
];

const reportStatusOptions = [
  { value: "draft", label: "Draft" },
  { value: "under_review", label: "Under Review" },
  { value: "awaiting_signatures", label: "Awaiting Signatures" },
  { value: "filed", label: "Filed" },
];

export default function ComparisonReportDetail() {
  const { id } = useParams();
  const { toast } = useToast();
  const { user } = useAuth();
  const locale = useLocale();
  const [commentText, setCommentText] = useState("");
  const [isInternalComment, setIsInternalComment] = useState(false);
  const [signatureDataUrl, setSignatureDataUrl] = useState<string | null>(null);
  const signaturePadRef = useRef<SignatureCanvas>(null);
  const [editingItem, setEditingItem] = useState<string | null>(null);
  const [itemEdits, setItemEdits] = useState<Record<string, any>>({});
  const [isDownloadingPdf, setIsDownloadingPdf] = useState(false);
  const [isSendingToFinance, setIsSendingToFinance] = useState(false);
  const [includeAttachmentForFinance, setIncludeAttachmentForFinance] = useState(true);

  // Download comparison report as PDF
  const handleDownloadPdf = async () => {
    if (!id) return;

    setIsDownloadingPdf(true);
    try {
      const response = await fetch(`/api/comparison-reports/${id}/pdf`, {
        credentials: 'include',
      });

      if (!response.ok) {
        throw new Error('Failed to generate PDF');
      }

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `comparison-report-${id}.pdf`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);

      toast({
        title: "PDF Downloaded",
        description: "Your comparison report has been downloaded successfully.",
      });
    } catch (error) {
      console.error('Error downloading PDF:', error);
      toast({
        variant: "destructive",
        title: "Download Failed",
        description: "Failed to download the comparison report PDF. Please try again.",
      });
    } finally {
      setIsDownloadingPdf(false);
    }
  };

  // Send comparison report to finance department
  const handleSendToFinance = async () => {
    if (!id) return;

    setIsSendingToFinance(true);
    try {
      const response = await apiRequest("POST", `/api/comparison-reports/${id}/send-to-finance`, {
        includePdf: includeAttachmentForFinance,
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || 'Failed to send report');
      }

      toast({
        title: "Sent to Finance",
        description: data.message || "The liability summary has been sent to your finance department.",
      });
    } catch (error: any) {
      console.error('Error sending to finance:', error);
      toast({
        variant: "destructive",
        title: "Send Failed",
        description: error.message || "Failed to send the report to finance. Please try again.",
      });
    } finally {
      setIsSendingToFinance(false);
    }
  };

  const { data: report, isLoading } = useQuery<ComparisonReport>({
    queryKey: ["/api/comparison-reports", id],
    enabled: !!id,
    select: (data) => {
      const items = data.items.map(item => {
        const aiAnalysis = item.aiComparisonJson || {};
        // Debug logging
        if (aiAnalysis.notes_comparison) {
          console.log(`[Frontend] Item ${item.id} has notes_comparison`);
        } else if (aiAnalysis.checkInNote && aiAnalysis.checkOutNote) {
          console.log(`[Frontend] Item ${item.id} has both notes but no notes_comparison`);
        }
        return {
          ...item,
          checkInPhotos: aiAnalysis.checkInPhotos || [],
          checkOutPhotos: aiAnalysis.checkOutPhotos || [],
          // Ensure aiComparisonJson is preserved
          aiComparisonJson: item.aiComparisonJson || {},
        };
      });
      return { ...data, items };
    },
  });

  const { data: comments = [] } = useQuery<Comment[]>({
    queryKey: ["/api/comparison-reports", id, "comments"],
    enabled: !!id,
  });

  const updateReportMutation = useMutation({
    mutationFn: async (updates: any) => {
      const response = await apiRequest("PATCH", `/api/comparison-reports/${id}`, updates);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/comparison-reports", id] });
      toast({ title: "Report Updated", description: "Report status has been updated." });
    },
    onError: () => {
      toast({ variant: "destructive", title: "Error", description: "Failed to update report." });
    },
  });

  const updateItemMutation = useMutation({
    mutationFn: async ({ itemId, updates }: { itemId: string; updates: any }) => {
      const response = await apiRequest("PATCH", `/api/comparison-report-items/${itemId}`, {
        ...updates,
        comparisonReportId: id,
      });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/comparison-reports", id] });
      setEditingItem(null);
      setItemEdits({});
      toast({ title: "Item Updated", description: "Item has been updated successfully." });
    },
    onError: () => {
      toast({ variant: "destructive", title: "Error", description: "Failed to update item." });
    },
  });

  const addCommentMutation = useMutation({
    mutationFn: async ({ content, isInternal }: { content: string; isInternal: boolean }) => {
      const response = await apiRequest("POST", `/api/comparison-reports/${id}/comments`, {
        content,
        isInternal
      });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/comparison-reports", id, "comments"] });
      setCommentText("");
      toast({ title: "Comment Added", description: isInternalComment ? "Internal note added." : "Message sent to tenant." });
    },
    onError: () => {
      toast({ variant: "destructive", title: "Error", description: "Failed to add comment." });
    },
  });

  const signMutation = useMutation({
    mutationFn: async (signature: string) => {
      const response = await apiRequest("POST", `/api/comparison-reports/${id}/sign`, { signature });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/comparison-reports", id] });
      setSignatureDataUrl(null);
      if (signaturePadRef.current) {
        signaturePadRef.current.clear();
      }
      toast({ title: "Report Signed", description: "Your electronic signature has been recorded." });
    },
    onError: (error: any) => {
      toast({ variant: "destructive", title: "Error", description: error.message || "Failed to sign report." });
    },
  });

  const handleClearSignature = () => {
    if (signaturePadRef.current) {
      signaturePadRef.current.clear();
      setSignatureDataUrl(null);
    }
  };

  const handleSignReport = () => {
    if (signaturePadRef.current && !signaturePadRef.current.isEmpty()) {
      const signatureData = signaturePadRef.current.toDataURL();
      setSignatureDataUrl(signatureData);
      signMutation.mutate(signatureData);
    } else {
      toast({
        variant: "destructive",
        title: "Signature Required",
        description: "Please draw your signature before signing the report.",
      });
    }
  };

  const handleEditItem = (item: ComparisonReportItem) => {
    const aiAnalysis = item.aiComparisonJson || {};
    setEditingItem(item.id);
    setItemEdits({
      status: item.status || "pending",
      liabilityDecision: item.liabilityDecision || "tenant",
      estimatedCost: item.estimatedCost || "0",
      depreciation: item.depreciation || "0",
      finalCost: item.finalCost || "0",
      notesComparison: aiAnalysis.notes_comparison || "",
    });
  };

  const handleSaveItem = (itemId: string) => {
    // Get the current item to update aiComparisonJson
    const item = report?.items.find(i => i.id === itemId);
    if (!item) return;

    const aiComparisonJson = item.aiComparisonJson || {};
    const updates: any = {
      status: itemEdits.status,
      liabilityDecision: itemEdits.liabilityDecision,
      estimatedCost: itemEdits.estimatedCost,
      depreciation: itemEdits.depreciation,
      finalCost: itemEdits.finalCost,
    };

    // Update notes_comparison in aiComparisonJson if it was edited
    if (itemEdits.notesComparison !== undefined) {
      updates.aiComparisonJson = {
        ...aiComparisonJson,
        notes_comparison: itemEdits.notesComparison,
      };
    }

    updateItemMutation.mutate({ itemId, updates });
  };

  const recalculateFinalCost = () => {
    const estimated = parseFloat(itemEdits.estimatedCost || "0");
    const depreciation = parseFloat(itemEdits.depreciation || "0");
    const finalCost = Math.max(0, estimated - depreciation).toFixed(2);
    setItemEdits({ ...itemEdits, finalCost });
  };

  if (isLoading) {
    return (
      <div className="container mx-auto px-4 py-8 space-y-6">
        <Skeleton className="h-12 w-2/3" />
        <Skeleton className="h-64 w-full" />
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }

  if (!report) {
    return (
      <div className="container mx-auto px-4 py-8">
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16">
            <AlertCircle className="w-16 h-16 text-muted-foreground/50 mb-4" />
            <h3 className="text-xl font-semibold mb-2">Report Not Found</h3>
            <p className="text-muted-foreground mb-4">The comparison report you're looking for doesn't exist.</p>
            <Link href="/comparisons">
              <Button variant="outline">
                <ArrowLeft className="w-4 h-4 mr-2" />
                Back to Reports
              </Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  const statusInfo = statusConfig[report.status] || statusConfig.draft;
  const totalCost = parseFloat(report.totalEstimatedCost || "0");
  const isOperator = user?.role === "owner" || user?.role === "clerk";
  const canSign = isOperator && !report.operatorSignature &&
    (report.status === "awaiting_signatures" || report.status === "under_review");
  const canEdit = isOperator && report.status !== "signed" && report.status !== "filed";

  return (
    <div className="container mx-auto px-4 py-8 space-y-6" data-testid="page-comparison-detail">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div className="space-y-1">
          <Link href="/comparisons">
            <Button variant="ghost" size="sm" data-testid="button-back">
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back to Reports
            </Button>
          </Link>
          <h1 className="text-3xl font-bold flex items-center gap-3">
            <FileText className="w-8 h-8 text-primary" />
            Comparison Report
          </h1>
          <p className="text-muted-foreground">
            Generated on {format(new Date(report.createdAt), "MMMM d, yyyy 'at' h:mm a")}
          </p>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          <Button
            variant="outline"
            onClick={handleDownloadPdf}
            disabled={isDownloadingPdf}
            data-testid="button-download-pdf"
          >
            {isDownloadingPdf ? (
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            ) : (
              <Download className="w-4 h-4 mr-2" />
            )}
            {isDownloadingPdf ? "Generating..." : "Download PDF"}
          </Button>
          {isOperator && (
            <Button
              variant="outline"
              onClick={handleSendToFinance}
              disabled={isSendingToFinance}
              data-testid="button-send-to-finance"
            >
              {isSendingToFinance ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <Mail className="w-4 h-4 mr-2" />
              )}
              {isSendingToFinance ? "Sending..." : "Send to Finance"}
            </Button>
          )}
          {canEdit && (
            <Select
              value={report.status}
              onValueChange={(value) => updateReportMutation.mutate({ status: value })}
            >
              <SelectTrigger className="w-48" data-testid="select-report-status">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {reportStatusOptions.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          <Badge variant={statusInfo.variant} className="text-lg px-4 py-2">
            {statusInfo.label}
          </Badge>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Cost Summary</CardTitle>
          <CardDescription>Total estimated tenant liability after depreciation</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="text-4xl font-bold text-primary" data-testid="text-total-cost">
            {locale.formatCurrency(totalCost, false)}
          </div>
          <p className="text-sm text-muted-foreground mt-2">
            Based on {report.items.length} items marked for review
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Settings className="w-5 h-5" />
            Item-by-Item Analysis
          </CardTitle>
          <CardDescription>
            {canEdit ? "Click 'Edit' on any item to adjust liability, status, or costs" : "Detailed comparison of each marked item"}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {report.items.map((item, index) => {
            const aiAnalysis = item.aiComparisonJson || {};
            const isEditing = editingItem === item.id;
            const estimatedCost = isEditing ? parseFloat(itemEdits.estimatedCost || "0") : parseFloat(item.estimatedCost || "0");
            const depreciation = isEditing ? parseFloat(itemEdits.depreciation || "0") : parseFloat(item.depreciation || "0");
            const finalCost = isEditing ? parseFloat(itemEdits.finalCost || "0") : parseFloat(item.finalCost || "0");
            const currentStatus = isEditing ? itemEdits.status : (item.status || "pending");
            const currentLiability = isEditing ? itemEdits.liabilityDecision : (item.liabilityDecision || "tenant");
            const currentNotesComparison = isEditing ? (itemEdits.notesComparison || "") : (aiAnalysis.notes_comparison || "");

            return (
              <div key={item.id} className="space-y-4 pb-6 border-b last:border-b-0" data-testid={`item-${item.id}`}>
                <div className="flex items-start justify-between gap-4 flex-wrap">
                  <div>
                    <h3 className="text-lg font-semibold">
                      {index + 1}. {item.sectionRef} - {item.fieldKey}
                    </h3>
                    {item.itemRef && (
                      <p className="text-sm text-muted-foreground">{item.itemRef}</p>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    {!isEditing ? (
                      <>
                        <Badge variant={currentStatus === "reviewed" ? "default" : currentStatus === "disputed" ? "destructive" : "secondary"}>
                          {itemStatusOptions.find(o => o.value === currentStatus)?.label || currentStatus}
                        </Badge>
                        <Badge variant="outline">
                          {liabilityOptions.find(o => o.value === currentLiability)?.label || currentLiability}
                        </Badge>
                        {canEdit && (
                          <Button variant="outline" size="sm" onClick={() => handleEditItem(item)} data-testid={`button-edit-item-${item.id}`}>
                            <Pen className="w-4 h-4 mr-1" />
                            Edit
                          </Button>
                        )}
                      </>
                    ) : (
                      <>
                        <Button variant="outline" size="sm" onClick={() => setEditingItem(null)}>
                          Cancel
                        </Button>
                        <Button size="sm" onClick={() => handleSaveItem(item.id)} disabled={updateItemMutation.isPending} data-testid={`button-save-item-${item.id}`}>
                          <Save className="w-4 h-4 mr-1" />
                          Save
                        </Button>
                      </>
                    )}
                  </div>
                </div>

                {isEditing && (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 p-4 bg-muted rounded-lg">
                    <div className="space-y-2">
                      <Label>Item Status</Label>
                      <Select
                        value={itemEdits.status}
                        onValueChange={(value) => setItemEdits({ ...itemEdits, status: value })}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {itemStatusOptions.map((option) => (
                            <SelectItem key={option.value} value={option.value}>
                              {option.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label>Liability Decision</Label>
                      <Select
                        value={itemEdits.liabilityDecision}
                        onValueChange={(value) => setItemEdits({ ...itemEdits, liabilityDecision: value })}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {liabilityOptions.map((option) => (
                            <SelectItem key={option.value} value={option.value}>
                              {option.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label>Estimated Cost</Label>
                      <Input
                        type="number"
                        step="0.01"
                        value={itemEdits.estimatedCost}
                        onChange={(e) => setItemEdits({ ...itemEdits, estimatedCost: e.target.value })}
                        onBlur={recalculateFinalCost}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Depreciation</Label>
                      <Input
                        type="number"
                        step="0.01"
                        value={itemEdits.depreciation}
                        onChange={(e) => setItemEdits({ ...itemEdits, depreciation: e.target.value })}
                        onBlur={recalculateFinalCost}
                      />
                    </div>
                  </div>
                )}

                {((item.checkInPhotos && item.checkInPhotos.length > 0) || (item.checkOutPhotos && item.checkOutPhotos.length > 0)) && (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <h4 className="text-sm font-medium text-muted-foreground">Check-In Photos</h4>
                      <div className="grid grid-cols-2 gap-2">
                        {item.checkInPhotos && item.checkInPhotos.length > 0 ? (
                          item.checkInPhotos.map((photo, idx) => (
                            <img
                              key={idx}
                              src={photo}
                              alt={`Check-in ${idx + 1}`}
                              className="w-full h-32 object-cover rounded-lg border"
                            />
                          ))
                        ) : (
                          <div className="col-span-2 flex items-center justify-center h-32 bg-muted rounded-lg border border-dashed">
                            <p className="text-sm text-muted-foreground">No check-in photos</p>
                          </div>
                        )}
                      </div>
                    </div>
                    <div className="space-y-2">
                      <h4 className="text-sm font-medium text-muted-foreground">Check-Out Photos</h4>
                      <div className="grid grid-cols-2 gap-2">
                        {item.checkOutPhotos && item.checkOutPhotos.length > 0 ? (
                          item.checkOutPhotos.map((photo, idx) => (
                            <img
                              key={idx}
                              src={photo}
                              alt={`Check-out ${idx + 1}`}
                              className="w-full h-32 object-cover rounded-lg border"
                            />
                          ))
                        ) : (
                          <div className="col-span-2 flex items-center justify-center h-32 bg-muted rounded-lg border border-dashed">
                            <p className="text-sm text-muted-foreground">No check-out photos</p>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                )}

                {/* Always show AI comparison after photos if available */}
                {(item.aiSummary || aiAnalysis.differences) && (
                  <div className="mt-4 bg-blue-50 dark:bg-blue-950/20 p-4 rounded-lg border border-blue-200 dark:border-blue-800 space-y-2">
                    <h4 className="font-medium text-sm flex items-center gap-2 text-blue-900 dark:text-blue-100">
                      <ImageIcon className="w-4 h-4" />
                      AI Comparison Analysis
                    </h4>
                    <p className="text-sm text-blue-800 dark:text-blue-200 whitespace-pre-wrap">{item.aiSummary || aiAnalysis.differences}</p>
                  </div>
                )}

                {aiAnalysis.damage && (
                  <div className="bg-destructive/10 p-4 rounded-lg space-y-2">
                    <h4 className="font-medium text-sm flex items-center gap-2 text-destructive">
                      <AlertCircle className="w-4 h-4" />
                      Damage Assessment
                    </h4>
                    <p className="text-sm">{aiAnalysis.damage}</p>
                  </div>
                )}

                <div className="grid grid-cols-3 gap-4 pt-2">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <span className="w-4 h-4 flex items-center justify-center font-semibold">£</span>
                      Estimated Cost
                    </div>
                    <div className="text-lg font-semibold">{locale.formatCurrency(estimatedCost, false)}</div>
                  </div>
                  <div className="space-y-1">
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <TrendingDown className="w-4 h-4" />
                      Depreciation
                    </div>
                    <div className="text-lg font-semibold text-green-600 dark:text-green-400">
                      -{locale.formatCurrency(depreciation, false)}
                    </div>
                  </div>
                  <div className="space-y-1">
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Calculator className="w-4 h-4" />
                      Tenant Liability
                    </div>
                    <div className="text-lg font-semibold text-primary">
                      {locale.formatCurrency(finalCost, false)}
                    </div>
                  </div>
                </div>

                {/* Notes Comparison Section - Show if notes_comparison exists OR if both notes exist (will be generated) */}
                {(currentNotesComparison || (aiAnalysis.checkInNote && aiAnalysis.checkOutNote)) && (
                  <div className="mt-4 pt-4 border-t">
                    <div className="space-y-3">
                      <h4 className="text-sm font-medium text-muted-foreground">Notes Comparison</h4>

                      {/* AI Notes Comparison - Show comparison result or allow editing */}
                      {currentNotesComparison || isEditing ? (
                        <div className="space-y-1">
                          {isEditing ? (
                            <Textarea
                              value={itemEdits.notesComparison || ""}
                              onChange={(e) => setItemEdits({ ...itemEdits, notesComparison: e.target.value })}
                              className="min-h-[150px] font-sans"
                              placeholder="Enter notes comparison..."
                            />
                          ) : (
                            <div className="p-4 bg-blue-50 dark:bg-blue-950/20 rounded-lg border border-blue-200 dark:border-blue-800 text-sm whitespace-pre-wrap text-blue-900 dark:text-blue-100">
                              {currentNotesComparison}
                            </div>
                          )}
                        </div>
                      ) : (
                        <div className="space-y-1">
                          <div className="p-4 bg-muted rounded-lg text-sm text-muted-foreground">
                            Generating notes comparison...
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <MessageSquare className="w-5 h-5" />
            Discussion Thread
          </CardTitle>
          <CardDescription>
            Internal notes and tenant communication
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-3 max-h-96 overflow-y-auto">
            {comments.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">
                No comments yet. Start the discussion below.
              </p>
            ) : (
              comments.map((comment) => (
                <div
                  key={comment.id}
                  className={`p-4 rounded-lg ${comment.isInternal
                    ? "bg-amber-50 dark:bg-amber-950 border border-amber-200 dark:border-amber-800"
                    : comment.authorRole === "tenant"
                      ? "bg-primary/10 ml-8"
                      : "bg-muted mr-8"
                    }`}
                  data-testid={`comment-${comment.id}`}
                >
                  <div className="flex items-start justify-between mb-2 gap-2 flex-wrap">
                    <div className="flex items-center gap-2 flex-wrap">
                      <User className="w-4 h-4" />
                      <span className="text-sm font-medium">
                        {comment.authorName || (comment.authorRole === "tenant" ? "Tenant" : "Operator")}
                      </span>
                      <Badge variant="outline" className="text-xs">
                        {comment.authorRole === "tenant" ? "Tenant" : "Operator"}
                      </Badge>
                      {comment.isInternal && (
                        <Badge variant="secondary" className="text-xs gap-1">
                          <Lock className="w-3 h-3" />
                          Internal
                        </Badge>
                      )}
                    </div>
                    <span className="text-xs text-muted-foreground">
                      {format(new Date(comment.createdAt), "MMM d, h:mm a")}
                    </span>
                  </div>
                  <p className="text-sm whitespace-pre-wrap">{comment.content}</p>
                </div>
              ))
            )}
          </div>

          <Separator />

          {isOperator && (
            <div className="flex items-center gap-4 pb-2">
              <div className="flex items-center gap-2">
                <Switch
                  id="internal-comment"
                  checked={isInternalComment}
                  onCheckedChange={setIsInternalComment}
                  data-testid="switch-internal-comment"
                />
                <Label htmlFor="internal-comment" className="flex items-center gap-2 cursor-pointer">
                  {isInternalComment ? (
                    <>
                      <EyeOff className="w-4 h-4" />
                      Internal Note (hidden from tenant)
                    </>
                  ) : (
                    <>
                      <Eye className="w-4 h-4" />
                      Public Message (visible to tenant)
                    </>
                  )}
                </Label>
              </div>
            </div>
          )}

          <div className="flex gap-2">
            <Textarea
              placeholder={isInternalComment ? "Add internal note..." : "Type your message to tenant..."}
              value={commentText}
              onChange={(e) => setCommentText(e.target.value)}
              rows={2}
              className="flex-1"
              data-testid="input-comment"
            />
            <Button
              onClick={() => addCommentMutation.mutate({ content: commentText, isInternal: isInternalComment })}
              disabled={!commentText.trim() || addCommentMutation.isPending}
              data-testid="button-send-message"
            >
              <Send className="w-4 h-4" />
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Pen className="w-5 h-5" />
            Electronic Signatures
          </CardTitle>
          <CardDescription>
            Both parties must sign to finalize the report
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="flex items-center justify-between p-4 border rounded-lg gap-4 flex-wrap">
            <div className="space-y-1">
              <div className="font-medium flex items-center gap-2">
                <User className="w-4 h-4" />
                Operator Signature
              </div>
              {report.operatorSignature ? (
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <CheckCircle className="w-4 h-4 text-green-600" />
                    <span className="text-sm">Signed</span>
                  </div>
                  {report.operatorSignature.startsWith('data:image/') ? (
                    <img 
                      src={report.operatorSignature} 
                      alt="Operator signature" 
                      className="h-16 object-contain border rounded bg-background mt-2"
                    />
                  ) : (
                    <span className="text-sm text-muted-foreground">{report.operatorSignature}</span>
                  )}
                  {report.operatorSignedAt && (
                    <p className="text-xs text-muted-foreground">
                      {format(new Date(report.operatorSignedAt), "MMM d, yyyy 'at' h:mm a")}
                    </p>
                  )}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">Pending signature</p>
              )}
            </div>
            {!report.operatorSignature && (
              <Badge variant={canSign ? "destructive" : "outline"}>
                {canSign ? "Action Required" : "Pending"}
              </Badge>
            )}
          </div>

          <div className="flex items-center justify-between p-4 border rounded-lg gap-4 flex-wrap">
            <div className="space-y-1">
              <div className="font-medium flex items-center gap-2">
                <User className="w-4 h-4" />
                Tenant Signature
              </div>
              {report.tenantSignature ? (
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <CheckCircle className="w-4 h-4 text-green-600" />
                    <span className="text-sm">Signed</span>
                  </div>
                  {report.tenantSignature.startsWith('data:image/') ? (
                    <img 
                      src={report.tenantSignature} 
                      alt="Tenant signature" 
                      className="h-16 object-contain border rounded bg-background mt-2"
                    />
                  ) : (
                    <span className="text-sm text-muted-foreground">{report.tenantSignature}</span>
                  )}
                  {report.tenantSignedAt && (
                    <p className="text-xs text-muted-foreground">
                      {format(new Date(report.tenantSignedAt), "MMM d, yyyy 'at' h:mm a")}
                    </p>
                  )}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">Awaiting tenant signature</p>
              )}
            </div>
          </div>

          {canSign && (
            <div className="space-y-3 p-4 bg-muted rounded-lg">
              <Label>Draw your signature to sign</Label>
              {signatureDataUrl ? (
                <Card>
                  <CardContent className="p-4">
                    <div className="space-y-3">
                      <img 
                        src={signatureDataUrl} 
                        alt="Signature" 
                        className="w-full h-40 object-contain border rounded bg-background"
                        data-testid="img-signature"
                      />
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={handleClearSignature}
                        data-testid="button-clear-signature"
                        className="w-full"
                      >
                        <Trash2 className="w-4 h-4 mr-2" />
                        Clear Signature
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ) : (
                <Card>
                  <CardContent className="p-4">
                    <div className="space-y-3">
                      <div className="border-2 border-dashed rounded bg-background">
                        <SignatureCanvas
                          ref={signaturePadRef}
                          canvasProps={{
                            className: "w-full h-40 cursor-crosshair",
                            "data-testid": "canvas-signature"
                          }}
                          backgroundColor="transparent"
                        />
                      </div>
                      <div className="flex gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={handleClearSignature}
                          data-testid="button-clear-signature"
                        >
                          <Trash2 className="w-4 h-4 mr-2" />
                          Clear
                        </Button>
                        <Button
                          variant="default"
                          size="sm"
                          onClick={handleSignReport}
                          disabled={signMutation.isPending}
                          className="flex-1"
                          data-testid="button-sign"
                        >
                          <Pen className="w-4 h-4 mr-2" />
                          {signMutation.isPending ? "Signing..." : "Sign Report as Operator"}
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )}
              <p className="text-xs text-muted-foreground">
                By signing, you confirm the accuracy of this comparison report. This is a legally binding electronic signature.
              </p>
            </div>
          )}

          {report.operatorSignature && !report.tenantSignature && (
            <div className="p-4 bg-amber-50 dark:bg-amber-950 rounded-lg">
              <p className="text-sm">
                You have signed this report. Waiting for tenant signature. The tenant can access this report through their portal.
              </p>
            </div>
          )}

          {report.operatorSignature && report.tenantSignature && (
            <div className="p-4 bg-green-50 dark:bg-green-950 rounded-lg flex items-center gap-3">
              <CheckCircle className="w-6 h-6 text-green-600" />
              <div>
                <p className="font-medium text-green-800 dark:text-green-200">Report Fully Signed</p>
                <p className="text-sm text-green-700 dark:text-green-300">Both parties have signed this comparison report.</p>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
