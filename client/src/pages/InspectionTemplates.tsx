import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage, FormDescription } from "@/components/ui/form";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Plus, Edit2, Trash2, FileText, CheckSquare } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { createInsertSchema } from "drizzle-zod";
import { inspectionTemplates, inspectionTemplatePoints, inspectionCategories, type InspectionTemplate, type InspectionTemplatePoint, type InspectionCategory } from "@shared/schema";
import { z } from "zod";

// Form schemas
const templateFormSchema = createInsertSchema(inspectionTemplates).omit({
  id: true,
  organizationId: true,
  createdAt: true,
  updatedAt: true,
}).extend({
  name: z.string().min(1, "Template name is required"),
});

const pointFormSchema = createInsertSchema(inspectionTemplatePoints).omit({
  id: true,
  createdAt: true,
}).extend({
  name: z.string().min(1, "Point name is required"),
});

type TemplateFormValues = z.infer<typeof templateFormSchema>;
type PointFormValues = z.infer<typeof pointFormSchema>;

// Label mappings
const dataTypeLabels = {
  text: "Text",
  number: "Number",
  checkbox: "Checkbox",
  photo: "Photo",
  rating: "Rating",
};

export default function InspectionTemplates() {
  const { toast } = useToast();
  const [isTemplateDialogOpen, setIsTemplateDialogOpen] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<InspectionTemplate | null>(null);
  const [selectedTemplate, setSelectedTemplate] = useState<InspectionTemplate | null>(null);
  const [isPointDialogOpen, setIsPointDialogOpen] = useState(false);
  const [editingPoint, setEditingPoint] = useState<InspectionTemplatePoint | null>(null);

  // Fetch templates
  const { data: templates, isLoading: templatesLoading } = useQuery<InspectionTemplate[]>({
    queryKey: ["/api/inspection-templates"],
  });

  // Fetch points for selected template
  const { data: points, isLoading: pointsLoading } = useQuery<InspectionTemplatePoint[]>({
    queryKey: ["/api/inspection-templates", selectedTemplate?.id, "points"],
    enabled: !!selectedTemplate?.id,
  });

  // Fetch categories for dropdown
  const { data: categories } = useQuery<InspectionCategory[]>({
    queryKey: ["/api/inspection-categories"],
  });

  // Template form
  const templateForm = useForm<TemplateFormValues>({
    resolver: zodResolver(templateFormSchema),
    defaultValues: {
      name: "",
      description: "",
      isActive: true,
    },
  });

  // Point form
  const pointForm = useForm<PointFormValues>({
    resolver: zodResolver(pointFormSchema),
    defaultValues: {
      templateId: "",
      name: "",
      description: "",
      dataType: "text",
      categoryId: null,
      requiresConditionRating: true,
      requiresCleanlinessRating: true,
      requiresPhoto: false,
      sortOrder: 0,
    },
  });

  // Create template mutation
  const createTemplateMutation = useMutation({
    mutationFn: async (data: TemplateFormValues) => {
      return await apiRequest("POST", "/api/inspection-templates", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/inspection-templates"] });
      toast({
        title: "Success",
        description: "Template created successfully",
      });
      setIsTemplateDialogOpen(false);
      templateForm.reset();
    },
    onError: (error: Error) => {
      toast({
        variant: "destructive",
        title: "Error",
        description: error.message || "Failed to create template",
      });
    },
  });

  // Update template mutation
  const updateTemplateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<TemplateFormValues> }) => {
      return await apiRequest("PATCH", `/api/inspection-templates/${id}`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/inspection-templates"] });
      toast({
        title: "Success",
        description: "Template updated successfully",
      });
      setEditingTemplate(null);
      setIsTemplateDialogOpen(false);
    },
    onError: (error: Error) => {
      toast({
        variant: "destructive",
        title: "Error",
        description: error.message || "Failed to update template",
      });
    },
  });

  // Delete template mutation
  const deleteTemplateMutation = useMutation({
    mutationFn: async (id: string) => {
      return await apiRequest("DELETE", `/api/inspection-templates/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/inspection-templates"] });
      toast({
        title: "Success",
        description: "Template deleted successfully",
      });
      if (selectedTemplate) {
        setSelectedTemplate(null);
      }
    },
    onError: (error: Error) => {
      toast({
        variant: "destructive",
        title: "Error",
        description: error.message || "Failed to delete template",
      });
    },
  });

  // Create point mutation
  const createPointMutation = useMutation({
    mutationFn: async (data: PointFormValues) => {
      return await apiRequest("POST", "/api/inspection-template-points", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/inspection-templates", selectedTemplate?.id, "points"] });
      toast({
        title: "Success",
        description: "Inspection point created successfully",
      });
      setIsPointDialogOpen(false);
      pointForm.reset();
    },
    onError: (error: Error) => {
      toast({
        variant: "destructive",
        title: "Error",
        description: error.message || "Failed to create inspection point",
      });
    },
  });

  // Update point mutation
  const updatePointMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<PointFormValues> }) => {
      return await apiRequest("PATCH", `/api/inspection-template-points/${id}`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/inspection-templates", selectedTemplate?.id, "points"] });
      toast({
        title: "Success",
        description: "Inspection point updated successfully",
      });
      setEditingPoint(null);
      setIsPointDialogOpen(false);
    },
    onError: (error: Error) => {
      toast({
        variant: "destructive",
        title: "Error",
        description: error.message || "Failed to update inspection point",
      });
    },
  });

  // Delete point mutation
  const deletePointMutation = useMutation({
    mutationFn: async (id: string) => {
      return await apiRequest("DELETE", `/api/inspection-template-points/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/inspection-templates", selectedTemplate?.id, "points"] });
      toast({
        title: "Success",
        description: "Inspection point deleted successfully",
      });
    },
    onError: (error: Error) => {
      toast({
        variant: "destructive",
        title: "Error",
        description: error.message || "Failed to delete inspection point",
      });
    },
  });

  // Template form handlers
  const handleCreateTemplate = () => {
    setEditingTemplate(null);
    templateForm.reset({
      name: "",
      description: "",
      isActive: true,
    });
    setIsTemplateDialogOpen(true);
  };

  const handleEditTemplate = (template: InspectionTemplate) => {
    setEditingTemplate(template);
    templateForm.reset({
      name: template.name,
      description: template.description || "",
      isActive: template.isActive,
    });
    setIsTemplateDialogOpen(true);
  };

  const handleTemplateSubmit = (data: TemplateFormValues) => {
    if (editingTemplate) {
      updateTemplateMutation.mutate({ id: editingTemplate.id, data });
    } else {
      createTemplateMutation.mutate(data);
    }
  };

  // Point form handlers
  const handleCreatePoint = () => {
    if (!selectedTemplate) return;
    
    setEditingPoint(null);
    pointForm.reset({
      templateId: selectedTemplate.id,
      name: "",
      description: "",
      dataType: "text",
      categoryId: null,
      requiresConditionRating: true,
      requiresCleanlinessRating: true,
      requiresPhoto: false,
      sortOrder: (points?.length || 0),
    });
    setIsPointDialogOpen(true);
  };

  const handleEditPoint = (point: InspectionTemplatePoint) => {
    setEditingPoint(point);
    pointForm.reset({
      templateId: point.templateId,
      name: point.name,
      description: point.description || "",
      dataType: point.dataType,
      categoryId: point.categoryId,
      requiresConditionRating: point.requiresConditionRating || false,
      requiresCleanlinessRating: point.requiresCleanlinessRating || false,
      requiresPhoto: point.requiresPhoto || false,
      sortOrder: point.sortOrder,
    });
    setIsPointDialogOpen(true);
  };

  const handlePointSubmit = (data: PointFormValues) => {
    if (editingPoint) {
      updatePointMutation.mutate({ id: editingPoint.id, data });
    } else {
      createPointMutation.mutate(data);
    }
  };

  return (
    <div className="container mx-auto p-8 space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-4xl font-bold tracking-tight">Inspection Templates</h1>
          <p className="text-muted-foreground mt-2">
            Create and manage reusable inspection templates with custom inspection points
          </p>
        </div>
        <Button
          onClick={handleCreateTemplate}
          size="lg"
          data-testid="button-create-template"
        >
          <Plus className="w-5 h-5 mr-2" />
          New Template
        </Button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Templates List */}
        <Card className="backdrop-blur-xl bg-white/80 dark:bg-gray-900/80 border-white/20 shadow-2xl rounded-2xl">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileText className="w-5 h-5" />
              Templates
            </CardTitle>
            <CardDescription>
              Select a template to manage its inspection points
            </CardDescription>
          </CardHeader>
          <CardContent>
            {templatesLoading ? (
              <div className="text-center py-8 text-muted-foreground">Loading templates...</div>
            ) : !templates || templates.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                No templates yet. Create your first one!
              </div>
            ) : (
              <div className="space-y-3">
                {templates.map((template) => (
                  <Card
                    key={template.id}
                    className={`cursor-pointer transition-all hover-elevate ${
                      selectedTemplate?.id === template.id
                        ? "ring-2 ring-primary"
                        : ""
                    }`}
                    onClick={() => setSelectedTemplate(template)}
                    data-testid={`card-template-${template.id}`}
                  >
                    <CardContent className="p-4">
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <h3 className="font-semibold truncate" data-testid={`text-template-name-${template.id}`}>
                              {template.name}
                            </h3>
                            {!template.isActive && (
                              <Badge variant="secondary" className="text-xs">
                                Inactive
                              </Badge>
                            )}
                          </div>
                          {template.description && (
                            <p className="text-sm text-muted-foreground mt-1 line-clamp-2">
                              {template.description}
                            </p>
                          )}
                        </div>
                        <div className="flex items-center gap-2">
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleEditTemplate(template);
                            }}
                            data-testid={`button-edit-template-${template.id}`}
                          >
                            <Edit2 className="w-4 h-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={(e) => {
                              e.stopPropagation();
                              if (confirm("Are you sure you want to delete this template?")) {
                                deleteTemplateMutation.mutate(template.id);
                              }
                            }}
                            data-testid={`button-delete-template-${template.id}`}
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Inspection Points */}
        <Card className="backdrop-blur-xl bg-white/80 dark:bg-gray-900/80 border-white/20 shadow-2xl rounded-2xl">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <CheckSquare className="w-5 h-5" />
                  Inspection Points
                </CardTitle>
                <CardDescription>
                  {selectedTemplate
                    ? `Points for "${selectedTemplate.name}"`
                    : "Select a template to view points"}
                </CardDescription>
              </div>
              {selectedTemplate && (
                <Button
                  onClick={handleCreatePoint}
                  size="sm"
                  data-testid="button-create-point"
                >
                  <Plus className="w-4 h-4 mr-2" />
                  Add Point
                </Button>
              )}
            </div>
          </CardHeader>
          <CardContent>
            {!selectedTemplate ? (
              <div className="text-center py-8 text-muted-foreground">
                Select a template to manage its inspection points
              </div>
            ) : pointsLoading ? (
              <div className="text-center py-8 text-muted-foreground">Loading points...</div>
            ) : !points || points.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                No inspection points yet. Add your first one!
              </div>
            ) : (
              <div className="space-y-3">
                {points
                  .sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0))
                  .map((point) => {
                    const category = categories?.find(c => c.id === point.categoryId);
                    return (
                      <Card key={point.id} className="hover-elevate" data-testid={`card-point-${point.id}`}>
                        <CardContent className="p-4">
                          <div className="flex items-start justify-between gap-4">
                            <div className="flex-1 min-w-0 space-y-2">
                              <h4 className="font-medium" data-testid={`text-point-name-${point.id}`}>
                                {point.name}
                              </h4>
                              {point.description && (
                                <p className="text-sm text-muted-foreground">
                                  {point.description}
                                </p>
                              )}
                              <div className="flex items-center gap-2 flex-wrap">
                                {category && (
                                  <Badge variant="outline">
                                    {category.name}
                                  </Badge>
                                )}
                                <Badge variant="outline">
                                  {dataTypeLabels[point.dataType]}
                                </Badge>
                                {point.requiresConditionRating && (
                                  <Badge variant="secondary" className="text-xs">
                                    Condition Rating
                                  </Badge>
                                )}
                                {point.requiresCleanlinessRating && (
                                  <Badge variant="secondary" className="text-xs">
                                    Cleanliness Rating
                                  </Badge>
                                )}
                                {point.requiresPhoto && (
                                  <Badge variant="secondary" className="text-xs">
                                    Photo Required
                                  </Badge>
                                )}
                              </div>
                            </div>
                            <div className="flex items-center gap-2">
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => handleEditPoint(point)}
                                data-testid={`button-edit-point-${point.id}`}
                              >
                                <Edit2 className="w-4 h-4" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => {
                                  if (confirm("Are you sure you want to delete this point?")) {
                                    deletePointMutation.mutate(point.id);
                                  }
                                }}
                                data-testid={`button-delete-point-${point.id}`}
                              >
                                <Trash2 className="w-4 h-4" />
                              </Button>
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    );
                  })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Template Dialog */}
      <Dialog open={isTemplateDialogOpen} onOpenChange={setIsTemplateDialogOpen}>
        <DialogContent data-testid="dialog-template-form">
          <DialogHeader>
            <DialogTitle>
              {editingTemplate ? "Edit Template" : "Create Template"}
            </DialogTitle>
            <DialogDescription>
              {editingTemplate
                ? "Update the template details"
                : "Create a new inspection template"}
            </DialogDescription>
          </DialogHeader>
          <Form {...templateForm}>
            <form onSubmit={templateForm.handleSubmit(handleTemplateSubmit)} className="space-y-4">
              <FormField
                control={templateForm.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Template Name</FormLabel>
                    <FormControl>
                      <Input
                        placeholder="e.g., Standard Move-In Inspection"
                        {...field}
                        data-testid="input-template-name"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={templateForm.control}
                name="description"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Description (Optional)</FormLabel>
                    <FormControl>
                      <Textarea
                        placeholder="Describe what this template is used for..."
                        {...field}
                        value={field.value || ""}
                        data-testid="input-template-description"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={templateForm.control}
                name="isActive"
                render={({ field }) => (
                  <FormItem className="flex items-center gap-2 space-y-0">
                    <FormControl>
                      <Checkbox
                        checked={field.value || false}
                        onCheckedChange={field.onChange}
                        data-testid="checkbox-template-active"
                      />
                    </FormControl>
                    <FormLabel className="!mt-0">Active template</FormLabel>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <DialogFooter>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setIsTemplateDialogOpen(false)}
                  data-testid="button-cancel-template"
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={createTemplateMutation.isPending || updateTemplateMutation.isPending}
                  data-testid="button-submit-template"
                >
                  {editingTemplate ? "Update" : "Create"}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      {/* Point Dialog */}
      <Dialog open={isPointDialogOpen} onOpenChange={setIsPointDialogOpen}>
        <DialogContent className="max-w-2xl" data-testid="dialog-point-form">
          <DialogHeader>
            <DialogTitle>
              {editingPoint ? "Edit Inspection Point" : "Add Inspection Point"}
            </DialogTitle>
            <DialogDescription>
              {editingPoint
                ? "Update the inspection point details"
                : "Add a new inspection point to the template"}
            </DialogDescription>
          </DialogHeader>
          <Form {...pointForm}>
            <form onSubmit={pointForm.handleSubmit(handlePointSubmit)} className="space-y-4">
              <FormField
                control={pointForm.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Point Name</FormLabel>
                    <FormControl>
                      <Input
                        placeholder="e.g., Kitchen Sink Condition"
                        {...field}
                        data-testid="input-point-name"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={pointForm.control}
                name="description"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Description (Optional)</FormLabel>
                    <FormControl>
                      <Textarea
                        placeholder="Instructions for this inspection point..."
                        {...field}
                        value={field.value || ""}
                        data-testid="input-point-description"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={pointForm.control}
                  name="categoryId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Category (Optional)</FormLabel>
                      <Select 
                        onValueChange={(value) => field.onChange(value === "" ? null : value)} 
                        value={field.value || undefined}
                      >
                        <FormControl>
                          <SelectTrigger data-testid="select-point-category">
                            <SelectValue placeholder="Select category" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="">None</SelectItem>
                          {categories?.map((cat) => (
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
                  control={pointForm.control}
                  name="dataType"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Data Type</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl>
                          <SelectTrigger data-testid="select-point-datatype">
                            <SelectValue placeholder="Select type" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {Object.entries(dataTypeLabels).map(([value, label]) => (
                            <SelectItem key={value} value={value}>
                              {label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
              <div className="space-y-2">
                <FormLabel>Requirements</FormLabel>
                <div className="space-y-2">
                  <FormField
                    control={pointForm.control}
                    name="requiresConditionRating"
                    render={({ field }) => (
                      <FormItem className="flex items-center gap-2 space-y-0">
                        <FormControl>
                          <Checkbox
                            checked={field.value || false}
                            onCheckedChange={field.onChange}
                            data-testid="checkbox-point-condition"
                          />
                        </FormControl>
                        <FormLabel className="!mt-0">Requires condition rating</FormLabel>
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={pointForm.control}
                    name="requiresCleanlinessRating"
                    render={({ field }) => (
                      <FormItem className="flex items-center gap-2 space-y-0">
                        <FormControl>
                          <Checkbox
                            checked={field.value || false}
                            onCheckedChange={field.onChange}
                            data-testid="checkbox-point-cleanliness"
                          />
                        </FormControl>
                        <FormLabel className="!mt-0">Requires cleanliness rating</FormLabel>
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={pointForm.control}
                    name="requiresPhoto"
                    render={({ field }) => (
                      <FormItem className="flex items-center gap-2 space-y-0">
                        <FormControl>
                          <Checkbox
                            checked={field.value || false}
                            onCheckedChange={field.onChange}
                            data-testid="checkbox-point-photo"
                          />
                        </FormControl>
                        <FormLabel className="!mt-0">Requires photo</FormLabel>
                      </FormItem>
                    )}
                  />
                </div>
              </div>
              <DialogFooter>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setIsPointDialogOpen(false)}
                  data-testid="button-cancel-point"
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={createPointMutation.isPending || updatePointMutation.isPending}
                  data-testid="button-submit-point"
                >
                  {editingPoint ? "Update" : "Add"}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
