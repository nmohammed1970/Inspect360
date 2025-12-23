import { useState, useRef, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useParams, useLocation, Link } from "wouter";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import SignatureCanvas from "react-signature-canvas";
import { Trash2, Flag, Loader2 } from "lucide-react";
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
  Building2,
  Send,
  Download
} from "lucide-react";
import { format } from "date-fns";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useLocale } from "@/contexts/LocaleContext";
import {
  Breadcrumb,
  BreadcrumbList,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbSeparator,
  BreadcrumbPage,
} from "@/components/ui/breadcrumb";

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
  property: {
    id: string;
    name: string;
    address: string;
  } | null;
}

interface ComparisonReportItem {
  id: string;
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
  checkInPhotos?: string[];
  checkOutPhotos?: string[];
  disputeReason?: string | null;
  disputedAt?: string | null;
  aiCostCalculationNotes?: string | null;
  costCalculationMethod?: string | null;
  assetInventoryId?: string | null;
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

const itemStatusConfig: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  pending: { label: "Pending Review", variant: "secondary" },
  reviewed: { label: "Reviewed", variant: "default" },
  disputed: { label: "Disputed", variant: "destructive" },
  resolved: { label: "Resolved", variant: "outline" },
  waived: { label: "Waived", variant: "outline" },
};

const liabilityConfig: Record<string, { label: string; color: string }> = {
  tenant: { label: "Tenant Liable", color: "text-destructive" },
  landlord: { label: "Landlord Responsible", color: "text-green-600" },
  shared: { label: "Shared Responsibility", color: "text-amber-600" },
  waived: { label: "Waived", color: "text-muted-foreground" },
};

