import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useParams, useLocation, Link } from "wouter";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
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
  const [signatureName, setSignatureName] = useState("");

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
      setSignatureName("");
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
                    <span className="text-sm">Signed: {report.operatorSignature}</span>
                  </div>
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
                    <span className="text-sm">Signed: {report.tenantSignature}</span>
                  </div>
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
              <label className="text-sm font-medium">Type your full name to sign</label>
              <Input
                placeholder="Your full name"
                value={signatureName}
                onChange={(e) => setSignatureName(e.target.value)}
                data-testid="input-signature"
              />
              <Button
                onClick={() => signMutation.mutate(signatureName)}
                disabled={!signatureName.trim() || signMutation.isPending}
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
    </div>
  );
}
