import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { useForm, useFieldArray } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage, FormDescription } from "@/components/ui/form";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { cn } from "@/lib/utils";
import { Plus, Trash2, Copy, GripVertical, Save, X, Eye, Code, ChevronDown, ChevronRight, FileText, Layers } from "lucide-react";
import { RichTextEditor } from "@/components/ui/rich-text-editor";
import { LocaleDateInput } from "@/components/LocaleDateInput";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { type CompletionChecklist, type InspectionTemplate, type TemplateCategory } from "@shared/schema";
import { duplicateTemplateSection } from "@shared/templateSectionDuplicate";
import {
  isMetaSection,
  normalizeCustomInspectionPoints,
  sanitizeStructureSectionCipIds,
  TemplateCipValidationError,
} from "@shared/templateCustomInspectionPoints";
import {
  defaultGeneralInformationSection,
  isGeneralInformationSection,
} from "@shared/defaultGeneralInformationSection";
import {
  AUTO_BATHROOM_COUNT_TYPE,
  AUTO_BEDROOM_COUNT_TYPE,
  matchSectionToRoomType,
} from "@shared/propertyLayout";
import {
  DEFAULT_REPORT_SECTION_ORDER,
  REPORT_SECTION_META,
  normalizeReportSectionOrder,
  type ReportSectionId,
} from "@shared/reportSectionOrder";
import { z } from "zod";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";

// Default AI instruction for inspection analysis
const DEFAULT_AI_INSTRUCTION = `You are analyzing a property inspection photo. Provide a professional, objective assessment focused on condition, cleanliness, and any maintenance issues. Be specific and concise. Format your response as plain text without bullet points, numbered lists, or special formatting.`;

// Custom section schema (defined before DEFAULT_REPORT_CONFIG to allow type reference)
const customSectionSchema = z.object({
  id: z.string(),
  title: z.string(),
  content: z.string(),
  sortOrder: z.number().default(0),
  placement: z.enum(["before_inspection", "after_inspection", "before_closing"]).default("after_inspection"),
});

type CustomSection = z.infer<typeof customSectionSchema>;

// Default report config - all sections enabled by default
const DEFAULT_REPORT_CONFIG = {
  showCover: true,
  showContentsPage: true,
  showFloorPlan: true,
  showTradeMarks: true,
  showGlossary: true,
  showMaintenanceLog: true,
  showInspection: true,
  showInventory: true,
  showTermsConditions: true,
  showClosingSection: true,
  sectionOrder: [...DEFAULT_REPORT_SECTION_ORDER] as ReportSectionId[],
  customSections: [] as CustomSection[],
};

// Report config schema
const reportConfigSchema = z.object({
  showCover: z.boolean().default(true),
  showContentsPage: z.boolean().default(true),
  showFloorPlan: z.boolean().default(true),
  showTradeMarks: z.boolean().default(true),
  showGlossary: z.boolean().default(true),
  showMaintenanceLog: z.boolean().default(true),
  showInspection: z.boolean().default(true),
  showInventory: z.boolean().default(true),
  showTermsConditions: z.boolean().default(true),
  showClosingSection: z.boolean().default(true),
  sectionOrder: z.array(z.string()).optional(),
  // Custom content fields
  coverPageTitle: z.string().optional(),
  coverPageSubtitle: z.string().optional(),
  termsConditionsText: z.string().optional(),
  closingSectionTitle: z.string().optional(),
  closingSectionText: z.string().optional(),
  // Custom formatted text sections
  customSections: z.array(customSectionSchema).optional(),
});

// UI-specific schema - only includes fields user can edit
// Backend will populate organizationId, createdBy, createdAt, updatedAt
const templateMetaSchema = z.object({
  name: z.string().min(1, "Name is required"),
  description: z.string().optional(),
  scope: z.enum(["property", "block", "both"]),
  categoryId: z.string().optional(),
  completionChecklistId: z.string().optional().nullable(),
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
  /** Allow-list of template CIP ids enabled for this section (opt-in). */
  customInspectionPointIds?: string[];
  fields: TemplateField[];
}

interface CustomInspectionPoint {
  id: string;
  label: string;
  repeatable?: boolean;
  fields: TemplateField[];
}

interface TemplateStructure {
  sections: TemplateSection[];
  customInspectionPoints?: CustomInspectionPoint[];
}

function newCustomInspectionPointId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return `cip_${crypto.randomUUID()}`;
  }
  return `cip_${Date.now()}`;
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
  { value: AUTO_BEDROOM_COUNT_TYPE, label: "Auto: Bedrooms" },
  { value: AUTO_BATHROOM_COUNT_TYPE, label: "Auto: Bathrooms" },
];

function stabilizeRoomCountFieldIds(
  field: TemplateField,
  type: string,
): Partial<TemplateField> {
  const looksGenerated = /^field_\d+/.test(field.id) || /^field_\d+/.test(field.key);
  if (type === AUTO_BEDROOM_COUNT_TYPE) {
    const next: Partial<TemplateField> = {
      type,
      label:
        field.label === "New Field" || !field.label?.trim()
          ? "Number of Bedrooms"
          : field.label,
    };
    if (looksGenerated || !field.id.toLowerCase().includes("num_bedroom")) {
      const id = `field_num_bedrooms_${Date.now()}`;
      next.id = id;
      next.key = id;
    }
    return next;
  }
  if (type === AUTO_BATHROOM_COUNT_TYPE) {
    const next: Partial<TemplateField> = {
      type,
      label:
        field.label === "New Field" || !field.label?.trim()
          ? "Number of Bathrooms"
          : field.label,
    };
    if (looksGenerated || !field.id.toLowerCase().includes("num_bathroom")) {
      const id = `field_num_bathrooms_${Date.now()}`;
      next.id = id;
      next.key = id;
    }
    return next;
  }
  return { type };
}

interface TemplateBuilderProps {
  template: InspectionTemplate | null;
  categories: TemplateCategory[];
  onClose: () => void;
  onSave: (saved?: InspectionTemplate) => void;
}

type FieldDragState =
  | { kind: "section"; parentId: string; fromIndex: number }
  | { kind: "cip"; parentId: string; fromIndex: number };

function reorderList<T>(list: T[], fromIndex: number, toIndex: number): T[] {
  if (fromIndex === toIndex || fromIndex < 0 || toIndex < 0) return list;
  if (fromIndex >= list.length || toIndex >= list.length) return list;
  const next = [...list];
  const [item] = next.splice(fromIndex, 1);
  next.splice(toIndex, 0, item!);
  return next;
}

