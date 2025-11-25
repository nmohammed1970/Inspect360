import { useState, useEffect } from "react";
import { useParams, useLocation } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { ChevronLeft, ChevronRight, Save, CheckCircle2, AlertCircle, Wifi, WifiOff, Cloud } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import type { Inspection } from "@shared/schema";
import { FieldWidget } from "@/components/FieldWidget";
import { offlineQueue, useOnlineStatus } from "@/lib/offlineQueue";
import { InspectionQuickActions } from "@/components/InspectionQuickActions";
import { QuickAddAssetSheet } from "@/components/QuickAddAssetSheet";
import { QuickUpdateAssetSheet } from "@/components/QuickUpdateAssetSheet";
import { QuickAddMaintenanceSheet } from "@/components/QuickAddMaintenanceSheet";

interface TemplateSection {
  id: string;
  title: string;
  description?: string;
  repeatable?: boolean;
  fields: TemplateField[];
}

interface TemplateField {
  id: string;
  key?: string; // For compatibility with legacy templates
  label: string;
  type: string;
  required?: boolean;
  placeholder?: string;
  options?: string[];
  validation?: Record<string, any>;
  dependsOn?: Record<string, any>;
  includeCondition?: boolean;
  includeCleanliness?: boolean;
}

interface InspectionEntry {
  id?: string;
  sectionRef: string;
  fieldKey: string;
  fieldType: string;
  valueJson?: any;
  note?: string;
  photos?: string[];
  maintenanceFlag?: boolean;
  markedForReview?: boolean;
}

