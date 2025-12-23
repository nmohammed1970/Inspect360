import { useState, useEffect } from "react";
import { useParams, useLocation } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { ChevronLeft, ChevronRight, Save, CheckCircle2, AlertCircle, Wifi, WifiOff, Cloud, Sparkles, Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import type { Inspection } from "@shared/schema";
import { FieldWidget } from "@/components/FieldWidget";
import { offlineQueue, useOnlineStatus } from "@/lib/offlineQueue";
import { InspectionQuickActions } from "@/components/InspectionQuickActions";
import { QuickAddAssetSheet } from "@/components/QuickAddAssetSheet";
import { QuickUpdateAssetSheet } from "@/components/QuickUpdateAssetSheet";
import { QuickAddMaintenanceSheet } from "@/components/QuickAddMaintenanceSheet";

interface AIAnalysisStatus {
  status: "idle" | "processing" | "completed" | "failed";
  progress: number;
  totalFields: number;
  error: string | null;
}

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

  // Copy from previous check-in state
  const [copyImages, setCopyImages] = useState(false);
  const [copyNotes, setCopyNotes] = useState(false);
  // Track what was copied so we can remove it when unchecked
  const [copiedImageKeys, setCopiedImageKeys] = useState<Set<string>>(new Set());
  const [copiedNoteKeys, setCopiedNoteKeys] = useState<Set<string>>(new Set());

  // Fetch inspection with template snapshot
  const { data: inspection, isLoading } = useQuery<Inspection>({
    queryKey: ["/api/inspections", id],
  });

  // Fetch property details if inspection has a propertyId
  const { data: property } = useQuery<any>({
    queryKey: [`/api/properties/${inspection?.propertyId}`],
    enabled: !!inspection?.propertyId,
  });

  // Fetch block details if inspection has a blockId
  const { data: block } = useQuery<any>({
    queryKey: [`/api/blocks/${inspection?.blockId}`],
    enabled: !!inspection?.blockId,
  });

  // Fetch inspector details - use /api/users/:userId endpoint
  const { data: inspector } = useQuery<any>({
    queryKey: [`/api/users/${inspection?.inspectorId}`],
    enabled: !!inspection?.inspectorId,
  });

  // Fetch tenant information for property - use existing /api/properties/:id/tenants endpoint
  const { data: tenants = [] } = useQuery<any[]>({
    queryKey: [`/api/properties/${inspection?.propertyId}/tenants`],
    enabled: !!inspection?.propertyId,
  });

  // Fetch existing entries for this inspection
  const { data: existingEntries = [] } = useQuery<any[]>({
    queryKey: [`/api/inspections/${id}/entries`],
    enabled: !!id,
  });

  // Fetch most recent check-in inspection for check-out inspections
  const { data: checkInData, error: checkInError } = useQuery<{
    inspection: Inspection;
    entries: any[];
  } | null>({
    queryKey: [`/api/properties/${inspection?.propertyId}/most-recent-checkin`],
    enabled: !!inspection?.propertyId && inspection?.type === "check_out",
    retry: false,
  });

  // AI Analysis status polling
  const { data: aiAnalysisStatus } = useQuery<AIAnalysisStatus>({
    queryKey: [`/api/ai/analyze-inspection/${id}/status`],
    enabled: !!id,
    refetchInterval: (query) => {
      // Poll every 2 seconds while processing
      const status = query.state.data?.status;
      return status === "processing" ? 2000 : false;
    },
  });

  // Start AI analysis mutation
  const startAIAnalysis = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", `/api/ai/analyze-inspection/${id}`);
      return response.json();
    },
    onSuccess: (data: any) => {
      toast({
        title: "AI Analysis Started",
        description: data.message || "Analysis is running in the background. You can continue working.",
      });
      // Start polling for status
      queryClient.invalidateQueries({ queryKey: [`/api/ai/analyze-inspection/${id}/status`] });
    },
    onError: (error: any) => {
      toast({
        variant: "destructive",
        title: "Failed to start AI analysis",
        description: error.message || "Please try again",
      });
    },
  });

  // Refetch entries when AI analysis completes
  useEffect(() => {
    if (aiAnalysisStatus?.status === "completed") {
      queryClient.invalidateQueries({ queryKey: [`/api/inspections/${id}/entries`] });
      toast({
        title: "AI Analysis Complete",
        description: "All inspection fields have been analyzed.",
      });
    }
  }, [aiAnalysisStatus?.status, id, toast]);

  // Load existing entries into state on mount and auto-populate property address
  useEffect(() => {
    if (existingEntries) {
      const entriesMap: Record<string, InspectionEntry> = {};
      existingEntries.forEach((entry: any) => {
        const key = `${entry.sectionRef}-${entry.fieldKey}`;
        entriesMap[key] = {
          id: entry.id,
          sectionRef: entry.sectionRef,
          fieldKey: entry.fieldKey,
          fieldType: entry.fieldType,
          valueJson: entry.valueJson,
          note: entry.note || undefined,
          photos: entry.photos || [],
          maintenanceFlag: entry.maintenanceFlag,
          markedForReview: entry.markedForReview,
        };
      });
      // Merge with existing entries to preserve any local changes, but prioritize server data
      setEntries(prev => ({ ...prev, ...entriesMap }));
    }
  }, [existingEntries]);

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
      // If inspection is still in draft status, update to in_progress
      if (inspection?.status === "draft") {
        fetch(`/api/inspections/${id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            status: "in_progress",
            startedAt: new Date().toISOString(),
          }),
        }).then(() => {
          queryClient.invalidateQueries({ queryKey: ["/api/inspections", id] });
          queryClient.invalidateQueries({ queryKey: ["/api/inspections"] });
        });
      }
      // Invalidate entries query to ensure report page gets fresh data
      queryClient.invalidateQueries({ queryKey: [`/api/inspections/${id}/entries`] });
      // Also invalidate inspection query
      queryClient.invalidateQueries({ queryKey: ["/api/inspections", id] });
      // Force immediate refetch for any active queries (like report page)
      queryClient.refetchQueries({ queryKey: [`/api/inspections/${id}/entries`] });
      queryClient.refetchQueries({ queryKey: ["/api/inspections", id] });
    },
    onError: (error: Error) => {
      toast({
        variant: "destructive",
        title: "Error saving field",
        description: error.message,
      });
    },
  });

  // Server-side copy mutation
  const copyFromCheckIn = useMutation({
    mutationFn: async (data: { copyImages: boolean; copyNotes: boolean }) => {
      const response = await apiRequest("POST", `/api/inspections/${id}/copy-from-checkin`, data);
      return response.json();
    },
    onSuccess: async (data) => {
      console.log('[Copy] Server response:', data);
      
      if (data.modifiedImageKeys?.length) {
        setCopiedImageKeys(prev => {
          const next = new Set(prev);
          data.modifiedImageKeys.forEach((k: string) => next.add(k));
          return next;
        });
      }
      if (data.modifiedNoteKeys?.length) {
        setCopiedNoteKeys(prev => {
          const next = new Set(prev);
          data.modifiedNoteKeys.forEach((k: string) => next.add(k));
          return next;
        });
      }

      // Invalidate and refetch entries to get updated data
      queryClient.invalidateQueries({ queryKey: [`/api/inspections/${id}/entries`] });
      
      // Wait a bit for the server to finish processing, then refetch
      setTimeout(async () => {
        const result = await queryClient.refetchQueries({ 
          queryKey: [`/api/inspections/${id}/entries`] 
        });
        console.log('[Copy] Refetched entries result:', result);
      }, 500);

      toast({
        title: "Data copied",
        description: "Successfully copied data from previous check-in",
      });
    },
    onError: (error: any) => {
      toast({
        variant: "destructive",
        title: "Copy failed",
        description: error.message
      });
    }
  });

  // Copy images from check-in when checkbox is checked
  useEffect(() => {
    if (!checkInData || !checkInData.entries || !inspection || inspection.type !== "check_out") {
      return;
    }

    if (copyImages) {
      // Trigger server-side copy
      copyFromCheckIn.mutate({ copyImages: true, copyNotes: false });
    } else {
      // If unchecked, remove copied images locally
      if (copiedImageKeys.size > 0) {
        setEntries((currentEntries) => {
          const updatedEntries = { ...currentEntries };
          const entriesToSave: InspectionEntry[] = [];

          // Collect all check-in photos for robust removal
          const allCheckInPhotos = new Set(checkInData.entries.flatMap((e: any) => e.photos || []));

          copiedImageKeys.forEach((key) => {
            const existingEntry = updatedEntries[key];
            if (existingEntry && existingEntry.photos) {
              // Remove photos that exist in check-in
              const newPhotos = existingEntry.photos.filter((photo: string) => !allCheckInPhotos.has(photo));

              if (newPhotos.length !== existingEntry.photos.length) {
                const newEntry: InspectionEntry = {
                  ...existingEntry,
                  photos: newPhotos,
                };
                updatedEntries[key] = newEntry;
                entriesToSave.push(newEntry);
              }
            }
          });

          // Save updated entries
          entriesToSave.forEach((entry) => {
            updateEntry.mutate(entry);
          });

          setCopiedImageKeys(new Set());
          return updatedEntries;
        });
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [copyImages]);

  // Copy notes from check-in when checkbox is checked
  useEffect(() => {
    if (!checkInData || !checkInData.entries || !inspection || inspection.type !== "check_out") {
      return;
    }

    if (copyNotes) {
      // Trigger server-side copy
      copyFromCheckIn.mutate({ copyImages: false, copyNotes: true });
    } else {
      // If unchecked, remove copied notes
      if (copiedNoteKeys.size > 0) {
        setEntries((currentEntries) => {
          const updatedEntries = { ...currentEntries };
          const entriesToSave: InspectionEntry[] = [];

          // Collect all check-in notes
          const allCheckInNotes = new Set(checkInData.entries.map((e: any) => e.note).filter(Boolean));

          copiedNoteKeys.forEach((key) => {
            const existingEntry = updatedEntries[key];
            if (existingEntry && existingEntry.note) {
              // Clear note if it matches any check-in note
              if (allCheckInNotes.has(existingEntry.note)) {
                const newEntry: InspectionEntry = {
                  ...existingEntry,
                  note: undefined,
                };
                updatedEntries[key] = newEntry;
                entriesToSave.push(newEntry);
              }
            }
          });

          // Save updated entries
          entriesToSave.forEach((entry) => {
            updateEntry.mutate(entry);
          });

          setCopiedNoteKeys(new Set());
          return updatedEntries;
        });
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [copyNotes]);

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
    const existingEntry = entries[entryKey];

    // Check if this is a photo removal operation (photos array passed but possibly empty)
    const isPhotoRemoval = photos !== undefined && existingEntry?.photos && existingEntry.photos.length > 0;

    // Only save if there's a value or note/photos, OR if we're removing photos
    // But for progress calculation, only count as complete if value exists
    if (value === null || value === undefined) {
      // If only notes/photos without value, still save but don't count as complete
      // Also save if we're removing photos (to persist the removal)
      if (!note && (!photos || photos.length === 0) && !isPhotoRemoval) {
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

          {/* AI Analysis Button */}
          {aiAnalysisStatus?.status === "processing" ? (
            <Button variant="outline" disabled data-testid="button-ai-analyzing">
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              Analysing ({aiAnalysisStatus.progress}/{aiAnalysisStatus.totalFields})
            </Button>
          ) : aiAnalysisStatus?.status === "completed" ? (
            <Badge variant="default" className="bg-green-600" data-testid="badge-ai-complete">
              <CheckCircle2 className="w-3 h-3 mr-1" />
              AI Analysis Complete
            </Badge>
          ) : (
            <Button
              variant="default"
              className="bg-primary hover:bg-primary/90"
              onClick={() => startAIAnalysis.mutate()}
              disabled={startAIAnalysis.isPending || !isOnline}
              data-testid="button-analyze-report"
            >
              <Sparkles className="w-4 h-4 mr-2" />
              {startAIAnalysis.isPending ? "Starting..." : "Analyse Report Using AI"}
            </Button>
          )}

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

      {/* Copy from Previous Check-In (only for check-out inspections) - Show at top for visibility */}
      {inspection?.type === "check_out" && (
        <Card className="border-primary/20 bg-primary/5">
          <CardContent className="p-4">
            <div className="space-y-3">
              <div className="font-medium text-sm">Copy from Previous Check-In</div>
              {checkInData ? (
                <>
                  <div className="text-xs text-muted-foreground mb-3">
                    Copy data from the most recent check-in inspection ({checkInData.inspection.scheduledDate ? new Date(checkInData.inspection.scheduledDate).toLocaleDateString() : 'N/A'})
                  </div>
                  <div className="flex flex-wrap gap-4">
                    <div className="flex items-center space-x-2">
                      <Checkbox
                        id="copy-images"
                        checked={copyImages}
                        onCheckedChange={(checked) => setCopyImages(checked === true)}
                      />
                      <Label htmlFor="copy-images" className="text-sm font-normal cursor-pointer">
                        Copy Images
                      </Label>
                    </div>
                    <div className="flex items-center space-x-2">
                      <Checkbox
                        id="copy-notes"
                        checked={copyNotes}
                        onCheckedChange={(checked) => setCopyNotes(checked === true)}
                      />
                      <Label htmlFor="copy-notes" className="text-sm font-normal cursor-pointer">
                        Copy Notes
                      </Label>
                    </div>
                  </div>
                  {(copyImages || copyNotes) && (
                    <div className="text-xs text-green-600 dark:text-green-400 flex items-center gap-1 mt-2">
                      <CheckCircle2 className="w-3 h-3" />
                      {copyImages && copyNotes
                        ? "Images and notes copied from check-in inspection"
                        : copyImages
                          ? "Images copied from check-in inspection"
                          : "Notes copied from check-in inspection"}
                    </div>
                  )}
                </>
              ) : (
                <div className="text-xs text-muted-foreground">
                  No previous check-in inspection found for this property.
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* AI Analysis Progress */}
      {aiAnalysisStatus?.status === "processing" && (
        <Card className="border-primary/20 bg-primary/5">
          <CardContent className="p-4">
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-primary" />
                  AI Analysis in Progress
                </span>
                <span className="font-medium">
                  {aiAnalysisStatus.progress} / {aiAnalysisStatus.totalFields} fields
                </span>
              </div>
              <Progress
                value={(aiAnalysisStatus.progress / aiAnalysisStatus.totalFields) * 100}
                className="h-2"
                data-testid="progress-ai-analysis"
              />
              <p className="text-xs text-muted-foreground">
                You can continue working while the AI analyzes your inspection photos in the background.
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* AI Analysis Error */}
      {aiAnalysisStatus?.status === "failed" && aiAnalysisStatus.error && (
        <Card className="border-destructive/20 bg-destructive/5">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-destructive">
              <AlertCircle className="w-4 h-4" />
              <span className="text-sm font-medium">AI Analysis Failed</span>
            </div>
            <p className="text-sm text-muted-foreground mt-1">{aiAnalysisStatus.error}</p>
          </CardContent>
        </Card>
      )}

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
        <Card className="border-2">
          <CardHeader>
            <CardTitle data-testid="text-section-title" className="text-xl font-bold">{currentSection.title}</CardTitle>
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
              
              // Build auto-context for auto-populated fields
              const getAddress = () => {
                if (property) {
                  return [property.address, property.city, property.state, property.postalCode]
                    .filter(Boolean).join(", ");
                }
                if (block) {
                  return [block.address, block.city, block.state, block.postalCode]
                    .filter(Boolean).join(", ");
                }
                return "";
              };
              
              const getTenantNames = () => {
                if (tenants && tenants.length > 0) {
                  const activeAssignments = tenants.filter((t: any) => t.status === "active");
                  if (activeAssignments.length > 0) {
                    return activeAssignments.map((t: any) => t.tenantName || t.name).filter(Boolean).join(", ");
                  }
                }
                return "";
              };
              
              const autoContext = {
                inspectorName: inspector?.fullName || inspector?.username || "",
                address: getAddress(),
                tenantNames: getTenantNames(),
                inspectionDate: inspection?.scheduledDate 
                  ? new Date(inspection.scheduledDate).toISOString().split("T")[0] 
                  : new Date().toISOString().split("T")[0],
              };

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
                  sectionName={currentSection.title}
                  autoContext={autoContext}
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
