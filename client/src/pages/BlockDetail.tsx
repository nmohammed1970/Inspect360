import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useRoute, Link } from "wouter";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import ComplianceCalendar from "@/components/ComplianceCalendar";
import ComplianceDocumentCalendar from "@/components/ComplianceDocumentCalendar";
import { ObjectUploader } from "@/components/ObjectUploader";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { MapPreview } from "@/components/MapPreview";
import { insertComplianceDocumentSchema } from "@shared/schema";
import { 
  ArrowLeft, Building2, MapPin, Users, CheckCircle2, Calendar as CalendarIcon, 
  AlertTriangle, FileCheck, ClipboardCheck, Upload, AlertCircle, ExternalLink, Clock,
  Wrench
} from "lucide-react";
import { format } from "date-fns";
import { computeDocumentComplianceRate } from "@shared/complianceDocTypes";

interface PropertyStats {
  totalUnits: number;
  occupiedUnits: number;
  occupancyStatus: string;
  complianceRate: number;
  complianceStatus: string;
  inspectionsDue: number;
  inspectionsOverdue: number;
}

interface Property {
  id: string;
  name: string;
  address: string;
  blockId: string | null;
  stats: PropertyStats;
}

interface BlockStats {
  totalProperties: number;
  totalUnits: number;
  occupiedUnits: number;
  occupancyRate: number;
  occupancyStatus?: string;
  complianceRate: number;
  inspectionsDue: number;
  overdueInspections: number;
  pendingInspections?: number;
}

interface Block {
  id: string;
  name: string;
  address: string;
  notes?: string | null;
  imageUrl?: string | null;
  stats?: BlockStats | null;
  openMaintenance?: number;
}

interface ComplianceDoc {
  id: string;
  documentName: string;
  documentType: string;
  documentUrl: string;
  expiryDate: string | null;
  status: string;
  uploadedAt: string;
}

const DEFAULT_DOCUMENT_TYPES = [
  "Fire Safety Certificate",
  "Building Insurance",
  "Electrical Safety Certificate",
  "Gas Safety Certificate",
  "EPC Certificate",
  "HMO License",
  "Planning Permission",
];

const uploadFormSchema = insertComplianceDocumentSchema.extend({
  documentUrl: z.string().min(1, "Please upload a document"),
  expiryDate: z.string().optional(),
});

type UploadFormValues = z.infer<typeof uploadFormSchema>;

