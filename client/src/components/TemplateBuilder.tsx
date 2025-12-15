import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage, FormDescription } from "@/components/ui/form";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Plus, Trash2, GripVertical, Save, X, Eye, Code, ChevronDown, ChevronRight } from "lucide-react";
import { type InspectionTemplate, type TemplateCategory } from "@shared/schema";
import { z } from "zod";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";

// Default AI instruction for inspection analysis
const DEFAULT_AI_INSTRUCTION = `You are analyzing a property inspection photo. Provide a professional, objective assessment focused on condition, cleanliness, and any maintenance issues. Be specific and concise. Format your response as plain text without bullet points, numbered lists, or special formatting.`;

// Default report config - all sections enabled by default
const DEFAULT_REPORT_CONFIG = {
  showCover: true,
  showContentsPage: true,
  showTradeMarks: true,
  showGlossary: true,
  showMaintenanceLog: true,
  showInspection: true,
  showInventory: true,
  showTermsConditions: true,
  showClosingSection: true,
};

// Report config schema
const reportConfigSchema = z.object({
  showCover: z.boolean().default(true),
  showContentsPage: z.boolean().default(true),
  showTradeMarks: z.boolean().default(true),
  showGlossary: z.boolean().default(true),
  showMaintenanceLog: z.boolean().default(true),
  showInspection: z.boolean().default(true),
  showInventory: z.boolean().default(true),
  showTermsConditions: z.boolean().default(true),
  showClosingSection: z.boolean().default(true),
});

// UI-specific schema - only includes fields user can edit
// Backend will populate organizationId, createdBy, createdAt, updatedAt
const templateMetaSchema = z.object({
  name: z.string().min(1, "Name is required"),
  description: z.string().optional(),
  scope: z.enum(["property", "block", "both"]),
  categoryId: z.string().optional(),
  isActive: z.boolean().default(true),
  version: z.number().default(1),
  structureJson: z.any(),
  aiMaxWords: z.number().min(50).max(500).default(150),
  aiInstruction: z.string().optional(),
  reportConfig: reportConfigSchema.optional(),
});

type TemplateMetaForm = z.infer<typeof templateMetaSchema>;

interface TemplateField {
  id: string; // Primary identifier for the field
  key: string; // Legacy property kept for compatibility
  label: string;
  type: string;
  required?: boolean;
  placeholder?: string;
  options?: string[];
  validation?: any;
  depends_on?: string;
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

interface TemplateStructure {
  sections: TemplateSection[];
}

const FIELD_TYPES = [
  { value: "short_text", label: "Short Text" },
  { value: "long_text", label: "Long Text" },
  { value: "number", label: "Number" },
  { value: "rating", label: "Rating (1-5)" },
  { value: "select", label: "Dropdown" },
  { value: "multiselect", label: "Multiple Select" },
  { value: "boolean", label: "Yes/No" },
  { value: "date", label: "Date" },
  { value: "time", label: "Time" },
  { value: "datetime", label: "Date & Time" },
  { value: "photo", label: "Single Photo" },
  { value: "photo_array", label: "Multiple Photos" },
  { value: "video", label: "Video" },
  { value: "gps", label: "GPS Location" },
  { value: "signature", label: "Signature" },
  { value: "auto_inspector", label: "Auto: Inspector Name" },
  { value: "auto_address", label: "Auto: Property/Block Address" },
  { value: "auto_tenant_names", label: "Auto: Tenant Name(s)" },
  { value: "auto_inspection_date", label: "Auto: Inspection Date" },
];

interface TemplateBuilderProps {
  template: InspectionTemplate | null;
  categories: TemplateCategory[];
  onClose: () => void;
  onSave: () => void;
}

export function TemplateBuilder({ template, categories, onClose, onSave }: TemplateBuilderProps) {
  const { toast } = useToast();
  const [previewMode, setPreviewMode] = useState(false);
  
  // Parse existing structure or create default
  const rawStructure: TemplateStructure = template?.structureJson 
    ? (typeof template.structureJson === 'string' ? JSON.parse(template.structureJson) : template.structureJson as TemplateStructure)
    : { sections: [] };
  
  // Migrate old templates: ensure all fields have both id and key
  const initialStructure: TemplateStructure = {
    sections: rawStructure.sections.map(section => ({
      ...section,
      fields: section.fields.map(field => ({
        ...field,
        id: field.id || field.key, // Use existing id or fall back to key
        key: field.key || field.id, // Ensure key exists too
      })),
    })),
  };

  const [structure, setStructure] = useState<TemplateStructure>(initialStructure);
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set());