export default function InspectionCapture() {
  const { id } = useParams<{ id: string }>();
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const [currentSectionIndex, setCurrentSectionIndex] = useState(0);
  const [entries, setEntries] = useState<Record<string, InspectionEntry>>({});
  const isOnline = useOnlineStatus();
  const [pendingCount, setPendingCount] = useState(0);
  const [isSyncing, setIsSyncing] = useState(false);
  const [showAssetSheet, setShowAssetSheet] = useState(false);
  const [showUpdateAssetSheet, setShowUpdateAssetSheet] = useState(false);
  const [showMaintenanceSheet, setShowMaintenanceSheet] = useState(false);
  const [maintenanceContext, setMaintenanceContext] = useState<{
    fieldLabel?: string;
    sectionTitle?: string;
    entryId?: string;
    photos?: string[];
  }>({});

  // Fetch inspection with template snapshot
  const { data: inspection, isLoading } = useQuery<Inspection>({
    queryKey: ["/api/inspections", id],
  });

  // Fetch property details if inspection has a propertyId
  const { data: property } = useQuery<any>({
    queryKey: [`/api/properties/${inspection?.propertyId}`],
    enabled: !!inspection?.propertyId,
  });

  // Fetch existing entries for this inspection
  const { data: existingEntries = [] } = useQuery<any[]>({
    queryKey: [`/api/inspections/${id}/entries`],
    enabled: !!id,
  });

  // Load existing entries into state on mount and auto-populate property address
  useEffect(() => {
    if (existingEntries.length > 0) {
      const entriesMap: Record<string, InspectionEntry> = {};
      existingEntries.forEach((entry: any) => {
        const key = `${entry.sectionRef}-${entry.fieldKey}`;
        entriesMap[key] = entry;
      });
      setEntries(entriesMap);
    }
  }, [existingEntries]);

  // Update pending count periodically
  useEffect(() => {
    const updateCount = () => {
      setPendingCount(offlineQueue.getPendingCount());
    };
    updateCount();
    const interval = setInterval(updateCount, 2000);
    return () => clearInterval(interval);
  }, []);

  // Auto-sync when coming online
  useEffect(() => {
    if (isOnline && pendingCount > 0 && !isSyncing) {
      handleSync();
    }
  }, [isOnline]);

  const handleSync = async () => {
    if (isSyncing || pendingCount === 0) return;
    
    setIsSyncing(true);
    try {
      const result = await offlineQueue.syncAll(apiRequest);
      if (result.success > 0) {
        toast({
          title: "Sync Complete",
          description: `${result.success} ${result.success === 1 ? 'entry' : 'entries'} synced successfully`,
        });
        queryClient.invalidateQueries({ queryKey: [`/api/inspections/${id}/entries`] });
      }
      if (result.failed > 0) {
        toast({
          variant: "destructive",
          title: "Sync Issues",
          description: `${result.failed} ${result.failed === 1 ? 'entry' : 'entries'} failed to sync`,
        });
      }
      setPendingCount(offlineQueue.getPendingCount());
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Sync Failed",
        description: "Unable to sync offline entries",
      });
    } finally {
      setIsSyncing(false);
    }
  };

  // Parse template structure from snapshot and migrate old templates
  const rawTemplateStructure = inspection?.templateSnapshotJson as { sections: TemplateSection[] } | null;
  
  // Migrate old templates: ensure all fields have both id and key
  const templateStructure = rawTemplateStructure ? {
    sections: rawTemplateStructure.sections.map(section => ({
      ...section,
      fields: section.fields.map((field: any) => ({
        ...field,
        id: field.id || field.key, // Use existing id or fall back to key
        key: field.key || field.id, // Ensure key exists too
      })),
    })),
  } : null;
  
  const sections = templateStructure?.sections || [];
  const currentSection = sections[currentSectionIndex];

  // Auto-start inspection on first visit
  useEffect(() => {
    if (inspection && inspection.status === "scheduled" && !inspection.startedAt) {
      // Update status to in_progress
      fetch(`/api/inspections/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          status: "in_progress",
          startedAt: new Date().toISOString(),
        }),
      }).then(() => {
        queryClient.invalidateQueries({ queryKey: ["/api/inspections", id] });
      });
    }
  }, [inspection, id]);

  // Calculate progress - count entries with values OR photos
  const totalFields = sections.reduce((acc, section) => acc + section.fields.length, 0);
  const completedFields = Object.values(entries).filter(entry => {
    // Count as complete if has valueJson OR photos
    const hasValue = entry.valueJson !== null && entry.valueJson !== undefined;
    const hasPhotos = entry.photos && entry.photos.length > 0;
    return hasValue || hasPhotos;
  }).length;
  const progress = totalFields > 0 ? (completedFields / totalFields) * 100 : 0;

  // Update entry mutation
  const updateEntry = useMutation({
    mutationFn: async (entry: InspectionEntry) => {
      const response = await fetch(`/api/inspection-entries`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          inspectionId: id,
          ...entry,
        }),
      });
      if (!response.ok) throw new Error(await response.text());
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/inspections/${id}/entries`] });
    },
    onError: (error: Error) => {
      toast({
        variant: "destructive",
        title: "Error saving field",
        description: error.message,
      });
    },
  });

  // Auto-populate property address when property is loaded and template is available
  useEffect(() => {
    if (!property?.address || !templateStructure || !sections.length || !id) return;
    
    // Check if entry already exists in existingEntries (from server)
    const hasExistingEntry = existingEntries.some((entry: any) => {
      const labelLower = entry.fieldKey?.toLowerCase() || "";
      return labelLower.includes("property_address") || labelLower.includes("property_address");
    });
    
    if (hasExistingEntry) return; // Don't overwrite existing entries
    
    // Find the property address field in the General Information section
    const generalInfoSection = sections.find(section => 
      section.title.toLowerCase().includes("general") || 
      section.id?.toLowerCase().includes("general")
    );
    
    if (!generalInfoSection) return;
    
    // Find property address field by label or common field IDs
    const addressField = generalInfoSection.fields.find(field => {
      const labelLower = field.label?.toLowerCase() || "";
      const fieldIdLower = field.id?.toLowerCase() || "";
      const fieldKeyLower = field.key?.toLowerCase() || "";
      
      return (
        labelLower.includes("property address") ||
        (labelLower.includes("address") && labelLower.includes("property")) ||
        fieldIdLower.includes("property_address") ||
        fieldKeyLower.includes("property_address")
      );
    });
    
    if (!addressField) return;
    
    const entryKey = `${generalInfoSection.id}-${addressField.id}`;
    const existingEntry = entries[entryKey];
    
    // Only auto-populate if the field is empty
    if (!existingEntry || !existingEntry.valueJson) {
      // Create entry directly (similar to handleFieldChange but without currentSection dependency)
      const entry: InspectionEntry = {
        sectionRef: generalInfoSection.id,
        fieldKey: addressField.id,
        fieldType: addressField.type as any,
        valueJson: property.address,
      };

      // Update local state optimistically
      setEntries(prev => ({
        ...prev,
        [entryKey]: entry,
      }));

      // Save to backend if online
      if (isOnline) {
        updateEntry.mutate(entry);
      } else {
        // If offline, queue the entry
        offlineQueue.enqueue({
          inspectionId: id,
          sectionRef: generalInfoSection.id,
          fieldKey: addressField.id,
          fieldType: addressField.type,
          valueJson: property.address,
        });
        setPendingCount(offlineQueue.getPendingCount());
      }
    }
  }, [property, templateStructure, sections, entries, existingEntries, id, isOnline, updateEntry]);

  // Handle field value change
  const handleFieldChange = (fieldKey: string, value: any, note?: string | undefined, photos?: string[] | undefined) => {
    const field = currentSection.fields.find(f => f.id === fieldKey);
    if (!field) return;

    const entryKey = `${currentSection.id}-${fieldKey}`;
    
    // Only save if there's a value or note/photos
    // But for progress calculation, only count as complete if value exists
    if (value === null || value === undefined) {
      // If only notes/photos without value, still save but don't count as complete
      if (!note && (!photos || photos.length === 0)) {
        return; // Nothing to save
      }
    }

    // If offline, queue the entry
    if (!isOnline) {
      offlineQueue.enqueue({
        inspectionId: id!,
        sectionRef: currentSection.id,
        fieldKey,
        fieldType: field.type,
        valueJson: value,
        note,
        photos,
      });
      
      // Update local state optimistically
      setEntries(prev => ({
        ...prev,
        [entryKey]: {
          sectionRef: currentSection.id,
          fieldKey,
          fieldType: field.type,
          valueJson: value,
          note,
          photos,
        }
      }));
      
      setPendingCount(offlineQueue.getPendingCount());
      
      toast({
        title: "Saved Offline",
        description: "Entry will sync when connection is restored",
      });
      return;
    }

    const existingEntry = entries[entryKey];
    const entry: InspectionEntry = {
      sectionRef: currentSection.id,
      fieldKey,
      fieldType: field.type,
      valueJson: value,
      note,
      photos,
      markedForReview: existingEntry?.markedForReview || false,
    };

    // Update local state optimistically
    setEntries(prev => ({
      ...prev,
      [entryKey]: entry,
    }));

    // Save to backend
    updateEntry.mutate(entry);
  };

  // Handle mark for review change
  const handleMarkedForReviewChange = async (fieldKey: string, marked: boolean) => {
    const entryKey = `${currentSection.id}-${fieldKey}`;
    const entry = entries[entryKey];
    
    // Update local state optimistically
    setEntries(prev => ({
      ...prev,
      [entryKey]: {
        ...prev[entryKey],
        markedForReview: marked,
      }
    }));

    if (!entry?.id) {
      // Entry doesn't exist yet - will be saved with markedForReview when created
      return;
    }

    // Update on server
    try {
      const response = await fetch(`/api/inspection-entries/${entry.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ markedForReview: marked }),
      });
      if (!response.ok) throw new Error(await response.text());
      queryClient.invalidateQueries({ queryKey: [`/api/inspections/${id}/entries`] });
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Error",
        description: "Failed to update mark for review",
      });
      // Revert optimistic update
      setEntries(prev => ({
        ...prev,
        [entryKey]: {
          ...prev[entryKey],
          markedForReview: !marked,
        }
      }));
    }
  };

  // Navigate sections
  const goToNextSection = () => {
    if (currentSectionIndex < sections.length - 1) {
      setCurrentSectionIndex(currentSectionIndex + 1);
    }
  };

  const goToPreviousSection = () => {
    if (currentSectionIndex > 0) {
      setCurrentSectionIndex(currentSectionIndex - 1);
    }
  };

  // Complete inspection
  const completeInspection = useMutation({
    mutationFn: async () => {
      const response = await fetch(`/api/inspections/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          status: "completed",
          completedDate: new Date().toISOString(),
        }),
      });
      if (!response.ok) throw new Error(await response.text());
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "Inspection completed",
        description: "All entries have been saved successfully.",
      });
      navigate("/inspections");
    },
    onError: (error: Error) => {
      toast({
        variant: "destructive",
        title: "Error completing inspection",
        description: error.message,
      });
    },
  });

  if (isLoading) {
    return (
      <div className="container mx-auto px-4 py-8 space-y-6">
        <Skeleton className="h-12 w-full" />
        <Skeleton className="h-[500px] w-full" />
      </div>
    );
  }

  if (!inspection) {
    return (
      <div className="container mx-auto px-4 py-8">
        <Card>
          <CardContent className="p-8 text-center">
            <AlertCircle className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
            <h2 className="text-2xl font-semibold mb-2">Inspection not found</h2>
            <p className="text-muted-foreground mb-6">
              The inspection you're looking for doesn't exist or has been removed.
            </p>
            <Button onClick={() => navigate("/inspections")} data-testid="button-back-to-inspections">
              Back to Inspections
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!templateStructure || sections.length === 0) {
    return (
      <div className="container mx-auto px-4 py-8">
        <Card>
          <CardContent className="p-8 text-center">
            <AlertCircle className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
            <h2 className="text-2xl font-semibold mb-2">No template available</h2>
            <p className="text-muted-foreground mb-6">
              This inspection doesn't have a template structure to fill out.
            </p>
            <Button onClick={() => navigate("/inspections")} data-testid="button-back-to-inspections">
              Back to Inspections
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-semibold mb-2" data-testid="text-inspection-title">
            Inspection Capture
          </h1>
          <p className="text-muted-foreground">
            {inspection.propertyId ? "Property" : "Block"} Inspection
          </p>
        </div>
        <div className="flex items-center gap-4">
          {/* Online/Offline status */}
          <Badge 
            variant={isOnline ? "default" : "secondary"}
            data-testid="badge-online-status"
            className="gap-2"
          >
            {isOnline ? <Wifi className="w-3 h-3" /> : <WifiOff className="w-3 h-3" />}
            {isOnline ? "Online" : "Offline"}
          </Badge>
          
          {/* Pending sync count */}
          {pendingCount > 0 && (
            <Badge variant="outline" data-testid="badge-pending-sync">
              <Cloud className="w-3 h-3 mr-1" />
              {pendingCount} pending
            </Badge>
          )}
          
          {/* Manual sync button */}
          {isOnline && pendingCount > 0 && (
            <Button
              size="sm"
              variant="outline"
              onClick={handleSync}
              disabled={isSyncing}
              data-testid="button-sync"
            >
              {isSyncing ? "Syncing..." : "Sync Now"}
            </Button>
          )}
          
          <Badge variant="secondary" data-testid="badge-progress">
            {completedFields} / {totalFields} fields
          </Badge>
          <Button
            onClick={() => completeInspection.mutate()}
            disabled={completeInspection.isPending}
            data-testid="button-complete-inspection"
          >
            <CheckCircle2 className="w-4 h-4 mr-2" />
            Complete Inspection
          </Button>
        </div>
      </div>

      {/* Progress bar */}
      <Card>
        <CardContent className="p-6">
          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Progress</span>
              <span className="font-medium">{Math.round(progress)}%</span>
            </div>
            <Progress value={progress} data-testid="progress-inspection" />
          </div>
        </CardContent>
      </Card>

      {/* Section navigation */}
      <div className="flex items-center gap-2 overflow-x-auto pb-2">
        {sections.map((section, index) => (
          <Button
            key={section.id}
            variant={index === currentSectionIndex ? "default" : "outline"}
            size="sm"
            onClick={() => setCurrentSectionIndex(index)}
            data-testid={`button-section-${index}`}
          >
            {section.title}
          </Button>
        ))}
      </div>

      {/* Current section */}
      {currentSection && (
        <Card>
          <CardHeader>
            <CardTitle data-testid="text-section-title">{currentSection.title}</CardTitle>
            {currentSection.description && (
              <p className="text-sm text-muted-foreground" data-testid="text-section-description">
                {currentSection.description}
              </p>
            )}
          </CardHeader>
          <CardContent className="space-y-6">
            {currentSection.fields.map((field) => {
              const entryKey = `${currentSection.id}-${field.id}`;
              const entry = entries[entryKey];

              return (
                <FieldWidget
                  key={field.id}
                  field={field}
                  value={entry?.valueJson}
                  note={entry?.note}
                  photos={entry?.photos}
                  inspectionId={id}
                  entryId={entry?.id}
                  isCheckOut={inspection?.type === "check_out"}
                  markedForReview={entry?.markedForReview || false}
                  onChange={(value: any, note?: string, photos?: string[]) => handleFieldChange(field.id, value, note, photos)}
                  onMarkedForReviewChange={(marked: boolean) => handleMarkedForReviewChange(field.id, marked)}
                  onLogMaintenance={(fieldLabel: string, photos: string[]) => {
                    setMaintenanceContext({
                      fieldLabel,
                      sectionTitle: currentSection.title,
                      entryId: entry?.id,
                      photos,
                    });
                    setShowMaintenanceSheet(true);
                  }}
                />
              );
            })}
          </CardContent>
        </Card>
      )}

      {/* Navigation buttons */}
      <div className="flex justify-between">
        <Button
          variant="outline"
          onClick={goToPreviousSection}
          disabled={currentSectionIndex === 0}
          data-testid="button-previous-section"
        >
          <ChevronLeft className="w-4 h-4 mr-2" />
          Previous
        </Button>
        <Button
          onClick={goToNextSection}
          disabled={currentSectionIndex === sections.length - 1}
          data-testid="button-next-section"
        >
          Next
          <ChevronRight className="w-4 h-4 ml-2" />
        </Button>
      </div>

      {/* Quick Actions FAB */}
      <InspectionQuickActions
        onAddAsset={() => setShowAssetSheet(true)}
        onUpdateAsset={() => setShowUpdateAssetSheet(true)}
        onLogMaintenance={() => setShowMaintenanceSheet(true)}
      />

      {/* Quick Add Asset Sheet */}
      <QuickAddAssetSheet
        open={showAssetSheet}
        onOpenChange={setShowAssetSheet}
        propertyId={inspection?.propertyId || undefined}
        blockId={inspection?.blockId || undefined}
        inspectionId={id}
      />

      {/* Quick Update Asset Sheet */}
      <QuickUpdateAssetSheet
        open={showUpdateAssetSheet}
        onOpenChange={setShowUpdateAssetSheet}
        propertyId={inspection?.propertyId || undefined}
        blockId={inspection?.blockId || undefined}
        inspectionId={id}
      />

      {/* Quick Add Maintenance Sheet */}
      <QuickAddMaintenanceSheet
        open={showMaintenanceSheet}
        onOpenChange={(open) => {
          setShowMaintenanceSheet(open);
          if (!open) {
            setMaintenanceContext({});
          }
        }}
        propertyId={inspection?.propertyId || undefined}
        blockId={inspection?.blockId || undefined}
        inspectionId={id}
        inspectionEntryId={maintenanceContext.entryId}
        fieldLabel={maintenanceContext.fieldLabel}
        sectionTitle={maintenanceContext.sectionTitle}
        initialPhotos={maintenanceContext.photos}
      />
    </div>
  );
}
