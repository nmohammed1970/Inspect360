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

// UI-specific schema - only includes fields user can edit
// Backend will populate organizationId, createdBy, createdAt, updatedAt
const templateMetaSchema = z.object({
  name: z.string().min(1, "Name is required"),
  description: z.string().optional(),
  scope: z.enum(["property", "block", "both"]),
  categoryId: z.number().optional(),
  isActive: z.boolean().default(true),
  version: z.number().default(1),
  structureJson: z.any(),
});

type TemplateMetaForm = z.infer<typeof templateMetaSchema>;

interface TemplateField {
  key: string;
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
  { value: "photo[]", label: "Multiple Photos" },
  { value: "video", label: "Video" },
  { value: "gps", label: "GPS Location" },
  { value: "signature", label: "Signature" },
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
  const initialStructure: TemplateStructure = template?.structureJson 
    ? (typeof template.structureJson === 'string' ? JSON.parse(template.structureJson) : template.structureJson as TemplateStructure)
    : { sections: [] };

  const [structure, setStructure] = useState<TemplateStructure>(initialStructure);
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set());

  const form = useForm<TemplateMetaForm>({
    resolver: zodResolver(templateMetaSchema),
    defaultValues: {
      name: template?.name || "",
      description: template?.description || "",
      scope: template?.scope || "property",
      categoryId: template?.categoryId !== null && template?.categoryId !== undefined ? template.categoryId : undefined,
      isActive: template?.isActive ?? true,
      version: template?.version || 1,
      structureJson: initialStructure,
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

    const newField: TemplateField = {
      key: `field_${Date.now()}`,
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
            <div className="space-y-6">
              <Card className="shadow-sm">
                <CardHeader>
                  <CardTitle>Preview Mode</CardTitle>
                </CardHeader>
                <CardContent>
                  <pre className="text-xs bg-muted p-4 rounded-lg overflow-auto">
                    {JSON.stringify({ ...form.getValues(), structureJson: structure }, null, 2)}
                  </pre>
                </CardContent>
              </Card>
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
                              value={field.value?.toString() || "none"} 
                              onValueChange={(v) => field.onChange(v === "none" ? undefined : parseInt(v))}
                            >
                              <FormControl>
                                <SelectTrigger data-testid="select-template-category">
                                  <SelectValue />
                                </SelectTrigger>
                              </FormControl>
                              <SelectContent>
                                <SelectItem value="none">No Category</SelectItem>
                                {categories.map((cat) => (
                                  <SelectItem key={cat.id} value={cat.id.toString()}>
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