  const form = useForm<TemplateMetaForm>({
    resolver: zodResolver(templateMetaSchema),
    defaultValues: {
      name: template?.name || "",
      description: template?.description || "",
      scope: template?.scope || "property",
      categoryId: template?.categoryId || undefined,
      isActive: template?.isActive ?? true,
      version: template?.version || 1,
      structureJson: initialStructure,
      aiMaxWords: template?.aiMaxWords ?? 150,
      aiInstruction: template?.aiInstruction || "",
      reportConfig: template?.reportConfig ?? DEFAULT_REPORT_CONFIG,
    },
  });

  // Save mutation
  const saveMutation = useMutation({
    mutationFn: async (data: TemplateMetaForm) => {
      const payload = {
        ...data,
        structureJson: structure,
      };
      if (template) {
        return await apiRequest("PUT", `/api/inspection-templates/${template.id}`, payload);
      } else {
        return await apiRequest("POST", "/api/inspection-templates", payload);
      }
    },
    onSuccess: async () => {
      // Refetch queries and wait for fresh data before closing dialog
      await queryClient.refetchQueries({ queryKey: ["/api/inspection-templates"] });
      if (template) {
        await queryClient.refetchQueries({ queryKey: ["/api/inspection-templates", template.id] });
      }
      toast({
        title: "Success",
        description: template ? "Template updated successfully" : "Template created successfully",
      });
      onSave();
      onClose(); // Close the modal after successful save
    },
    onError: (error: Error) => {
      toast({
        variant: "destructive",
        title: "Error",
        description: error.message || "Failed to save template",
      });
    },
  });

  const handleSave = () => {
    form.handleSubmit((data) => {
      saveMutation.mutate(data);
    })();
  };

  const addSection = () => {
    const newSection: TemplateSection = {
      id: `section_${Date.now()}`,
      title: "New Section",
      fields: [],
    };
    setStructure({ sections: [...structure.sections, newSection] });
    setExpandedSections(new Set([...Array.from(expandedSections), newSection.id]));
  };

  const updateSection = (sectionId: string, updates: Partial<TemplateSection>) => {
    setStructure({
      sections: structure.sections.map((s) =>
        s.id === sectionId ? { ...s, ...updates } : s
      ),
    });
  };

  const deleteSection = (sectionId: string) => {
    setStructure({
      sections: structure.sections.filter((s) => s.id !== sectionId),
    });
    const newExpanded = new Set(expandedSections);
    newExpanded.delete(sectionId);
    setExpandedSections(newExpanded);
  };

  const addField = (sectionId: string) => {
    const section = structure.sections.find((s) => s.id === sectionId);
    if (!section) return;

    const fieldId = `field_${Date.now()}`;
    const newField: TemplateField = {
      id: fieldId,
      key: fieldId, // Keep key same as id for compatibility
      label: "New Field",
      type: "short_text",
      required: false,
    };

    updateSection(sectionId, {
      fields: [...section.fields, newField],
    });
  };

  const updateField = (sectionId: string, fieldKey: string, updates: Partial<TemplateField>) => {
    const section = structure.sections.find((s) => s.id === sectionId);
    if (!section) return;

    updateSection(sectionId, {
      fields: section.fields.map((f) =>
        f.key === fieldKey ? { ...f, ...updates } : f
      ),
    });
  };