export default function TenantComparisonReportDetail() {
  const { id } = useParams();
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const locale = useLocale();
  const [commentText, setCommentText] = useState("");
  const [signatureData, setSignatureData] = useState<string | null>(null);
  const signaturePadRef = useRef<SignatureCanvas>(null);
  
  // Dispute dialog state
  const [disputeDialogOpen, setDisputeDialogOpen] = useState(false);
  const [selectedItemForDispute, setSelectedItemForDispute] = useState<ComparisonReportItem | null>(null);
  const [disputeReason, setDisputeReason] = useState("");

  const { data: report, isLoading } = useQuery<ComparisonReport>({
    queryKey: ["/api/tenant/comparison-reports", id],
    enabled: !!id,
    select: (data) => {
      const items = data.items.map(item => {
        const aiAnalysis = item.aiComparisonJson || {};
        return {
          ...item,
          checkInPhotos: aiAnalysis.checkInPhotos || [],
          checkOutPhotos: aiAnalysis.checkOutPhotos || [],
        };
      });
      return { ...data, items };
    },
  });

  const { data: comments = [] } = useQuery<Comment[]>({
    queryKey: ["/api/tenant/comparison-reports", id, "comments"],
    enabled: !!id,
  });

  const addCommentMutation = useMutation({
    mutationFn: async (content: string) => {
      const response = await apiRequest("POST", `/api/tenant/comparison-reports/${id}/comments`, { content });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tenant/comparison-reports", id, "comments"] });
      setCommentText("");
      toast({
        title: "Message Sent",
        description: "Your message has been sent to the property manager.",
      });
    },
    onError: () => {
      toast({
        variant: "destructive",
        title: "Error",
        description: "Failed to send message.",
      });
    },
  });

  const signMutation = useMutation({
    mutationFn: async (signature: string) => {
      const response = await apiRequest("POST", `/api/tenant/comparison-reports/${id}/sign`, { signature });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tenant/comparison-reports", id] });
      setSignatureData(null);
      if (signaturePadRef.current) {
        signaturePadRef.current.clear();
      }
      toast({
        title: "Report Signed",
        description: "Your electronic signature has been recorded.",
      });
    },
    onError: (error: any) => {
      toast({
        variant: "destructive",
        title: "Error",
        description: error.message || "Failed to sign report.",
      });
    },
  });

  const disputeMutation = useMutation({
    mutationFn: async (data: { itemId: string; reason: string }) => {
      const response = await apiRequest("POST", `/api/tenant/comparison-reports/${id}/items/${data.itemId}/dispute`, {
        reason: data.reason,
      });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tenant/comparison-reports", id] });
      queryClient.invalidateQueries({ queryKey: ["/api/tenant/comparison-reports", id, "comments"] });
      setDisputeDialogOpen(false);
      setSelectedItemForDispute(null);
      setDisputeReason("");
      toast({
        title: "Dispute Submitted",
        description: "Your dispute has been submitted. The property manager will review it and the cost has been recalculated based on AI analysis.",
      });
    },
    onError: (error: any) => {
      toast({
        variant: "destructive",
        title: "Error",
        description: error.message || "Failed to submit dispute.",
      });
    },
  });

  const handleOpenDisputeDialog = (item: ComparisonReportItem) => {
    setSelectedItemForDispute(item);
    setDisputeReason("");
    setDisputeDialogOpen(true);
  };

  const handleSubmitDispute = () => {
    if (!selectedItemForDispute || !disputeReason.trim()) return;
    
    disputeMutation.mutate({
      itemId: selectedItemForDispute.id,
      reason: disputeReason,
    });
  };

  const handleDownloadPdf = async () => {
    if (!id) return;

    try {
      const response = await fetch(`/api/comparison-reports/${id}/pdf`, {
        credentials: 'include',
      });

      if (!response.ok) {
        throw new Error('Failed to download PDF');
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
        title: "Download Complete",
        description: "Your comparison report has been downloaded successfully.",
      });
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Download Failed",
        description: error.message || "Failed to download the comparison report PDF. Please try again.",
      });
    }
  };

  if (isLoading) {
    return (
      <div className="p-6 space-y-6">
        <Skeleton className="h-12 w-2/3" />
        <Skeleton className="h-64 w-full" />
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }

  if (!report) {
    return (
      <div className="p-6">
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16">
            <AlertCircle className="w-16 h-16 text-muted-foreground/50 mb-4" />
            <h3 className="text-xl font-semibold mb-2">Report Not Found</h3>
            <p className="text-muted-foreground mb-4">The comparison report you're looking for doesn't exist.</p>
            <Button variant="outline" onClick={() => navigate("/tenant/comparison-reports")}>
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back to Reports
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const statusInfo = statusConfig[report.status] || statusConfig.draft;
  const totalCost = parseFloat(report.totalEstimatedCost || "0");
  const canSign = (report.status === "awaiting_signatures" || report.status === "under_review") && !report.tenantSignature;

  return (
    <div className="p-6 space-y-6" data-testid="page-tenant-comparison-detail">
      <Breadcrumb className="mb-4">
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink asChild>
              <Link href="/tenant/home">Home</Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbLink asChild>
              <Link href="/tenant/comparison-reports">Comparison Reports</Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>Report Detail</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>
      <div className="flex items-center justify-between">
        <div className="space-y-1">
          <Button variant="ghost" size="sm" onClick={() => navigate("/tenant/comparison-reports")} data-testid="button-back">
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to Reports
          </Button>
          <h1 className="text-3xl font-bold flex items-center gap-3">
            <FileText className="w-8 h-8 text-primary" />
            Comparison Report
          </h1>
          <div className="flex items-center gap-2 text-muted-foreground">
            <Building2 className="h-4 w-4" />
            {report.property?.name || "Property"} - {report.property?.address}
          </div>
          <p className="text-sm text-muted-foreground">
            Generated on {format(new Date(report.createdAt), "MMMM d, yyyy 'at' h:mm a")}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Button
            variant="outline"
            onClick={handleDownloadPdf}
            data-testid="button-download-pdf"
          >
            <Download className="w-4 h-4 mr-2" />
            Download PDF
          </Button>
          <Badge variant={statusInfo.variant} className="text-lg px-4 py-2">
            {statusInfo.label}
          </Badge>
        </div>
      </div>

      {canSign && (
        <Card className="border-amber-500 bg-amber-50 dark:bg-amber-950">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <Pen className="h-6 w-6 text-amber-600" />
              <div>
                <p className="font-semibold text-amber-800 dark:text-amber-200">Action Required</p>
                <p className="text-sm text-amber-700 dark:text-amber-300">
                  Please review this report and provide your signature at the bottom of the page.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Total Liability Summary</CardTitle>
          <CardDescription>Your estimated liability after depreciation adjustments</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="text-4xl font-bold text-primary" data-testid="text-total-cost">
            {locale.formatCurrency(totalCost, false)}
          </div>
          <p className="text-sm text-muted-foreground mt-2">
            Based on {report.items.length} item{report.items.length !== 1 ? "s" : ""} marked for review
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Item-by-Item Analysis</CardTitle>
          <CardDescription>Detailed comparison of each item with condition changes</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {report.items.map((item, index) => {
            const aiAnalysis = item.aiComparisonJson || {};
            const estimatedCost = parseFloat(item.estimatedCost || "0");
            const depreciation = parseFloat(item.depreciation || "0");
            const finalCost = parseFloat(item.finalCost || "0");
            const itemStatus = itemStatusConfig[item.status] || itemStatusConfig.pending;
            const liability = liabilityConfig[item.liabilityDecision] || liabilityConfig.tenant;

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
                    <Badge variant={itemStatus.variant}>{itemStatus.label}</Badge>
                    <Badge variant="outline" className={liability.color}>{liability.label}</Badge>
                  </div>
                </div>

                {((item.checkInPhotos && item.checkInPhotos.length > 0) || (item.checkOutPhotos && item.checkOutPhotos.length > 0)) && (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <h4 className="text-sm font-medium text-muted-foreground">Check-In (Move In)</h4>
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
                      <h4 className="text-sm font-medium text-muted-foreground">Check-Out (Move Out)</h4>
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
                    <div className="text-lg font-semibold text-green-600">
                      -{locale.formatCurrency(depreciation, false)}
                    </div>
                  </div>
                  <div className="space-y-1">
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Calculator className="w-4 h-4" />
                      Your Liability
                    </div>
                    <div className="text-lg font-semibold text-primary">
                      {locale.formatCurrency(finalCost, false)}
                    </div>
                  </div>
                </div>

                {/* Show dispute info if disputed */}
                {item.status === "disputed" && item.aiCostCalculationNotes && (
                  <div className="bg-amber-50 dark:bg-amber-950/20 p-4 rounded-lg border border-amber-200 dark:border-amber-800 space-y-2">
                    <h4 className="font-medium text-sm flex items-center gap-2 text-amber-900 dark:text-amber-100">
                      <Flag className="w-4 h-4" />
                      Dispute Details
                    </h4>
                    {item.disputeReason && (
                      <p className="text-sm text-amber-800 dark:text-amber-200">
                        <span className="font-medium">Your reason:</span> {item.disputeReason}
                      </p>
                    )}
                    <div className="text-sm text-amber-800 dark:text-amber-200 whitespace-pre-wrap font-mono bg-amber-100/50 dark:bg-amber-900/20 p-2 rounded">
                      {item.aiCostCalculationNotes}
                    </div>
                    {item.costCalculationMethod && (
                      <Badge variant="outline" className="text-xs">
                        {item.costCalculationMethod === "depreciation" ? "Based on Asset Depreciation" : "Based on Local Market Search"}
                      </Badge>
                    )}
                  </div>
                )}

                {/* Dispute button - only show if not already disputed and report not finalized */}
                {item.status !== "disputed" && item.status !== "resolved" && item.status !== "waived" && 
                 report.status !== "signed" && report.status !== "filed" && !report.tenantSignature && (
                  <div className="pt-2">
                    <Button 
                      variant="outline" 
                      size="sm"
                      onClick={() => handleOpenDisputeDialog(item)}
                      data-testid={`button-dispute-${item.id}`}
                    >
                      <Flag className="w-4 h-4 mr-2" />
                      Dispute This Item
                    </Button>
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
            Discussion with Property Manager
          </CardTitle>
          <CardDescription>
            Communicate with your property manager about this report
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-3 max-h-96 overflow-y-auto">
            {comments.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">
                No messages yet. Send a message below if you have questions.
              </p>
            ) : (
              comments.map((comment) => (
                <div 
                  key={comment.id}
                  className={`p-4 rounded-lg ${
                    comment.authorRole === "tenant" 
                      ? "bg-primary/10 ml-8" 
                      : "bg-muted mr-8"
                  }`}
                  data-testid={`comment-${comment.id}`}
                >
                  <div className="flex items-start justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <User className="w-4 h-4" />
                      <span className="text-sm font-medium">
                        {comment.authorName || (comment.authorRole === "tenant" ? "You" : "Property Manager")}
                      </span>
                      <Badge variant="outline" className="text-xs">
                        {comment.authorRole === "tenant" ? "You" : "Manager"}
                      </Badge>
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

          {report.status === "signed" || report.status === "filed" || report.tenantSignature ? (
            <p className="text-sm text-muted-foreground text-center py-4">
              {report.tenantSignature ? "You have signed this report. Chat is now closed." : "This report has been finalized. Chat is now closed."}
            </p>
          ) : (
            <div className="flex gap-2">
              <Textarea
                placeholder="Type your message..."
                value={commentText}
                onChange={(e) => setCommentText(e.target.value)}
                rows={2}
                className="flex-1"
                data-testid="input-comment"
              />
              <Button
                onClick={() => addCommentMutation.mutate(commentText)}
                disabled={!commentText.trim() || addCommentMutation.isPending}
                data-testid="button-send-message"
              >
                <Send className="w-4 h-4" />
              </Button>
            </div>
          )}
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
          <div className="flex items-center justify-between p-4 border rounded-lg">
            <div className="space-y-1">
              <div className="font-medium flex items-center gap-2">
                <User className="w-4 h-4" />
                Property Manager Signature
              </div>
              {report.operatorSignature ? (
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <Check className="w-4 h-4 text-green-600" />
                    <span className="text-sm">Signed</span>
                  </div>
                  {report.operatorSignature.startsWith('data:image/') ? (
                    <div className="mt-2">
                      <img 
                        src={report.operatorSignature} 
                        alt="Property Manager signature" 
                        className="h-16 object-contain border rounded bg-background"
                      />
                    </div>
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
          </div>

          <div className="flex items-center justify-between p-4 border rounded-lg">
            <div className="space-y-1">
              <div className="font-medium flex items-center gap-2">
                <User className="w-4 h-4" />
                Your Signature
              </div>
              {report.tenantSignature ? (
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <Check className="w-4 h-4 text-green-600" />
                    <span className="text-sm">Signed</span>
                  </div>
                  {report.tenantSignature.startsWith('data:image/') ? (
                    <div className="mt-2">
                      <img 
                        src={report.tenantSignature} 
                        alt="Your signature" 
                        className="h-16 object-contain border rounded bg-background"
                      />
                    </div>
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
                <p className="text-sm text-muted-foreground">
                  {canSign ? "Awaiting your signature" : "Pending signature"}
                </p>
              )}
            </div>
            {!report.tenantSignature && (
              <Badge variant={canSign ? "destructive" : "outline"}>
                {canSign ? "Action Required" : "Pending"}
              </Badge>
            )}
          </div>

          {canSign && (
            <div className="space-y-3 p-4 bg-muted rounded-lg">
              <label className="text-sm font-medium">Draw your signature</label>
              {signatureData ? (
                <Card>
                  <CardContent className="p-4">
                    <div className="space-y-3">
                      <img 
                        src={signatureData} 
                        alt="Your signature" 
                        className="w-full h-40 object-contain border rounded bg-background"
                        data-testid="img-signature"
                      />
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          setSignatureData(null);
                          if (signaturePadRef.current) {
                            signaturePadRef.current.clear();
                          }
                        }}
                        data-testid="button-clear-signature"
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
                      {canSign && (
                        <div 
                          className="border-2 border-dashed rounded bg-background relative"
                          style={{ touchAction: 'none', userSelect: 'none', WebkitUserSelect: 'none' }}
                          onTouchStart={(e) => {
                            // Prevent default touch behaviors that might interfere
                            e.stopPropagation();
                          }}
                          onTouchMove={(e) => {
                            e.stopPropagation();
                          }}
                        >
                          <SignatureCanvas
                            ref={signaturePadRef}
                            canvasProps={{
                              className: "w-full h-40 cursor-crosshair",
                              width: 800,
                              height: 200,
                              "data-testid": "canvas-signature",
                              style: { 
                                touchAction: 'none', 
                                width: '100%', 
                                height: '160px',
                                display: 'block',
                                userSelect: 'none',
                                WebkitUserSelect: 'none'
                              }
                            }}
                            backgroundColor="rgb(255, 255, 255)"
                            penColor="rgb(0, 0, 0)"
                            velocityFilterWeight={0.7}
                            minWidth={1}
                            maxWidth={3}
                          />
                        </div>
                      )}
                      {canSign && (
                        <p className="text-xs text-muted-foreground">
                          Use your mouse or finger to draw your signature above
                        </p>
                      )}
                      <div className="flex gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            if (signaturePadRef.current) {
                              signaturePadRef.current.clear();
                            }
                          }}
                          data-testid="button-clear-canvas"
                        >
                          <Trash2 className="w-4 h-4 mr-2" />
                          Clear
                        </Button>
                        <Button
                          size="sm"
                          onClick={() => {
                            if (signaturePadRef.current && !signaturePadRef.current.isEmpty()) {
                              const data = signaturePadRef.current.toDataURL();
                              setSignatureData(data);
                            } else {
                              toast({
                                variant: "destructive",
                                title: "Signature Required",
                                description: "Please draw your signature before saving.",
                              });
                            }
                          }}
                          data-testid="button-save-signature"
                        >
                          Save Signature
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )}
              <Button
                onClick={() => {
                  if (!signatureData) {
                    toast({
                      variant: "destructive",
                      title: "Signature Required",
                      description: "Please draw your signature before signing the report.",
                    });
                    return;
                  }
                  signMutation.mutate(signatureData);
                }}
                disabled={!signatureData || signMutation.isPending}
                className="w-full"
                data-testid="button-sign"
              >
                <Pen className="w-4 h-4 mr-2" />
                {signMutation.isPending ? "Signing..." : "Sign Report"}
              </Button>
              <p className="text-xs text-muted-foreground">
                By signing, you acknowledge that you have reviewed and agree to the contents of this report. 
                This is a legally binding electronic signature.
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Dispute Dialog */}
      <Dialog open={disputeDialogOpen} onOpenChange={setDisputeDialogOpen}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Flag className="w-5 h-5" />
              Dispute Item
            </DialogTitle>
            <DialogDescription>
              Explain why you disagree with this charge. We'll use AI to calculate a fair cost based on depreciation or local market rates.
            </DialogDescription>
          </DialogHeader>
          
          {selectedItemForDispute && (
            <div className="space-y-4">
              <div className="bg-muted p-3 rounded-lg">
                <p className="font-medium">{selectedItemForDispute.sectionRef} - {selectedItemForDispute.fieldKey}</p>
                {selectedItemForDispute.itemRef && (
                  <p className="text-sm text-muted-foreground">{selectedItemForDispute.itemRef}</p>
                )}
                <p className="text-sm mt-1">
                  Current cost: <span className="font-semibold">{locale.formatCurrency(parseFloat(selectedItemForDispute.finalCost || "0"), false)}</span>
                </p>
              </div>

              <p className="text-sm text-muted-foreground">
                When you submit this dispute, our AI will analyze the charge and recalculate the cost fairly. 
                For inventory items with linked assets, we'll use depreciated values. For other items, 
                we'll estimate costs based on local market rates.
              </p>

              <div className="space-y-2">
                <Label htmlFor="dispute-reason">Reason for Dispute</Label>
                <Textarea
                  id="dispute-reason"
                  placeholder="Please explain why you believe this charge is incorrect or unfair..."
                  value={disputeReason}
                  onChange={(e) => setDisputeReason(e.target.value)}
                  rows={4}
                  data-testid="textarea-dispute-reason"
                />
              </div>
            </div>
          )}

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setDisputeDialogOpen(false)}
              disabled={disputeMutation.isPending}
            >
              Cancel
            </Button>
            <Button
              onClick={handleSubmitDispute}
              disabled={!disputeReason.trim() || disputeMutation.isPending}
              data-testid="button-submit-dispute"
            >
              {disputeMutation.isPending ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Analyzing...
                </>
              ) : (
                <>
                  <Flag className="w-4 h-4 mr-2" />
                  Submit Dispute
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
