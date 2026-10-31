import { useParams, Link, useLocation } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { ArrowLeft, Calendar, MapPin, User, CheckCircle, Sparkles, Trash2, Pencil, Loader2 } from "lucide-react";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { ASSIGNED_INVENTORY_CLERK_LABEL } from "@shared/roleLabels";
import {
  formatInspectionStatus,
  formatInspectionType,
  inspectionStatusBadgeVariant,
} from "@shared/inspectionLabels";
import { useLocale } from "@/contexts/LocaleContext";
import { LocaleDateInput } from "@/components/LocaleDateInput";
import { DeleteConfirmDialog } from "@/components/DeleteConfirmDialog";
import { cn } from "@/lib/utils";
import { pagePad, dialogContentBase, textBreak } from "@/lib/responsive";
import { useCompanyModules } from "@/hooks/useCompanyModules";
import {
  CompletionChecklistPanel,
  useInspectionCompletionChecklist,
} from "@/components/CompletionChecklistPanel";
import { COMPLETION_CHECKLIST_INSPECTION_UI_VISIBLE } from "@shared/completionChecklist";
import {
  formatRequiredIncompleteMessage,
  listRequiredIncompleteFields,
  repeatableCountsFromEntries,
} from "@shared/inspectionProgress";
import { repeatableCountsFromPropertyLayout } from "@shared/propertyLayout";