  const deleteField = (sectionId: string, fieldKey: string) => {
    const section = structure.sections.find((s) => s.id === sectionId);
    if (!section) return;

    updateSection(sectionId, {
      fields: section.fields.filter((f) => f.key !== fieldKey),
    });
  };

  const toggleSection = (sectionId: string) => {
    const newExpanded = new Set(expandedSections);
    if (newExpanded.has(sectionId)) {
      newExpanded.delete(sectionId);
    } else {
      newExpanded.add(sectionId);
    }
    setExpandedSections(newExpanded);
  };

  const renderPreviewField = (field: TemplateField) => {
    switch (field.type) {
      case "short_text":
        return <Input disabled placeholder={field.placeholder || "Enter text..."} className="bg-muted/50" />;
      case "long_text":
        return <Textarea disabled placeholder={field.placeholder || "Enter text..."} className="bg-muted/50 min-h-[80px]" />;
      case "number":
        return <Input disabled type="number" placeholder={field.placeholder || "0"} className="bg-muted/50 max-w-[200px]" />;
      case "rating":
        return (
          <div className="flex gap-1">
            {[1, 2, 3, 4, 5].map((star) => (
              <div key={star} className="w-8 h-8 rounded border border-dashed border-muted-foreground/30 flex items-center justify-center text-muted-foreground">
                {star}
              </div>
            ))}
          </div>
        );
      case "select":
        return (
          <Select disabled>
            <SelectTrigger className="bg-muted/50 max-w-[300px]">
              <SelectValue placeholder={field.options?.[0] || "Select option..."} />
            </SelectTrigger>
          </Select>
        );
      case "multiselect":
        return (
          <div className="flex flex-wrap gap-1">
            {field.options?.slice(0, 3).map((opt, i) => (
              <Badge key={i} variant="outline" className="text-muted-foreground">{opt}</Badge>
            )) || <span className="text-muted-foreground text-sm">No options defined</span>}
          </div>
        );
      case "boolean":
        return (
          <div className="flex gap-2">
            <Badge variant="outline">Yes</Badge>
            <Badge variant="outline">No</Badge>
          </div>
        );
      case "date":
        return <Input disabled type="date" className="bg-muted/50 max-w-[200px]" />;
      case "time":
        return <Input disabled type="time" className="bg-muted/50 max-w-[150px]" />;
      case "datetime":
        return <Input disabled type="datetime-local" className="bg-muted/50 max-w-[250px]" />;
      case "photo":
        return (
          <div className="w-32 h-24 border-2 border-dashed border-muted-foreground/30 rounded-lg flex items-center justify-center text-muted-foreground text-sm">
            Photo Upload
          </div>
        );
      case "photo_array":
        return (
          <div className="flex gap-2">
            {[1, 2, 3].map((i) => (
              <div key={i} className="w-20 h-16 border-2 border-dashed border-muted-foreground/30 rounded-lg flex items-center justify-center text-muted-foreground text-xs">
                Photo {i}
              </div>
            ))}
          </div>
        );
      case "video":
        return (
          <div className="w-40 h-24 border-2 border-dashed border-muted-foreground/30 rounded-lg flex items-center justify-center text-muted-foreground text-sm">
            Video Upload
          </div>
        );
      case "gps":
        return (
          <div className="flex gap-2 items-center text-muted-foreground text-sm">
            <Badge variant="outline">GPS Location</Badge>
            <span>Lat/Long coordinates</span>
          </div>
        );
      case "signature":
        return (
          <div className="w-64 h-20 border-2 border-dashed border-muted-foreground/30 rounded-lg flex items-center justify-center text-muted-foreground text-sm">
            Signature Pad
          </div>
        );
      case "auto_inspector":
        return <Input disabled value="[Auto-filled: Inspector Name]" className="bg-muted/50 max-w-[300px] italic text-muted-foreground" />;
      case "auto_address":
        return <Input disabled value="[Auto-filled: Property/Block Address]" className="bg-muted/50 max-w-[400px] italic text-muted-foreground" />;
      case "auto_tenant_names":
        return <Input disabled value="[Auto-filled: Tenant Name(s)]" className="bg-muted/50 max-w-[300px] italic text-muted-foreground" />;
      case "auto_inspection_date":
        return <Input disabled value="[Auto-filled: Inspection Date]" className="bg-muted/50 max-w-[200px] italic text-muted-foreground" />;
      default:
        return <Input disabled placeholder="Field preview" className="bg-muted/50" />;
    }
  };

