import { useParams, useLocation } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useState, useEffect, useRef } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import {
  CheckCircle2,
  Calendar,
  MapPin,
  User,
  Building2,
  Wrench,
  ArrowLeft,
  Trash2,
  Pen,
} from "lucide-react";
import { format } from "date-fns";
import SignatureCanvas from "react-signature-canvas";
import { QuickAddMaintenanceSheet } from "@/components/QuickAddMaintenanceSheet";
import {
  isTenantSignatureField,
  parseSignatureValue,
  formatSignerDisplayName,
} from "@shared/signature";
import { useAuth } from "@/hooks/useAuth";

interface Inspection {
  id: string;
  type: string;
  status: string;
  completedDate: string | null;
  submittedAt: string | null;
  tenantApprovalStatus: string | null;
  tenantApprovalDeadline: string | null;
  tenantComments: string | null;
  tenantApprovedAt?: string | null;
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
  const { user } = useAuth();
  const [comments, setComments] = useState("");
  const [signatureData, setSignatureData] = useState<string | null>(null);
  const signaturePadRef = useRef<SignatureCanvas>(null);
  const [showMaintenanceSheet, setShowMaintenanceSheet] = useState(false);
  const [selectedFieldForMaintenance, setSelectedFieldForMaintenance] = useState<{
    entryId: string;
    fieldLabel: string;
    sectionTitle: string;
  } | null>(null);

  const { data: inspection, isLoading: inspectionLoading } = useQuery<Inspection>({
    queryKey: ["/api/inspections", id],
    enabled: !!id,
  });

  const { data: entries = [], isLoading: entriesLoading } = useQuery<any[]>({
    queryKey: [`/api/inspections/${id}/entries`],
    enabled: !!id,
  });

  useEffect(() => {
    if (inspection?.tenantComments) {
      setComments(inspection.tenantComments);
    }
  }, [inspection]);

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

  const signMutation = useMutation({
    mutationFn: async (image: string) => {
      const response = await apiRequest("POST", `/api/inspections/${id}/tenant-sign`, {
        image,
        signedByName: formatSignerDisplayName(user),
        signedAt: new Date().toISOString(),
        comments: comments || undefined,
      });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/inspections", id] });
      queryClient.invalidateQueries({ queryKey: [`/api/inspections/${id}/entries`] });
      queryClient.invalidateQueries({ queryKey: ["/api/tenant/check-ins"] });
      toast({
        title: "Inspection signed",
        description: "Thank you. Your signature has been recorded.",
      });
      navigate("/dashboard");
    },
    onError: (error: any) => {
      toast({
        variant: "destructive",
        title: "Error",
        description: error.message || "Failed to sign inspection",
      });
    },
  });

  const handleLogMaintenance = (entryId: string, fieldLabel: string, sectionTitle: string) => {
    setSelectedFieldForMaintenance({ entryId, fieldLabel, sectionTitle });
    setShowMaintenanceSheet(true);
  };

  const handleClearSignature = () => {
    setSignatureData(null);
    signaturePadRef.current?.clear();
  };

  const readSignatureFromPad = (): string | null => {
    if (!signaturePadRef.current || signaturePadRef.current.isEmpty()) {
      return null;
    }
    // Prefer toDataURL — getTrimmedCanvas often fails when the canvas is CSS-sized
    try {
      return signaturePadRef.current.toDataURL("image/png");
    } catch {
      try {
        return signaturePadRef.current.getTrimmedCanvas().toDataURL("image/png");
      } catch {
        return null;
      }
    }
  };

