import { useState, useEffect } from "react";
import { useParams, useLocation } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { ChevronLeft, ChevronRight, Save, CheckCircle2, AlertCircle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import type { Inspection } from "@shared/schema";
import { FieldWidget } from "@/components/FieldWidget";

interface TemplateSection {
  id: string;
  title: string;
  description?: string;
  repeatable?: boolean;
  fields: TemplateField[];
}

interface TemplateField {
  id: string;
  label: string;
  type: string;
  required?: boolean;
  placeholder?: string;
  options?: string[];
  validation?: Record<string, any>;
  dependsOn?: Record<string, any>;
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
}

export default function InspectionCapture() {
  const { id } = useParams<{ id: string }>();
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const [currentSectionIndex, setCurrentSectionIndex] = useState(0);
  const [entries, setEntries] = useState<Record<string, InspectionEntry>>({});

  // Fetch inspection with template snapshot
  const { data: inspection, isLoading } = useQuery<Inspection>({
    queryKey: ["/api/inspections", id],
  });

  // Fetch existing entries for this inspection
  const { data: existingEntries = [] } = useQuery<any[]>({
    queryKey: [`/api/inspections/${id}/entries`],
    enabled: !!id,
  });

  // Load existing entries into state on mount
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

  // Parse template structure from snapshot
  const templateStructure = inspection?.templateSnapshotJson as { sections: TemplateSection[] } | null;
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

  // Calculate progress - only count entries with actual values
  const totalFields = sections.reduce((acc, section) => acc + section.fields.length, 0);
  const completedFields = Object.values(entries).filter(entry => 
    entry.valueJson !== null && entry.valueJson !== undefined
  ).length;
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

    const entry: InspectionEntry = {
      sectionRef: currentSection.id,
      fieldKey,
      fieldType: field.type,
      valueJson: value,
      note,
      photos,
    };

    // Update local state optimistically
    setEntries(prev => ({
      ...prev,
      [entryKey]: entry,
    }));

    // Save to backend
    updateEntry.mutate(entry);
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
        method: "PUT",
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
          <Badge variant="secondary" data-testid="badge-progress">
            {completedFields} / {totalFields} fields
          </Badge>
          <Button
            onClick={() => completeInspection.mutate()}
            disabled={completeInspection.isPending || progress < 100}
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
                  onChange={(value: any, note?: string, photos?: string[]) => handleFieldChange(field.id, value, note, photos)}
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
    </div>
  );
}
