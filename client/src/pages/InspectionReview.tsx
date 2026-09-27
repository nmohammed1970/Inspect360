import { useParams, useLocation } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { SignatureDisplay } from "@/components/SignatureDisplay";
import { Skeleton } from "@/components/ui/skeleton";
import { Progress } from "@/components/ui/progress";
import { CheckCircle2, AlertCircle, ChevronLeft, FileText } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { queryClient } from "@/lib/queryClient";
import { InspectionNoteSectionsView } from "@/components/InspectionNoteSectionsView";
import type { Inspection } from "@shared/schema";

interface TemplateSection {
  id: string;
  title: string;
  description?: string;
  fields: TemplateField[];
}

interface TemplateField {
  id: string;
  label: string;
  type: string;
  required?: boolean;
}

export default function InspectionReview() {
  const { id } = useParams<{ id: string }>();
  const [, navigate] = useLocation();
  const { toast } = useToast();

  // Fetch inspection with template snapshot
  const { data: inspection, isLoading: inspectionLoading } = useQuery<Inspection>({
    queryKey: ["/api/inspections", id],
  });

  // Fetch all entries for this inspection
  const { data: entries = [], isLoading: entriesLoading } = useQuery<any[]>({
    queryKey: [`/api/inspections/${id}/entries`],
    enabled: !!id,
  });

  // Parse template structure from snapshot
  const templateStructure = inspection?.templateSnapshotJson as { sections: TemplateSection[] } | null;
  const sections = templateStructure?.sections || [];

  // Calculate completion stats
  const totalFields = sections.reduce((acc, section) => acc + section.fields.length, 0);
  const completedFields = entries.length;
  const progress = totalFields > 0 ? (completedFields / totalFields) * 100 : 0;

  // Complete inspection mutation
  const completeInspection = useMutation({
    mutationFn: async () => {
      const response = await fetch(`/api/inspections/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          status: "completed",
          completedDate: new Date().toISOString(),
          submittedAt: new Date().toISOString(),
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
      queryClient.invalidateQueries({ queryKey: ["/api/inspections", id] });
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

  // Get entry value for a specific field
  const getEntryValue = (sectionId: string, fieldKey: string) => {
    return entries.find(e => e.sectionRef === sectionId && e.fieldKey === fieldKey);
  };

  // Render field value based on type
  const renderFieldValue = (entry: any, field: TemplateField) => {
    if (!entry || entry.valueJson === null || entry.valueJson === undefined) {
      return <span className="text-muted-foreground italic">Not filled</span>;
    }

    const value = entry.valueJson;

    switch (field.type) {
      case "boolean":
        return <Badge variant={value ? "default" : "secondary"}>{value ? "Yes" : "No"}</Badge>;
      
      case "rating":
        return (
          <div className="flex items-center gap-1">
            {Array.from({ length: 5 }, (_, i) => (
              <span key={i} className={i < value ? "text-primary" : "text-muted-foreground"}>
                ★
              </span>
            ))}
            <span className="ml-2 text-sm">({value}/5)</span>
          </div>
        );
      
      case "multiselect":
        return (
          <div className="flex flex-wrap gap-1">
            {(value || []).map((v: string) => (
              <Badge key={v} variant="secondary">{v}</Badge>
            ))}
          </div>
        );
      
      case "select":
        return <Badge variant="outline">{value}</Badge>;
      
      case "photo":
      case "photo_array":
      case "video":
        return <Badge variant="secondary">Media uploaded</Badge>;

      case "signature":
        return <SignatureDisplay signature={typeof value === "string" ? value : null} />;
      
      default:
        return <span>{String(value)}</span>;
    }
  };

  if (inspectionLoading || entriesLoading) {
    return (
      <div className="container mx-auto px-3 sm:px-4 py-4 sm:py-6 md:py-8 space-y-4 sm:space-y-6">
        <Skeleton className="h-12 w-full" />
        <Skeleton className="h-[500px] w-full" />
      </div>
    );
  }

  if (!inspection) {
    return (
      <div className="container mx-auto px-3 sm:px-4 py-4 sm:py-6 md:py-8">
        <Card>
          <CardContent className="p-6 sm:p-8 text-center">
            <AlertCircle className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
            <h2 className="text-xl sm:text-2xl font-semibold mb-2 break-words">Inspection not found</h2>
            <Button onClick={() => navigate("/inspections")} data-testid="button-back-to-inspections">
              Back to Inspections
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-3 sm:px-4 py-4 sm:py-6 md:py-8 space-y-4 sm:space-y-6 min-w-0">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <div className="flex items-center gap-2 sm:gap-3 mb-2">
            <Button
              variant="ghost"
              size="icon"
              className="shrink-0 min-h-11 min-w-11"
              onClick={() => navigate("/inspections")}
              data-testid="button-back"
            >
              <ChevronLeft className="w-5 h-5" />
            </Button>
            <h1 className="text-xl sm:text-2xl md:text-3xl font-semibold break-words min-w-0" data-testid="text-page-title">
              Inspection Review
            </h1>
          </div>
          <p className="text-sm sm:text-base text-muted-foreground ml-11 sm:ml-14">
            {inspection.propertyId ? "Property" : "Block"} Inspection
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2 sm:gap-3 w-full sm:w-auto">
          <Badge
            variant={progress === 100 ? "default" : "secondary"}
            data-testid="badge-completion"
            className="shrink-0"
          >
            {Math.round(progress)}% Complete
          </Badge>
          <Button
            variant="outline"
            className="min-h-11"
            onClick={() => navigate(`/inspections/${id}/report`)}
            data-testid="button-view-report"
          >
            <FileText className="w-4 h-4 mr-2 shrink-0" />
            View Report
          </Button>
          {inspection.status !== "completed" && (
            <>
              <Button
                variant="outline"
                className="min-h-11"
                onClick={() => navigate(`/inspections/${id}/capture`)}
                data-testid="button-continue-capture"
              >
                Continue Editing
              </Button>
              <Button
                className="min-h-11"
                onClick={() => completeInspection.mutate()}
                disabled={completeInspection.isPending || progress < 100}
                data-testid="button-mark-complete"
              >
                <CheckCircle2 className="w-4 h-4 mr-2 shrink-0" />
                Mark as Complete
              </Button>
            </>
          )}
        </div>
      </div>

      {/* Progress Summary */}
      <Card>
        <CardContent className="p-4 sm:p-6">
          <div className="space-y-3">
            <div className="flex flex-wrap justify-between items-center gap-2">
              <span className="text-sm font-medium">Completion Progress</span>
              <span className="text-xl sm:text-2xl font-bold">{completedFields} / {totalFields}</span>
            </div>
            <Progress value={progress} data-testid="progress-completion" />
            <div className="flex flex-wrap justify-between gap-2 text-sm text-muted-foreground">
              <span>{completedFields} fields completed</span>
              <span>{totalFields - completedFields} remaining</span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Sections and Entries */}
      <div className="space-y-4 sm:space-y-6">
        {sections.map((section) => {
          const sectionEntries = entries.filter(e => e.sectionRef === section.id);
          const sectionProgress = section.fields.length > 0
            ? (sectionEntries.length / section.fields.length) * 100
            : 0;

          return (
            <Card key={section.id} className="border-2 min-w-0" data-testid={`section-${section.id}`}>
              <CardHeader className="p-4 sm:p-6">
                <div className="flex flex-wrap justify-between items-start gap-2">
                  <div className="min-w-0 flex-1">
                    <CardTitle className="text-lg sm:text-xl font-bold break-words" data-testid={`text-section-title-${section.id}`}>
                      {section.title}
                    </CardTitle>
                    {section.description && (
                      <p className="text-sm text-muted-foreground mt-1 break-words">
                        {section.description}
                      </p>
                    )}
                  </div>
                  <Badge variant={sectionProgress === 100 ? "default" : "secondary"} className="shrink-0">
                    {Math.round(sectionProgress)}%
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="p-4 sm:p-6 pt-0">
                <div className="space-y-4">
                  {section.fields.map((field) => {
                    const entry = getEntryValue(section.id, field.id);
                    const hasValue = entry && (entry.valueJson !== null && entry.valueJson !== undefined);

                    return (
                      <div
                        key={field.id}
                        className="border rounded-lg p-3 sm:p-4 min-w-0"
                        data-testid={`field-${field.id}`}
                      >
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="font-bold break-words min-w-0">{field.label}</span>
                            {field.required && <span className="text-destructive text-xs shrink-0">*</span>}
                            {hasValue && <CheckCircle2 className="w-4 h-4 text-primary shrink-0" />}
                          </div>
                          <div className="mt-2 break-words">
                            {renderFieldValue(entry, field)}
                          </div>
                          {entry?.note && (
                            <InspectionNoteSectionsView note={entry.note} />
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Empty state if no template */}
      {sections.length === 0 && (
        <Card>
          <CardContent className="p-12 text-center">
            <AlertCircle className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
            <h2 className="text-xl font-semibold mb-2">No template structure</h2>
            <p className="text-muted-foreground">
              This inspection doesn't have a template structure to review.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
