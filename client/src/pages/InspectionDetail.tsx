import { useParams, Link, useLocation } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Slider } from "@/components/ui/slider";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { ObjectUploader } from "@/components/ObjectUploader";
import { ArrowLeft, Calendar, MapPin, User, CheckCircle, Plus, Upload, Sparkles, Camera, Trash2, AlertTriangle, Pencil } from "lucide-react";
import { format } from "date-fns";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";

export default function InspectionDetail() {
  const { id } = useParams<{ id: string }>();
  const { toast } = useToast();
  const [, setLocation] = useLocation();

  const [showAddForm, setShowAddForm] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState("");
  const [newItem, setNewItem] = useState({
    category: "",
    itemName: "",
    photoUrl: "",
    conditionRating: 5,
    notes: "",
  });

  const { data: inspection, isLoading } = useQuery<any>({
    queryKey: ["/api/inspections", id],
    enabled: !!id,
  });

  const completeInspection = useMutation({
    mutationFn: async () => {
      return await apiRequest("PATCH", `/api/inspections/${id}/status`, {
        status: "completed",
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/inspections", id] });
      queryClient.invalidateQueries({ queryKey: ["/api/inspections/my"] });
      toast({
        title: "Success",
        description: "Inspection marked as completed",
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

  const addItemMutation = useMutation({
    mutationFn: async (itemData: any) => {
      const response = await apiRequest("POST", "/api/inspection-items", {
        inspectionId: id,
        ...itemData,
      });
      return await response.json();
    },
    onSuccess: async (newItem) => {
      console.log('[InspectionDetail] Item created:', newItem);
      
      // Optimistically update the cache
      queryClient.setQueryData(["/api/inspections", id], (oldData: any) => {
        if (!oldData) return oldData;
        return {
          ...oldData,
          items: [...(oldData.items || []), newItem],
        };
      });
      
      // Invalidate and refetch to ensure we have the latest data
      await queryClient.invalidateQueries({ queryKey: ["/api/inspections", id] });
      await queryClient.refetchQueries({ queryKey: ["/api/inspections", id] });
      
      setShowAddForm(false);
      setNewItem({ category: "", itemName: "", photoUrl: "", conditionRating: 5, notes: "" });
      toast({
        title: "Success",
        description: "Inspection item added successfully",
      });
    },
    onError: (error: any) => {
      console.error('[InspectionDetail] Error adding item:', error);
      toast({
        title: "Error",
        description: error.message || "Failed to add inspection item",
        variant: "destructive",
      });
    },
  });

  const analyzePhotoMutation = useMutation({
    mutationFn: async (itemId: string) => {
      return await apiRequest("POST", "/api/ai/analyze-photo", { itemId });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/inspections", id] });
      toast({
        title: "Success",
        description: "AI analysis completed (1 credit used)",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to analyze photo",
        variant: "destructive",
      });
    },
  });

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
    if (deleteConfirmText === "DELETE") {
      deleteInspectionMutation.mutate();
    }
  };

  const handleAddItem = () => {
    if (!newItem.category || !newItem.itemName) {
      toast({
        title: "Validation Error",
        description: "Category and item name are required",
        variant: "destructive",
      });
      return;
    }
    addItemMutation.mutate(newItem);
  };

  if (isLoading) {
    return (
      <div className="container mx-auto p-4 md:p-6">
        <div className="flex justify-center items-center h-64">
          <p className="text-muted-foreground">Loading inspection...</p>
        </div>
      </div>
    );
  }

  if (!inspection) {
    return (
      <div className="container mx-auto p-4 md:p-6">
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

  const getStatusBadge = (status: string) => {
    const variants: Record<string, { variant: any; label: string; className?: string }> = {
      draft: { variant: "outline", label: "Draft", className: "border-muted-foreground/50 text-muted-foreground" },
      scheduled: { variant: "outline", label: "Scheduled", className: "border-blue-500 text-blue-600 dark:text-blue-400" },
      in_progress: { variant: "default", label: "In Progress", className: "bg-amber-500 text-white dark:bg-amber-600" },
      completed: { variant: "default", label: "Completed", className: "bg-primary text-primary-foreground" },
    };
    const config = variants[status] || variants.draft;
    return <Badge variant={config.variant} className={config.className}>{config.label}</Badge>;
  };

  const getTypeBadge = (type: string) => {
    const labels: Record<string, string> = {
      check_in: "Check In",
      check_out: "Check Out",
      routine: "Routine",
      maintenance: "Maintenance",
      esg_sustainability_inspection: "ESG Sustainability Inspection",
      fire_hazard_assessment: "Fire Hazard Assessment",
      maintenance_inspection: "Maintenance Inspection",
      damage: "Damage",
      emergency: "Emergency",
      safety_compliance: "Safety & Compliance",
      compliance_regulatory: "Compliance / Regulatory",
      pre_purchase: "Pre-Purchase",
      specialized: "Specialized",
    };
    return <Badge variant="outline">{labels[type] || type}</Badge>;
  };

  const items = inspection?.items || [];
  
  // Debug logging
  if (inspection) {
    console.log('[InspectionDetail] Inspection data:', {
      id: inspection.id,
      itemsCount: items.length,
      items: items,
    });
  }

  return (
    <div className="container mx-auto p-4 md:p-6 space-y-4 md:space-y-6">
      <div className="flex items-center gap-2 md:gap-4">
        <Link href="/inspections">
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
        <div className="flex items-center gap-2">
          {inspection.status !== "completed" && (
            <Button
              onClick={() => completeInspection.mutate()}
              disabled={completeInspection.isPending}
              data-testid="button-complete"
            >
              <CheckCircle className="w-4 h-4 mr-2" />
              {completeInspection.isPending ? "Completing..." : "Mark Complete"}
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
                  ? format(new Date(inspection.scheduledDate), "MMMM dd, yyyy")
                  : "Not scheduled"}
              </span>
            </div>
            {inspection.completedDate && (
              <div className="flex items-center gap-2">
                <CheckCircle className="w-4 h-4 text-muted-foreground" />
                <span className="text-sm">
                  Completed: {format(new Date(inspection.completedDate), "MMMM dd, yyyy")}
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
                  <span className="text-sm text-muted-foreground">Assigned Clerk:</span>
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

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-4">
          <div>
            <CardTitle>Inspection Items</CardTitle>
            <CardDescription>
              Photos and condition assessments for this inspection
            </CardDescription>
          </div>
          {inspection.status !== "completed" && (
            <Button
              onClick={() => setShowAddForm(!showAddForm)}
              size="sm"
              data-testid="button-add-item"
            >
              <Plus className="w-4 h-4 mr-2" />
              Add Item
            </Button>
          )}
        </CardHeader>
        <CardContent className="space-y-6">
          {showAddForm && (
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Add New Inspection Item</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="category">Category / Room</Label>
                  <Select
                    value={newItem.category}
                    onValueChange={(value) => setNewItem({ ...newItem, category: value })}
                  >
                    <SelectTrigger id="category" data-testid="select-category">
                      <SelectValue placeholder="Select category" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Kitchen">Kitchen</SelectItem>
                      <SelectItem value="Bathroom">Bathroom</SelectItem>
                      <SelectItem value="Living Room">Living Room</SelectItem>
                      <SelectItem value="Bedroom">Bedroom</SelectItem>
                      <SelectItem value="Hallway">Hallway</SelectItem>
                      <SelectItem value="Exterior">Exterior</SelectItem>
                      <SelectItem value="Other">Other</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="itemName">Item / Feature</Label>
                  <Input
                    id="itemName"
                    placeholder="e.g., Walls, Floors, Countertops, Appliances"
                    value={newItem.itemName}
                    onChange={(e) => setNewItem({ ...newItem, itemName: e.target.value })}
                    data-testid="input-item-name"
                  />
                </div>

                <div className="space-y-2">
                  <Label>Photo (Optional)</Label>
                  <ObjectUploader
                    onGetUploadParameters={async () => {
                      const response = await fetch('/api/objects/upload', {
                        method: 'POST',
                        credentials: 'include',
                      });
                      const { uploadURL } = await response.json();
                      return {
                        method: 'PUT',
                        url: uploadURL,
                      };
                    }}
                    onComplete={async (result) => {
                      if (result.successful && result.successful[0]) {
                        let uploadURL = result.successful[0].uploadURL;
                        
                        // Normalize URL: if absolute, extract pathname; if relative, use as is
                        if (uploadURL && (uploadURL.startsWith('http://') || uploadURL.startsWith('https://'))) {
                          try {
                            const urlObj = new URL(uploadURL);
                            uploadURL = urlObj.pathname;
                          } catch (e) {
                            console.error('[InspectionDetail] Invalid upload URL:', uploadURL);
                          }
                        }
                        
                        // Ensure it's a relative path starting with /objects/
                        if (!uploadURL || !uploadURL.startsWith('/objects/')) {
                          toast({
                            title: "Upload Error",
                            description: "Invalid file URL format. Please try again.",
                            variant: "destructive",
                          });
                          return;
                        }
                        
                        // Convert to absolute URL for ACL call
                        const absoluteUrl = `${window.location.origin}${uploadURL}`;
                        const response = await fetch('/api/objects/set-acl', {
                          method: 'PUT',
                          headers: { 'Content-Type': 'application/json' },
                          credentials: 'include',
                          body: JSON.stringify({ photoUrl: absoluteUrl }),
                        });
                        const { objectPath } = await response.json();
                        setNewItem({ ...newItem, photoUrl: objectPath });
                        toast({
                          title: "Photo uploaded",
                          description: "Photo uploaded successfully",
                        });
                      }
                    }}
                  >
                    <Upload className="w-4 h-4 mr-2" />
                    {newItem.photoUrl ? "Change Photo" : "Upload Photo"}
                  </ObjectUploader>
                  {newItem.photoUrl && (
                    <div className="space-y-2">
                      <div className="relative aspect-video rounded-md overflow-hidden bg-muted border">
                        <img
                          src={newItem.photoUrl.startsWith('/objects/') ? newItem.photoUrl : `/objects/${newItem.photoUrl}`}
                          alt="Preview"
                          className="object-cover w-full h-full"
                        />
                      </div>
                      <p className="text-sm text-muted-foreground">Photo uploaded</p>
                    </div>
                  )}
                </div>

                <div className="space-y-2">
                  <Label>Condition Rating: {newItem.conditionRating}/10</Label>
                  <Slider
                    value={[newItem.conditionRating]}
                    onValueChange={(value) => setNewItem({ ...newItem, conditionRating: value[0] })}
                    min={0}
                    max={10}
                    step={1}
                    className="w-full"
                    data-testid="slider-condition"
                  />
                  <p className="text-xs text-muted-foreground">
                    0 = Poor condition, 10 = Excellent condition
                  </p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="notes">Notes (Optional)</Label>
                  <Textarea
                    id="notes"
                    placeholder="Add any additional observations or details..."
                    value={newItem.notes}
                    onChange={(e) => setNewItem({ ...newItem, notes: e.target.value })}
                    rows={3}
                    data-testid="textarea-notes"
                  />
                </div>

                <div className="flex gap-2">
                  <Button
                    onClick={handleAddItem}
                    disabled={addItemMutation.isPending}
                    data-testid="button-save-item"
                  >
                    {addItemMutation.isPending ? "Saving..." : "Save Item"}
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => {
                      setShowAddForm(false);
                      setNewItem({ category: "", itemName: "", photoUrl: "", conditionRating: 5, notes: "" });
                    }}
                    data-testid="button-cancel"
                  >
                    Cancel
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          {!showAddForm && items.length === 0 && (
            <div className="text-center py-8">
              <Camera className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
              <p className="text-muted-foreground mb-2">No inspection items yet</p>
              <p className="text-sm text-muted-foreground">
                Add inspection items to document the condition of this property
              </p>
            </div>
          )}

          {items.length > 0 && (
            <div className="grid gap-4 md:grid-cols-2">
              {items.map((item: any) => {
                console.log('[InspectionDetail] Rendering item:', item);
                return (
                <Card key={item.id} data-testid={`card-item-${item.id}`}>
                  <CardHeader>
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <CardTitle className="text-base">{item.itemName}</CardTitle>
                        <CardDescription>{item.category}</CardDescription>
                      </div>
                      <Badge variant="secondary" data-testid={`badge-rating-${item.id}`}>
                        {item.conditionRating != null ? `${item.conditionRating}/10` : 'N/A'}
                      </Badge>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {item.photoUrl && (
                      <div className="relative aspect-video rounded-md overflow-hidden bg-muted">
                        <img
                          src={item.photoUrl.startsWith('/objects/') ? item.photoUrl : `/objects/${item.photoUrl}`}
                          alt={item.itemName}
                          className="object-cover w-full h-full"
                          data-testid={`img-item-${item.id}`}
                        />
                      </div>
                    )}
                    
                    {item.notes && (
                      <div className="p-3 bg-muted/50 rounded-md">
                        <p className="text-sm" data-testid={`text-notes-${item.id}`}>
                          {item.notes}
                        </p>
                      </div>
                    )}
                    
                    {item.aiAnalysis && (
                      <div className="p-3 bg-muted rounded-md">
                        <div className="flex items-center gap-2 mb-2">
                          <Sparkles className="w-4 h-4 text-primary" />
                          <span className="text-sm font-medium">AI Analysis</span>
                        </div>
                        <p className="text-sm text-muted-foreground" data-testid={`text-ai-${item.id}`}>
                          {item.aiAnalysis}
                        </p>
                      </div>
                    )}
                    
                    {!item.aiAnalysis && item.photoUrl && inspection.status !== "completed" && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => analyzePhotoMutation.mutate(item.id)}
                        disabled={analyzePhotoMutation.isPending}
                        data-testid={`button-analyze-${item.id}`}
                        className="w-full"
                      >
                        <Sparkles className="w-4 h-4 mr-2" />
                        {analyzePhotoMutation.isPending ? "Analyzing..." : "Analyze with AI (1 credit)"}
                      </Button>
                    )}
                  </CardContent>
                </Card>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Delete Confirmation Dialog */}
      <Dialog open={showDeleteDialog} onOpenChange={(open) => {
        setShowDeleteDialog(open);
        if (!open) setDeleteConfirmText("");
      }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <AlertTriangle className="w-5 h-5" />
              Delete Inspection
            </DialogTitle>
            <DialogDescription>
              This action cannot be undone. This will permanently delete the inspection
              and all associated items, photos, and data.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <p className="text-sm text-muted-foreground">
              To confirm deletion, type <span className="font-bold text-foreground">DELETE</span> in the box below:
            </p>
            <Input
              value={deleteConfirmText}
              onChange={(e) => setDeleteConfirmText(e.target.value)}
              placeholder="Type DELETE to confirm"
              data-testid="input-delete-confirm"
            />
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setShowDeleteDialog(false);
                setDeleteConfirmText("");
              }}
              data-testid="button-cancel-delete"
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleDeleteInspection}
              disabled={deleteConfirmText !== "DELETE" || deleteInspectionMutation.isPending}
              data-testid="button-confirm-delete"
            >
              {deleteInspectionMutation.isPending ? "Deleting..." : "Delete Inspection"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Inspection Dialog */}
      <Dialog open={showEditDialog} onOpenChange={setShowEditDialog}>
        <DialogContent>
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
                      <Input type="date" {...field} data-testid="input-edit-date" />
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
                    <FormLabel>Assigned Clerk</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value || ""}>
                      <FormControl>
                        <SelectTrigger data-testid="select-edit-clerk">
                          <SelectValue placeholder="Select clerk" />
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