export default function InspectionDetail() {
  const { id } = useParams<{ id: string }>();
  const { toast } = useToast();
  const locale = useLocale();
  const [, setLocation] = useLocation();
  const { tenanciesEnabled } = useCompanyModules();
  const { data: completionChecklist } = useInspectionCompletionChecklist(id);
  const checklistRequiredIncomplete = COMPLETION_CHECKLIST_INSPECTION_UI_VISIBLE
    ? (completionChecklist?.progress?.requiredIncomplete ?? 0)
    : 0;

  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [showCompleteDialog, setShowCompleteDialog] = useState(false);
  const [showSendToTenantDialog, setShowSendToTenantDialog] = useState(false);
  const [pendingCompleteWithAI, setPendingCompleteWithAI] = useState(false);
  const [completingAction, setCompletingAction] = useState<"without-ai" | "with-ai" | null>(null);
  const [sendingToTenantAction, setSendingToTenantAction] = useState<"yes" | "no" | null>(null);
  const [isOnline, setIsOnline] = useState(
    typeof navigator !== "undefined" ? navigator.onLine : true,
  );

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  const { data: inspection, isLoading } = useQuery<any>({
    queryKey: ["/api/inspections", id],
    enabled: !!id,
  });

  const { data: detailEntries = [] } = useQuery<any[]>({
    queryKey: [`/api/inspections/${id}/entries`],
    enabled: !!id,
  });

  const completeInspection = useMutation({
    mutationFn: async (sendToTenantForReview: boolean) => {
      return await apiRequest("PATCH", `/api/inspections/${id}/status`, {
        status: "completed",
        sendToTenantForReview,
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to update inspection status",
        variant: "destructive",
      });
    },
  });

  const startBackgroundAIAnalysis = async (): Promise<{ started: boolean }> => {
    const statusResponse = await fetch(`/api/ai/analyze-inspection/${id}/status`, {
      credentials: "include",
    });
    const currentStatus = statusResponse.ok
      ? await statusResponse.json()
      : { status: "idle" };

    if (currentStatus.status === "completed" || currentStatus.status === "processing") {
      return { started: false };
    }

    const response = await fetch(`/api/ai/analyze-inspection/${id}`, {
      method: "POST",
      credentials: "include",
    });

    if (response.ok) {
      queryClient.invalidateQueries({ queryKey: [`/api/ai/analyze-inspection/${id}/status`] });
      return { started: true };
    }

    const errorBody = await response.json().catch(() => ({}));
    const message = typeof errorBody.message === "string" ? errorBody.message : "";

    if (response.status === 409) {
      return { started: false };
    }
    if (response.status === 400 && message.includes("No photos found")) {
      return { started: false };
    }

    throw new Error(message || "Failed to start AI analysis");
  };

  const shouldOfferTenantReview =
    (inspection?.type === "check_in" || inspection?.type === "check_out") &&
    !!inspection?.propertyId;

  const getRequiredIncompleteForDetail = () => {
    const snapshot = inspection?.templateSnapshotJson || {};
    const sections = Array.isArray(snapshot.sections) ? snapshot.sections : [];
    const fromEntries = repeatableCountsFromEntries(detailEntries);
    const layoutCounts = inspection?.propertyRoomCountsSnapshot ?? null;
    const fromLayout = layoutCounts
      ? repeatableCountsFromPropertyLayout(snapshot, layoutCounts)
      : {};
    return listRequiredIncompleteFields({
      sections,
      entries: detailEntries,
      repeatableCounts: { ...fromEntries, ...fromLayout },
      propertyRoomInstances: Array.isArray(snapshot.propertyRoomInstances)
        ? snapshot.propertyRoomInstances
        : [],
      templateStructure: snapshot,
      excludeTenantSignatures: !tenanciesEnabled,
    });
  };

  const requestMarkComplete = () => {
    const missing = getRequiredIncompleteForDetail();
    if (missing.length > 0) {
      toast({
        variant: "destructive",
        title: "Required fields missing",
        description: formatRequiredIncompleteMessage(missing),
      });
      if (id) setLocation(`/inspections/${id}/capture`);
      return;
    }
    setShowCompleteDialog(true);
  };

  const finalizeComplete = async (opts: { withAI: boolean; sendToTenant: boolean }) => {
    const missing = getRequiredIncompleteForDetail();
    if (missing.length > 0) {
      setShowCompleteDialog(false);
      setShowSendToTenantDialog(false);
      toast({
        variant: "destructive",
        title: "Required fields missing",
        description: formatRequiredIncompleteMessage(missing),
      });
      if (id) setLocation(`/inspections/${id}/capture`);
      return;
    }

    setCompletingAction(opts.withAI ? "with-ai" : "without-ai");
    if (opts.sendToTenant) {
      setSendingToTenantAction("yes");
    } else if (shouldOfferTenantReview) {
      setSendingToTenantAction("no");
    }

    try {
      let aiStarted = false;
      if (opts.withAI) {
        if (!isOnline) {
          toast({
            variant: "destructive",
            title: "You are offline",
            description: "Connect to the internet to run AI analysis before completing.",
          });
          return;
        }
        try {
          const result = await startBackgroundAIAnalysis();
          aiStarted = result.started;
        } catch (aiError: any) {
          toast({
            variant: "destructive",
            title: "AI analysis could not start",
            description: aiError.message || "The inspection will still be completed.",
          });
        }
      }

      await completeInspection.mutateAsync(opts.sendToTenant);
      setShowCompleteDialog(false);
      setShowSendToTenantDialog(false);
      queryClient.invalidateQueries({ queryKey: ["/api/inspections", id] });
      queryClient.invalidateQueries({ queryKey: ["/api/inspections/my"] });
      toast({
        title: "Inspection completed",
        description: opts.sendToTenant
          ? "Sent to the tenant for review and signature."
          : aiStarted
            ? "AI analysis is running in the background on this report."
            : "Inspection marked as completed",
      });
    } catch {
      // Error toast handled by mutation
    } finally {
      setCompletingAction(null);
      setSendingToTenantAction(null);
    }
  };

  const handleCompleteWithoutAI = () => {
    if (shouldOfferTenantReview) {
      setPendingCompleteWithAI(false);
      setShowCompleteDialog(false);
      setShowSendToTenantDialog(true);
      return;
    }
    void finalizeComplete({ withAI: false, sendToTenant: false });
  };

  const handleCompleteWithAI = () => {
    if (!isOnline) {
      toast({
        variant: "destructive",
        title: "You are offline",
        description: "Connect to the internet to run AI analysis before completing.",
      });
      return;
    }
    if (shouldOfferTenantReview) {
      setPendingCompleteWithAI(true);
      setShowCompleteDialog(false);
      setShowSendToTenantDialog(true);
      return;
    }
    void finalizeComplete({ withAI: true, sendToTenant: false });
  };

  const deleteInspectionMutation = useMutation({
    mutationFn: async () => {
      return await apiRequest("DELETE", `/api/inspections/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/inspections"] });
      toast({
        title: "Deleted",
        description: "Inspection has been permanently deleted",
      });
      setLocation("/inspections");
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to delete inspection",
        variant: "destructive",
      });
    },
  });

  const { data: clerks = [] } = useQuery<any[]>({
    queryKey: ["/api/users/clerks"],
  });

  const editFormSchema = z.object({
    type: z.enum(["check_in", "check_out", "routine", "maintenance", "esg_sustainability_inspection", "fire_hazard_assessment", "maintenance_inspection", "damage", "emergency", "safety_compliance", "compliance_regulatory", "pre_purchase", "specialized"]),
    scheduledDate: z.string().min(1, "Scheduled date is required"),
    inspectorId: z.string().optional(),
    notes: z.string().optional(),
  });

  type EditFormData = z.infer<typeof editFormSchema>;

  const editForm = useForm<EditFormData>({
    resolver: zodResolver(editFormSchema),
    defaultValues: {
      type: inspection?.type || "routine",
      scheduledDate: inspection?.scheduledDate ? new Date(inspection.scheduledDate).toISOString().split("T")[0] : "",
      inspectorId: inspection?.inspectorId || "",
      notes: inspection?.notes || "",
    },
  });

  const updateInspectionMutation = useMutation({
    mutationFn: async (data: EditFormData) => {
      return await apiRequest("PATCH", `/api/inspections/${id}`, {
        ...data,
        scheduledDate: data.scheduledDate ? new Date(data.scheduledDate).toISOString() : undefined,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/inspections", id] });
      queryClient.invalidateQueries({ queryKey: ["/api/inspections/my"] });
      setShowEditDialog(false);
      toast({
        title: "Success",
        description: "Inspection updated successfully",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to update inspection",
        variant: "destructive",
      });
    },
  });

  const handleEditSubmit = (data: EditFormData) => {
    updateInspectionMutation.mutate(data);
  };

  const openEditDialog = () => {
    editForm.reset({
      type: inspection?.type || "routine",
      scheduledDate: inspection?.scheduledDate ? new Date(inspection.scheduledDate).toISOString().split("T")[0] : "",
      inspectorId: inspection?.inspectorId || "",
      notes: inspection?.notes || "",
    });
    setShowEditDialog(true);
  };

  const handleDeleteInspection = () => {
    deleteInspectionMutation.mutate();
  };

  if (isLoading) {
    return (
      <div className={cn("container mx-auto min-w-0", pagePad)}>
        <div className="flex justify-center items-center h-64">
          <p className="text-muted-foreground">Loading inspection...</p>
        </div>
      </div>
    );
  }

  if (!inspection) {
    return (
      <div className={cn("container mx-auto min-w-0", pagePad)}>
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <p className="text-lg font-medium">Inspection not found</p>
            <Link href="/inspections">
              <Button variant="outline" className="mt-4">
                <ArrowLeft className="w-4 h-4 mr-2" />
                Back to Inspections
              </Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  const getStatusBadge = (status: string) => (
    <Badge variant={inspectionStatusBadgeVariant(status)}>
      {formatInspectionStatus(status)}
    </Badge>
  );

  const getTypeBadge = (type: string) => (
    <Badge variant="outline">{formatInspectionType(type)}</Badge>
  );

  return (
    <div className={cn("container mx-auto min-w-0 space-y-4 md:space-y-6", pagePad)}>
      <div className="flex flex-col sm:flex-row sm:items-start gap-3 md:gap-4">
        <Link href="/inspections" className="shrink-0">
          <Button variant="ghost" size="icon" data-testid="button-back">
            <ArrowLeft className="w-4 h-4" />
          </Button>
        </Link>
        <div className="flex-1 min-w-0">
          <h1 className="text-xl md:text-2xl lg:text-3xl font-bold truncate" data-testid="text-page-title">
            Inspection Details
          </h1>
          <p className="text-xs md:text-sm text-muted-foreground truncate">
            {inspection.property?.name || inspection.block?.name}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap shrink-0">
          {inspection.status !== "completed" && (
            <Button
              onClick={requestMarkComplete}
              disabled={completeInspection.isPending || completingAction !== null || sendingToTenantAction !== null}
              data-testid="button-complete"
              className="w-full sm:w-auto"
            >
              <CheckCircle className="w-4 h-4 mr-2" />
              {completingAction ? "Completing..." : "Mark Complete"}
            </Button>
          )}
          <Button
            variant="destructive"
            size="icon"
            onClick={() => setShowDeleteDialog(true)}
            data-testid="button-delete-inspection"
          >
            <Trash2 className="w-4 h-4" />
          </Button>
        </div>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0">
            <CardTitle>Inspection Information</CardTitle>
            <Button variant="ghost" size="icon" onClick={openEditDialog} data-testid="button-edit-inspection">
              <Pencil className="w-4 h-4" />
            </Button>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Status:</span>
              {getStatusBadge(inspection.status)}
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Type:</span>
              {getTypeBadge(inspection.type)}
            </div>
            <div className="flex items-center gap-2">
              <Calendar className="w-4 h-4 text-muted-foreground" />
              <span className="text-sm">
                {inspection.scheduledDate
                  ? locale.formatDate(new Date(inspection.scheduledDate), "PPP")
                  : "Not scheduled"}
              </span>
            </div>
            {inspection.completedDate && (
              <div className="flex items-center gap-2">
                <CheckCircle className="w-4 h-4 text-muted-foreground" />
                <span className="text-sm">
                  Completed: {locale.formatDate(new Date(inspection.completedDate), "PPP")}
                </span>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Property</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <MapPin className="w-4 h-4 text-muted-foreground" />
                <span className="font-medium">{inspection.property?.name || inspection.block?.name}</span>
              </div>
              <p className="text-sm text-muted-foreground ml-6">
                {inspection.property?.address || inspection.block?.address}
              </p>
            </div>
            {inspection.clerk && (
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <User className="w-4 h-4 text-muted-foreground" />
                  <span className="text-sm text-muted-foreground">{ASSIGNED_INVENTORY_CLERK_LABEL}:</span>
                </div>
                <p className="text-sm ml-6">{inspection.clerk.email}</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {inspection.notes && (
        <Card>
          <CardHeader>
            <CardTitle>Notes</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm">{inspection.notes}</p>
          </CardContent>
        </Card>
      )}

      {id && (
        <div
          style={{
            display: COMPLETION_CHECKLIST_INSPECTION_UI_VISIBLE ? undefined : "none",
          }}
        >
          <CompletionChecklistPanel
            inspectionId={id}
            readOnly={
              inspection.status === "completed" || inspection.status === "reviewed"
            }
          />
        </div>
      )}

      <AlertDialog
        open={showCompleteDialog}
        onOpenChange={(open) => {
          if (!completingAction) setShowCompleteDialog(open);
        }}
      >
        <AlertDialogContent data-testid="dialog-complete-inspection">
          <AlertDialogHeader>
            <AlertDialogTitle>Complete this inspection?</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3 text-sm text-muted-foreground">
                <p>
                  Once completed, this inspection cannot be edited again. Make sure all fields and photos are correct before continuing.
                </p>
                {checklistRequiredIncomplete > 0 && (
                  <p className="text-amber-700 dark:text-amber-400 font-medium">
                    {checklistRequiredIncomplete} required completion checklist step
                    {checklistRequiredIncomplete === 1 ? " is" : "s are"} still unfinished. You can
                    complete anyway.
                  </p>
                )}
                <p>
                  Would you like to analyse this inspection with AI? This uses the same full report analysis as{" "}
                  <span className="font-medium text-foreground">Analyse Report Using AI</span> and runs in the background while the inspection is marked complete.
                </p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex-col sm:flex-row gap-2">
            <AlertDialogCancel disabled={completingAction !== null}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                void handleCompleteWithoutAI();
              }}
              disabled={completingAction !== null}
              className="bg-secondary text-secondary-foreground hover:bg-secondary/80"
              data-testid="button-complete-without-ai"
            >
              {completingAction === "without-ai" ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Completing...
                </>
              ) : checklistRequiredIncomplete > 0 ? (
                "Complete anyway"
              ) : (
                "No, complete now"
              )}
            </AlertDialogAction>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                void handleCompleteWithAI();
              }}
              disabled={completingAction !== null || !isOnline}
              data-testid="button-complete-with-ai"
            >
              {completingAction === "with-ai" ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Completing...
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4 mr-2" />
                  Yes, analyse with AI
                </>
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={showSendToTenantDialog}
        onOpenChange={(open) => {
          if (!completingAction && !sendingToTenantAction) setShowSendToTenantDialog(open);
        }}
      >
        <AlertDialogContent data-testid="dialog-send-to-tenant">
          <AlertDialogHeader>
            <AlertDialogTitle>Send to tenant for review?</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3 text-sm text-muted-foreground">
                <p>
                  Would you like to send this inspection to the tenant for review? They will be notified in their portal and can view the report and sign the Tenant Signature field. They cannot edit other fields.
                </p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex-col sm:flex-row gap-2">
            <AlertDialogCancel disabled={completingAction !== null || sendingToTenantAction !== null}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                void finalizeComplete({ withAI: pendingCompleteWithAI, sendToTenant: false });
              }}
              disabled={completingAction !== null || sendingToTenantAction !== null}
              className="bg-secondary text-secondary-foreground hover:bg-secondary/80"
              data-testid="button-complete-without-tenant"
            >
              {sendingToTenantAction === "no" ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Completing...
                </>
              ) : (
                "No"
              )}
            </AlertDialogAction>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                void finalizeComplete({ withAI: pendingCompleteWithAI, sendToTenant: true });
              }}
              disabled={completingAction !== null || sendingToTenantAction !== null}
              data-testid="button-complete-send-to-tenant"
            >
              {sendingToTenantAction === "yes" ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Completing...
                </>
              ) : (
                "Yes, send for review"
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete Confirmation Dialog */}
      <DeleteConfirmDialog
        open={showDeleteDialog}
        onOpenChange={setShowDeleteDialog}
        title="Delete inspection?"
        description="This cannot be undone. This will permanently delete the inspection and all associated items, photos, and data."
        isPending={deleteInspectionMutation.isPending}
        confirmLabel="Delete Inspection"
        onConfirm={handleDeleteInspection}
      />

      {/* Edit Inspection Dialog */}
      <Dialog open={showEditDialog} onOpenChange={setShowEditDialog}>
        <DialogContent className={cn(dialogContentBase, "max-w-lg")}>
          <DialogHeader>
            <DialogTitle>Edit Inspection</DialogTitle>
            <DialogDescription>
              Update the inspection details below
            </DialogDescription>
          </DialogHeader>
          <Form {...editForm}>
            <form onSubmit={editForm.handleSubmit(handleEditSubmit)} className="space-y-4">
              <FormField
                control={editForm.control}
                name="type"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Inspection Type</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger data-testid="select-edit-type">
                          <SelectValue placeholder="Select type" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="check_in">Check In</SelectItem>
                        <SelectItem value="check_out">Check Out</SelectItem>
                        <SelectItem value="routine">Routine</SelectItem>
                        <SelectItem value="maintenance">Maintenance</SelectItem>
                        <SelectItem value="esg_sustainability_inspection">ESG Sustainability Inspection</SelectItem>
                        <SelectItem value="fire_hazard_assessment">Fire Hazard Assessment</SelectItem>
                        <SelectItem value="maintenance_inspection">Maintenance Inspection</SelectItem>
                        <SelectItem value="damage">Damage</SelectItem>
                        <SelectItem value="emergency">Emergency</SelectItem>
                        <SelectItem value="safety_compliance">Safety & Compliance</SelectItem>
                        <SelectItem value="compliance_regulatory">Compliance / Regulatory</SelectItem>
                        <SelectItem value="pre_purchase">Pre-Purchase</SelectItem>
                        <SelectItem value="specialized">Specialized</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={editForm.control}
                name="scheduledDate"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Scheduled Date</FormLabel>
                    <FormControl>
                      <LocaleDateInput
                        value={field.value}
                        onChange={(ymd) => field.onChange(ymd ?? "")}
                        onBlur={field.onBlur}
                        name={field.name}
                        ref={field.ref}
                        data-testid="input-edit-date"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={editForm.control}
                name="inspectorId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{ASSIGNED_INVENTORY_CLERK_LABEL}</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value || ""}>
                      <FormControl>
                        <SelectTrigger data-testid="select-edit-clerk">
                          <SelectValue placeholder="Select inventory clerk / inspector" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {clerks.map((clerk: any) => (
                          <SelectItem key={clerk.id} value={clerk.id}>
                            {clerk.firstName && clerk.lastName
                              ? `${clerk.firstName} ${clerk.lastName}`
                              : clerk.email || clerk.username}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={editForm.control}
                name="notes"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Notes</FormLabel>
                    <FormControl>
                      <Textarea
                        {...field}
                        placeholder="Add any notes about this inspection..."
                        className="resize-none"
                        rows={3}
                        data-testid="input-edit-notes"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <DialogFooter>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setShowEditDialog(false)}
                  data-testid="button-cancel-edit"
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={updateInspectionMutation.isPending}
                  data-testid="button-save-edit"
                >
                  {updateInspectionMutation.isPending ? "Saving..." : "Save Changes"}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
