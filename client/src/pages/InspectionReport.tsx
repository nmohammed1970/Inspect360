import { useParams, useLocation } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import {
  ArrowLeft,
  Printer,
  Download,
  Edit2,
  Save,
  X,
  AlertTriangle,
  FileText,
  Calendar,
  User,
  MapPin,
  Building,
  Wrench,
  GitCompare,
  ExternalLink,
  Loader2
} from "lucide-react";
import { format } from "date-fns";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Progress } from "@/components/ui/progress";

interface TemplateField {
  id: string;
  key?: string;
  label: string;
  type: string;
  description?: string;
  required?: boolean;
  placeholder?: string;
  options?: string[];
  validation?: Record<string, any>;
  dependsOn?: Record<string, any>;
  includeCondition?: boolean;
  includeCleanliness?: boolean;
}

interface TemplateSection {
  id: string;
  title: string;
  description?: string;
  repeatable?: boolean;
  fields: TemplateField[];
}

interface Inspection {
  id: string;
  organizationId: string;
  templateId?: string;
  templateSnapshotJson?: { sections: TemplateSection[] };
  propertyId?: string;
  blockId?: string;
  inspectorId: string;
  type: string;
  status: string;
  scheduledDate?: string;
  startedAt?: string;
  completedDate?: string;
  submittedAt?: string;
  notes?: string;
  property?: {
    id: string;
    name: string;
    address: string;
    propertyType?: string;
  };
  block?: {
    id: string;
    name: string;
    address: string;
  };
  inspector?: {
    id: string;
    email: string;
    firstName?: string;
    lastName?: string;
  };
}