export function TemplateBuilder({ template, categories, onClose, onSave }: TemplateBuilderProps) {
  const { toast } = useToast();
  const [previewMode, setPreviewMode] = useState(false);
  const [persistedTemplate, setPersistedTemplate] = useState<InspectionTemplate | null>(template);

  const { data: completionChecklists = [] } = useQuery<CompletionChecklist[]>({
    queryKey: ["/api/completion-checklists", { active: true }],
    queryFn: async () => {
      const res = await fetch("/api/completion-checklists?active=true", { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch completion checklists");
      return res.json();
    },
  });
  const [fieldDrag, setFieldDrag] = useState<FieldDragState | null>(null);
  const [fieldDropTarget, setFieldDropTarget] = useState<{
    kind: "section" | "cip";
    parentId: string;
    index: number;
  } | null>(null);
  const [reportSectionDragIndex, setReportSectionDragIndex] = useState<number | null>(null);
  const [reportSectionDropIndex, setReportSectionDropIndex] = useState<number | null>(null);
  const [templateSectionDragIndex, setTemplateSectionDragIndex] = useState<number | null>(null);
  const [templateSectionDropIndex, setTemplateSectionDropIndex] = useState<number | null>(null);
  const [cipDragIndex, setCipDragIndex] = useState<number | null>(null);
  const [cipDropIndex, setCipDropIndex] = useState<number | null>(null);
  
  // Parse existing structure or seed General Information for brand-new templates
  const rawStructure: TemplateStructure = template?.structureJson
    ? (typeof template.structureJson === "string"
        ? JSON.parse(template.structureJson)
        : (template.structureJson as TemplateStructure))
    : { sections: [defaultGeneralInformationSection() as TemplateSection] };

  // Migrate old templates: ensure all fields have both id and key
  const initialStructure: TemplateStructure = {
    sections: (rawStructure.sections.length
      ? rawStructure.sections
      : [defaultGeneralInformationSection() as TemplateSection]
    ).map((section) => ({
      ...section,
      customInspectionPointIds: Array.isArray(section.customInspectionPointIds)
        ? section.customInspectionPointIds.filter((id): id is string => typeof id === "string")
        : [],
      fields: (section.fields || []).map((field) => ({
        ...field,
        id: field.id || field.key,
        key: field.key || field.id,
      })),
    })),
    customInspectionPoints: (rawStructure.customInspectionPoints ?? []).map((cip) => ({
      ...cip,
      fields: (cip.fields ?? []).map((field) => ({
        ...field,
        id: field.id || field.key,
        key: field.key || field.id,
      })),
    })),
  };

  const [structure, setStructure] = useState<TemplateStructure>(initialStructure);
  const [expandedSections, setExpandedSections] = useState<Set<string>>(() => new Set());

  const form = useForm<TemplateMetaForm>({
    resolver: zodResolver(templateMetaSchema),
    defaultValues: {
      name: template?.name || "",
      description: template?.description || "",
      scope: template?.scope || "property",
      categoryId: template?.categoryId || undefined,
      completionChecklistId: template?.completionChecklistId || null,
      isActive: template?.isActive ?? true,
      version: template?.version || 1,
      structureJson: initialStructure,
      aiMaxWords: template?.aiMaxWords ?? 150,
      aiInstruction: template?.aiInstruction || "",
      reportConfig: template?.reportConfig
        ? {
            ...DEFAULT_REPORT_CONFIG,
            ...template.reportConfig,
            sectionOrder: normalizeReportSectionOrder(template.reportConfig.sectionOrder),
            customSections: template.reportConfig.customSections ?? [],
          }
        : DEFAULT_REPORT_CONFIG,
    },
  });

  const ensureGeneralInformationInStructure = (next: TemplateStructure): TemplateStructure => {
    if (next.sections.some((s) => isGeneralInformationSection(s))) return next;
    return {
      ...next,
      sections: [defaultGeneralInformationSection() as TemplateSection, ...next.sections],
    };
  };

  // Save mutation — modal stays open; first create switches to update mode.
  const saveMutation = useMutation({
    mutationFn: async (data: TemplateMetaForm) => {
      const payload = {
        ...data,
        reportConfig: data.reportConfig
          ? {
              ...data.reportConfig,
              sectionOrder: normalizeReportSectionOrder(data.reportConfig.sectionOrder),
            }
          : data.reportConfig,
        structureJson: sanitizeStructureSectionCipIds(
          ensureGeneralInformationInStructure({
            ...structure,
            customInspectionPoints: normalizeCustomInspectionPoints(
              structure.customInspectionPoints ?? [],
            ),
          }),
        ),
      };
      const res = persistedTemplate
        ? await apiRequest("PUT", `/api/inspection-templates/${persistedTemplate.id}`, payload)
        : await apiRequest("POST", "/api/inspection-templates", payload);
      return (await res.json()) as InspectionTemplate;
    },
    onSuccess: async (saved) => {
      setPersistedTemplate(saved);
      await queryClient.refetchQueries({ queryKey: ["/api/inspection-templates"] });
      if (saved?.id) {
        await queryClient.refetchQueries({ queryKey: ["/api/inspection-templates", saved.id] });
      }
      toast({
        title: "Success",
        description: persistedTemplate
          ? "Template updated successfully"
          : "Template created successfully",
      });
      onSave(saved);
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
      try {
        normalizeCustomInspectionPoints(structure.customInspectionPoints ?? []);
      } catch (err) {
        const message =
          err instanceof TemplateCipValidationError
            ? err.message
            : "Invalid custom inspection point configuration";
        toast({
          variant: "destructive",
          title: "Cannot save template",
          description: message,
        });
        return;
      }
      const withGi = ensureGeneralInformationInStructure(structure);
      if (withGi !== structure) setStructure(withGi);
      saveMutation.mutate(data);
    })();
  };

  const addSection = () => {
    const newSection: TemplateSection = {
      id: `section_${Date.now()}`,
      title: "New Section",
      fields: [],
    };
    setStructure({ ...structure, sections: [...structure.sections, newSection] });
    setExpandedSections(new Set([...Array.from(expandedSections), newSection.id]));
  };

  const updateSection = (sectionId: string, updates: Partial<TemplateSection>) => {
    setStructure({
      ...structure,
      sections: structure.sections.map((s) =>
        s.id === sectionId ? { ...s, ...updates } : s
      ),
    });
  };

  const deleteSection = (sectionId: string) => {
    const target = structure.sections.find((s) => s.id === sectionId);
    if (target && isGeneralInformationSection(target)) {
      toast({
        variant: "destructive",
        title: "Cannot delete",
        description: "General Information is required on every template.",
      });
      return;
    }
    setStructure({
      ...structure,
      sections: structure.sections.filter((s) => s.id !== sectionId),
    });
    const newExpanded = new Set(expandedSections);
    newExpanded.delete(sectionId);
    setExpandedSections(newExpanded);
  };

  const duplicateSection = (sectionId: string) => {
    const index = structure.sections.findIndex((s) => s.id === sectionId);
    if (index < 0) return;
    const copy = duplicateTemplateSection(structure.sections[index]!);
    const next = [...structure.sections];
    next.splice(index + 1, 0, copy);
    setStructure({ ...structure, sections: next });
    setExpandedSections(new Set([...Array.from(expandedSections), copy.id]));
  };

  const customInspectionPoints = structure.customInspectionPoints ?? [];

  const addCustomInspectionPoint = () => {
    const newCip: CustomInspectionPoint = {
      id: newCustomInspectionPointId(),
      label: "New Custom Inspection Point",
      repeatable: true,
      fields: [],
    };
    setStructure({
      ...structure,
      customInspectionPoints: [...customInspectionPoints, newCip],
    });
    setExpandedSections(new Set([...Array.from(expandedSections), newCip.id]));
  };

  const updateCustomInspectionPoint = (cipId: string, updates: Partial<CustomInspectionPoint>) => {
    setStructure({
      ...structure,
      customInspectionPoints: customInspectionPoints.map((cip) =>
        cip.id === cipId ? { ...cip, ...updates } : cip,
      ),
    });
  };

  const deleteCustomInspectionPoint = (cipId: string) => {
    setStructure({
      ...structure,
      customInspectionPoints: customInspectionPoints.filter((cip) => cip.id !== cipId),
      sections: structure.sections.map((section) => ({
        ...section,
        customInspectionPointIds: (section.customInspectionPointIds || []).filter((id) => id !== cipId),
      })),
    });
    const newExpanded = new Set(expandedSections);
    newExpanded.delete(cipId);
    setExpandedSections(newExpanded);
  };

  const toggleSectionCustomInspectionPoint = (sectionId: string, cipId: string, enabled: boolean) => {
    const section = structure.sections.find((s) => s.id === sectionId);
    if (!section) return;
    const current = section.customInspectionPointIds || [];
    const next = enabled
      ? current.includes(cipId)
        ? current
        : [...current, cipId]
      : current.filter((id) => id !== cipId);
    updateSection(sectionId, { customInspectionPointIds: next });
  };

  const duplicateCustomInspectionPoint = (cipId: string) => {
    const index = customInspectionPoints.findIndex((c) => c.id === cipId);
    if (index < 0) return;
    const src = customInspectionPoints[index]!;
    const stamp = Date.now();
    const copy: CustomInspectionPoint = {
      id: newCustomInspectionPointId(),
      label: `${src.label} (Copy)`,
      repeatable: src.repeatable !== false,
      fields: (src.fields || []).map((f, i) => {
        const fieldId = `field_${stamp}_${i}`;
        return { ...f, id: fieldId, key: fieldId };
      }),
    };
    const next = [...customInspectionPoints];
    next.splice(index + 1, 0, copy);
    setStructure({ ...structure, customInspectionPoints: next });
    setExpandedSections(new Set([...Array.from(expandedSections), copy.id]));
  };

  const addCipField = (cipId: string) => {
    const cip = customInspectionPoints.find((c) => c.id === cipId);
    if (!cip) return;
    const fieldId = `field_${Date.now()}`;
    const newField: TemplateField = {
      id: fieldId,
      key: fieldId,
      label: "New Field",
      type: "photo_array",
      required: false,
    };
    updateCustomInspectionPoint(cipId, { fields: [...cip.fields, newField] });
  };

  const updateCipField = (cipId: string, fieldKey: string, updates: Partial<TemplateField>) => {
    const cip = customInspectionPoints.find((c) => c.id === cipId);
    if (!cip) return;
    updateCustomInspectionPoint(cipId, {
      fields: cip.fields.map((f) => (f.key === fieldKey ? { ...f, ...updates } : f)),
    });
  };

  const deleteCipField = (cipId: string, fieldKey: string) => {
    const cip = customInspectionPoints.find((c) => c.id === cipId);
    if (!cip) return;
    updateCustomInspectionPoint(cipId, {
      fields: cip.fields.filter((f) => f.key !== fieldKey),
    });
  };

  const addField = (sectionId: string) => {
    const section = structure.sections.find((s) => s.id === sectionId);
    if (!section) return;

    const fieldId = `field_${Date.now()}`;
    const newField: TemplateField = {
      id: fieldId,
      key: fieldId, // Keep key same as id for compatibility
      label: "New Field",
      type: "photo_array",
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
      fields: section.fields.map((f) => {
        if (f.key !== fieldKey) return f;
        if (updates.type === AUTO_BEDROOM_COUNT_TYPE || updates.type === AUTO_BATHROOM_COUNT_TYPE) {
          return { ...f, ...stabilizeRoomCountFieldIds(f, updates.type) };
        }
        return { ...f, ...updates };
      }),
    });
  };

  const deleteField = (sectionId: string, fieldKey: string) => {
    const section = structure.sections.find((s) => s.id === sectionId);
    if (!section) return;

    updateSection(sectionId, {
      fields: section.fields.filter((f) => f.key !== fieldKey),
    });
  };

  const moveTemplateSection = (fromIndex: number, toIndex: number) => {
    setStructure({
      ...structure,
      sections: reorderList(structure.sections, fromIndex, toIndex),
    });
  };

  const moveCustomInspectionPoint = (fromIndex: number, toIndex: number) => {
    setStructure({
      ...structure,
      customInspectionPoints: reorderList(customInspectionPoints, fromIndex, toIndex),
    });
  };

  const moveSectionField = (sectionId: string, fromIndex: number, toIndex: number) => {
    const section = structure.sections.find((s) => s.id === sectionId);
    if (!section) return;
    updateSection(sectionId, {
      fields: reorderList(section.fields, fromIndex, toIndex),
    });
  };

  const moveCipField = (cipId: string, fromIndex: number, toIndex: number) => {
    const cip = customInspectionPoints.find((c) => c.id === cipId);
    if (!cip) return;
    updateCustomInspectionPoint(cipId, {
      fields: reorderList(cip.fields, fromIndex, toIndex),
    });
  };

  const fieldDragHandleProps = (
    kind: "section" | "cip",
    parentId: string,
    fromIndex: number,
  ) => ({
    draggable: true,
    onDragStart: (e: React.DragEvent) => {
      e.stopPropagation();
      e.dataTransfer.effectAllowed = "move";
      e.dataTransfer.setData("text/plain", `${kind}:${parentId}:${fromIndex}`);
      setFieldDrag({ kind, parentId, fromIndex });
    },
    onDragEnd: () => {
      setFieldDrag(null);
      setFieldDropTarget(null);
    },
  });

  const fieldDropZoneProps = (
    kind: "section" | "cip",
    parentId: string,
    toIndex: number,
  ) => ({
    onDragOver: (e: React.DragEvent) => {
      if (!fieldDrag || fieldDrag.kind !== kind || fieldDrag.parentId !== parentId) return;
      e.preventDefault();
      e.stopPropagation();
      e.dataTransfer.dropEffect = "move";
      if (
        fieldDropTarget?.kind !== kind ||
        fieldDropTarget.parentId !== parentId ||
        fieldDropTarget.index !== toIndex
      ) {
        setFieldDropTarget({ kind, parentId, index: toIndex });
      }
    },
    onDrop: (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (!fieldDrag || fieldDrag.kind !== kind || fieldDrag.parentId !== parentId) return;
      if (fieldDrag.fromIndex !== toIndex) {
        if (kind === "section") {
          moveSectionField(parentId, fieldDrag.fromIndex, toIndex);
        } else {
          moveCipField(parentId, fieldDrag.fromIndex, toIndex);
        }
      }
      setFieldDrag(null);
      setFieldDropTarget(null);
    },
  });

  const reportSectionOrder = normalizeReportSectionOrder(
    form.watch("reportConfig.sectionOrder") as string[] | undefined,
  );

  const moveReportSection = (fromIndex: number, toIndex: number) => {
    const next = reorderList(reportSectionOrder, fromIndex, toIndex);
    form.setValue("reportConfig.sectionOrder", next, { shouldDirty: true });
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

  // Custom section management using useFieldArray for proper react-hook-form integration
  const { fields: customSectionFields, append: appendCustomSection, remove: removeCustomSection } = useFieldArray({
    control: form.control,
    name: "reportConfig.customSections" as any,
  });

  const addCustomSection = () => {
    const newSection: CustomSection = {
      id: `section_${Date.now()}`,
      title: `Custom Section ${customSectionFields.length + 1}`,
      content: "",
      sortOrder: customSectionFields.length,
      placement: "after_inspection",
    };
    appendCustomSection(newSection as any);
  };

  const renderPreviewField = (field: TemplateField) => {
    switch (field.type) {
      case "short_text":
        return <Input disabled placeholder={field.placeholder || "Enter text..."} className="bg-muted/50" />;
      case "long_text":
        return <Textarea disabled placeholder={field.placeholder || "Enter text..."} className="bg-muted/50 min-h-[80px]" />;
      case "number":
        return <Input disabled type="number" placeholder={field.placeholder || "0"} className="bg-muted/50 w-full max-w-[200px]" />;
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
            <SelectTrigger className="bg-muted/50 w-full max-w-[300px]">
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
        return (
          <LocaleDateInput
            disabled
            value={null}
            onChange={() => {}}
            className="bg-muted/50 max-w-[200px]"
          />
        );
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
          <div className="w-full max-w-xl space-y-2">
            <div className="w-full h-48 border-2 border-dashed border-muted-foreground/30 rounded-lg flex items-center justify-center text-muted-foreground text-sm">
              Signature Pad
            </div>
            <div className="text-xs text-muted-foreground space-y-1">
              <div>Name: [Auto from signer]</div>
              <div>Date Signed: [Auto on save]</div>
            </div>
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
      case "auto_bedroom_count":
        return (
          <Input
            disabled
            type="number"
            value=""
            placeholder="From property floor plan (bedrooms)"
            className="bg-muted/50 max-w-[280px] italic text-muted-foreground"
          />
        );
      case "auto_bathroom_count":
        return (
          <Input
            disabled
            type="number"
            value=""
            placeholder="From property floor plan (bathrooms)"
            className="bg-muted/50 max-w-[280px] italic text-muted-foreground"
          />
        );
      default:
        return <Input disabled placeholder="Field preview" className="bg-muted/50" />;
    }
  };

  return (
    <Dialog open={true} onOpenChange={onClose}>
      <DialogContent className="max-w-6xl h-[min(90vh,calc(100dvh-2rem))] p-0 gap-0 flex flex-col overflow-hidden">
        <DialogHeader className="p-4 sm:p-6 pb-3 sm:pb-4 border-b shrink-0">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between pr-8 sm:pr-0">
            <DialogTitle className="text-xl sm:text-2xl break-words min-w-0">
              {template ? "Edit Template" : "Create Template"}
            </DialogTitle>
            <div className="flex flex-wrap items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                className="min-h-11"
                onClick={() => setPreviewMode(!previewMode)}
                data-testid="button-toggle-preview"
              >
                {previewMode ? <Code className="w-4 h-4 mr-2 shrink-0" /> : <Eye className="w-4 h-4 mr-2 shrink-0" />}
                {previewMode ? "Edit" : "Preview"}
              </Button>
              <Button
                className="min-h-11"
                onClick={handleSave}
                disabled={saveMutation.isPending}
                data-testid="button-save-template"
              >
                <Save className="w-4 h-4 mr-2 shrink-0" />
                {saveMutation.isPending ? "Saving..." : "Save Template"}
              </Button>
              <Button variant="ghost" size="icon" className="min-h-11 min-w-11 hidden sm:inline-flex" onClick={onClose} data-testid="button-close-builder">
                <X className="w-4 h-4" />
              </Button>
            </div>
          </div>
        </DialogHeader>

        <div className="flex-1 overflow-auto p-4 sm:p-6 min-w-0">
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
                            <div className="flex flex-wrap items-center gap-2 min-w-0">
                              <span className="text-sm font-medium break-words min-w-0">{field.label}</span>
                              {field.required && <span className="text-destructive text-xs shrink-0">*</span>}
                              <Badge variant="outline" className="text-xs shrink-0">
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
                        name="completionChecklistId"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Completion checklist</FormLabel>
                            <Select
                              value={field.value || "none"}
                              onValueChange={(v) => field.onChange(v === "none" ? null : v)}
                            >
                              <FormControl>
                                <SelectTrigger data-testid="select-completion-checklist">
                                  <SelectValue placeholder="None" />
                                </SelectTrigger>
                              </FormControl>
                              <SelectContent>
                                <SelectItem value="none">None</SelectItem>
                                {completionChecklists.map((c) => (
                                  <SelectItem key={c.id} value={c.id}>
                                    {c.name}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            <FormDescription>
                              Optional finish-the-job list snapshotted onto new inspections using this
                              template.
                            </FormDescription>
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
                      Toggle sections and drag to set the order they appear in generated PDF reports.
                    </p>
                    <Form {...form}>
                      <div className="space-y-2">
                        {reportSectionOrder.map((sectionId, sectionIndex) => {
                          const meta = REPORT_SECTION_META[sectionId];
                          return (
                            <div
                              key={sectionId}
                              className={cn(
                                "rounded-md px-1 transition-opacity",
                                reportSectionDragIndex === sectionIndex && "opacity-50",
                                reportSectionDropIndex === sectionIndex &&
                                  reportSectionDragIndex !== sectionIndex &&
                                  "ring-2 ring-primary/40",
                              )}
                              onDragOver={(e) => {
                                if (reportSectionDragIndex === null) return;
                                e.preventDefault();
                                e.dataTransfer.dropEffect = "move";
                                if (reportSectionDropIndex !== sectionIndex) {
                                  setReportSectionDropIndex(sectionIndex);
                                }
                              }}
                              onDrop={(e) => {
                                e.preventDefault();
                                if (
                                  reportSectionDragIndex !== null &&
                                  reportSectionDragIndex !== sectionIndex
                                ) {
                                  moveReportSection(reportSectionDragIndex, sectionIndex);
                                }
                                setReportSectionDragIndex(null);
                                setReportSectionDropIndex(null);
                              }}
                            >
                              <FormField
                                control={form.control}
                                name={`reportConfig.${meta.showKey}` as const}
                                render={({ field }) => (
                                  <FormItem className="flex items-center justify-between gap-2 space-y-0 py-1">
                                    <div className="flex items-center gap-2 min-w-0">
                                      <button
                                        type="button"
                                        className="cursor-grab active:cursor-grabbing touch-none p-1 -ml-1 text-muted-foreground hover:text-foreground shrink-0"
                                        title="Drag to reorder"
                                        aria-label={`Drag to reorder ${meta.label}`}
                                        data-testid={`drag-report-section-${sectionId}`}
                                        draggable
                                        onDragStart={(e) => {
                                          e.stopPropagation();
                                          e.dataTransfer.effectAllowed = "move";
                                          e.dataTransfer.setData("text/plain", sectionId);
                                          setReportSectionDragIndex(sectionIndex);
                                        }}
                                        onDragEnd={() => {
                                          setReportSectionDragIndex(null);
                                          setReportSectionDropIndex(null);
                                        }}
                                      >
                                        <GripVertical className="w-4 h-4" />
                                      </button>
                                      <FormLabel className="font-normal">{meta.label}</FormLabel>
                                    </div>
                                    <FormControl>
                                      <Switch
                                        checked={field.value ?? true}
                                        onCheckedChange={field.onChange}
                                        data-testid={meta.testId}
                                      />
                                    </FormControl>
                                  </FormItem>
                                )}
                              />
                            </div>
                          );
                        })}
                      </div>
                    </Form>
                  </CardContent>
                </Card>

                <Card className="shadow-sm">
                  <CardHeader>
                    <CardTitle className="text-lg">Report Content Customization</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <p className="text-sm text-muted-foreground mb-4">
                      Customize the text content that appears in each section of your PDF reports.
                    </p>
                    <Form {...form}>
                      <Collapsible className="border rounded-md">
                        <CollapsibleTrigger className="flex items-center justify-between w-full p-3 hover-elevate">
                          <span className="font-medium text-sm">Cover Page Content</span>
                          <ChevronDown className="w-4 h-4 text-muted-foreground" />
                        </CollapsibleTrigger>
                        <CollapsibleContent className="p-3 pt-0 space-y-3">
                          <FormField
                            control={form.control}
                            name="reportConfig.coverPageTitle"
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel>Report Title</FormLabel>
                                <FormControl>
                                  <Input
                                    {...field}
                                    value={field.value || ""}
                                    placeholder="Inspection Report"
                                    data-testid="input-cover-title"
                                  />
                                </FormControl>
                                <FormDescription>
                                  Leave blank to use "Inspection Report"
                                </FormDescription>
                              </FormItem>
                            )}
                          />
                          <FormField
                            control={form.control}
                            name="reportConfig.coverPageSubtitle"
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel>Subtitle</FormLabel>
                                <FormControl>
                                  <Input
                                    {...field}
                                    value={field.value || ""}
                                    placeholder="Optional subtitle text"
                                    data-testid="input-cover-subtitle"
                                  />
                                </FormControl>
                                <FormDescription>
                                  Optional text shown below the title
                                </FormDescription>
                              </FormItem>
                            )}
                          />
                        </CollapsibleContent>
                      </Collapsible>

                    </Form>
                  </CardContent>
                </Card>
              </div>

              {/* Structure Editor & Report Content */}
              <div className="lg:col-span-2 space-y-4">
                <Tabs defaultValue="structure" className="w-full min-w-0">
                  <TabsList className="grid w-full grid-cols-2 h-auto min-h-11">
                    <TabsTrigger value="structure" className="gap-1 sm:gap-2 text-xs sm:text-sm min-h-11 px-2" data-testid="tab-template-structure">
                      <Layers className="w-4 h-4 shrink-0" />
                      <span className="truncate">Structure</span>
                    </TabsTrigger>
                    <TabsTrigger value="content" className="gap-1 sm:gap-2 text-xs sm:text-sm min-h-11 px-2" data-testid="tab-report-content">
                      <FileText className="w-4 h-4 shrink-0" />
                      <span className="truncate">Report Content</span>
                    </TabsTrigger>
                  </TabsList>
                  
                  <TabsContent value="structure" className="space-y-4 mt-4">
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                      <h3 className="text-lg font-semibold">Template Structure</h3>
                      <div className="flex flex-col gap-2 sm:flex-row w-full sm:w-auto">
                        <Button onClick={addSection} size="sm" className="min-h-11 w-full sm:w-auto" data-testid="button-add-section">
                          <Plus className="w-4 h-4 mr-2 shrink-0" />
                          Add Section
                        </Button>
                        <Button
                          onClick={addCustomInspectionPoint}
                          size="sm"
                          className="min-h-11 w-full sm:w-auto"
                          data-testid="button-add-custom-inspection-point"
                        >
                          <Plus className="w-4 h-4 mr-2 shrink-0" />
                          Custom Inspection Point
                        </Button>
                      </div>
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
                      <Card
                        key={section.id}
                        className={cn(
                          "shadow-sm transition-opacity",
                          templateSectionDragIndex === sectionIndex && "opacity-50",
                          templateSectionDropIndex === sectionIndex &&
                            templateSectionDragIndex !== sectionIndex &&
                            "ring-2 ring-primary/40",
                        )}
                        onDragOver={(e) => {
                          if (templateSectionDragIndex === null) return;
                          e.preventDefault();
                          e.dataTransfer.dropEffect = "move";
                          if (templateSectionDropIndex !== sectionIndex) {
                            setTemplateSectionDropIndex(sectionIndex);
                          }
                        }}
                        onDrop={(e) => {
                          e.preventDefault();
                          if (
                            templateSectionDragIndex !== null &&
                            templateSectionDragIndex !== sectionIndex
                          ) {
                            moveTemplateSection(templateSectionDragIndex, sectionIndex);
                          }
                          setTemplateSectionDragIndex(null);
                          setTemplateSectionDropIndex(null);
                        }}
                      >
                        <Collapsible
                          open={expandedSections.has(section.id)}
                          onOpenChange={() => toggleSection(section.id)}
                        >
                          <CardHeader className="pb-3">
                            <div className="flex flex-wrap items-center gap-2 sm:gap-3 min-w-0">
                              <CollapsibleTrigger asChild>
                                <Button variant="ghost" size="icon" className="h-11 w-11 shrink-0">
                                  {expandedSections.has(section.id) ? (
                                    <ChevronDown className="w-4 h-4" />
                                  ) : (
                                    <ChevronRight className="w-4 h-4" />
                                  )}
                                </Button>
                              </CollapsibleTrigger>
                              <button
                                type="button"
                                className="cursor-grab active:cursor-grabbing touch-none p-1 -ml-1 text-muted-foreground hover:text-foreground shrink-0"
                                title="Drag to reorder section"
                                aria-label={`Drag to reorder ${section.title || "section"}`}
                                data-testid={`drag-section-${sectionIndex}`}
                                draggable
                                onDragStart={(e) => {
                                  e.stopPropagation();
                                  e.dataTransfer.effectAllowed = "move";
                                  e.dataTransfer.setData("text/plain", section.id);
                                  setTemplateSectionDragIndex(sectionIndex);
                                }}
                                onDragEnd={() => {
                                  setTemplateSectionDragIndex(null);
                                  setTemplateSectionDropIndex(null);
                                }}
                              >
                                <GripVertical className="w-4 h-4" />
                              </button>
                              <Input
                                value={section.title}
                                onChange={(e) => {
                                  const title = e.target.value;
                                  const roomType = matchSectionToRoomType({
                                    id: section.id,
                                    title,
                                  });
                                  const shouldRepeat =
                                    roomType === "bedrooms" || roomType === "bathrooms";
                                  updateSection(section.id, {
                                    title,
                                    ...(shouldRepeat && !section.repeatable
                                      ? { repeatable: true }
                                      : {}),
                                  });
                                }}
                                className="font-semibold flex-1 min-w-[10rem] min-h-11"
                                placeholder="Section Title"
                                data-testid={`input-section-title-${sectionIndex}`}
                              />
                              <div className="flex items-center gap-2 shrink-0">
                                <Switch
                                  checked={section.repeatable || false}
                                  onCheckedChange={(checked) => updateSection(section.id, { repeatable: checked })}
                                  data-testid={`switch-section-repeatable-${sectionIndex}`}
                                />
                                <span className="text-xs text-muted-foreground">Repeatable</span>
                              </div>
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                className="min-h-11 min-w-11 shrink-0"
                                title="Duplicate section"
                                onClick={() => duplicateSection(section.id)}
                                data-testid={`button-duplicate-section-${sectionIndex}`}
                              >
                                <Copy className="w-4 h-4" />
                              </Button>
                              {!isGeneralInformationSection(section) && (
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="icon"
                                  className="min-h-11 min-w-11 shrink-0"
                                  title="Delete section"
                                  onClick={() => deleteSection(section.id)}
                                  data-testid={`button-delete-section-${sectionIndex}`}
                                >
                                  <Trash2 className="w-4 h-4 text-destructive" />
                                </Button>
                              )}
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

                              {!isMetaSection(section) && customInspectionPoints.length > 0 && (
                                <div className="space-y-2 rounded-lg border p-3">
                                  <p className="text-sm font-medium">Custom Inspection Points</p>
                                  <p className="text-xs text-muted-foreground">
                                    Enable which template custom points apply to this section.
                                  </p>
                                  <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:gap-4">
                                    {customInspectionPoints.map((cip) => {
                                      const enabled = (section.customInspectionPointIds || []).includes(cip.id);
                                      return (
                                        <div key={cip.id} className="flex items-center gap-2 min-h-11">
                                          <Switch
                                            checked={enabled}
                                            onCheckedChange={(checked) =>
                                              toggleSectionCustomInspectionPoint(section.id, cip.id, checked)
                                            }
                                            data-testid={`switch-section-include-cip-${sectionIndex}-${cip.id}`}
                                          />
                                          <span className="text-xs text-muted-foreground">
                                            Include {cip.label || "Custom Point"}
                                          </span>
                                        </div>
                                      );
                                    })}
                                  </div>
                                </div>
                              )}

                              {/* Fields */}
                              <div className="space-y-2">
                                {section.fields.map((field, fieldIndex) => (
                                  <div
                                    key={field.key}
                                    className={cn(
                                      "space-y-2 rounded-lg transition-opacity",
                                      fieldDrag?.kind === "section" &&
                                        fieldDrag.parentId === section.id &&
                                        fieldDrag.fromIndex === fieldIndex &&
                                        "opacity-50",
                                      fieldDropTarget?.kind === "section" &&
                                        fieldDropTarget.parentId === section.id &&
                                        fieldDropTarget.index === fieldIndex &&
                                        fieldDrag?.fromIndex !== fieldIndex &&
                                        "ring-2 ring-primary/40",
                                    )}
                                    {...fieldDropZoneProps("section", section.id, fieldIndex)}
                                  >
                                    <div className="space-y-2">
                                      <div className="flex flex-col gap-2 p-3 bg-muted rounded-lg sm:flex-row sm:flex-wrap sm:items-center min-w-0">
                                        <div className="flex items-center gap-2 flex-1 min-w-0">
                                          <button
                                            type="button"
                                            className="cursor-grab active:cursor-grabbing touch-none p-1 -ml-1 text-muted-foreground hover:text-foreground shrink-0"
                                            title="Drag to reorder"
                                            aria-label={`Drag to reorder ${field.label || "field"}`}
                                            data-testid={`drag-field-${sectionIndex}-${fieldIndex}`}
                                            {...fieldDragHandleProps("section", section.id, fieldIndex)}
                                          >
                                            <GripVertical className="w-4 h-4" />
                                          </button>
                                          <Input
                                            value={field.label}
                                            onChange={(e) => updateField(section.id, field.key, { label: e.target.value })}
                                            placeholder="Field Label"
                                            className="flex-1 min-w-0 min-h-11"
                                            data-testid={`input-field-label-${sectionIndex}-${fieldIndex}`}
                                          />
                                        </div>
                                        <div className="flex flex-wrap items-center gap-2">
                                          <Select
                                            value={field.type}
                                            onValueChange={(type) => updateField(section.id, field.key, { type })}
                                          >
                                            <SelectTrigger className="w-full sm:w-40 min-h-11" data-testid={`select-field-type-${sectionIndex}-${fieldIndex}`}>
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
                                          <div className="flex items-center gap-2">
                                            <Switch
                                              checked={field.required || false}
                                              onCheckedChange={(checked) =>
                                                updateField(section.id, field.key, { required: checked })
                                              }
                                              data-testid={`switch-field-required-${sectionIndex}-${fieldIndex}`}
                                            />
                                            <span className="text-xs text-muted-foreground">Required</span>
                                          </div>
                                          <Button
                                            variant="ghost"
                                            size="icon"
                                            className="min-h-11 min-w-11 shrink-0"
                                            onClick={() => deleteField(section.id, field.key)}
                                            data-testid={`button-delete-field-${sectionIndex}-${fieldIndex}`}
                                          >
                                            <Trash2 className="w-4 h-4 text-destructive" />
                                          </Button>
                                        </div>
                                      </div>
                                      
                                      {/* Additional Options Row */}
                                      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:gap-4 ml-0 sm:ml-8 px-1 sm:px-3">
                                        <div className="flex items-center gap-2 min-h-11">
                                          <Switch
                                            checked={field.includeCondition || false}
                                            onCheckedChange={(checked) =>
                                              updateField(section.id, field.key, { includeCondition: checked })
                                            }
                                            data-testid={`switch-field-condition-${sectionIndex}-${fieldIndex}`}
                                          />
                                          <span className="text-xs text-muted-foreground">Include Condition</span>
                                        </div>
                                        <div className="flex items-center gap-2 min-h-11">
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
                                      <div className="ml-0 sm:ml-8 p-3 bg-background border rounded-lg space-y-2 min-w-0">
                                        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                                          <label className="text-sm font-medium">Dropdown Options</label>
                                          <Button
                                            variant="outline"
                                            size="sm"
                                            className="min-h-11 w-full sm:w-auto"
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

                    <div className="space-y-3 pt-2 border-t">
                      <div>
                        <h3 className="text-lg font-semibold">Custom Inspection Points</h3>
                        <p className="text-sm text-muted-foreground mt-1">
                          Defined on the template; enable per section with Include toggles above.
                          Repeatable points ask How many {"{name}"}? at capture; non-repeatable
                          points always show one copy.
                        </p>
                      </div>
                      {customInspectionPoints.length === 0 ? (
                        <Card className="shadow-sm">
                          <CardContent className="text-center py-8">
                            <p className="text-muted-foreground text-sm mb-4">No custom inspection points yet</p>
                            <Button
                              onClick={addCustomInspectionPoint}
                              size="sm"
                              className="min-h-11"
                              data-testid="button-add-first-custom-inspection-point"
                            >
                              <Plus className="w-4 h-4 mr-2 shrink-0" />
                              Custom Inspection Point
                            </Button>
                          </CardContent>
                        </Card>
                      ) : (
                        <div className="space-y-4">
                          {customInspectionPoints.map((cip, cipIndex) => (
                            <Card
                              key={cip.id}
                              className={cn(
                                "shadow-sm transition-opacity",
                                cipDragIndex === cipIndex && "opacity-50",
                                cipDropIndex === cipIndex &&
                                  cipDragIndex !== cipIndex &&
                                  "ring-2 ring-primary/40",
                              )}
                              onDragOver={(e) => {
                                if (cipDragIndex === null) return;
                                e.preventDefault();
                                e.dataTransfer.dropEffect = "move";
                                if (cipDropIndex !== cipIndex) {
                                  setCipDropIndex(cipIndex);
                                }
                              }}
                              onDrop={(e) => {
                                e.preventDefault();
                                if (cipDragIndex !== null && cipDragIndex !== cipIndex) {
                                  moveCustomInspectionPoint(cipDragIndex, cipIndex);
                                }
                                setCipDragIndex(null);
                                setCipDropIndex(null);
                              }}
                            >
                              <Collapsible
                                open={expandedSections.has(cip.id)}
                                onOpenChange={() => toggleSection(cip.id)}
                              >
                                <CardHeader className="pb-3">
                                  <div className="flex flex-wrap items-center gap-2 sm:gap-3 min-w-0">
                                    <CollapsibleTrigger asChild>
                                      <Button
                                        variant="ghost"
                                        size="icon"
                                        className="h-11 w-11 shrink-0"
                                        data-testid={`button-toggle-cip-${cipIndex}`}
                                      >
                                        {expandedSections.has(cip.id) ? (
                                          <ChevronDown className="w-4 h-4" />
                                        ) : (
                                          <ChevronRight className="w-4 h-4" />
                                        )}
                                      </Button>
                                    </CollapsibleTrigger>
                                    <button
                                      type="button"
                                      className="cursor-grab active:cursor-grabbing touch-none p-1 -ml-1 text-muted-foreground hover:text-foreground shrink-0"
                                      title="Drag to reorder"
                                      aria-label={`Drag to reorder ${cip.label || "custom inspection point"}`}
                                      data-testid={`drag-cip-${cipIndex}`}
                                      draggable
                                      onDragStart={(e) => {
                                        e.stopPropagation();
                                        e.dataTransfer.effectAllowed = "move";
                                        e.dataTransfer.setData("text/plain", cip.id);
                                        setCipDragIndex(cipIndex);
                                      }}
                                      onDragEnd={() => {
                                        setCipDragIndex(null);
                                        setCipDropIndex(null);
                                      }}
                                    >
                                      <GripVertical className="w-4 h-4" />
                                    </button>
                                    <Input
                                      value={cip.label}
                                      onChange={(e) =>
                                        updateCustomInspectionPoint(cip.id, { label: e.target.value })
                                      }
                                      className="font-semibold flex-1 min-w-[10rem] min-h-11"
                                      placeholder="Inspection point name (e.g. Door)"
                                      data-testid={`input-cip-label-${cipIndex}`}
                                    />
                                    <div className="flex items-center gap-2 shrink-0">
                                      <Switch
                                        checked={cip.repeatable !== false}
                                        onCheckedChange={(checked) =>
                                          updateCustomInspectionPoint(cip.id, { repeatable: checked })
                                        }
                                        data-testid={`switch-cip-repeatable-${cipIndex}`}
                                      />
                                      <span className="text-xs text-muted-foreground">Repeatable</span>
                                    </div>
                                    <Button
                                      type="button"
                                      variant="ghost"
                                      size="icon"
                                      className="min-h-11 min-w-11 shrink-0"
                                      title="Duplicate custom inspection point"
                                      onClick={() => duplicateCustomInspectionPoint(cip.id)}
                                      data-testid={`button-duplicate-cip-${cipIndex}`}
                                    >
                                      <Copy className="w-4 h-4" />
                                    </Button>
                                    <Button
                                      type="button"
                                      variant="ghost"
                                      size="icon"
                                      className="min-h-11 min-w-11 shrink-0"
                                      title="Delete custom inspection point"
                                      onClick={() => deleteCustomInspectionPoint(cip.id)}
                                      data-testid={`button-delete-cip-${cipIndex}`}
                                    >
                                      <Trash2 className="w-4 h-4 text-destructive" />
                                    </Button>
                                  </div>
                                </CardHeader>
                                <CollapsibleContent>
                                  <CardContent className="space-y-3">
                                    <div className="space-y-2">
                                      {cip.fields.map((field, fieldIndex) => (
                                        <div
                                          key={field.key}
                                          className={cn(
                                            "space-y-2 rounded-lg transition-opacity",
                                            fieldDrag?.kind === "cip" &&
                                              fieldDrag.parentId === cip.id &&
                                              fieldDrag.fromIndex === fieldIndex &&
                                              "opacity-50",
                                            fieldDropTarget?.kind === "cip" &&
                                              fieldDropTarget.parentId === cip.id &&
                                              fieldDropTarget.index === fieldIndex &&
                                              fieldDrag?.fromIndex !== fieldIndex &&
                                              "ring-2 ring-primary/40",
                                          )}
                                          {...fieldDropZoneProps("cip", cip.id, fieldIndex)}
                                        >
                                          <div className="space-y-2">
                                            <div className="flex flex-col gap-2 p-3 bg-muted rounded-lg sm:flex-row sm:flex-wrap sm:items-center min-w-0">
                                              <div className="flex items-center gap-2 flex-1 min-w-0">
                                                <button
                                                  type="button"
                                                  className="cursor-grab active:cursor-grabbing touch-none p-1 -ml-1 text-muted-foreground hover:text-foreground shrink-0"
                                                  title="Drag to reorder"
                                                  aria-label={`Drag to reorder ${field.label || "field"}`}
                                                  data-testid={`drag-cip-field-${cipIndex}-${fieldIndex}`}
                                                  {...fieldDragHandleProps("cip", cip.id, fieldIndex)}
                                                >
                                                  <GripVertical className="w-4 h-4" />
                                                </button>
                                                <Input
                                                  value={field.label}
                                                  onChange={(e) =>
                                                    updateCipField(cip.id, field.key, { label: e.target.value })
                                                  }
                                                  placeholder="Field Label"
                                                  className="flex-1 min-w-0 min-h-11"
                                                  data-testid={`input-cip-field-label-${cipIndex}-${fieldIndex}`}
                                                />
                                              </div>
                                              <div className="flex flex-wrap items-center gap-2">
                                                <Select
                                                  value={field.type}
                                                  onValueChange={(type) =>
                                                    updateCipField(cip.id, field.key, { type })
                                                  }
                                                >
                                                  <SelectTrigger
                                                    className="w-full sm:w-40 min-h-11"
                                                    data-testid={`select-cip-field-type-${cipIndex}-${fieldIndex}`}
                                                  >
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
                                                <div className="flex items-center gap-2">
                                                  <Switch
                                                    checked={field.required || false}
                                                    onCheckedChange={(checked) =>
                                                      updateCipField(cip.id, field.key, { required: checked })
                                                    }
                                                    data-testid={`switch-cip-field-required-${cipIndex}-${fieldIndex}`}
                                                  />
                                                  <span className="text-xs text-muted-foreground">Required</span>
                                                </div>
                                                <Button
                                                  variant="ghost"
                                                  size="icon"
                                                  className="min-h-11 min-w-11 shrink-0"
                                                  onClick={() => deleteCipField(cip.id, field.key)}
                                                  data-testid={`button-delete-cip-field-${cipIndex}-${fieldIndex}`}
                                                >
                                                  <Trash2 className="w-4 h-4 text-destructive" />
                                                </Button>
                                              </div>
                                            </div>

                                            <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:gap-4 ml-0 sm:ml-8 px-1 sm:px-3">
                                              <div className="flex items-center gap-2 min-h-11">
                                                <Switch
                                                  checked={field.includeCondition || false}
                                                  onCheckedChange={(checked) =>
                                                    updateCipField(cip.id, field.key, {
                                                      includeCondition: checked,
                                                    })
                                                  }
                                                  data-testid={`switch-cip-field-condition-${cipIndex}-${fieldIndex}`}
                                                />
                                                <span className="text-xs text-muted-foreground">
                                                  Include Condition
                                                </span>
                                              </div>
                                              <div className="flex items-center gap-2 min-h-11">
                                                <Switch
                                                  checked={field.includeCleanliness || false}
                                                  onCheckedChange={(checked) =>
                                                    updateCipField(cip.id, field.key, {
                                                      includeCleanliness: checked,
                                                    })
                                                  }
                                                  data-testid={`switch-cip-field-cleanliness-${cipIndex}-${fieldIndex}`}
                                                />
                                                <span className="text-xs text-muted-foreground">
                                                  Include Cleanliness
                                                </span>
                                              </div>
                                            </div>
                                          </div>

                                          {(field.type === "select" || field.type === "multiselect") && (
                                            <div className="ml-0 sm:ml-8 p-3 bg-background border rounded-lg space-y-2 min-w-0">
                                              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                                                <label className="text-sm font-medium">Dropdown Options</label>
                                                <Button
                                                  variant="outline"
                                                  size="sm"
                                                  className="min-h-11 w-full sm:w-auto"
                                                  onClick={() => {
                                                    const options = field.options || [];
                                                    updateCipField(cip.id, field.key, {
                                                      options: [...options, ""],
                                                    });
                                                  }}
                                                  data-testid={`button-add-cip-option-${cipIndex}-${fieldIndex}`}
                                                >
                                                  <Plus className="w-3 h-3 mr-1" />
                                                  Add Option
                                                </Button>
                                              </div>

                                              {(!field.options || field.options.length === 0) ? (
                                                <p className="text-xs text-muted-foreground">
                                                  No options yet. Click &quot;Add Option&quot; to create dropdown
                                                  choices.
                                                </p>
                                              ) : (
                                                <div className="space-y-2">
                                                  {field.options.map((option, optionIndex) => (
                                                    <div key={optionIndex} className="flex items-center gap-2">
                                                      <Input
                                                        value={option}
                                                        onChange={(e) => {
                                                          const newOptions = [...(field.options || [])];
                                                          newOptions[optionIndex] = e.target.value;
                                                          updateCipField(cip.id, field.key, {
                                                            options: newOptions,
                                                          });
                                                        }}
                                                        placeholder={`Option ${optionIndex + 1}`}
                                                        className="flex-1"
                                                        data-testid={`input-cip-option-${cipIndex}-${fieldIndex}-${optionIndex}`}
                                                      />
                                                      <Button
                                                        variant="ghost"
                                                        size="icon"
                                                        onClick={() => {
                                                          const newOptions = (field.options || []).filter(
                                                            (_, i) => i !== optionIndex,
                                                          );
                                                          updateCipField(cip.id, field.key, {
                                                            options: newOptions,
                                                          });
                                                        }}
                                                        data-testid={`button-delete-cip-option-${cipIndex}-${fieldIndex}-${optionIndex}`}
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
                                      onClick={() => addCipField(cip.id)}
                                      className="w-full min-h-11"
                                      data-testid={`button-add-cip-field-${cipIndex}`}
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
                  </TabsContent>
                  
                  <TabsContent value="content" className="space-y-6 mt-4">
                    <div>
                      <h3 className="text-lg font-semibold mb-2">Report Content Customization</h3>
                      <p className="text-sm text-muted-foreground">
                        Customize the text content that appears in each section of your PDF reports. Use the formatting toolbar to style your text.
                      </p>
                    </div>
                    
                    <Form {...form}>
                      <div className="space-y-6">
                        <Card className="shadow-sm">
                          <CardHeader className="pb-3">
                            <CardTitle className="text-base">Terms and Conditions</CardTitle>
                          </CardHeader>
                          <CardContent>
                            <FormField
                              control={form.control}
                              name="reportConfig.termsConditionsText"
                              render={({ field }) => (
                                <FormItem>
                                  <FormControl>
                                    <RichTextEditor
                                      value={field.value || ""}
                                      onChange={field.onChange}
                                      placeholder="Enter your terms and conditions text here. This will appear in the Terms and Conditions section of the PDF report."
                                      minHeight="250px"
                                      data-testid="editor-terms-text"
                                    />
                                  </FormControl>
                                  <FormDescription>
                                    Custom terms that will appear in your inspection reports. Leave blank to omit this section.
                                  </FormDescription>
                                </FormItem>
                              )}
                            />
                          </CardContent>
                        </Card>

                        <Card className="shadow-sm">
                          <CardHeader className="pb-3">
                            <CardTitle className="text-base">Closing Section</CardTitle>
                          </CardHeader>
                          <CardContent className="space-y-4">
                            <FormField
                              control={form.control}
                              name="reportConfig.closingSectionTitle"
                              render={({ field }) => (
                                <FormItem>
                                  <FormLabel>Section Title</FormLabel>
                                  <FormControl>
                                    <Input
                                      {...field}
                                      value={field.value || ""}
                                      placeholder="Closing Statement"
                                      data-testid="input-closing-title"
                                    />
                                  </FormControl>
                                </FormItem>
                              )}
                            />
                            <FormField
                              control={form.control}
                              name="reportConfig.closingSectionText"
                              render={({ field }) => (
                                <FormItem>
                                  <FormLabel>Closing Text</FormLabel>
                                  <FormControl>
                                    <RichTextEditor
                                      value={field.value || ""}
                                      onChange={field.onChange}
                                      placeholder="Enter your closing statement or additional notes that will appear at the end of the report."
                                      minHeight="200px"
                                      data-testid="editor-closing-text"
                                    />
                                  </FormControl>
                                  <FormDescription>
                                    Custom text for the closing section of your reports
                                  </FormDescription>
                                </FormItem>
                              )}
                            />
                          </CardContent>
                        </Card>

                        {/* Custom Sections */}
                        <Card className="shadow-sm">
                          <CardHeader className="pb-3">
                            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-2">
                              <div className="min-w-0">
                                <CardTitle className="text-base break-words">Custom Sections</CardTitle>
                                <p className="text-sm text-muted-foreground mt-1 break-words">
                                  Add additional formatted text sections to your report
                                </p>
                              </div>
                              <Button
                                variant="outline"
                                size="sm"
                                className="min-h-11 w-full sm:w-auto shrink-0"
                                onClick={addCustomSection}
                                data-testid="button-add-custom-section"
                              >
                                <Plus className="w-4 h-4 mr-2 shrink-0" />
                                Add Section
                              </Button>
                            </div>
                          </CardHeader>
                          <CardContent className="space-y-4">
                            {customSectionFields.length === 0 ? (
                              <div className="text-center py-8 border border-dashed rounded-lg">
                                <FileText className="w-8 h-8 mx-auto text-muted-foreground mb-2" />
                                <p className="text-sm text-muted-foreground">
                                  No custom sections added yet. Click "Add Section" to create one.
                                </p>
                              </div>
                            ) : (
                              customSectionFields.map((fieldItem, index) => (
                                <Card key={fieldItem.id} className="border shadow-none">
                                  <Collapsible defaultOpen={true}>
                                    <CardHeader className="p-3 pb-0">
                                      <div className="flex flex-wrap items-center justify-between gap-2 min-w-0">
                                        <CollapsibleTrigger className="flex items-center gap-2 flex-1 min-w-0 hover-elevate rounded p-1 -m-1">
                                          <GripVertical className="w-4 h-4 text-muted-foreground shrink-0" />
                                          <span className="font-medium text-sm break-words min-w-0">
                                            {form.watch(`reportConfig.customSections.${index}.title` as any) || `Section ${index + 1}`}
                                          </span>
                                          <ChevronDown className="w-4 h-4 text-muted-foreground ml-auto" />
                                        </CollapsibleTrigger>
                                        <Button
                                          variant="ghost"
                                          size="icon"
                                          onClick={() => removeCustomSection(index)}
                                          data-testid={`button-delete-custom-section-${index}`}
                                        >
                                          <Trash2 className="w-4 h-4 text-destructive" />
                                        </Button>
                                      </div>
                                    </CardHeader>
                                    <CollapsibleContent>
                                      <CardContent className="p-3 space-y-4">
                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                          <FormField
                                            control={form.control}
                                            name={`reportConfig.customSections.${index}.title` as any}
                                            render={({ field }) => (
                                              <FormItem>
                                                <FormLabel>Section Title</FormLabel>
                                                <FormControl>
                                                  <Input
                                                    {...field}
                                                    value={field.value || ""}
                                                    placeholder="Enter section title"
                                                    data-testid={`input-custom-section-title-${index}`}
                                                  />
                                                </FormControl>
                                              </FormItem>
                                            )}
                                          />
                                          <FormField
                                            control={form.control}
                                            name={`reportConfig.customSections.${index}.placement` as any}
                                            render={({ field }) => (
                                              <FormItem>
                                                <FormLabel>Placement in Report</FormLabel>
                                                <Select
                                                  value={field.value || "after_inspection"}
                                                  onValueChange={field.onChange}
                                                >
                                                  <FormControl>
                                                    <SelectTrigger data-testid={`select-custom-section-placement-${index}`}>
                                                      <SelectValue />
                                                    </SelectTrigger>
                                                  </FormControl>
                                                  <SelectContent>
                                                    <SelectItem value="before_inspection">Before Inspection Details</SelectItem>
                                                    <SelectItem value="after_inspection">After Inspection Details</SelectItem>
                                                    <SelectItem value="before_closing">Before Closing Section</SelectItem>
                                                  </SelectContent>
                                                </Select>
                                              </FormItem>
                                            )}
                                          />
                                        </div>
                                        <FormField
                                          control={form.control}
                                          name={`reportConfig.customSections.${index}.content` as any}
                                          render={({ field }) => (
                                            <FormItem>
                                              <FormLabel>Content</FormLabel>
                                              <FormControl>
                                                <RichTextEditor
                                                  value={field.value || ""}
                                                  onChange={field.onChange}
                                                  placeholder="Enter the formatted text content for this section..."
                                                  minHeight="150px"
                                                  data-testid={`editor-custom-section-content-${index}`}
                                                />
                                              </FormControl>
                                            </FormItem>
                                          )}
                                        />
                                      </CardContent>
                                    </CollapsibleContent>
                                  </Collapsible>
                                </Card>
                              ))
                            )}
                          </CardContent>
                        </Card>
                      </div>
                    </Form>
                  </TabsContent>
                </Tabs>
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
