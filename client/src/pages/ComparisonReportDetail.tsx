import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useParams, Link } from "wouter";
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
  DollarSign, 
  TrendingDown, 
  Calculator,
  Image as ImageIcon,
  AlertCircle,
  Check,
  User
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
  sectionRef: string;
  fieldKey: string;
  itemRef: string | null;
  aiComparisonJson: any;
  estimatedCost: string;
  depreciation: string;
  finalCost: string;
  checkInEntryId: string | null;
  checkOutEntryId: string;
  checkInPhotos?: string[];
  checkOutPhotos?: string[];
}

interface Comment {
  id: string;
  userId: string;
  content: string;
  isInternal: boolean;
  createdAt: string;
}

const statusConfig = {
  draft: { label: "Draft", color: "bg-gray-500" },
  under_review: { label: "Under Review", color: "bg-blue-500" },
  awaiting_signatures: { label: "Awaiting Signatures", color: "bg-amber-500" },
  signed: { label: "Signed", color: "bg-green-500" },
  filed: { label: "Filed", color: "bg-slate-600" },
};

export default function ComparisonReportDetail() {
  const { id } = useParams();
  const { toast } = useToast();
  const { user } = useAuth();
  const locale = useLocale();
  const [commentText, setCommentText] = useState("");
  const [signatureName, setSignatureName] = useState("");

  const { data: report, isLoading } = useQuery<ComparisonReport>({
    queryKey: ["/api/comparison-reports", id],
    enabled: !!id,
    select: (data) => {
      // Parse AI analysis to extract photos if available
      const items = data.items.map(item => {
        const aiAnalysis = item.aiComparisonJson || {};
        const checkInPhotos = aiAnalysis.checkInPhotos || [];
        const checkOutPhotos = aiAnalysis.checkOutPhotos || [];
        return {
          ...item,
          checkInPhotos,
          checkOutPhotos,
        };
      });
      return {
        ...data,
        items,
      };
    },
  });

  const { data: comments = [] } = useQuery<Comment[]>({
    queryKey: ["/api/comparison-reports", id, "comments"],
    enabled: !!id,
  });

  const addCommentMutation = useMutation({
    mutationFn: async (content: string) => {
      const response = await apiRequest("POST", `/api/comparison-reports/${id}/comments`, { content });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/comparison-reports", id, "comments"] });
      setCommentText("");
      toast({
        title: "Comment Added",
        description: "Your comment has been posted successfully.",
      });
    },
    onError: () => {
      toast({
        variant: "destructive",
        title: "Error",
        description: "Failed to add comment.",
      });
    },
  });

  const signMutation = useMutation({
    mutationFn: async (signature: string) => {
      const response = await apiRequest("POST", `/api/comparison-reports/${id}/sign`, { signature });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/comparison-reports", id] });
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
              <a>
                <Button variant="outline">
                  <ArrowLeft className="w-4 h-4 mr-2" />
                  Back to Reports
                </Button>
              </a>
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  const statusInfo = statusConfig[report.status as keyof typeof statusConfig];
  const totalCost = parseFloat(report.totalEstimatedCost);
  const isOperator = user?.role === "owner" || user?.role === "clerk";
  const isTenant = user?.role === "tenant";
  const canSign = (isOperator && !report.operatorSignature) || (isTenant && !report.tenantSignature);

  return (
    <div className="container mx-auto px-4 py-8 space-y-6" data-testid="page-comparison-detail">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="space-y-1">
          <Link href="/comparisons">
            <a>
              <Button variant="ghost" size="sm" data-testid="button-back">
                <ArrowLeft className="w-4 h-4 mr-2" />
                Back to Reports
              </Button>
            </a>
          </Link>
          <h1 className="text-4xl font-bold flex items-center gap-3">
            <FileText className="w-10 h-10 text-primary" />
            Comparison Report
          </h1>
          <p className="text-muted-foreground">
            Generated on {format(new Date(report.createdAt), "MMMM d, yyyy 'at' h:mm a")}
          </p>
        </div>
        <Badge className={`${statusInfo.color} text-white text-lg px-4 py-2`}>
          {statusInfo.label}
        </Badge>
      </div>

      {/* Summary Card */}
      <Card>
        <CardHeader>
          <CardTitle>Cost Summary</CardTitle>
          <CardDescription>Total estimated tenant liability after depreciation</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="text-4xl font-bold text-primary">
            {locale.formatCurrency(totalCost, false)}
          </div>
          <p className="text-sm text-muted-foreground mt-2">
            Based on {report.items.length} items marked for review
          </p>
        </CardContent>
      </Card>

      {/* Items Breakdown */}
      <Card>
        <CardHeader>
          <CardTitle>Item-by-Item Analysis</CardTitle>
          <CardDescription>Detailed comparison of each marked item</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {report.items.map((item, index) => {
            const aiAnalysis = item.aiComparisonJson || {};
            const estimatedCost = parseFloat(item.estimatedCost);
            const depreciation = parseFloat(item.depreciation);
            const finalCost = parseFloat(item.finalCost);

            return (
              <div key={item.id} className="space-y-4 pb-6 border-b last:border-b-0">
                {/* Item Header */}
                <div className="flex items-start justify-between">
                  <div>
                    <h3 className="text-lg font-semibold">
                      {index + 1}. {item.sectionRef} - {item.fieldKey}
                    </h3>
                    {item.itemRef && (
                      <p className="text-sm text-muted-foreground">{item.itemRef}</p>
                    )}
                  </div>
                  {aiAnalysis.severity && (
                    <Badge 
                      variant={
                        aiAnalysis.severity === "high" ? "destructive" : 
                        aiAnalysis.severity === "medium" ? "default" : 
                        "secondary"
                      }
                    >
                      {aiAnalysis.severity} severity
                    </Badge>
                  )}
                </div>

                {/* Images Side-by-Side */}
                {((item.checkInPhotos && item.checkInPhotos.length > 0) || (item.checkOutPhotos && item.checkOutPhotos.length > 0)) && (
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <h4 className="text-sm font-medium text-muted-foreground">Check-In Photos</h4>
                      <div className="grid grid-cols-2 gap-2">
                        {item.checkInPhotos && item.checkInPhotos.length > 0 ? (
                          item.checkInPhotos.slice(0, 2).map((photo, idx) => (
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
                          item.checkOutPhotos.slice(0, 2).map((photo, idx) => (
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

                {/* AI Analysis */}
                {aiAnalysis.differences && (
                  <div className="bg-muted p-4 rounded-lg space-y-2">
                    <h4 className="font-medium text-sm flex items-center gap-2">
                      <ImageIcon className="w-4 h-4" />
                      Visual Differences
                    </h4>
                    <p className="text-sm">{aiAnalysis.differences}</p>
                  </div>
                )}

                {aiAnalysis.damage && (
                  <div className="bg-destructive/10 p-4 rounded-lg space-y-2">
                    <h4 className="font-medium text-sm flex items-center gap-2">
                      <AlertCircle className="w-4 h-4 text-destructive" />
                      Damage Assessment
                    </h4>
                    <p className="text-sm">{aiAnalysis.damage}</p>
                  </div>
                )}

                {aiAnalysis.repair_description && (
                  <div className="bg-blue-50 dark:bg-blue-950 p-4 rounded-lg space-y-2">
                    <h4 className="font-medium text-sm flex items-center gap-2">
                      <Calculator className="w-4 h-4" />
                      Recommended Repairs
                    </h4>
                    <p className="text-sm">{aiAnalysis.repair_description}</p>
                  </div>
                )}

                {/* Cost Breakdown */}
                <div className="grid grid-cols-3 gap-4 pt-2">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <DollarSign className="w-4 h-4" />
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
                      Tenant Liability
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

      {/* Comments Section */}
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
          {/* Comments List */}
          <div className="space-y-3 max-h-96 overflow-y-auto">
            {comments.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">
                No comments yet. Start the discussion below.
              </p>
            ) : (
              comments.map((comment) => (
                <div 
                  key={comment.id}
                  className={`p-4 rounded-lg ${
                    comment.isInternal 
                      ? "bg-amber-50 dark:bg-amber-950 border border-amber-200 dark:border-amber-800" 
                      : "bg-muted"
                  }`}
                >
                  <div className="flex items-start justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <User className="w-4 h-4" />
                      <span className="text-sm font-medium">
                        {comment.isInternal ? "Internal Note" : "Comment"}
                      </span>
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

          {/* Add Comment Form */}
          <div className="space-y-3">
            <Textarea
              placeholder="Add a comment or internal note..."
              value={commentText}
              onChange={(e) => setCommentText(e.target.value)}
              rows={3}
              data-testid="input-comment"
            />
            <Button
              onClick={() => addCommentMutation.mutate(commentText)}
              disabled={!commentText.trim() || addCommentMutation.isPending}
              data-testid="button-add-comment"
            >
              <MessageSquare className="w-4 h-4 mr-2" />
              {addCommentMutation.isPending ? "Adding..." : "Add Comment"}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Signature Section */}
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
          {/* Operator Signature */}
          <div className="flex items-center justify-between p-4 border rounded-lg">
            <div className="space-y-1">
              <div className="font-medium flex items-center gap-2">
                <User className="w-4 h-4" />
                Operator Signature
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
            {isOperator && !report.operatorSignature && (
              <Badge variant="outline" className="text-amber-600 border-amber-600">
                Action Required
              </Badge>
            )}
          </div>

          {/* Tenant Signature */}
          <div className="flex items-center justify-between p-4 border rounded-lg">
            <div className="space-y-1">
              <div className="font-medium flex items-center gap-2">
                <User className="w-4 h-4" />
                Tenant Signature
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
                <p className="text-sm text-muted-foreground">Pending signature</p>
              )}
            </div>
            {isTenant && !report.tenantSignature && (
              <Badge variant="outline" className="text-amber-600 border-amber-600">
                Action Required
              </Badge>
            )}
          </div>

          {/* Sign Form */}
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
              </p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
