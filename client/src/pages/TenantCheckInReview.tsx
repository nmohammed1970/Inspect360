import { useParams, useLocation } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { 
  Clock, 
  CheckCircle2, 
  XCircle, 
  AlertCircle, 
  FileText, 
  Calendar,
  MapPin,
  User,
  Building2,
  Wrench,
  ArrowLeft
} from "lucide-react";
import { format, differenceInDays, differenceInHours, differenceInMinutes } from "date-fns";
import { QuickAddMaintenanceSheet } from "@/components/QuickAddMaintenanceSheet";

interface Inspection {
  id: string;
  type: string;
  status: string;
  completedDate: string | null;
  submittedAt: string | null;
  tenantApprovalStatus: string | null;
  tenantApprovalDeadline: string | null;
  tenantComments: string | null;
  templateSnapshotJson?: any;
  property?: {
    id: string;
    name: string;
    address: string;
  };
  clerk?: {
    id: string;
    firstName?: string;
    lastName?: string;
    email: string;
  };
}

export default function TenantCheckInReview() {
  const { id } = useParams<{ id: string }>();
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const [comments, setComments] = useState("");
  const [showMaintenanceSheet, setShowMaintenanceSheet] = useState(false);
  const [selectedFieldForMaintenance, setSelectedFieldForMaintenance] = useState<{
    entryId: string;
    fieldLabel: string;
    sectionTitle: string;
  } | null>(null);

  // Fetch inspection data
  const { data: inspection, isLoading: inspectionLoading } = useQuery<Inspection>({
    queryKey: ["/api/inspections", id],
    enabled: !!id,
  });

  // Fetch inspection entries
  const { data: entries = [], isLoading: entriesLoading } = useQuery<any[]>({
    queryKey: [`/api/inspections/${id}/entries`],
    enabled: !!id,
  });

  // Fetch organization for approval period
  const { data: user } = useQuery({
    queryKey: ["/api/auth/user"],
  });
  
  const { data: organization } = useQuery({
    queryKey: ["/api/organizations", user?.organizationId],
    enabled: !!user?.organizationId,
  });

  // Initialize comments from inspection
  useEffect(() => {
    if (inspection?.tenantComments) {
      setComments(inspection.tenantComments);
    }
  }, [inspection]);

  // Auto-approve if deadline has passed (refetch to get updated status)
  useEffect(() => {
    if (inspection && inspection.tenantApprovalDeadline && 
        (inspection.tenantApprovalStatus === "pending" || !inspection.tenantApprovalStatus)) {
      const deadline = new Date(inspection.tenantApprovalDeadline);
      const now = new Date();
      if (deadline < now) {
        // Deadline has passed, refetch to get auto-approved status
        queryClient.invalidateQueries({ queryKey: ["/api/inspections", id] });
      }
    }
  }, [inspection, id]);

  // Calculate time remaining
  const getTimeRemaining = () => {
    if (!inspection?.tenantApprovalDeadline) return null;
    
    const deadline = new Date(inspection.tenantApprovalDeadline);
    const now = new Date();
    const diffMs = deadline.getTime() - now.getTime();

    if (diffMs <= 0) {
      return { expired: true, text: "Expired" };
    }

    const days = differenceInDays(deadline, now);
    const hours = differenceInHours(deadline, now) % 24;
    const minutes = differenceInMinutes(deadline, now) % 60;

    if (days > 0) {
      return { expired: false, text: `${days} day${days !== 1 ? 's' : ''} remaining` };
    } else if (hours > 0) {
      return { expired: false, text: `${hours} hour${hours !== 1 ? 's' : ''} remaining` };
    } else {
      return { expired: false, text: `${minutes} minute${minutes !== 1 ? 's' : ''} remaining` };
    }
  };

  const timeRemaining = getTimeRemaining();
  const approvalPeriodDays = organization?.checkInApprovalPeriodDays ?? 5;

  // Approve inspection mutation
  const approveMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", `/api/inspections/${id}/tenant-approve`, {
        comments: comments || null,
      });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/inspections", id] });
      queryClient.invalidateQueries({ queryKey: ["/api/tenant/check-ins"] });
      toast({
        title: "Check-in Approved",
        description: "You have approved this check-in inspection.",
      });
      navigate("/dashboard");
    },
    onError: (error: any) => {
      toast({
        variant: "destructive",
        title: "Error",
        description: error.message || "Failed to approve check-in",
      });
    },
  });

  // Dispute inspection mutation
  const disputeMutation = useMutation({
    mutationFn: async () => {
      if (!comments.trim()) {
        throw new Error("Please provide comments explaining your dispute");
      }
      const response = await apiRequest("POST", `/api/inspections/${id}/tenant-dispute`, {
        comments: comments,
      });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/inspections", id] });
      queryClient.invalidateQueries({ queryKey: ["/api/tenant/check-ins"] });
      toast({
        title: "Dispute Submitted",
        description: "Your dispute has been submitted. The property manager will review it.",
      });
      navigate("/dashboard");
    },
    onError: (error: any) => {
      toast({
        variant: "destructive",
        title: "Error",
        description: error.message || "Failed to submit dispute",
      });
    },
  });

  // Save comments mutation (without approval/dispute)
  const saveCommentsMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("PATCH", `/api/inspections/${id}/tenant-comments`, {
        comments: comments,
      });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/inspections", id] });
      toast({
        title: "Comments Saved",
        description: "Your comments have been saved.",
      });
    },
    onError: (error: any) => {
      toast({
        variant: "destructive",
        title: "Error",
        description: error.message || "Failed to save comments",
      });
    },
  });

  const handleLogMaintenance = (entryId: string, fieldLabel: string, sectionTitle: string) => {
    setSelectedFieldForMaintenance({ entryId, fieldLabel, sectionTitle });
    setShowMaintenanceSheet(true);
  };

  if (inspectionLoading || entriesLoading) {
    return (
      <div className="p-6 space-y-6">
        <Skeleton className="h-12 w-64" />
        <Skeleton className="h-96" />
      </div>
    );
  }

  if (!inspection) {
    return (
      <div className="p-6">
        <Card>
          <CardHeader>
            <CardTitle>Inspection Not Found</CardTitle>
            <CardDescription>The check-in inspection could not be found.</CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  // Parse template structure
  const templateStructure = inspection.templateSnapshotJson as { sections: any[] } | null;
  const sections = templateStructure?.sections || [];

  // Group entries by section
  const entriesBySection = entries.reduce((acc, entry) => {
    const key = entry.sectionRef;
    if (!acc[key]) acc[key] = [];
    acc[key].push(entry);
    return acc;
  }, {} as Record<string, any[]>);

  const isApproved = inspection.tenantApprovalStatus === "approved";
  const isDisputed = inspection.tenantApprovalStatus === "disputed";
  const isPending = !inspection.tenantApprovalStatus || inspection.tenantApprovalStatus === "pending";
  // Allow action if pending (even if deadline passed, it will auto-approve on submit)
  const canTakeAction = isPending;

  return (
    <div className="p-6 space-y-6 max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <Button
            variant="ghost"
            onClick={() => navigate("/dashboard")}
            className="mb-4"
          >
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to Home
          </Button>
          <h1 className="text-3xl font-bold">Check-In Inspection Review</h1>
          <p className="text-muted-foreground mt-1">
            Please review the check-in inspection details and take action
          </p>
        </div>
        <div className="flex items-center gap-2">
          {isApproved && <Badge className="bg-green-500">Approved</Badge>}
          {isDisputed && <Badge className="bg-orange-500">Disputed</Badge>}
          {isPending && (
            <Badge variant="outline" className="border-orange-500 text-orange-600">
              Pending Review
              {timeRemaining && !timeRemaining.expired && ` - ${timeRemaining.text}`}
            </Badge>
          )}
        </div>
      </div>

      {/* Timer Banner - Only show if deadline hasn't passed */}
      {isPending && timeRemaining && !timeRemaining.expired && (
        <Card className="border-orange-500 bg-orange-50">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <Clock className="w-5 h-5 text-orange-600" />
              <div className="flex-1">
                <h3 className="font-bold text-orange-600">Approval Period</h3>
                <p className="text-sm text-orange-600">
                  You have {timeRemaining.text} to review and approve this check-in inspection.
                </p>
                {inspection.tenantApprovalDeadline && (
                  <p className="text-xs text-muted-foreground mt-1">
                    Deadline: {format(new Date(inspection.tenantApprovalDeadline), "PPpp")}
                  </p>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Inspection Details */}
      <Card>
        <CardHeader>
          <CardTitle>Inspection Details</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {inspection.property && (
              <div>
                <Label className="text-sm text-muted-foreground">Property</Label>
                <div className="flex items-center gap-2 mt-1">
                  <Building2 className="w-4 h-4" />
                  <span className="font-medium">{inspection.property.name}</span>
                </div>
                <div className="flex items-center gap-2 mt-1 text-sm text-muted-foreground">
                  <MapPin className="w-4 h-4" />
                  {inspection.property.address}
                </div>
              </div>
            )}
            {inspection.clerk && (
              <div>
                <Label className="text-sm text-muted-foreground">Inspector</Label>
                <div className="flex items-center gap-2 mt-1">
                  <User className="w-4 h-4" />
                  <span className="font-medium">
                    {inspection.clerk.firstName} {inspection.clerk.lastName}
                  </span>
                </div>
              </div>
            )}
            {inspection.completedDate && (
              <div>
                <Label className="text-sm text-muted-foreground">Completed Date</Label>
                <div className="flex items-center gap-2 mt-1">
                  <Calendar className="w-4 h-4" />
                  <span>{format(new Date(inspection.completedDate), "PPpp")}</span>
                </div>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Inspection Entries */}
      <Card>
        <CardHeader>
          <CardTitle>Inspection Details</CardTitle>
          <CardDescription>
            Review all inspection entries. You can add comments or log maintenance requests for any item.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {sections.map((section) => {
            const sectionEntries = entriesBySection[section.id] || [];
            if (sectionEntries.length === 0) return null;

            return (
              <div key={section.id} className="space-y-4 border-b pb-6 last:border-0">
                <h3 className="text-xl font-semibold">{section.title}</h3>
                <div className="space-y-4">
                  {sectionEntries.map((entry) => {
                    const field = section.fields?.find((f: any) => f.id === entry.fieldKey);
                    if (!field) return null;

                    return (
                      <div key={entry.id} className="border rounded-lg p-4 space-y-3">
                        <div className="flex items-start justify-between">
                          <div className="flex-1">
                            <h4 className="font-medium">{field.label}</h4>
                            {field.description && (
                              <p className="text-sm text-muted-foreground">{field.description}</p>
                            )}
                          </div>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleLogMaintenance(entry.id, field.label, section.title)}
                            className="ml-4"
                          >
                            <Wrench className="w-4 h-4 mr-2" />
                            Log Maintenance
                          </Button>
                        </div>

                        {/* Value Display */}
                        {entry.valueJson && (
                          <div className="bg-muted p-3 rounded">
                            <Label className="text-xs text-muted-foreground">Value</Label>
                            <div className="mt-1">
                              {typeof entry.valueJson === "object" ? (
                                <pre className="text-sm">{JSON.stringify(entry.valueJson, null, 2)}</pre>
                              ) : (
                                <span>{String(entry.valueJson)}</span>
                              )}
                            </div>
                          </div>
                        )}

                        {/* Notes */}
                        {entry.note && (
                          <div className="bg-muted p-3 rounded">
                            <Label className="text-xs text-muted-foreground">Inspector Notes</Label>
                            <p className="text-sm mt-1">{entry.note}</p>
                          </div>
                        )}

                        {/* Photos */}
                        {entry.photos && entry.photos.length > 0 && (
                          <div>
                            <Label className="text-xs text-muted-foreground">Photos</Label>
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mt-2">
                              {entry.photos.map((photo: string, idx: number) => (
                                <img
                                  key={idx}
                                  src={photo}
                                  alt={`Photo ${idx + 1}`}
                                  className="w-full h-32 object-cover rounded border"
                                />
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </CardContent>
      </Card>

      {/* Comments and Actions */}
      <Card>
        <CardHeader>
          <CardTitle>Your Comments</CardTitle>
          <CardDescription>
            Add any comments, questions, or disputes about this inspection. You can also approve or dispute the inspection.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label htmlFor="comments">Comments</Label>
            <Textarea
              id="comments"
              value={comments}
              onChange={(e) => setComments(e.target.value)}
              placeholder="Add your comments, questions, or disputes here..."
              rows={6}
              disabled={!isPending}
              className="mt-2"
            />
            <p className="text-xs text-muted-foreground mt-1">
              {isDisputed && "You have disputed this inspection. Your comments have been submitted."}
              {isApproved && "You have approved this inspection."}
            </p>
          </div>

          {isPending && (
            <div className="flex items-center gap-3 flex-wrap">
              <Button
                onClick={() => saveCommentsMutation.mutate()}
                disabled={saveCommentsMutation.isPending}
                variant="outline"
              >
                {saveCommentsMutation.isPending ? "Saving..." : "Save Comments"}
              </Button>
              <Button
                onClick={() => approveMutation.mutate()}
                disabled={approveMutation.isPending}
                className="bg-green-600 hover:bg-green-700"
              >
                <CheckCircle2 className="w-4 h-4 mr-2" />
                {approveMutation.isPending ? "Approving..." : "Approve Inspection"}
              </Button>
              <Button
                onClick={() => disputeMutation.mutate()}
                disabled={disputeMutation.isPending || !comments.trim()}
                variant="destructive"
              >
                <XCircle className="w-4 h-4 mr-2" />
                {disputeMutation.isPending ? "Submitting..." : "Dispute Inspection"}
              </Button>
            </div>
          )}

          {!canTakeAction && (isApproved || isDisputed) && (
            <div className="flex items-center gap-2 p-3 bg-muted rounded">
              {isApproved && <CheckCircle2 className="w-5 h-5 text-green-600" />}
              {isDisputed && <AlertCircle className="w-5 h-5 text-orange-600" />}
              <span className="text-sm">
                {isApproved && "You have already approved this inspection."}
                {isDisputed && "You have already disputed this inspection."}
              </span>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Maintenance Sheet */}
      {showMaintenanceSheet && selectedFieldForMaintenance && (
        <QuickAddMaintenanceSheet
          open={showMaintenanceSheet}
          onOpenChange={setShowMaintenanceSheet}
          propertyId={inspection.property?.id}
          inspectionId={id}
          inspectionEntryId={selectedFieldForMaintenance.entryId}
          fieldLabel={selectedFieldForMaintenance.fieldLabel}
          sectionTitle={selectedFieldForMaintenance.sectionTitle}
        />
      )}
    </div>
  );
}