  const handleSubmitSignature = () => {
    let image = signatureData;
    if (!image) {
      image = readSignatureFromPad();
    }
    if (!image) {
      toast({
        variant: "destructive",
        title: "Signature required",
        description: "Please draw your signature before submitting.",
      });
      return;
    }
    setSignatureData(image);
    signMutation.mutate(image);
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
            <CardDescription>The inspection could not be found.</CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  const templateStructure = inspection.templateSnapshotJson as { sections: any[] } | null;
  const sections = templateStructure?.sections || [];

  const entriesBySection = entries.reduce((acc, entry) => {
    const key = entry.sectionRef;
    if (!acc[key]) acc[key] = [];
    acc[key].push(entry);
    return acc;
  }, {} as Record<string, any[]>);

  const typeLabel = inspection.type === "check_out" ? "Check-Out" : "Check-In";
  const isSigned =
    inspection.tenantApprovalStatus === "signed" ||
    inspection.tenantApprovalStatus === "approved";
  const isPending = inspection.tenantApprovalStatus === "pending";

  const tenantSignatureEntry = entries.find(
    (e: any) =>
      e.fieldType === "signature" &&
      isTenantSignatureField({ key: e.fieldKey, id: e.fieldKey, label: e.fieldKey }),
  );
  const existingSignature = parseSignatureValue(tenantSignatureEntry?.valueJson);

  return (
    <div className="p-6 space-y-6 max-w-6xl mx-auto">
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
          <h1 className="text-3xl font-bold">{typeLabel} Inspection Review</h1>
          <p className="text-muted-foreground mt-1">
            Review the inspection details, add comments if needed, and provide your signature.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {isSigned && <Badge className="bg-green-500">Signed</Badge>}
          {isPending && (
            <Badge variant="outline" className="border-orange-500 text-orange-600">
              Signature Required
            </Badge>
          )}
        </div>
      </div>

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

      <Card>
        <CardHeader>
          <CardTitle>Inspection Entries</CardTitle>
          <CardDescription>
            All fields are read-only. You can log a maintenance request if something needs attention.
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
                  {sectionEntries.map((entry: any) => {
                    const field = section.fields?.find((f: any) => f.id === entry.fieldKey || f.key === entry.fieldKey);
                    if (!field) return null;
                    if (field.type === "signature" && isTenantSignatureField(field)) {
                      return null;
                    }

                    const sig = field.type === "signature" ? parseSignatureValue(entry.valueJson) : null;

                    return (
                      <div key={entry.id} className="border rounded-lg p-4 space-y-3">
                        <div className="flex items-start justify-between">
                          <div className="flex-1">
                            <h4 className="font-medium">{field.label}</h4>
                            {field.description && (
                              <p className="text-sm text-muted-foreground">{field.description}</p>
                            )}
                          </div>
                          {isPending && (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleLogMaintenance(entry.id, field.label, section.title)}
                              className="ml-4"
                            >
                              <Wrench className="w-4 h-4 mr-2" />
                              Log Maintenance
                            </Button>
                          )}
                        </div>

                        {sig?.image ? (
                          <div className="bg-muted p-3 rounded">
                            <Label className="text-xs text-muted-foreground">Signature</Label>
                            <img
                              src={sig.image}
                              alt={field.label}
                              className="mt-2 h-16 object-contain border rounded bg-background"
                            />
                          </div>
                        ) : entry.valueJson != null && entry.valueJson !== "" ? (
                          <div className="bg-muted p-3 rounded">
                            <Label className="text-xs text-muted-foreground">Value</Label>
                            <div className="mt-1 text-sm">
                              {typeof entry.valueJson === "object" ? (
                                <ul className="list-disc list-inside space-y-1">
                                  {Object.entries(entry.valueJson).map(([key, value]) => (
                                    <li key={key}>
                                      <span className="font-medium">{key}:</span>{" "}
                                      <span>{typeof value === "string" ? value : JSON.stringify(value)}</span>
                                    </li>
                                  ))}
                                </ul>
                              ) : (
                                <span>{String(entry.valueJson)}</span>
                              )}
                            </div>
                          </div>
                        ) : null}

                        {entry.note && (
                          <div className="bg-muted p-3 rounded">
                            <Label className="text-xs text-muted-foreground">Inspector Notes</Label>
                            <p className="text-sm mt-1">{entry.note}</p>
                          </div>
                        )}

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

      <Card>
        <CardHeader>
          <CardTitle>Your Comments</CardTitle>
          <CardDescription>
            Optional comments about this inspection. You can save them before signing.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label htmlFor="comments">Comments</Label>
            <Textarea
              id="comments"
              value={comments}
              onChange={(e) => setComments(e.target.value)}
              placeholder="Add your comments here..."
              rows={5}
              disabled={!isPending}
              className="mt-2"
            />
          </div>
          {isPending && (
            <Button
              onClick={() => saveCommentsMutation.mutate()}
              disabled={saveCommentsMutation.isPending}
              variant="outline"
            >
              {saveCommentsMutation.isPending ? "Saving..." : "Save Comments"}
            </Button>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Pen className="w-5 h-5" />
            Tenant Signature
          </CardTitle>
          <CardDescription>
            {isSigned
              ? "You have signed this inspection."
              : "Draw your signature below to complete the review. This remains required until you sign."}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {(isSigned || existingSignature?.image) && (
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-green-700">
                <CheckCircle2 className="w-5 h-5" />
                <span className="font-medium">Signed</span>
              </div>
              {(existingSignature?.image || signatureData) && (
                <img
                  src={existingSignature?.image || signatureData || ""}
                  alt="Your signature"
                  className="h-20 object-contain border rounded bg-background"
                />
              )}
              {inspection.tenantApprovedAt && (
                <p className="text-xs text-muted-foreground">
                  Signed {format(new Date(inspection.tenantApprovedAt), "PPpp")}
                </p>
              )}
            </div>
          )}

          {isPending && !isSigned && (
            <div className="space-y-3 p-4 bg-muted rounded-lg">
              {signatureData ? (
                <div className="space-y-3">
                  <img
                    src={signatureData}
                    alt="Your signature"
                    className="w-full h-40 object-contain border rounded bg-background"
                  />
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleClearSignature}
                    disabled={signMutation.isPending}
                  >
                    <Trash2 className="w-4 h-4 mr-2" />
                    Clear Signature
                  </Button>
                </div>
              ) : (
                <div className="space-y-3">
                  <div
                    className="border-2 border-dashed rounded bg-background"
                    style={{ touchAction: "none" }}
                  >
                    <SignatureCanvas
                      ref={signaturePadRef}
                      penColor="#000000"
                      canvasProps={{
                        className: "w-full h-40 cursor-crosshair",
                        style: { width: "100%", height: "160px" },
                      }}
                    />
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleClearSignature}
                    disabled={signMutation.isPending}
                  >
                    <Trash2 className="w-4 h-4 mr-2" />
                    Clear
                  </Button>
                </div>
              )}
              <Button
                onClick={handleSubmitSignature}
                disabled={signMutation.isPending}
                className="w-full sm:w-auto"
                data-testid="button-submit-tenant-signature"
              >
                {signMutation.isPending ? "Submitting..." : "Submit Signature"}
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

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