  return (
    <Dialog open={true} onOpenChange={onClose}>
      <DialogContent className="max-w-6xl h-[90vh] p-0 gap-0 flex flex-col">
        <DialogHeader className="p-6 pb-4 border-b">
          <div className="flex items-center justify-between">
            <DialogTitle className="text-2xl">
              {template ? "Edit Template" : "Create Template"}
            </DialogTitle>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPreviewMode(!previewMode)}
                data-testid="button-toggle-preview"
              >
                {previewMode ? <Code className="w-4 h-4 mr-2" /> : <Eye className="w-4 h-4 mr-2" />}
                {previewMode ? "Edit" : "Preview"}
              </Button>
              <Button
                onClick={handleSave}
                disabled={saveMutation.isPending}
                data-testid="button-save-template"
              >
                <Save className="w-4 h-4 mr-2" />
                {saveMutation.isPending ? "Saving..." : "Save Template"}
              </Button>
              <Button variant="ghost" size="icon" onClick={onClose} data-testid="button-close-builder">
                <X className="w-4 h-4" />
              </Button>
            </div>
          </div>
        </DialogHeader>

        <div className="flex-1 overflow-auto p-6">
          {previewMode ? (
            <div className="space-y-6 max-w-3xl mx-auto">
              <div className="mb-6">
                <h2 className="text-2xl font-bold">{form.getValues().name || "Untitled Template"}</h2>
                {form.getValues().description && (
                  <p className="text-muted-foreground mt-1">{form.getValues().description}</p>
                )}
                <div className="flex gap-2 mt-2">
                  <Badge variant="outline">{form.getValues().scope === "property" ? "Property" : form.getValues().scope === "block" ? "Block" : "Property & Block"}</Badge>
                  {form.getValues().isActive !== false && <Badge variant="secondary">Active</Badge>}
                </div>
              </div>

              {structure.sections.length === 0 ? (
                <Card className="shadow-sm">
                  <CardContent className="py-12 text-center text-muted-foreground">
                    No sections defined yet. Switch to Edit mode to add sections and fields.
                  </CardContent>
                </Card>
              ) : (
                structure.sections.map((section, sectionIdx) => (
                  <Card key={section.id} className="shadow-sm">
                    <CardHeader>
                      <CardTitle className="text-lg">{section.title || `Section ${sectionIdx + 1}`}</CardTitle>
                      {section.description && (
                        <p className="text-sm text-muted-foreground">{section.description}</p>
                      )}
                    </CardHeader>
                    <CardContent className="space-y-4">
                      {section.fields.length === 0 ? (
                        <p className="text-muted-foreground text-sm">No fields in this section</p>
                      ) : (
                        section.fields.map((field) => (
                          <div key={field.id} className="space-y-1">
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-medium">{field.label}</span>
                              {field.required && <span className="text-destructive text-xs">*</span>}
                              <Badge variant="outline" className="text-xs">
                                {FIELD_TYPES.find(t => t.value === field.type)?.label || field.type}
                              </Badge>
                            </div>
                            {renderPreviewField(field)}
                          </div>
                        ))
                      )}
                    </CardContent>
                  </Card>
                ))
              )}
            </div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* Template Metadata */}
              <div className="lg:col-span-1 space-y-6">
                <Card className="shadow-sm">
                  <CardHeader>
                    <CardTitle className="text-lg">Template Settings</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <Form {...form}>
                      <FormField
                        control={form.control}
                        name="name"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Name</FormLabel>
                            <FormControl>
                              <Input {...field} placeholder="Move-In Inspection" data-testid="input-template-name" />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={form.control}
                        name="description"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Description</FormLabel>
                            <FormControl>
                              <Textarea
                                {...field}
                                value={field.value || ""}
                                placeholder="Template description..."
                                data-testid="input-template-description"
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={form.control}
                        name="scope"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Scope</FormLabel>
                            <Select value={field.value} onValueChange={field.onChange}>
                              <FormControl>
                                <SelectTrigger data-testid="select-template-scope">
                                  <SelectValue />
                                </SelectTrigger>
                              </FormControl>
                              <SelectContent>
                                <SelectItem value="property">Property</SelectItem>
                                <SelectItem value="block">Block</SelectItem>
                                <SelectItem value="both">Both</SelectItem>
                              </SelectContent>
                            </Select>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={form.control}
                        name="categoryId"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Category</FormLabel>
                            <Select 
                              value={field.value || "none"} 
                              onValueChange={(v) => field.onChange(v === "none" ? undefined : v)}
                            >
                              <FormControl>
                                <SelectTrigger data-testid="select-template-category">
                                  <SelectValue />
                                </SelectTrigger>
                              </FormControl>
                              <SelectContent>
                                <SelectItem value="none">No Category</SelectItem>
                                {categories.map((cat) => (
                                  <SelectItem key={cat.id} value={cat.id}>
                                    {cat.name}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={form.control}
                        name="isActive"
                        render={({ field }) => (
                          <FormItem className="flex items-center justify-between gap-2 space-y-0">
                            <FormLabel>Active Template</FormLabel>
                            <FormControl>
                              <Switch
                                checked={field.value ?? true}
                                onCheckedChange={field.onChange}
                                data-testid="switch-template-active"
                              />
                            </FormControl>
                          </FormItem>
                        )}
                      />
                    </Form>
                  </CardContent>
                </Card>

                <Card className="shadow-sm">
                  <CardHeader>
                    <CardTitle className="text-lg">AI Analysis Settings</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <Form {...form}>
                      <FormField
                        control={form.control}
                        name="aiMaxWords"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Max Word Count</FormLabel>
                            <FormControl>
                              <Input 
                                type="number"
                                min={50}
                                max={500}
                                {...field}
                                value={field.value ?? 150}
                                onChange={(e) => field.onChange(parseInt(e.target.value) || 150)}
                                data-testid="input-ai-max-words" 
                              />
                            </FormControl>
                            <FormDescription>
                              Maximum words for AI analysis output (50-500)
                            </FormDescription>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={form.control}
                        name="aiInstruction"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>AI Instruction</FormLabel>
                            <FormControl>
                              <Textarea
                                {...field}
                                value={field.value || ""}
                                placeholder={DEFAULT_AI_INSTRUCTION}
                                rows={6}
                                data-testid="input-ai-instruction"
                              />
                            </FormControl>
                            <FormDescription>
                              Custom instruction for AI analysis. Leave blank to use default. The AI will focus on condition, cleanliness, and maintenance issues.
                            </FormDescription>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </Form>
                  </CardContent>
                </Card>

                <Card className="shadow-sm">
                  <CardHeader>
                    <CardTitle className="text-lg">Report Configuration</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <p className="text-sm text-muted-foreground mb-4">
                      Configure which sections appear in generated PDF reports and report views.
                    </p>
                    <Form {...form}>
                      <div className="space-y-3">
                        <FormField
                          control={form.control}
                          name="reportConfig.showCover"
                          render={({ field }) => (
                            <FormItem className="flex items-center justify-between gap-2 space-y-0">
                              <FormLabel className="font-normal">Cover Page</FormLabel>
                              <FormControl>
                                <Switch
                                  checked={field.value ?? true}
                                  onCheckedChange={field.onChange}
                                  data-testid="switch-report-cover"
                                />
                              </FormControl>
                            </FormItem>
                          )}
                        />
                        <FormField
                          control={form.control}
                          name="reportConfig.showContentsPage"
                          render={({ field }) => (
                            <FormItem className="flex items-center justify-between gap-2 space-y-0">
                              <FormLabel className="font-normal">Contents Page</FormLabel>
                              <FormControl>
                                <Switch
                                  checked={field.value ?? true}
                                  onCheckedChange={field.onChange}
                                  data-testid="switch-report-contents"
                                />
                              </FormControl>
                            </FormItem>
                          )}
                        />
                        <FormField
                          control={form.control}
                          name="reportConfig.showTradeMarks"
                          render={({ field }) => (
                            <FormItem className="flex items-center justify-between gap-2 space-y-0">
                              <FormLabel className="font-normal">Trade Marks</FormLabel>
                              <FormControl>
                                <Switch
                                  checked={field.value ?? true}
                                  onCheckedChange={field.onChange}
                                  data-testid="switch-report-trademarks"
                                />
                              </FormControl>
                            </FormItem>
                          )}
                        />
                        <FormField
                          control={form.control}
                          name="reportConfig.showGlossary"
                          render={({ field }) => (
                            <FormItem className="flex items-center justify-between gap-2 space-y-0">
                              <FormLabel className="font-normal">Glossary of Terms</FormLabel>
                              <FormControl>
                                <Switch
                                  checked={field.value ?? true}
                                  onCheckedChange={field.onChange}
                                  data-testid="switch-report-glossary"
                                />
                              </FormControl>
                            </FormItem>
                          )}
                        />
                        <FormField
                          control={form.control}
                          name="reportConfig.showMaintenanceLog"
                          render={({ field }) => (
                            <FormItem className="flex items-center justify-between gap-2 space-y-0">
                              <FormLabel className="font-normal">Maintenance Log</FormLabel>
                              <FormControl>
                                <Switch
                                  checked={field.value ?? true}
                                  onCheckedChange={field.onChange}
                                  data-testid="switch-report-maintenance"
                                />
                              </FormControl>
                            </FormItem>
                          )}
                        />
                        <FormField
                          control={form.control}
                          name="reportConfig.showInspection"
                          render={({ field }) => (
                            <FormItem className="flex items-center justify-between gap-2 space-y-0">
                              <FormLabel className="font-normal">Inspection</FormLabel>
                              <FormControl>
                                <Switch
                                  checked={field.value ?? true}
                                  onCheckedChange={field.onChange}
                                  data-testid="switch-report-inspection"
                                />
                              </FormControl>
                            </FormItem>
                          )}
                        />
                        <FormField
                          control={form.control}
                          name="reportConfig.showInventory"
                          render={({ field }) => (
                            <FormItem className="flex items-center justify-between gap-2 space-y-0">
                              <FormLabel className="font-normal">Inventory</FormLabel>
                              <FormControl>
                                <Switch
                                  checked={field.value ?? true}
                                  onCheckedChange={field.onChange}
                                  data-testid="switch-report-inventory"
                                />
                              </FormControl>
                            </FormItem>
                          )}
                        />
                        <FormField
                          control={form.control}
                          name="reportConfig.showTermsConditions"
                          render={({ field }) => (
                            <FormItem className="flex items-center justify-between gap-2 space-y-0">
                              <FormLabel className="font-normal">Terms and Conditions</FormLabel>
                              <FormControl>
                                <Switch
                                  checked={field.value ?? true}
                                  onCheckedChange={field.onChange}
                                  data-testid="switch-report-terms"
                                />
                              </FormControl>
                            </FormItem>
                          )}
                        />
                        <FormField
                          control={form.control}
                          name="reportConfig.showClosingSection"
                          render={({ field }) => (
                            <FormItem className="flex items-center justify-between gap-2 space-y-0">
                              <FormLabel className="font-normal">Closing Section</FormLabel>
                              <FormControl>
                                <Switch
                                  checked={field.value ?? true}
                                  onCheckedChange={field.onChange}
                                  data-testid="switch-report-closing"
                                />
                              </FormControl>
                            </FormItem>
                          )}
                        />
                      </div>
                    </Form>
                  </CardContent>
                </Card>
              </div>

              {/* Structure Editor */}
              <div className="lg:col-span-2 space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-lg font-semibold">Template Structure</h3>
                  <Button onClick={addSection} size="sm" data-testid="button-add-section">
                    <Plus className="w-4 h-4 mr-2" />
                    Add Section
                  </Button>
                </div>

                {structure.sections.length === 0 ? (
                  <Card className="shadow-sm">
                    <CardContent className="text-center py-12">
                      <p className="text-muted-foreground mb-4">No sections yet</p>
                      <Button onClick={addSection} data-testid="button-add-first-section">
                        <Plus className="w-4 h-4 mr-2" />
                        Add First Section
                      </Button>
                    </CardContent>
                  </Card>
                ) : (
                  <div className="space-y-4">
                    {structure.sections.map((section, sectionIndex) => (
                      <Card key={section.id} className="shadow-sm">
                        <Collapsible
                          open={expandedSections.has(section.id)}
                          onOpenChange={() => toggleSection(section.id)}
                        >
                          <CardHeader className="pb-3">
                            <div className="flex items-center gap-3">
                              <CollapsibleTrigger asChild>
                                <Button variant="ghost" size="icon" className="h-8 w-8">
                                  {expandedSections.has(section.id) ? (
                                    <ChevronDown className="w-4 h-4" />
                                  ) : (
                                    <ChevronRight className="w-4 h-4" />
                                  )}
                                </Button>
                              </CollapsibleTrigger>
                              <GripVertical className="w-4 h-4 text-muted-foreground" />
                              <Input
                                value={section.title}
                                onChange={(e) => updateSection(section.id, { title: e.target.value })}
                                className="font-semibold flex-1"
                                placeholder="Section Title"
                                data-testid={`input-section-title-${sectionIndex}`}
                              />
                              <Switch
                                checked={section.repeatable || false}
                                onCheckedChange={(checked) => updateSection(section.id, { repeatable: checked })}
                                data-testid={`switch-section-repeatable-${sectionIndex}`}
                              />
                              <span className="text-xs text-muted-foreground">Repeatable</span>
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => deleteSection(section.id)}
                                data-testid={`button-delete-section-${sectionIndex}`}
                              >
                                <Trash2 className="w-4 h-4 text-destructive" />
                              </Button>
                            </div>
                          </CardHeader>
                          <CollapsibleContent>
                            <CardContent className="space-y-3">
                              <Textarea
                                value={section.description || ""}
                                onChange={(e) => updateSection(section.id, { description: e.target.value })}
                                placeholder="Section description (optional)"
                                rows={2}
                                data-testid={`input-section-description-${sectionIndex}`}
                              />

                              {/* Fields */}
                              <div className="space-y-2">
                                {section.fields.map((field, fieldIndex) => (
                                  <div key={field.key} className="space-y-2">
                                    <div className="space-y-2">
                                      <div className="flex items-center gap-2 p-3 bg-muted rounded-lg">
                                        <GripVertical className="w-4 h-4 text-muted-foreground" />
                                        <Input
                                          value={field.label}
                                          onChange={(e) => updateField(section.id, field.key, { label: e.target.value })}
                                          placeholder="Field Label"
                                          className="flex-1"
                                          data-testid={`input-field-label-${sectionIndex}-${fieldIndex}`}
                                        />
                                        <Select
                                          value={field.type}
                                          onValueChange={(type) => updateField(section.id, field.key, { type })}
                                        >
                                          <SelectTrigger className="w-40" data-testid={`select-field-type-${sectionIndex}-${fieldIndex}`}>
                                            <SelectValue />
                                          </SelectTrigger>
                                          <SelectContent>
                                            {FIELD_TYPES.map((ft) => (
                                              <SelectItem key={ft.value} value={ft.value}>
                                                {ft.label}
                                              </SelectItem>
                                            ))}
                                          </SelectContent>
                                        </Select>
                                        <Switch
                                          checked={field.required || false}
                                          onCheckedChange={(checked) =>
                                            updateField(section.id, field.key, { required: checked })
                                          }
                                          data-testid={`switch-field-required-${sectionIndex}-${fieldIndex}`}
                                        />
                                        <span className="text-xs text-muted-foreground w-16">Required</span>
                                        <Button
                                          variant="ghost"
                                          size="icon"
                                          onClick={() => deleteField(section.id, field.key)}
                                          data-testid={`button-delete-field-${sectionIndex}-${fieldIndex}`}
                                        >
                                          <Trash2 className="w-4 h-4 text-destructive" />
                                        </Button>
                                      </div>
                                      
                                      {/* Additional Options Row */}
                                      <div className="flex items-center gap-4 ml-8 px-3">
                                        <div className="flex items-center gap-2">
                                          <Switch
                                            checked={field.includeCondition || false}
                                            onCheckedChange={(checked) =>
                                              updateField(section.id, field.key, { includeCondition: checked })
                                            }
                                            data-testid={`switch-field-condition-${sectionIndex}-${fieldIndex}`}
                                          />
                                          <span className="text-xs text-muted-foreground">Include Condition</span>
                                        </div>
                                        <div className="flex items-center gap-2">
                                          <Switch
                                            checked={field.includeCleanliness || false}
                                            onCheckedChange={(checked) =>
                                              updateField(section.id, field.key, { includeCleanliness: checked })
                                            }
                                            data-testid={`switch-field-cleanliness-${sectionIndex}-${fieldIndex}`}
                                          />
                                          <span className="text-xs text-muted-foreground">Include Cleanliness</span>
                                        </div>
                                      </div>
                                    </div>
                                    
                                    {/* Options editor for select/multiselect fields */}
                                    {(field.type === "select" || field.type === "multiselect") && (
                                      <div className="ml-8 p-3 bg-background border rounded-lg space-y-2">
                                        <div className="flex items-center justify-between">
                                          <label className="text-sm font-medium">Dropdown Options</label>
                                          <Button
                                            variant="outline"
                                            size="sm"
                                            onClick={() => {
                                              const options = field.options || [];
                                              updateField(section.id, field.key, { options: [...options, ""] });
                                            }}
                                            data-testid={`button-add-option-${sectionIndex}-${fieldIndex}`}
                                          >
                                            <Plus className="w-3 h-3 mr-1" />
                                            Add Option
                                          </Button>
                                        </div>
                                        
                                        {(!field.options || field.options.length === 0) ? (
                                          <p className="text-xs text-muted-foreground">No options yet. Click "Add Option" to create dropdown choices.</p>
                                        ) : (
                                          <div className="space-y-2">
                                            {field.options.map((option, optionIndex) => (
                                              <div key={optionIndex} className="flex items-center gap-2">
                                                <Input
                                                  value={option}
                                                  onChange={(e) => {
                                                    const newOptions = [...(field.options || [])];
                                                    newOptions[optionIndex] = e.target.value;
                                                    updateField(section.id, field.key, { options: newOptions });
                                                  }}
                                                  placeholder={`Option ${optionIndex + 1}`}
                                                  className="flex-1"
                                                  data-testid={`input-option-${sectionIndex}-${fieldIndex}-${optionIndex}`}
                                                />
                                                <Button
                                                  variant="ghost"
                                                  size="icon"
                                                  onClick={() => {
                                                    const newOptions = (field.options || []).filter((_, i) => i !== optionIndex);
                                                    updateField(section.id, field.key, { options: newOptions });
                                                  }}
                                                  data-testid={`button-delete-option-${sectionIndex}-${fieldIndex}-${optionIndex}`}
                                                >
                                                  <X className="w-4 h-4 text-destructive" />
                                                </Button>
                                              </div>
                                            ))}
                                          </div>
                                        )}
                                      </div>
                                    )}
                                  </div>
                                ))}
                              </div>

                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => addField(section.id)}
                                className="w-full"
                                data-testid={`button-add-field-${sectionIndex}`}
                              >
                                <Plus className="w-4 h-4 mr-2" />
                                Add Field
                              </Button>
                            </CardContent>
                          </CollapsibleContent>
                        </Collapsible>
                      </Card>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