export default function BlockDetail() {
  const [, params] = useRoute("/blocks/:id");
  const blockId = params?.id;
  const [uploadDialogOpen, setUploadDialogOpen] = useState(false);
  const [blockImageDialogOpen, setBlockImageDialogOpen] = useState(false);
  const [selectedPropertyIds, setSelectedPropertyIds] = useState<string[]>([]);
  const { toast } = useToast();

  const form = useForm<UploadFormValues>({
    resolver: zodResolver(uploadFormSchema),
    defaultValues: {
      documentType: "",
      documentUrl: "",
      expiryDate: undefined,
      organizationId: "",
      blockId: blockId || "",
      uploadedBy: "",
      status: "current",
    },
  });

  const { data: block, isLoading: blockLoading } = useQuery<Block>({
    queryKey: ["/api/blocks", blockId],
    queryFn: async () => {
      const res = await fetch(`/api/blocks/${blockId}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch block");
      return res.json();
    },
    enabled: !!blockId,
  });

  const updateBlockImage = useMutation({
    mutationFn: async (imageUrl: string) => {
      return await apiRequest("PATCH", `/api/blocks/${blockId}`, { imageUrl });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/blocks", blockId] });
      queryClient.invalidateQueries({ queryKey: ["/api/blocks"] });
      setBlockImageDialogOpen(false);
      toast({
        title: "Success",
        description: "Block photo updated successfully",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to update block photo",
        variant: "destructive",
      });
    },
  });

  const { data: properties = [], isLoading: propertiesLoading } = useQuery<Property[]>({
    queryKey: ["/api/blocks", blockId, "properties"],
    queryFn: async () => {
      const res = await fetch(`/api/blocks/${blockId}/properties`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch properties");
      return res.json();
    },
    enabled: !!blockId,
  });

  const { data: complianceReport, isLoading: complianceReportLoading } = useQuery({
    queryKey: ["/api/blocks", blockId, "compliance-report"],
    queryFn: async () => {
      const res = await fetch(`/api/blocks/${blockId}/compliance-report`, { credentials: "include" });
      if (!res.ok) return null;
      return res.json();
    },
    enabled: !!blockId,
  });

  const { data: compliance = [], isLoading: complianceLoading } = useQuery<ComplianceDoc[]>({
    queryKey: ["/api/blocks", blockId, "compliance"],
    queryFn: async () => {
      const res = await fetch(`/api/blocks/${blockId}/compliance`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch compliance documents");
      return res.json();
    },
    enabled: !!blockId,
  });

  const { data: customDocTypes = [] } = useQuery<{ id: string; name: string }[]>({
    queryKey: ["/api/compliance-document-types"],
  });

  const allDocumentTypes = [
    ...DEFAULT_DOCUMENT_TYPES,
    ...customDocTypes.map((t) => t.name),
  ];

  // Match the Compliance Documents calendar: coverage of required types from uploaded docs
  const complianceRateFromDocs = computeDocumentComplianceRate(
    compliance.map((d) => ({ documentType: d.documentType, expiryDate: d.expiryDate })),
  );

  const uploadMutation = useMutation({
    mutationFn: async (data: UploadFormValues & { propertyIds?: string[] }) => {
      return await apiRequest("POST", "/api/compliance", {
        ...data,
        blockId: blockId,
        propertyIds: data.propertyIds,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/blocks", blockId, "compliance"] });
      // Also invalidate property compliance caches
      properties.forEach(p => {
        queryClient.invalidateQueries({ queryKey: ["/api/properties", p.id, "compliance"] });
      });
      setUploadDialogOpen(false);
      setSelectedPropertyIds([]);
      form.reset();
      toast({
        title: "Document Uploaded",
        description: "Compliance document has been uploaded successfully.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Upload Failed",
        description: error.message || "Failed to upload compliance document.",
        variant: "destructive",
      });
    },
  });

  const onSubmit = (data: UploadFormValues) => {
    uploadMutation.mutate({
      ...data,
      propertyIds: selectedPropertyIds.length > 0 ? selectedPropertyIds : undefined,
    });
  };

  const togglePropertySelection = (propertyId: string) => {
    setSelectedPropertyIds(prev => 
      prev.includes(propertyId) 
        ? prev.filter(id => id !== propertyId)
        : [...prev, propertyId]
    );
  };

  const toggleAllProperties = () => {
    if (selectedPropertyIds.length === properties.length) {
      setSelectedPropertyIds([]);
    } else {
      setSelectedPropertyIds(properties.map(p => p.id));
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'valid':
        return <Badge className="bg-green-600"><CheckCircle2 className="h-3 w-3 mr-1" />Valid</Badge>;
      case 'expiring':
        return <Badge variant="secondary" className="text-yellow-600"><Clock className="h-3 w-3 mr-1" />Expiring Soon</Badge>;
      case 'expired':
        return <Badge variant="destructive"><AlertCircle className="h-3 w-3 mr-1" />Expired</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  if (blockLoading || propertiesLoading) {
    return (
      <div className="container mx-auto p-4 md:p-6">
        <div className="text-center py-12">Loading...</div>
      </div>
    );
  }

  if (!block) {
    return (
      <div className="container mx-auto p-4 md:p-6">
        <div className="text-center py-12">
          <p className="text-muted-foreground">Block not found</p>
          <Link href="/blocks">
            <Button variant="outline" className="mt-4">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back to Blocks
            </Button>
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-4 md:p-6 space-y-4 md:space-y-6">
      {/* Header */}
      <div className="flex items-center gap-2 md:gap-4">
        <Link href="/blocks">
          <Button variant="ghost" size="sm" className="text-xs md:text-sm" data-testid="button-back-to-blocks">
            <ArrowLeft className="h-3 w-3 md:h-4 md:w-4 mr-1 md:mr-2" />
            <span className="hidden sm:inline">Back to Blocks</span>
            <span className="sm:hidden">Back</span>
          </Button>
        </Link>
      </div>

      <div className="space-y-4">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="space-y-2 flex-1 min-w-0">
            <h1 className="text-xl md:text-2xl lg:text-3xl font-bold flex items-center gap-2 md:gap-3" data-testid="heading-block-name">
              <Building2 className="h-5 w-5 md:h-6 md:w-6 lg:h-8 lg:w-8 text-primary shrink-0" />
              <span className="truncate">{block.name}</span>
            </h1>
            <div className="flex items-center gap-2 text-xs md:text-sm text-muted-foreground">
              <MapPin className="h-3 w-3 md:h-4 md:w-4 shrink-0" />
              <span className="truncate" data-testid="text-block-address">{block.address}</span>
            </div>
          </div>
        </div>

        {/* Block Image and Map Section */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Card className="overflow-hidden">
            {block.imageUrl ? (
              <div className="relative aspect-video">
                <img
                  src={block.imageUrl}
                  alt={block.name}
                  className="w-full h-full object-cover"
                  data-testid="img-block"
                />
                <Button
                  size="sm"
                  variant="secondary"
                  className="absolute bottom-2 left-2"
                  onClick={() => setBlockImageDialogOpen(true)}
                  data-testid="button-change-block-image"
                >
                  <Upload className="h-4 w-4 mr-2" />
                  Change Photo
                </Button>
              </div>
            ) : (
              <div
                className="aspect-video bg-muted flex items-center justify-center cursor-pointer hover-elevate"
                onClick={() => setBlockImageDialogOpen(true)}
                data-testid="button-upload-block-image"
              >
                <div className="text-center text-muted-foreground">
                  <Upload className="h-16 w-16 mx-auto mb-2 opacity-50" />
                  <p className="text-sm font-medium">Upload Block Photo</p>
                  <p className="text-xs">Click to add an image</p>
                </div>
              </div>
            )}
          </Card>

          <Card className="overflow-hidden">
            <MapPreview
              address={block.address}
              title={block.address ? `Map of ${block.address}` : undefined}
              testId="map-embed-block"
              externalLinkTestId="link-map-external-block"
            />
          </Card>
        </div>

        <Dialog open={blockImageDialogOpen} onOpenChange={setBlockImageDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Upload Block Photo</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Upload an image of the block (exterior or common areas) to display on this page.
              </p>
              <ObjectUploader
                maxNumberOfFiles={1}
                maxFileSize={10 * 1024 * 1024}
                onGetUploadParameters={async () => {
                  const response = await fetch("/api/objects/upload", {
                    method: "POST",
                    credentials: "include",
                  });
                  const { uploadURL } = await response.json();
                  return {
                    method: "PUT" as const,
                    url: uploadURL,
                  };
                }}
                onComplete={async (result) => {
                  if (result.successful && result.successful.length > 0) {
                    let fileUrl = result.successful[0].uploadURL;
                    if (fileUrl) {
                      if (fileUrl.startsWith("http://") || fileUrl.startsWith("https://")) {
                        try {
                          const urlObj = new URL(fileUrl);
                          fileUrl = `/objects${urlObj.pathname}`;
                        } catch {
                          fileUrl = `/objects/${fileUrl}`;
                        }
                      }
                      updateBlockImage.mutate(fileUrl);
                    }
                  }
                }}
              >
                <Upload className="w-4 h-4 mr-2" />
                Select Block Photo
              </ObjectUploader>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {/* Block summary — same pattern as Property detail */}
      {block.stats && (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Occupancy</CardTitle>
              <Users className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {block.stats.occupancyStatus ??
                  ((block.stats.totalUnits ?? 0) > 0 &&
                  (block.stats.occupiedUnits ?? 0) === (block.stats.totalUnits ?? 0)
                    ? "Occupied"
                    : "Vacant")}
              </div>
              <p className="text-xs text-muted-foreground">
                {block.stats.occupiedUnits ?? 0}/{block.stats.totalUnits ?? 0} units occupied
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Compliance</CardTitle>
              <CheckCircle2 className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{complianceRateFromDocs}%</div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Inspections</CardTitle>
              <ClipboardCheck className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {block.stats.pendingInspections ??
                  (block.stats.inspectionsDue ?? 0) + (block.stats.overdueInspections ?? 0)}
              </div>
              <p className="text-xs text-muted-foreground">
                {(block.stats.overdueInspections ?? 0) > 0
                  ? `${block.stats.overdueInspections} overdue`
                  : "Pending"}
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Maintenance</CardTitle>
              <Wrench className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{block.openMaintenance ?? 0}</div>
              <p className="text-xs text-muted-foreground">Open requests</p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Tabs */}
      <Tabs defaultValue="properties" className="space-y-6">
        <TabsList>
          <TabsTrigger value="properties" data-testid="tab-properties">
            <Building2 className="h-4 w-4 mr-2" />
            Properties ({properties.length})
          </TabsTrigger>
          <TabsTrigger value="inspection-schedule" data-testid="tab-inspection-schedule">
            <ClipboardCheck className="h-4 w-4 mr-2" />
            Inspection Schedule
          </TabsTrigger>
          <TabsTrigger value="compliance-schedule" data-testid="tab-compliance-schedule">
            <FileCheck className="h-4 w-4 mr-2" />
            Compliance Documents
          </TabsTrigger>
        </TabsList>

        {/* Properties Tab */}
        <TabsContent value="properties" className="space-y-4">
          {properties.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-12">
                <Building2 className="h-12 w-12 text-muted-foreground mb-4" />
                <h3 className="text-lg font-semibold mb-2">No properties yet</h3>
                <p className="text-muted-foreground text-center mb-4">
                  Properties assigned to this block will appear here
                </p>
                <Link href="/properties">
                  <Button>View All Properties</Button>
                </Link>
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-4">
              {properties.map((property) => (
                <Link key={property.id} href={`/properties/${property.id}`}>
                  <Card className="hover-elevate cursor-pointer" data-testid={`card-property-${property.id}`}>
                    <CardHeader>
                      <div className="flex items-start justify-between">
                        <div>
                          <CardTitle className="flex items-center gap-2">
                            <Building2 className="h-5 w-5 text-primary" />
                            {property.name}
                          </CardTitle>
                          <p className="text-sm text-muted-foreground mt-1">{property.address}</p>
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent>
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                        {/* Occupancy */}
                        <div className="space-y-1">
                          <div className="flex items-center gap-2 text-sm font-medium">
                            <Users className="h-4 w-4 text-muted-foreground" />
                            Occupancy
                          </div>
                          <p className="text-sm font-semibold">
                            {property.stats?.occupancyStatus ?? "Vacant"}
                          </p>
                        </div>

                        {/* Compliance */}
                        <div className="space-y-1">
                          <div className="flex items-center gap-2 text-sm font-medium">
                            <CheckCircle2 className="h-4 w-4 text-muted-foreground" />
                            Compliance
                          </div>
                          <Badge 
                            variant={(property.stats?.complianceRate ?? 0) >= 80 ? "default" : "destructive"}
                            className="text-xs"
                          >
                            {property.stats?.complianceRate ?? 0}%
                          </Badge>
                        </div>

                        {/* Due Soon */}
                        <div className="space-y-1">
                          <div className="flex items-center gap-2 text-sm font-medium">
                            <CalendarIcon className="h-4 w-4 text-muted-foreground" />
                            Due Soon
                          </div>
                          <Badge 
                            variant={(property.stats?.inspectionsDue || 0) > 0 ? "secondary" : "outline"}
                            className="text-xs"
                          >
                            {property.stats?.inspectionsDue || 0} inspection{(property.stats?.inspectionsDue || 0) !== 1 ? 's' : ''}
                          </Badge>
                        </div>

                        {/* Overdue */}
                        <div className="space-y-1">
                          <div className="flex items-center gap-2 text-sm font-medium">
                            <AlertTriangle className="h-4 w-4 text-muted-foreground" />
                            Overdue
                          </div>
                          <Badge 
                            variant={(property.stats?.inspectionsOverdue || 0) > 0 ? "destructive" : "outline"}
                            className="text-xs"
                          >
                            {property.stats?.inspectionsOverdue || 0} inspection{(property.stats?.inspectionsOverdue || 0) !== 1 ? 's' : ''}
                          </Badge>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </Link>
              ))}
            </div>
          )}
        </TabsContent>

        {/* Inspection Schedule Tab */}
        <TabsContent value="inspection-schedule" className="space-y-6">
          <ComplianceCalendar 
            entityType="block"
            entityId={blockId}
          />
        </TabsContent>

        {/* Compliance Documents Tab */}
        <TabsContent value="compliance-schedule" className="space-y-6">
          <ComplianceDocumentCalendar 
            entityType="block"
            entityId={blockId}
          />

          {/* Compliance Documents Section */}
          <div className="flex justify-between items-center">
            <h2 className="text-xl font-semibold">Compliance Documents</h2>
            <Dialog open={uploadDialogOpen} onOpenChange={setUploadDialogOpen}>
              <DialogTrigger asChild>
                <Button data-testid="button-upload-block-compliance">
                  <Upload className="mr-2 h-4 w-4" />
                  Upload Document
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                  <DialogTitle>Upload Compliance Document</DialogTitle>
                </DialogHeader>
                <Form {...form}>
                  <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                    <FormField
                      control={form.control}
                      name="documentType"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Document Type</FormLabel>
                          <Select onValueChange={field.onChange} value={field.value}>
                            <FormControl>
                              <SelectTrigger data-testid="select-document-type">
                                <SelectValue placeholder="Select document type" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              {allDocumentTypes.map((type) => (
                                <SelectItem key={type} value={type}>
                                  {type}
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
                      name="expiryDate"
                      render={({ field }) => (
                        <FormItem className="flex flex-col">
                          <FormLabel>Expiry Date (Optional)</FormLabel>
                          <Popover>
                            <PopoverTrigger asChild>
                              <FormControl>
                                <Button
                                  variant="outline"
                                  className="w-full justify-start text-left font-normal"
                                  data-testid="button-expiry-date"
                                >
                                  <CalendarIcon className="mr-2 h-4 w-4" />
                                  {field.value ? format(new Date(field.value), "PPP") : "Select expiry date"}
                                </Button>
                              </FormControl>
                            </PopoverTrigger>
                            <PopoverContent className="w-auto p-0 z-[100]" align="start">
                              <Calendar
                                mode="single"
                                selected={field.value ? new Date(field.value) : undefined}
                                onSelect={(date) => field.onChange(date?.toISOString())}
                                initialFocus
                              />
                            </PopoverContent>
                          </Popover>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="documentUrl"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Document File</FormLabel>
                          <FormControl>
                            <ObjectUploader
                              maxNumberOfFiles={1}
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
                              onComplete={(result) => {
                                if (result.successful && result.successful[0]) {
                                  let uploadURL = result.successful[0].uploadURL;
                                  if (uploadURL && (uploadURL.startsWith('http://') || uploadURL.startsWith('https://'))) {
                                    try {
                                      const urlObj = new URL(uploadURL);
                                      uploadURL = urlObj.pathname;
                                    } catch (e) {
                                      console.error('Invalid upload URL:', uploadURL);
                                    }
                                  }
                                  if (uploadURL) {
                                    field.onChange(uploadURL);
                                  }
                                }
                              }}
                            >
                              <Upload className="mr-2 h-4 w-4" />
                              Choose File
                            </ObjectUploader>
                          </FormControl>
                          {field.value && (
                            <p className="text-sm text-muted-foreground mt-2">
                              File uploaded successfully
                            </p>
                          )}
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    {/* Property Selection */}
                    {properties.length > 0 && (
                      <div className="space-y-3">
                        <div className="flex items-center justify-between">
                          <Label className="text-sm font-medium">
                            Also apply to properties (optional)
                          </Label>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={toggleAllProperties}
                            data-testid="button-toggle-all-properties"
                          >
                            {selectedPropertyIds.length === properties.length ? "Deselect All" : "Select All"}
                          </Button>
                        </div>
                        <div className="border rounded-md p-3 max-h-48 overflow-y-auto space-y-2">
                          {properties.map((property) => (
                            <div 
                              key={property.id} 
                              className="flex items-center gap-2"
                            >
                              <Checkbox
                                id={`property-${property.id}`}
                                checked={selectedPropertyIds.includes(property.id)}
                                onCheckedChange={() => togglePropertySelection(property.id)}
                                data-testid={`checkbox-property-${property.id}`}
                              />
                              <Label 
                                htmlFor={`property-${property.id}`}
                                className="text-sm cursor-pointer flex-1"
                              >
                                {property.name}
                              </Label>
                            </div>
                          ))}
                        </div>
                        {selectedPropertyIds.length > 0 && (
                          <p className="text-xs text-muted-foreground">
                            Document will be applied to {selectedPropertyIds.length} propert{selectedPropertyIds.length === 1 ? 'y' : 'ies'}
                          </p>
                        )}
                      </div>
                    )}

                    <div className="flex justify-end gap-2 pt-4">
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => {
                          setUploadDialogOpen(false);
                          setSelectedPropertyIds([]);
                        }}
                      >
                        Cancel
                      </Button>
                      <Button type="submit" disabled={uploadMutation.isPending}>
                        {uploadMutation.isPending ? "Uploading..." : "Upload Document"}
                      </Button>
                    </div>
                  </form>
                </Form>
              </DialogContent>
            </Dialog>
          </div>

          {/* Documents List */}
          {complianceLoading ? (
            <Card>
              <CardContent className="py-12 text-center text-muted-foreground">
                Loading documents...
              </CardContent>
            </Card>
          ) : compliance.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-12">
                <FileCheck className="h-12 w-12 text-muted-foreground mb-4" />
                <h3 className="text-lg font-semibold mb-2">No compliance documents</h3>
                <p className="text-muted-foreground text-center">
                  Upload block-level compliance documents like building insurance or fire safety certificates.
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-3">
              {compliance.map((doc) => (
                <Card key={doc.id} data-testid={`card-compliance-${doc.id}`}>
                  <CardContent className="py-4">
                    <div className="flex items-center justify-between gap-4">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <h3 className="font-semibold">{doc.documentType}</h3>
                          {getStatusBadge(doc.status)}
                        </div>
                        <p className="text-sm text-muted-foreground mt-1">
                          {doc.documentName}
                        </p>
                        {doc.expiryDate && (
                          <p className={`text-sm mt-1 ${
                            doc.status === 'expired' ? 'text-destructive' :
                            doc.status === 'expiring' ? 'text-yellow-600' :
                            'text-muted-foreground'
                          }`}>
                            {doc.status === 'expired' ? 'Expired' : 'Expires'} {format(new Date(doc.expiryDate), "d MMMM yyyy")}
                          </p>
                        )}
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => window.open(doc.documentUrl, '_blank')}
                        data-testid={`button-view-doc-${doc.id}`}
                      >
                        <ExternalLink className="h-4 w-4 mr-2" />
                        View
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