export default function InspectionReport() {
  const { id } = useParams<{ id: string }>();
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [editMode, setEditMode] = useState(false);
  const [editedNotes, setEditedNotes] = useState<Record<string, string>>({});
  const [maintenanceDialogOpen, setMaintenanceDialogOpen] = useState(false);
  const [selectedEntryForMaintenance, setSelectedEntryForMaintenance] = useState<{
    entryId: string;
    fieldLabel: string;
    sectionTitle: string;
  } | null>(null);
  const [maintenanceForm, setMaintenanceForm] = useState({
    title: "",
    description: "",
    priority: "medium" as "low" | "medium" | "high" | "urgent",
  });
  const [comparisonProgress, setComparisonProgress] = useState(0);
  const [comparisonStatusMessage, setComparisonStatusMessage] = useState("Initializing...");

  // Fetch inspection data - refetch on mount to ensure fresh data
  const { data: inspection, isLoading: inspectionLoading, refetch: refetchInspection } = useQuery<Inspection>({
    queryKey: ["/api/inspections", id],
    refetchOnMount: "always",
    refetchOnWindowFocus: true,
    staleTime: 0, // Always consider data stale
    gcTime: 0, // Don't cache (gcTime replaces cacheTime in newer versions)
    // Poll for updates every 1 second for real-time updates
    refetchInterval: 1000,
    refetchIntervalInBackground: true, // Continue polling even when tab is in background
  });

  // Fetch all inspection entries - refetch on mount to ensure fresh data including new photos and AI notes
  const { data: entries = [], isLoading: entriesLoading, refetch: refetchEntries } = useQuery<any[]>({
    queryKey: [`/api/inspections/${id}/entries`],
    enabled: !!id,
    refetchOnMount: "always",
    refetchOnWindowFocus: true,
    staleTime: 0, // Always consider data stale
    gcTime: 0, // Don't cache (gcTime replaces cacheTime in newer versions)
    // Poll for updates every 1 second for real-time updates
    refetchInterval: 1000,
    refetchIntervalInBackground: true, // Continue polling even when tab is in background
  });

  // Refetch entries when component mounts or when page becomes visible to ensure we have the latest data
  useEffect(() => {
    if (id) {
      // Immediately invalidate and refetch to get latest data
      const refetchData = async () => {
        await queryClient.invalidateQueries({ queryKey: [`/api/inspections/${id}/entries`] });
        await queryClient.invalidateQueries({ queryKey: ["/api/inspections", id] });
        // Force immediate refetch
        await Promise.all([
          refetchEntries(),
          refetchInspection(),
        ]);
      };
      refetchData();

      // Set up interval to continuously refetch every second
      const interval = setInterval(() => {
        queryClient.invalidateQueries({ queryKey: [`/api/inspections/${id}/entries`] });
        queryClient.invalidateQueries({ queryKey: ["/api/inspections", id] });
        refetchEntries();
        refetchInspection();
      }, 1000);

      return () => clearInterval(interval);
    }
  }, [id, queryClient, refetchEntries, refetchInspection]);

  // Also refetch when page becomes visible (user switches back to tab)
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible' && id) {
        queryClient.invalidateQueries({ queryKey: [`/api/inspections/${id}/entries`] });
        refetchEntries();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [id, queryClient, refetchEntries]);

  // Fetch user role for edit permissions
  const { data: currentUser } = useQuery<any>({
    queryKey: ["/api/auth/user"],
  });

  // Fetch maintenance requests linked to this inspection
  const { data: maintenanceRequests = [] } = useQuery<any[]>({
    queryKey: [`/api/maintenance?inspectionId=${id}`],
    enabled: !!id,
  });

  // Create maintenance request mutation
  const createMaintenanceMutation = useMutation({
    mutationFn: async (data: any) => {
      const response = await fetch(`/api/maintenance`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(data),
      });
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || "Failed to create maintenance request");
      }
      return await response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/maintenance?inspectionId=${id}`] });
      toast({
        title: "Success",
        description: "Maintenance request created successfully",
      });
      setMaintenanceDialogOpen(false);
      setMaintenanceForm({ title: "", description: "", priority: "medium" });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to create maintenance request",
        variant: "destructive",
      });
    },
  });

  // Update inspection status mutation
  const updateStatusMutation = useMutation({
    mutationFn: async (newStatus: string) => {
      return await apiRequest("PATCH", `/api/inspections/${id}/status`, {
        status: newStatus,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/inspections", id] });
      queryClient.invalidateQueries({ queryKey: ["/api/inspections/my"] });
      toast({
        title: "Success",
        description: "Inspection status updated successfully",
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

  // Auto-create comparison report mutation
  const autoCreateComparisonMutation = useMutation({
    mutationFn: async (context: { inspectionId: string; fieldKey: string }) => {
      if (!inspection?.propertyId) {
        throw new Error("This inspection must be assigned to a property before creating a comparison report");
      }

      setComparisonProgress(10);
      setComparisonStatusMessage("Creating comparison report...");

      const response = await fetch(`/api/comparison-reports/auto`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          propertyId: inspection.propertyId,
          checkOutInspectionId: context.inspectionId,
          fieldKey: context.fieldKey
        }),
      });
      
      setComparisonProgress(95);
      setComparisonStatusMessage("Finalizing report...");
      
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || "Failed to create comparison report");
      }
      return await response.json();
    },
    onSuccess: (data: any) => {
      setComparisonProgress(100);
      setComparisonStatusMessage("Report created successfully!");
      
      const { report, created } = data;
      
      // Close progress dialog after a short delay
      setTimeout(() => {
        setComparisonProgress(0);
        setComparisonStatusMessage("Initializing...");
        
        if (created) {
          toast({
            title: "Success",
            description: "Comparison report created successfully using the latest check-in and check-out inspections",
          });
        } else {
          toast({
            title: "Success",
            description: "Navigating to existing comparison report",
          });
        }
        // Navigate to the comparison report detail page
        navigate(`/comparisons/${report.id}`);
      }, 1000);
    },
    onError: (error: any) => {
      setComparisonProgress(0);
      setComparisonStatusMessage("Error occurred");
      toast({
        title: "Error",
        description: error.message || "Failed to create comparison report",
        variant: "destructive",
      });
    },
  });

  // Simulate progress during auto-create comparison report
  useEffect(() => {
    if (autoCreateComparisonMutation.isPending) {
      setComparisonProgress(0);
      setComparisonStatusMessage("Initializing comparison report...");
      
      const interval = setInterval(() => {
        setComparisonProgress((prev) => {
          if (prev >= 90) return prev; // Don't go to 100% until actually done
          const increment = Math.random() * 15 + 5; // Random increment between 5-20%
          const newProgress = Math.min(prev + increment, 90);
          
          // Update status message based on progress
          if (newProgress < 30) {
            setComparisonStatusMessage("Finding matching check-in inspection...");
          } else if (newProgress < 60) {
            setComparisonStatusMessage("Comparing inspection data...");
          } else if (newProgress < 90) {
            setComparisonStatusMessage("Generating comparison report...");
          }
          
          return newProgress;
        });
      }, 500);
      
      return () => clearInterval(interval);
    } else {
      setComparisonProgress(0);
      setComparisonStatusMessage("Initializing...");
    }
  }, [autoCreateComparisonMutation.isPending]);

  const templateStructure = inspection?.templateSnapshotJson as { sections: TemplateSection[] } | null;
  const sections = templateStructure?.sections || [];

  // Initialize edited notes from entries - update when entries change
  useEffect(() => {
    const initialNotes: Record<string, string> = {};
    entries.forEach((entry: any) => {
      const key = `${entry.sectionRef}-${entry.fieldKey}`;
      if (entry.note) {
        initialNotes[key] = entry.note;
      }
    });
    setEditedNotes(initialNotes);
  }, [entries]);

  // Save edited notes mutation
  const saveNotesMutation = useMutation({
    mutationFn: async (updates: { entryId: string; note: string }[]) => {
      const promises = updates.map(({ entryId, note }) =>
        apiRequest("PATCH", `/api/inspection-entries/${entryId}`, { note })
      );
      return Promise.all(promises);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/inspections/${id}/entries`] });
      setEditMode(false);
      toast({
        title: "Report updated",
        description: "Changes saved successfully",
      });
    },
    onError: () => {
      toast({
        variant: "destructive",
        title: "Error",
        description: "Failed to save changes",
      });
    },
  });

  const handleSaveEdits = () => {
    const updates: { entryId: string; note: string }[] = [];
    entries.forEach((entry: any) => {
      const key = `${entry.sectionRef}-${entry.fieldKey}`;
      if (editedNotes[key] !== entry.note) {
        updates.push({ entryId: entry.id, note: editedNotes[key] || "" });
      }
    });
    if (updates.length > 0) {
      saveNotesMutation.mutate(updates);
    } else {
      setEditMode(false);
    }
  };

  const handleCancelEdit = () => {
    setEditMode(false);
    const initialNotes: Record<string, string> = {};
    entries.forEach((entry: any) => {
      const key = `${entry.sectionRef}-${entry.fieldKey}`;
      if (entry.note) {
        initialNotes[key] = entry.note;
      }
    });
    setEditedNotes(initialNotes);
  };

  const handleOpenMaintenanceDialog = (entryId: string, fieldLabel: string, sectionTitle: string) => {
    setSelectedEntryForMaintenance({ entryId, fieldLabel, sectionTitle });
    setMaintenanceForm({
      title: `${sectionTitle} - ${fieldLabel}`,
      description: "",
      priority: "medium",
    });
    setMaintenanceDialogOpen(true);
  };

  const handleSubmitMaintenance = () => {
    if (!inspection || !selectedEntryForMaintenance) return;

    createMaintenanceMutation.mutate({
      title: maintenanceForm.title,
      description: maintenanceForm.description,
      priority: maintenanceForm.priority,
      status: "open",
      propertyId: inspection.propertyId,
      organizationId: inspection.organizationId,
      reportedBy: currentUser?.id,
      source: "inspection",
      inspectionId: inspection.id,
      inspectionEntryId: selectedEntryForMaintenance.entryId,
    });
  };

  const handlePrint = async () => {
    if (!inspection) return;

    try {
      toast({
        title: "Generating PDF",
        description: "Please wait while we create your inspection report...",
      });

      const response = await fetch(`/api/inspections/${inspection.id}/pdf`, {
        method: "GET",
        credentials: "include",
      });

      if (!response.ok) {
        throw new Error("Failed to generate PDF");
      }

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${inspection.property?.name?.replace(/[^a-zA-Z0-9]/g, "_") || "inspection"}_report.pdf`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);

      toast({
        title: "PDF Generated",
        description: "Your inspection report has been downloaded.",
      });
    } catch (error) {
      console.error("Error generating PDF:", error);
      toast({
        title: "Error",
        description: "Failed to generate PDF report. Please try again.",
        variant: "destructive",
      });
    }
  };

  const getEntryValue = (sectionId: string, fieldKey: string) => {
    return entries.find(e => e.sectionRef === sectionId && e.fieldKey === fieldKey);
  };

  const renderFieldValue = (value: any, field: TemplateField) => {
    if (value === null || value === undefined) {
      return <span className="text-muted-foreground italic">Not recorded</span>;
    }

    // Handle composite values (with condition/cleanliness)
    let actualValue = value;
    let condition = null;
    let cleanliness = null;

    if (typeof value === 'object' && !Array.isArray(value) && value.value !== undefined) {
      actualValue = value.value;
      condition = value.condition;
      cleanliness = value.cleanliness;
    }

    let displayValue: React.ReactNode = null;

    switch (field.type) {
      case "text":
      case "textarea":
      case "email":
      case "phone":
        displayValue = actualValue || <span className="text-muted-foreground italic">Not filled</span>;
        break;
      case "number":
        displayValue = actualValue !== null && actualValue !== undefined ? actualValue.toString() : <span className="text-muted-foreground italic">Not filled</span>;
        break;
      case "boolean":
        displayValue = actualValue ? "Yes" : "No";
        break;
      case "select":
      case "radio":
        displayValue = actualValue || <span className="text-muted-foreground italic">Not selected</span>;
        break;
      case "checkbox":
        displayValue = Array.isArray(actualValue) ? actualValue.join(", ") : <span className="text-muted-foreground italic">None selected</span>;
        break;
      case "date":
        displayValue = actualValue ? format(new Date(actualValue), "MMM dd, yyyy") : <span className="text-muted-foreground italic">Not set</span>;
        break;
      case "signature":
        displayValue = actualValue ? (
          <img
            src={actualValue}
            alt="Signature"
            className="max-w-md h-32 object-contain border rounded bg-background p-2"
          />
        ) : (
          <span className="text-muted-foreground italic">Not signed</span>
        );
        break;
      default:
        // Handle objects that don't match composite structure
        if (typeof actualValue === 'object' && actualValue !== null) {
          // If it's still an object, try to stringify it nicely or show a message
          if (Array.isArray(actualValue)) {
            displayValue = actualValue.length > 0
              ? actualValue.join(", ")
              : <span className="text-muted-foreground italic">Empty list</span>;
          } else {
            // Format object as bullet points instead of JSON
            try {
              const entries = Object.entries(actualValue).filter(([_, v]) => v !== null && v !== undefined && v !== '');
              if (entries.length > 0) {
                displayValue = (
                  <ul className="list-disc list-inside space-y-1 text-sm">
                    {entries.map(([key, value]) => (
                      <li key={key}>
                        <span className="font-medium capitalize">{key.replace(/_/g, ' ')}:</span>{' '}
                        <span>{String(value)}</span>
                      </li>
                    ))}
                  </ul>
                );
              } else {
                displayValue = <span className="text-muted-foreground italic">No data</span>;
              }
            } catch (error) {
              // Handle circular references or other errors
              console.warn('Failed to format field value:', error);
              displayValue = <span className="text-muted-foreground italic">Complex data structure</span>;
            }
          }
        } else if (typeof actualValue === 'string' && actualValue.length > 0) {
          displayValue = actualValue;
        } else if (typeof actualValue === 'number') {
          displayValue = actualValue.toString();
        } else {
          displayValue = <span className="text-muted-foreground italic">Not filled</span>;
        }
    }

    return (
      <div className="space-y-2">
        <div className="text-base">{displayValue}</div>
        {(condition || cleanliness) && (
          <div className="flex gap-2 flex-wrap">
            {condition && (
              <Badge variant={condition === 'Excellent' ? 'default' : condition === 'Good' ? 'secondary' : 'destructive'}>
                Condition: {condition}
              </Badge>
            )}
            {cleanliness && (
              <Badge variant={cleanliness === 'Clean' ? 'default' : cleanliness === 'Needs a Clean' ? 'secondary' : 'destructive'}>
                Cleanliness: {cleanliness}
              </Badge>
            )}
          </div>
        )}
      </div>
    );
  };

  const canEdit = currentUser?.role === 'owner' || currentUser?.role === 'compliance';

  if (inspectionLoading || entriesLoading) {
    return (
      <div className="p-6 max-w-6xl mx-auto space-y-6">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-40 w-full" />
        <Skeleton className="h-60 w-full" />
      </div>
    );
  }

  if (!inspection) {
    return (
      <div className="p-6 max-w-6xl mx-auto">
        <Card>
          <CardContent className="pt-6">
            <p className="text-center text-muted-foreground">Inspection not found</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const inspectorName = inspection.inspector
    ? `${inspection.inspector.firstName || ''} ${inspection.inspector.lastName || ''}`.trim() || inspection.inspector.email
    : "Unknown Inspector";

  const propertyName = inspection.property?.name || inspection.block?.name || "Unknown Property";
  const propertyAddress = inspection.property?.address || inspection.block?.address || "No address";

  return (
    <div className="min-h-screen bg-background">
      {/* Print styles */}
      <style>{`
        @media print {
          .no-print {
            display: none !important;
          }
          .print-break-inside-avoid {
            break-inside: avoid;
            page-break-inside: avoid;
          }
          .print-only {
            display: block !important;
          }
          .print-cover-page {
            display: flex !important;
            page-break-after: always;
            min-height: 100%;
            padding: 3rem 2rem;
            margin: 0;
            box-sizing: border-box;
          }
          body {
            background: white !important;
            print-color-adjust: exact;
            -webkit-print-color-adjust: exact;
          }
          .bg-card {
            background: white !important;
            border: 1px solid #e5e7eb !important;
          }
          img {
            max-width: 100%;
            page-break-inside: avoid;
          }
          h1, h2, h3, h4, h5, h6 {
            page-break-after: avoid;
            page-break-inside: avoid;
          }
          .space-y-8 > * + * {
            margin-top: 2rem !important;
          }
          @page {
            margin: 0.75in;
            size: letter;
          }
          @page :first {
            margin: 0;
          }
          /* Ensure colors print correctly */
          * {
            print-color-adjust: exact;
            -webkit-print-color-adjust: exact;
          }
        }
        @media screen {
          .print-only {
            position: absolute !important;
            left: -9999px !important;
            top: -9999px !important;
            width: 0 !important;
            height: 0 !important;
            overflow: hidden !important;
            visibility: hidden !important;
          }
        }
      `}</style>

      {/* PDF Cover Page - Only visible when printing */}
      <div className="print-only print-cover-page hidden flex-col items-center justify-center text-center p-12" aria-hidden="true">
        <div className="space-y-12 max-w-2xl mx-auto">
          {/* Logo */}
          <div className="flex justify-center mb-16">
            <img
              src={new URL("@assets/Inspect360 Logo_1761302629835.png", import.meta.url).href}
              alt="Inspect360 Logo"
              className="h-24 w-auto"
            />
          </div>

          {/* Report Title */}
          <div className="space-y-4 mb-12">
            <h1 className="text-5xl font-bold text-gray-900" style={{ color: '#000' }}>
              Inspection Report
            </h1>
            <div className="h-1 w-32 mx-auto" style={{ backgroundColor: '#00D5CC' }}></div>
          </div>

          {/* Inspection Type */}
          {inspection.type && (
            <div className="text-2xl font-semibold text-gray-700 mb-12" style={{ color: '#333' }}>
              {inspection.type.replace(/_/g, ' ').toUpperCase()}
            </div>
          )}

          {/* Property Information */}
          <div className="space-y-6 pt-8 border-t-2" style={{ borderColor: '#E5E7EB' }}>
            <div className="space-y-2">
              <div className="text-sm font-medium text-gray-500 uppercase tracking-wide">Property</div>
              <div className="text-2xl font-bold text-gray-900" style={{ color: '#000' }}>
                {propertyName || "Property Not Specified"}
              </div>
              {propertyAddress && propertyAddress !== "No address" && (
                <div className="text-lg text-gray-600" style={{ color: '#666' }}>
                  {propertyAddress}
                </div>
              )}
            </div>

            {/* Inspector Information */}
            <div className="space-y-2 pt-6">
              <div className="text-sm font-medium text-gray-500 uppercase tracking-wide">Inspector</div>
              <div className="text-xl font-semibold text-gray-900" style={{ color: '#000' }}>
                {inspectorName || "Inspector Not Assigned"}
              </div>
              {inspection.inspector?.email && (
                <div className="text-base text-gray-600" style={{ color: '#666' }}>
                  {inspection.inspector.email}
                </div>
              )}
            </div>

            {/* Inspection Date */}
            <div className="space-y-2 pt-6">
              <div className="text-sm font-medium text-gray-500 uppercase tracking-wide">Inspection Date</div>
              <div className="text-xl font-semibold text-gray-900" style={{ color: '#000' }}>
                {inspection.completedDate
                  ? format(new Date(inspection.completedDate), "MMMM dd, yyyy")
                  : inspection.scheduledDate
                    ? format(new Date(inspection.scheduledDate), "MMMM dd, yyyy")
                    : "Not Scheduled"}
              </div>
            </div>

            {/* Status Badge */}
            {inspection.status && (
              <div className="pt-6">
                <div className="inline-block px-6 py-2 text-sm font-semibold uppercase tracking-wide border-2 rounded-lg"
                  style={{
                    borderColor: inspection.status === 'completed' ? '#00D5CC' : '#9CA3AF',
                    color: inspection.status === 'completed' ? '#00D5CC' : '#9CA3AF'
                  }}>
                  {inspection.status.replace(/_/g, ' ')}
                </div>
              </div>
            )}
          </div>

          {/* Report ID */}
          {inspection.id && (
            <div className="pt-8 text-sm text-gray-500">
              Report ID: {inspection.id}
            </div>
          )}
        </div>
      </div>

      {/* Header Actions - Hidden in print */}
      <div className="no-print sticky top-0 z-10 bg-background border-b">
        <div className="max-w-6xl mx-auto p-4 flex items-center justify-between gap-4">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => navigate("/inspections")}
            data-testid="button-back"
          >
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to Inspections
          </Button>

          <div className="flex gap-2">
            {canEdit && !editMode && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setEditMode(true)}
                data-testid="button-edit-report"
              >
                <Edit2 className="w-4 h-4 mr-2" />
                Edit Report
              </Button>
            )}
            {editMode && (
              <>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleCancelEdit}
                  data-testid="button-cancel-edit"
                >
                  <X className="w-4 h-4 mr-2" />
                  Cancel
                </Button>
                <Button
                  size="sm"
                  onClick={handleSaveEdits}
                  disabled={saveNotesMutation.isPending}
                  data-testid="button-save-edit"
                >
                  <Save className="w-4 h-4 mr-2" />
                  {saveNotesMutation.isPending ? "Saving..." : "Save Changes"}
                </Button>
              </>
            )}
            <Button
              variant="outline"
              size="sm"
              onClick={handlePrint}
              data-testid="button-print-report"
            >
              <Printer className="w-4 h-4 mr-2" />
              Print
            </Button>
          </div>
        </div>
      </div>

      {/* Report Content */}
      <div className="max-w-6xl mx-auto p-6 space-y-8">
        {/* Report Header */}
        <Card className="print-break-inside-avoid">
          <CardHeader className="space-y-4">
            <div className="flex items-start justify-between gap-4">
              <div className="space-y-2">
                <CardTitle className="text-3xl">Inspection Report</CardTitle>
                <CardDescription className="text-lg">
                  {propertyName}
                </CardDescription>
              </div>
              {canEdit ? (
                <div className="flex flex-col gap-1 min-w-[180px]">
                  <Label className="text-xs text-muted-foreground">Status</Label>
                  <Select
                    value={inspection.status}
                    onValueChange={(value) => updateStatusMutation.mutate(value)}
                    disabled={updateStatusMutation.isPending}
                  >
                    <SelectTrigger data-testid="select-inspection-status" className="h-8">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="scheduled">Scheduled</SelectItem>
                      <SelectItem value="in_progress">In Progress</SelectItem>
                      <SelectItem value="completed">Completed</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              ) : (
                inspection.status && (
                  <Badge variant={inspection.status === 'completed' ? 'default' : 'secondary'} className="text-sm">
                    {inspection.status.replace(/_/g, ' ').toUpperCase()}
                  </Badge>
                )
              )}
            </div>

            {/* Inspection Metadata Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-4 border-t">
              <div className="flex items-start gap-3">
                <MapPin className="w-5 h-5 text-muted-foreground mt-0.5" />
                <div>
                  <div className="text-sm font-medium">Property Address</div>
                  <div className="text-sm text-muted-foreground">{propertyAddress}</div>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <FileText className="w-5 h-5 text-muted-foreground mt-0.5" />
                <div>
                  <div className="text-sm font-medium">Inspection Type</div>
                  <div className="text-sm text-muted-foreground capitalize">
                    {inspection.type ? inspection.type.replace(/_/g, ' ') : 'Not specified'}
                  </div>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <User className="w-5 h-5 text-muted-foreground mt-0.5" />
                <div>
                  <div className="text-sm font-medium">Inspector</div>
                  <div className="text-sm text-muted-foreground">{inspectorName}</div>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <Calendar className="w-5 h-5 text-muted-foreground mt-0.5" />
                <div>
                  <div className="text-sm font-medium">Inspection Date</div>
                  <div className="text-sm text-muted-foreground">
                    {inspection.completedDate
                      ? format(new Date(inspection.completedDate), "MMMM dd, yyyy")
                      : inspection.scheduledDate
                        ? format(new Date(inspection.scheduledDate), "MMMM dd, yyyy")
                        : "Not scheduled"}
                  </div>
                </div>
              </div>
            </div>

            {inspection.notes && (
              <div className="pt-4 border-t">
                <div className="text-sm font-medium mb-2">General Notes</div>
                <div className="text-sm text-muted-foreground whitespace-pre-wrap">{inspection.notes}</div>
              </div>
            )}
          </CardHeader>
        </Card>

        {/* Inspection Points */}
        {sections.length === 0 ? (
          <Card>
            <CardContent className="pt-6 text-center text-muted-foreground">
              No inspection template structure available
            </CardContent>
          </Card>
        ) : (
          sections.map((section) => {
            const sectionEntries = entries.filter(e => e.sectionRef === section.id);

            return (
              <Card key={section.id} className="print-break-inside-avoid border-2" data-testid={`section-${section.id}`}>
                <CardHeader>
                  <CardTitle className="text-2xl font-bold">{section.title}</CardTitle>
                  {section.description && (
                    <CardDescription>{section.description}</CardDescription>
                  )}
                </CardHeader>
                <CardContent className="space-y-6">
                  {section.fields.map((field) => {
                    const entry = getEntryValue(section.id, field.id || field.key || field.label);
                    const entryKey = `${section.id}-${field.id || field.key || field.label}`;

                    if (!entry && !editMode) return null; // Hide unfilled fields in view mode

                    return (
                      <div
                        key={field.id || field.key || field.label}
                        className="border rounded-lg p-4"
                        data-testid={`field-${field.id || field.key}`}
                      >
                        <div className="space-y-3">
                          {/* Field Label and Description */}
                          <div>
                            <h4 className="text-base font-bold">
                              {field.label}
                              {field.required && <span className="text-destructive ml-1">*</span>}
                            </h4>
                            {field.description && (
                              <p className="text-sm text-muted-foreground mt-1">{field.description}</p>
                            )}
                          </div>

                          {/* Field Value */}
                          <div className="pl-4 border-l-2 border-primary/20">
                            {renderFieldValue(entry?.valueJson, field)}
                          </div>

                          {/* Photos */}
                          {entry?.photos && entry.photos.length > 0 && (
                            <div className="space-y-2">
                              <div className="text-sm font-bold">Photos</div>
                              <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                                {entry.photos.map((photo: string, idx: number) => {
                                  // Ensure photo URL is correct
                                  const photoUrl = photo.startsWith('/objects/') || photo.startsWith('http')
                                    ? photo
                                    : `/objects/${photo}`;
                                  return (
                                    <img
                                      key={`${entry.id}-${idx}-${photo}`}
                                      src={photoUrl}
                                      alt={`${field.label} - Photo ${idx + 1}`}
                                      className="w-full h-40 object-cover rounded-lg border"
                                      data-testid={`photo-${field.id || field.key}-${idx}`}
                                    />
                                  );
                                })}
                              </div>
                            </div>
                          )}

                          {/* Notes */}
                          <div className="space-y-2">
                            <div className="text-sm font-bold">Notes</div>
                            {editMode ? (
                              <Textarea
                                value={editedNotes[entryKey] || ""}
                                onChange={(e) => setEditedNotes({ ...editedNotes, [entryKey]: e.target.value })}
                                placeholder="Add inspection notes..."
                                className="min-h-[80px]"
                                data-testid={`textarea-note-${field.id || field.key}`}
                              />
                            ) : entry?.note ? (
                              <div className="text-sm text-muted-foreground whitespace-pre-wrap bg-muted/50 p-3 rounded-lg">
                                {entry.note}
                              </div>
                            ) : (
                              <p className="text-sm text-muted-foreground italic">No notes</p>
                            )}
                          </div>

                          {/* Action Buttons - Hidden in print and edit mode */}
                          {!editMode && entry && (
                            <div className="flex gap-2 flex-wrap no-print">
                              {/* Raise Maintenance Request - only if property exists */}
                              {inspection.propertyId && (
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => handleOpenMaintenanceDialog(entry.id, field.label, section.title)}
                                  data-testid={`button-maintenance-${field.id || field.key}`}
                                >
                                  <Wrench className="w-4 h-4 mr-2" />
                                  Raise Maintenance Request
                                </Button>
                              )}
                              {/* Add to Comparison - only on check-out inspections with photos and property */}
                              {inspection.type === 'check_out' && entry.photos && entry.photos.length > 0 && inspection.propertyId && (
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => autoCreateComparisonMutation.mutate({
                                    inspectionId: id!,
                                    fieldKey: field.id || field.key
                                  })}
                                  disabled={autoCreateComparisonMutation.isPending}
                                  data-testid={`button-comparison-${field.id || field.key}`}
                                >
                                  <GitCompare className="w-4 h-4 mr-2" />
                                  {autoCreateComparisonMutation.isPending ? "Creating..." : "Add to Comparison"}
                                </Button>
                              )}
                            </div>
                          )}

                          {/* Maintenance Flag Indicator */}
                          {entry?.maintenanceFlag && (
                            <div className="flex items-center gap-2 text-sm text-amber-600 dark:text-amber-500">
                              <AlertTriangle className="w-4 h-4" />
                              <span>Flagged for maintenance</span>
                            </div>
                          )}

                          {/* Linked Maintenance Requests */}
                          {entry && (() => {
                            const linkedRequests = maintenanceRequests.filter(
                              (req: any) => req.inspectionEntryId === entry.id
                            );
                            if (linkedRequests.length === 0) return null;

                            return (
                              <div className="space-y-2 mt-4 border-t pt-4">
                                <div className="text-sm font-medium text-muted-foreground">
                                  Related Maintenance Requests ({linkedRequests.length})
                                </div>
                                {linkedRequests.map((request: any) => (
                                  <Card key={request.id} className="bg-muted/30">
                                    <CardContent className="p-3">
                                      <div className="flex items-start justify-between gap-2">
                                        <div className="flex-1">
                                          <div className="font-medium text-sm">{request.title}</div>
                                          {request.description && (
                                            <div className="text-xs text-muted-foreground mt-1">
                                              {request.description}
                                            </div>
                                          )}
                                          <div className="flex items-center gap-2 mt-2">
                                            <Badge variant={
                                              request.status === 'open' ? 'default' :
                                                request.status === 'in_progress' ? 'secondary' :
                                                  request.status === 'resolved' ? 'outline' : 'default'
                                            }>
                                              {request.status}
                                            </Badge>
                                            <Badge variant="outline" className="text-xs">
                                              {request.priority}
                                            </Badge>
                                          </div>
                                        </div>
                                        <Button
                                          variant="ghost"
                                          size="sm"
                                          onClick={() => navigate(`/maintenance`)}
                                          data-testid={`link-maintenance-${request.id}`}
                                        >
                                          <ExternalLink className="w-4 h-4" />
                                        </Button>
                                      </div>
                                    </CardContent>
                                  </Card>
                                ))}
                              </div>
                            );
                          })()}
                        </div>
                      </div>
                    );
                  })}
                </CardContent>
              </Card>
            );
          })
        )}
      </div>

      {/* Maintenance Request Dialog */}
      <Dialog open={maintenanceDialogOpen} onOpenChange={setMaintenanceDialogOpen}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>Raise Maintenance Request</DialogTitle>
            <DialogDescription>
              Create a maintenance request for this inspection item
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="maintenance-title">Title</Label>
              <Input
                id="maintenance-title"
                value={maintenanceForm.title}
                onChange={(e) => setMaintenanceForm({ ...maintenanceForm, title: e.target.value })}
                placeholder="Brief description of the issue"
                data-testid="input-maintenance-title"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="maintenance-description">Description</Label>
              <Textarea
                id="maintenance-description"
                value={maintenanceForm.description}
                onChange={(e) => setMaintenanceForm({ ...maintenanceForm, description: e.target.value })}
                placeholder="Detailed description of the maintenance issue..."
                className="min-h-[100px]"
                data-testid="textarea-maintenance-description"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="maintenance-priority">Priority</Label>
              <Select
                value={maintenanceForm.priority}
                onValueChange={(value: any) => setMaintenanceForm({ ...maintenanceForm, priority: value })}
              >
                <SelectTrigger id="maintenance-priority" data-testid="select-maintenance-priority">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="low">Low</SelectItem>
                  <SelectItem value="medium">Medium</SelectItem>
                  <SelectItem value="high">High</SelectItem>
                  <SelectItem value="urgent">Urgent</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setMaintenanceDialogOpen(false)}
              data-testid="button-cancel-maintenance"
            >
              Cancel
            </Button>
            <Button
              onClick={handleSubmitMaintenance}
              disabled={!maintenanceForm.title || createMaintenanceMutation.isPending}
              data-testid="button-submit-maintenance"
            >
              {createMaintenanceMutation.isPending ? "Creating..." : "Create Request"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Comparison Report Progress Dialog */}
      <Dialog open={autoCreateComparisonMutation.isPending} onOpenChange={() => {}}>
        <DialogContent className="sm:max-w-md" data-testid="dialog-comparison-progress">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Loader2 className="h-5 w-5 animate-spin" />
              Creating Comparison Report
            </DialogTitle>
            <DialogDescription>
              Please wait while we create your comparison report. This may take a few moments.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">{comparisonStatusMessage}</span>
                <span className="font-medium">{Math.round(comparisonProgress)}%</span>
              </div>
              <Progress value={comparisonProgress} className="h-2" />
            </div>
            <p className="text-xs text-muted-foreground">
              This process uses AI to analyze differences between check-in and check-out inspections.
            </p>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
