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
import ComplianceCalendar from "@/components/ComplianceCalendar";
import ComplianceDocumentCalendar from "@/components/ComplianceDocumentCalendar";
import { ObjectUploader } from "@/components/ObjectUploader";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { insertComplianceDocumentSchema } from "@shared/schema";
import { 
  ArrowLeft, Building2, MapPin, Users, CheckCircle2, Calendar as CalendarIcon, 
  AlertTriangle, FileCheck, ClipboardCheck, Upload, AlertCircle, ExternalLink, Clock
} from "lucide-react";
import { format } from "date-fns";

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

interface Block {
  id: string;
  name: string;
  address: string;
  notes?: string | null;
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

  const uploadMutation = useMutation({
    mutationFn: async (data: UploadFormValues) => {
      return await apiRequest("POST", "/api/compliance-documents", {
        ...data,
        blockId: blockId,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/blocks", blockId, "compliance"] });
      setUploadDialogOpen(false);
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
    uploadMutation.mutate(data);
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
      <div className="container mx-auto p-6">
        <div className="text-center py-12">Loading...</div>
      </div>
    );
  }

  if (!block) {
    return (
      <div className="container mx-auto p-6">
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
    <div className="container mx-auto p-6">
      {/* Header */}
      <div className="mb-6">
        <Link href="/blocks">
          <Button variant="ghost" className="mb-4" data-testid="button-back-to-blocks">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to Blocks
          </Button>
        </Link>
        
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-3xl font-bold flex items-center gap-2">
              <Building2 className="h-8 w-8 text-primary" />
              {block.name}
            </h1>
            <p className="text-muted-foreground mt-2 flex items-center gap-2">
              <MapPin className="h-4 w-4" />
              {block.address}
            </p>
            {block.notes && (
              <p className="text-sm text-muted-foreground mt-3 bg-muted p-3 rounded-md">
                {block.notes}
              </p>
            )}
          </div>
        </div>
      </div>

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
                          <p className="text-sm font-semibold">{property.stats?.occupancyStatus || 'No data'}</p>
                        </div>

                        {/* Compliance */}
                        <div className="space-y-1">
                          <div className="flex items-center gap-2 text-sm font-medium">
                            <CheckCircle2 className="h-4 w-4 text-muted-foreground" />
                            Compliance
                          </div>
                          <Badge 
                            variant={(property.stats?.complianceRate || 0) >= 80 ? "default" : "destructive"}
                            className="text-xs"
                          >
                            {property.stats?.complianceStatus || 'No data'}
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
            report={complianceReport} 
            isLoading={complianceReportLoading}
            entityType="block"
            entityId={blockId}
          />
        </TabsContent>

        {/* Compliance Documents Tab */}
        <TabsContent value="compliance-schedule" className="space-y-6">
          <ComplianceDocumentCalendar 
            documents={compliance.map(doc => ({
              id: doc.id,
              documentType: doc.documentType,
              expiryDate: doc.expiryDate,
              documentUrl: doc.documentUrl || '',
              createdAt: doc.uploadedAt || new Date().toISOString(),
            }))}
            isLoading={complianceLoading}
            entityType="block"
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
                            <PopoverContent className="w-auto p-0" align="start">
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
                              onUploadComplete={(urls) => {
                                if (urls.length > 0) {
                                  field.onChange(urls[0]);
                                }
                              }}
                              accept="application/pdf,image/*,.doc,.docx"
                              maxNumberOfFiles={20}
                            />
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

                    <div className="flex justify-end gap-2 pt-4">
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => setUploadDialogOpen(false)}
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
