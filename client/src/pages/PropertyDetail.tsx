import { useState } from "react";
import { useRoute, Link } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogTrigger } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import ComplianceCalendar from "@/components/ComplianceCalendar";
import ComplianceDocumentCalendar from "@/components/ComplianceDocumentCalendar";
import { insertComplianceDocumentSchema, type AssetInventory } from "@shared/schema";
import { ObjectUploader } from "@/components/ObjectUploader";
import { apiRequest, queryClient } from "@/lib/queryClient";
import {
  ArrowLeft,
  Building2,
  Users,
  ClipboardCheck,
  Package,
  FileCheck,
  Wrench,
  MapPin,
  Calendar,
  CheckCircle2,
  AlertCircle,
  User,
  Upload,
  Pencil,
} from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { AddressInput } from "@/components/AddressInput";
import { useToast } from "@/hooks/use-toast";

interface Property {
  id: string;
  name: string;
  address: string;
  blockId: string | null;
  blockName?: string;
  notes?: string | null;
  organizationId: string;
}

interface PropertyStats {
  occupancyStatus: string;
  complianceRate: number;
  dueInspections: number;
  overdueInspections: number;
  maintenanceRequests: number;
  inventoryCount: number;
}

interface Tenant {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  role: string;
}

interface Inspection {
  id: string;
  templateName: string;
  scheduledDate: string;
  status: string;
  inspectorName?: string;
  type?: string;
}

interface InventoryItem {
  id: string;
  name: string;
  category: string;
  condition: string;
  quantity: number;
  datePurchased?: string | null;
  expectedLifespanYears?: number | null;
  description?: string | null;
}

interface ComplianceDoc {
  id: string;
  documentName: string;
  documentType: string;
  expiryDate: string | null;
  status: string;
  documentUrl?: string;
  createdAt?: string;
}

interface MaintenanceRequest {
  id: string;
  title: string;
  priority: string;
  status: string;
  createdAt: string;
  category: string;
  description?: string;
  reportedByName?: string;
  assignedToName?: string;
}

// Default document types (fallback if no custom types exist)
const DEFAULT_DOCUMENT_TYPES = [
  "Fire Safety Certificate",
  "Building Insurance",
  "Electrical Safety Certificate",
  "Gas Safety Certificate",
  "EPC Certificate",
  "HMO License",
  "Planning Permission",
  "Other",
];

const uploadFormSchema = insertComplianceDocumentSchema.extend({
  documentUrl: z.string().min(1, "Please upload a document"),
  expiryDate: z.string().optional(),
});

type UploadFormValues = z.infer<typeof uploadFormSchema>;

export default function PropertyDetail() {
  const [, params] = useRoute("/properties/:id");
  const propertyId = params?.id;
  const [uploadDialogOpen, setUploadDialogOpen] = useState(false);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editName, setEditName] = useState("");
  const [editAddress, setEditAddress] = useState("");
  const [editNotes, setEditNotes] = useState("");
  const [inventoryDialogOpen, setInventoryDialogOpen] = useState(false);
  const [selectedInventoryItem, setSelectedInventoryItem] = useState<AssetInventory | null>(null);
  const { toast } = useToast();

  const { data: property, isLoading: propertyLoading } = useQuery<Property>({
    queryKey: ["/api/properties", propertyId],
    queryFn: async () => {
      const res = await fetch(`/api/properties/${propertyId}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch property");
      return res.json();
    },
    enabled: !!propertyId,
  });

  // Fetch custom document types
  const { data: customDocumentTypes = [] } = useQuery<any[]>({
    queryKey: ['/api/compliance/document-types'],
  });

  // Combine default and custom document types
  const allDocumentTypes = [
    ...DEFAULT_DOCUMENT_TYPES,
    ...customDocumentTypes.map(t => t.name).filter(name => !DEFAULT_DOCUMENT_TYPES.includes(name))
  ].sort();

  const { data: stats } = useQuery<PropertyStats>({
    queryKey: ["/api/properties", propertyId, "stats"],
    queryFn: async () => {
      const res = await fetch(`/api/properties/${propertyId}/stats`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch stats");
      return res.json();
    },
    enabled: !!propertyId,
  });

  const { data: tenants = [] } = useQuery<Tenant[]>({
    queryKey: ["/api/properties", propertyId, "tenants"],
    queryFn: async () => {
      const res = await fetch(`/api/properties/${propertyId}/tenants`, { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!propertyId,
  });

  const { data: inspections = [] } = useQuery<Inspection[]>({
    queryKey: ["/api/properties", propertyId, "inspections"],
    queryFn: async () => {
      const res = await fetch(`/api/properties/${propertyId}/inspections`, { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!propertyId,
  });

  const { data: inventory = [] } = useQuery<InventoryItem[]>({
    queryKey: ["/api/properties", propertyId, "inventory"],
    queryFn: async () => {
      const res = await fetch(`/api/properties/${propertyId}/inventory`, { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!propertyId,
  });

  // Fetch full asset inventory to get complete details when an item is clicked
  const { data: fullAssetInventory = [] } = useQuery<AssetInventory[]>({
    queryKey: ["/api/asset-inventory"],
    queryFn: async () => {
      const res = await fetch("/api/asset-inventory", { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
  });

  const { data: compliance = [] } = useQuery<ComplianceDoc[]>({
    queryKey: ["/api/properties", propertyId, "compliance"],
    queryFn: async () => {
      const res = await fetch(`/api/properties/${propertyId}/compliance`, { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!propertyId,
  });

  const { data: complianceReport, isLoading: complianceReportLoading } = useQuery({
    queryKey: ["/api/properties", propertyId, "compliance-report"],
    queryFn: async () => {
      const res = await fetch(`/api/properties/${propertyId}/compliance-report`, { credentials: "include" });
      if (!res.ok) return null;
      return res.json();
    },
    enabled: !!propertyId,
  });

  const { data: maintenance = [] } = useQuery<MaintenanceRequest[]>({
    queryKey: ["/api/properties", propertyId, "maintenance"],
    queryFn: async () => {
      const res = await fetch(`/api/properties/${propertyId}/maintenance`, { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!propertyId,
  });

  const form = useForm<UploadFormValues>({
    resolver: zodResolver(uploadFormSchema),
    defaultValues: {
      documentType: "",
      documentUrl: "",
      expiryDate: undefined,
      propertyId: propertyId,
      blockId: undefined,
      status: "current",
    },
  });

  const uploadMutation = useMutation({
    mutationFn: (data: UploadFormValues) => apiRequest('POST', '/api/compliance', {
      ...data,
      expiryDate: data.expiryDate ? new Date(data.expiryDate) : null,
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/properties', propertyId, 'compliance'] });
      queryClient.invalidateQueries({ queryKey: ['/api/compliance'] });
      setUploadDialogOpen(false);
      form.reset({
        documentType: "",
        documentUrl: "",
        expiryDate: undefined,
        propertyId: propertyId,
        blockId: undefined,
        status: "current",
      });
    },
  });

  const onSubmit = (data: UploadFormValues) => {
    uploadMutation.mutate(data);
  };

  const updatePropertyMutation = useMutation({
    mutationFn: async (data: { name: string; address: string; notes?: string }) => {
      return await apiRequest("PATCH", `/api/properties/${propertyId}`, data);
    },
    onSuccess: async () => {
      await queryClient.refetchQueries({ queryKey: ["/api/properties", propertyId] });
      await queryClient.refetchQueries({ queryKey: ["/api/properties"] });
      toast({
        title: "Success",
        description: "Property updated successfully",
      });
      setEditDialogOpen(false);
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to update property",
        variant: "destructive",
      });
    },
  });

  const handleOpenEditDialog = () => {
    if (property) {
      setEditName(property.name);
      setEditAddress(property.address);
      setEditNotes(property.notes || "");
      setEditDialogOpen(true);
    }
  };

  const handleEditSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editName || !editAddress) {
      toast({
        title: "Validation Error",
        description: "Please fill in all required fields",
        variant: "destructive",
      });
      return;
    }
    updatePropertyMutation.mutate({
      name: editName,
      address: editAddress,
      notes: editNotes || undefined,
    });
  };

  if (propertyLoading) {
    return (
      <div className="container mx-auto p-6">
        <div className="text-center py-12">Loading...</div>
      </div>
    );
  }

  if (!property) {
    return (
      <div className="container mx-auto p-6">
        <div className="text-center py-12">
          <p className="text-muted-foreground">Property not found</p>
          <Link href="/properties">
            <Button variant="outline" className="mt-4">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back to Properties
            </Button>
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Link href={property.blockId ? `/blocks/${property.blockId}` : "/properties"}>
          <Button variant="ghost" size="sm" data-testid="button-back">
            <ArrowLeft className="h-4 w-4 mr-2" />
            {property.blockId && property.blockName ? `Back to ${property.blockName}` : "Back to Properties"}
          </Button>
        </Link>
      </div>

      {/* Property Header */}
      <div>
        <div className="flex items-start justify-between">
          <div className="space-y-2">
            <h1 className="text-3xl font-bold flex items-center gap-3" data-testid="heading-property-name">
              <Building2 className="h-8 w-8 text-primary" />
              {property.name}
            </h1>
            <div className="flex items-center gap-2 text-muted-foreground">
              <MapPin className="h-4 w-4" />
              <span data-testid="text-property-address">{property.address}</span>
            </div>
            {property.blockName && (
              <div className="flex items-center gap-2">
                <Badge variant="outline" data-testid="badge-block">
                  Block: {property.blockName}
                </Badge>
              </div>
            )}
          </div>
          <Button
            variant="outline"
            onClick={handleOpenEditDialog}
            data-testid="button-edit-property"
          >
            <Pencil className="h-4 w-4 mr-2" />
            Edit Property
          </Button>
        </div>
        {property.notes && (
          <Card className="mt-4">
            <CardContent className="pt-6">
              <p className="text-sm text-muted-foreground">{property.notes}</p>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Stats Overview */}
      {stats && (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Occupancy</CardTitle>
              <Users className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.occupancyStatus}</div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Compliance</CardTitle>
              <CheckCircle2 className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.complianceRate}%</div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Inspections</CardTitle>
              <ClipboardCheck className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {stats.dueInspections + stats.overdueInspections}
              </div>
              <p className="text-xs text-muted-foreground">
                {stats.overdueInspections > 0 && `${stats.overdueInspections} overdue`}
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Maintenance</CardTitle>
              <Wrench className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.maintenanceRequests}</div>
              <p className="text-xs text-muted-foreground">Open requests</p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Tabbed Content */}
      <Tabs defaultValue="inspections" className="space-y-4">
        <TabsList>
          <TabsTrigger value="inspections" data-testid="tab-inspections">
            <ClipboardCheck className="h-4 w-4 mr-2" />
            Inspections
          </TabsTrigger>
          <TabsTrigger value="tenants" data-testid="tab-tenants">
            <Users className="h-4 w-4 mr-2" />
            Tenants
          </TabsTrigger>
          <TabsTrigger value="inventory" data-testid="tab-inventory">
            <Package className="h-4 w-4 mr-2" />
            Inventory
          </TabsTrigger>
          <TabsTrigger value="inspection-schedule" data-testid="tab-inspection-schedule">
            <ClipboardCheck className="h-4 w-4 mr-2" />
            Inspection Schedule
          </TabsTrigger>
          <TabsTrigger value="compliance-schedule" data-testid="tab-compliance-schedule">
            <FileCheck className="h-4 w-4 mr-2" />
            Compliance Schedule
          </TabsTrigger>
          <TabsTrigger value="maintenance" data-testid="tab-maintenance">
            <Wrench className="h-4 w-4 mr-2" />
            Maintenance
          </TabsTrigger>
        </TabsList>

        {/* Inspections Tab */}
        <TabsContent value="inspections" className="space-y-4">
          <div className="flex justify-between items-center">
            <h2 className="text-xl font-semibold">Inspections</h2>
            <Link href={`/inspections?propertyId=${propertyId}&create=true`}>
              <Button data-testid="button-new-inspection">
                <ClipboardCheck className="mr-2 h-4 w-4" />
                New Inspection
              </Button>
            </Link>
          </div>
          
          {inspections.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-12">
                <ClipboardCheck className="h-12 w-12 text-muted-foreground mb-4" />
                <p className="text-muted-foreground">No inspections yet</p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-3">
              {inspections.map((inspection) => (
                <Link key={inspection.id} href={`/inspections/${inspection.id}`}>
                  <Card className="hover-elevate cursor-pointer" data-testid={`card-inspection-${inspection.id}`}>
                    <CardHeader>
                      <div className="flex items-start justify-between gap-4">
                        <div className="space-y-2 flex-1">
                          <CardTitle className="text-base">{inspection.templateName}</CardTitle>
                          <div className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
                            <div className="flex items-center gap-1">
                              <Calendar className="h-3 w-3" />
                              <span>{new Date(inspection.scheduledDate).toLocaleDateString()}</span>
                            </div>
                            {inspection.inspectorName && (
                              <div className="flex items-center gap-1">
                                <User className="h-3 w-3" />
                                <span>{inspection.inspectorName}</span>
                              </div>
                            )}
                          </div>
                        </div>
                        <Badge 
                          variant={
                            inspection.status === 'completed' ? 'default' :
                            inspection.status === 'in_progress' ? 'secondary' :
                            'outline'
                          }
                          className={inspection.status === 'completed' ? 'bg-primary text-primary-foreground' : ''}
                        >
                          {inspection.status.replace('_', ' ')}
                        </Badge>
                      </div>
                    </CardHeader>
                  </Card>
                </Link>
              ))}
            </div>
          )}
        </TabsContent>

        {/* Tenants Tab */}
        <TabsContent value="tenants" className="space-y-4">
          <h2 className="text-xl font-semibold">Tenants</h2>
          
          {tenants.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-12">
                <User className="h-12 w-12 text-muted-foreground mb-4" />
                <p className="text-muted-foreground">No tenants assigned</p>
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {tenants.map((tenant) => (
                <Card key={tenant.id} data-testid={`card-tenant-${tenant.id}`} className="hover-elevate">
                  <CardHeader>
                    <div className="flex items-start gap-3">
                      <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                        <User className="h-5 w-5 text-primary" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <CardTitle className="text-base mb-1">
                          {tenant.firstName} {tenant.lastName}
                        </CardTitle>
                        <CardDescription className="text-sm break-all">
                          {tenant.email}
                        </CardDescription>
                        <Badge variant="outline" className="mt-2 text-xs">
                          Tenant
                        </Badge>
                      </div>
                    </div>
                  </CardHeader>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        {/* Inventory Tab */}
        <TabsContent value="inventory" className="space-y-4">
          <div className="flex justify-between items-center">
            <h2 className="text-xl font-semibold">Asset Inventory</h2>
            <Link href={`/asset-inventory?propertyId=${propertyId}`}>
              <Button data-testid="button-new-inventory">
                <Package className="mr-2 h-4 w-4" />
                Add Item
              </Button>
            </Link>
          </div>
          
          {inventory.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-12">
                <Package className="h-12 w-12 text-muted-foreground mb-4" />
                <p className="text-muted-foreground">No inventory items</p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-3">
              {inventory.map((item) => (
                <Card 
                  key={item.id} 
                  data-testid={`card-inventory-${item.id}`}
                  className="hover-elevate cursor-pointer"
                  onClick={() => {
                    const fullAsset = fullAssetInventory.find(asset => asset.id === item.id);
                    if (fullAsset) {
                      setSelectedInventoryItem(fullAsset);
                      setInventoryDialogOpen(true);
                    }
                  }}
                >
                  <CardHeader>
                    <div className="flex items-start justify-between gap-4">
                      <div className="space-y-2 flex-1">
                        <CardTitle className="text-base">{item.name}</CardTitle>
                        <CardDescription className="line-clamp-1">{item.description || item.category}</CardDescription>
                        <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
                          {item.datePurchased && (
                            <span>Purchased: {new Date(item.datePurchased).toLocaleDateString()}</span>
                          )}
                          {item.expectedLifespanYears && (
                            <span>Lifespan: {item.expectedLifespanYears} years</span>
                          )}
                        </div>
                      </div>
                      <Badge variant={
                        item.condition === 'excellent' ? 'default' :
                        item.condition === 'good' ? 'secondary' :
                        item.condition === 'fair' ? 'outline' :
                        'destructive'
                      }>
                        {item.condition}
                      </Badge>
                    </div>
                  </CardHeader>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        {/* Inspection Schedule Tab */}
        <TabsContent value="inspection-schedule" className="space-y-6">
          {/* Annual Inspection Compliance Report */}
          <ComplianceCalendar 
            report={complianceReport} 
            isLoading={complianceReportLoading}
            entityType="property"
          />
        </TabsContent>

        {/* Compliance Schedule Tab */}
        <TabsContent value="compliance-schedule" className="space-y-6">
          {/* Annual Compliance Document Calendar */}
          <ComplianceDocumentCalendar 
            documents={compliance.map(doc => ({
              id: doc.id,
              documentType: doc.documentType,
              expiryDate: doc.expiryDate,
              documentUrl: doc.documentUrl || '',
              createdAt: doc.createdAt || new Date().toISOString(),
            }))}
            isLoading={propertyLoading}
            entityType="property"
          />

          {/* Compliance Documents Section */}
          <div className="flex justify-between items-center">
            <h2 className="text-xl font-semibold">Compliance Documents</h2>
            <Dialog open={uploadDialogOpen} onOpenChange={setUploadDialogOpen}>
              <DialogTrigger asChild>
                <Button data-testid="button-new-compliance">
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
                      name="documentUrl"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Document File</FormLabel>
                          <FormControl>
                            <ObjectUploader
                              buttonClassName="w-full"
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
                              onComplete={async (result) => {
                                if (result.successful && result.successful[0]) {
                                  let uploadURL = result.successful[0].uploadURL;
                                  
                                  // Normalize URL: if absolute, extract pathname; if relative, use as is
                                  if (uploadURL && (uploadURL.startsWith('http://') || uploadURL.startsWith('https://'))) {
                                    try {
                                      const urlObj = new URL(uploadURL);
                                      uploadURL = urlObj.pathname;
                                    } catch (e) {
                                      console.error('[PropertyDetail] Invalid upload URL:', uploadURL);
                                    }
                                  }
                                  
                                  // Ensure it's a relative path starting with /objects/
                                  if (!uploadURL || !uploadURL.startsWith('/objects/')) {
                                    toast({
                                      title: "Upload Error",
                                      description: "Invalid file URL format. Please try again.",
                                      variant: "destructive",
                                    });
                                    return;
                                  }
                                  
                                  // Convert to absolute URL for ACL call
                                  const absoluteUrl = `${window.location.origin}${uploadURL}`;
                                  const response = await fetch('/api/objects/set-acl', {
                                    method: 'PUT',
                                    headers: { 'Content-Type': 'application/json' },
                                    credentials: 'include',
                                    body: JSON.stringify({ photoUrl: absoluteUrl }),
                                  });
                                  const { objectPath } = await response.json();
                                  field.onChange(objectPath);
                                }
                              }}
                            >
                              <Upload className="w-4 h-4 mr-2" />
                              Select Document
                            </ObjectUploader>
                          </FormControl>
                          {field.value && (
                            <p className="text-sm text-muted-foreground mt-1">
                              ✓ Document selected
                            </p>
                          )}
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="expiryDate"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Expiry Date (Optional)</FormLabel>
                          <FormControl>
                            <Input
                              type="date"
                              {...field}
                              data-testid="input-expiry-date"
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <div className="flex flex-col-reverse sm:flex-row justify-end gap-2 pt-4">
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => setUploadDialogOpen(false)}
                        data-testid="button-cancel"
                        className="w-full sm:w-auto"
                      >
                        Cancel
                      </Button>
                      <Button
                        type="submit"
                        className="bg-primary w-full sm:w-auto"
                        disabled={uploadMutation.isPending}
                        data-testid="button-submit-document"
                      >
                        {uploadMutation.isPending ? "Uploading..." : "Upload Document"}
                      </Button>
                    </div>
                  </form>
                </Form>
              </DialogContent>
            </Dialog>
          </div>
          
          {compliance.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-12">
                <FileCheck className="h-12 w-12 text-muted-foreground mb-4" />
                <p className="text-muted-foreground">No compliance documents</p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-3">
              {compliance.map((doc) => {
                const expiryDate = doc.expiryDate ? new Date(doc.expiryDate) : null;
                const now = new Date();
                const daysUntilExpiry = expiryDate ? Math.ceil((expiryDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)) : null;
                
                return (
                  <Card key={doc.id} data-testid={`card-compliance-${doc.id}`}>
                    <CardHeader>
                      <div className="flex items-start justify-between gap-4">
                        <div className="space-y-2 flex-1">
                          <CardTitle className="text-base">{doc.documentName}</CardTitle>
                          <CardDescription>{doc.documentType}</CardDescription>
                          {expiryDate && (
                            <div className="flex flex-col gap-1">
                              <div className="flex items-center gap-2 text-sm">
                                {doc.status === 'expired' ? (
                                  <>
                                    <AlertCircle className="h-3 w-3 text-destructive" />
                                    <span className="text-destructive font-medium">
                                      Expired {new Date(expiryDate).toLocaleDateString()}
                                    </span>
                                  </>
                                ) : doc.status === 'expiring' ? (
                                  <>
                                    <AlertCircle className="h-3 w-3 text-orange-500" />
                                    <span className="text-orange-500 font-medium">
                                      Expires in {daysUntilExpiry} days ({new Date(expiryDate).toLocaleDateString()})
                                    </span>
                                  </>
                                ) : (
                                  <>
                                    <CheckCircle2 className="h-3 w-3 text-green-600" />
                                    <span className="text-muted-foreground">
                                      Expires: {new Date(expiryDate).toLocaleDateString()}
                                    </span>
                                  </>
                                )}
                              </div>
                            </div>
                          )}
                        </div>
                        <Badge variant={
                          doc.status === 'expired' ? 'destructive' :
                          doc.status === 'expiring' ? 'outline' :
                          'default'
                        }>
                          {doc.status === 'expired' ? 'Expired' : doc.status === 'expiring' ? 'Expiring Soon' : 'Valid'}
                        </Badge>
                      </div>
                    </CardHeader>
                  </Card>
                );
              })}
            </div>
          )}
        </TabsContent>

        {/* Maintenance Tab */}
        <TabsContent value="maintenance" className="space-y-4">
          <div className="flex justify-between items-center">
            <h2 className="text-xl font-semibold">Maintenance Requests</h2>
            <Link href={`/maintenance/new?propertyId=${propertyId}`}>
              <Button data-testid="button-new-maintenance">
                <Wrench className="mr-2 h-4 w-4" />
                New Request
              </Button>
            </Link>
          </div>
          
          {maintenance.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-12">
                <Wrench className="h-12 w-12 text-muted-foreground mb-4" />
                <p className="text-muted-foreground">No maintenance requests</p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-3">
              {maintenance.map((request) => (
                <Card key={request.id} data-testid={`card-maintenance-${request.id}`}>
                  <CardHeader>
                    <div className="flex items-start justify-between gap-4">
                      <div className="space-y-2 flex-1">
                        <CardTitle className="text-base">{request.title}</CardTitle>
                        {request.description && (
                          <p className="text-sm text-muted-foreground line-clamp-2">{request.description}</p>
                        )}
                        <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                          <div className="flex items-center gap-1">
                            <Calendar className="h-3 w-3" />
                            <span>{new Date(request.createdAt).toLocaleDateString()}</span>
                          </div>
                          {request.reportedByName && (
                            <span>Reported by: {request.reportedByName}</span>
                          )}
                          {request.assignedToName && (
                            <span>Assigned to: {request.assignedToName}</span>
                          )}
                        </div>
                      </div>
                      <div className="flex flex-col items-end gap-2">
                        <Badge variant={
                          request.priority === 'urgent' ? 'destructive' :
                          request.priority === 'high' ? 'default' :
                          'secondary'
                        }>
                          {request.priority}
                        </Badge>
                        <Badge variant="outline">{request.status.replace('_', ' ')}</Badge>
                      </div>
                    </div>
                  </CardHeader>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* Edit Property Dialog */}
      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Property</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleEditSubmit} className="space-y-4">
            <div>
              <Label htmlFor="edit-name">Property Name *</Label>
              <Input
                id="edit-name"
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                placeholder="e.g., Flat 12, Unit 5B"
                data-testid="input-edit-property-name"
                required
              />
            </div>
            <div>
              <Label htmlFor="edit-address">Address *</Label>
              <AddressInput
                id="edit-address"
                value={editAddress}
                onChange={setEditAddress}
                placeholder="123 Main St, City, State ZIP"
                data-testid="input-edit-property-address"
                required
              />
            </div>
            <div>
              <Label htmlFor="edit-notes">Notes</Label>
              <Textarea
                id="edit-notes"
                value={editNotes}
                onChange={(e) => setEditNotes(e.target.value)}
                placeholder="Additional notes about this property..."
                data-testid="input-edit-property-notes"
              />
            </div>
            <Button
              type="submit"
              className="w-full"
              disabled={updatePropertyMutation.isPending}
              data-testid="button-submit-edit-property"
            >
              {updatePropertyMutation.isPending ? "Updating..." : "Update Property"}
            </Button>
          </form>
        </DialogContent>
      </Dialog>

      {/* Inventory Item Details Dialog */}
      <Dialog open={inventoryDialogOpen} onOpenChange={setInventoryDialogOpen}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{selectedInventoryItem?.name || "Inventory Item Details"}</DialogTitle>
            <DialogDescription>
              {selectedInventoryItem?.category && (
                <span className="text-sm text-muted-foreground">{selectedInventoryItem.category}</span>
              )}
            </DialogDescription>
          </DialogHeader>
          {selectedInventoryItem && (
            <div className="space-y-6">
              {/* Basic Information */}
              <div className="space-y-4">
                <h3 className="font-semibold text-lg">Basic Information</h3>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label className="text-muted-foreground">Name</Label>
                    <p className="font-medium">{selectedInventoryItem.name}</p>
                  </div>
                  <div>
                    <Label className="text-muted-foreground">Category</Label>
                    <p className="font-medium">{selectedInventoryItem.category || "N/A"}</p>
                  </div>
                  <div>
                    <Label className="text-muted-foreground">Condition</Label>
                    <Badge variant={
                      selectedInventoryItem.condition === 'excellent' ? 'default' :
                      selectedInventoryItem.condition === 'good' ? 'secondary' :
                      selectedInventoryItem.condition === 'fair' ? 'outline' :
                      'destructive'
                    }>
                      {selectedInventoryItem.condition}
                    </Badge>
                  </div>
                  {selectedInventoryItem.cleanliness && (
                    <div>
                      <Label className="text-muted-foreground">Cleanliness</Label>
                      <p className="font-medium capitalize">{selectedInventoryItem.cleanliness}</p>
                    </div>
                  )}
                  {selectedInventoryItem.location && (
                    <div className="col-span-2">
                      <Label className="text-muted-foreground">Location</Label>
                      <p className="font-medium">{selectedInventoryItem.location}</p>
                    </div>
                  )}
                  {selectedInventoryItem.description && (
                    <div className="col-span-2">
                      <Label className="text-muted-foreground">Description</Label>
                      <p className="font-medium">{selectedInventoryItem.description}</p>
                    </div>
                  )}
                </div>
              </div>

              {/* Purchase Information */}
              {(selectedInventoryItem.datePurchased || selectedInventoryItem.purchasePrice || selectedInventoryItem.supplier) && (
                <div className="space-y-4">
                  <h3 className="font-semibold text-lg">Purchase Information</h3>
                  <div className="grid grid-cols-2 gap-4">
                    {selectedInventoryItem.datePurchased && (
                      <div>
                        <Label className="text-muted-foreground">Date Purchased</Label>
                        <p className="font-medium">{new Date(selectedInventoryItem.datePurchased).toLocaleDateString()}</p>
                      </div>
                    )}
                    {selectedInventoryItem.purchasePrice && (
                      <div>
                        <Label className="text-muted-foreground">Purchase Price</Label>
                        <p className="font-medium">£{Number(selectedInventoryItem.purchasePrice).toLocaleString()}</p>
                      </div>
                    )}
                    {selectedInventoryItem.supplier && (
                      <div>
                        <Label className="text-muted-foreground">Supplier</Label>
                        <p className="font-medium">{selectedInventoryItem.supplier}</p>
                      </div>
                    )}
                    {selectedInventoryItem.supplierContact && (
                      <div>
                        <Label className="text-muted-foreground">Supplier Contact</Label>
                        <p className="font-medium">{selectedInventoryItem.supplierContact}</p>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Asset Details */}
              {(selectedInventoryItem.serialNumber || selectedInventoryItem.modelNumber || selectedInventoryItem.expectedLifespanYears) && (
                <div className="space-y-4">
                  <h3 className="font-semibold text-lg">Asset Details</h3>
                  <div className="grid grid-cols-2 gap-4">
                    {selectedInventoryItem.serialNumber && (
                      <div>
                        <Label className="text-muted-foreground">Serial Number</Label>
                        <p className="font-medium">{selectedInventoryItem.serialNumber}</p>
                      </div>
                    )}
                    {selectedInventoryItem.modelNumber && (
                      <div>
                        <Label className="text-muted-foreground">Model Number</Label>
                        <p className="font-medium">{selectedInventoryItem.modelNumber}</p>
                      </div>
                    )}
                    {selectedInventoryItem.expectedLifespanYears && (
                      <div>
                        <Label className="text-muted-foreground">Expected Lifespan</Label>
                        <p className="font-medium">{selectedInventoryItem.expectedLifespanYears} years</p>
                      </div>
                    )}
                    {selectedInventoryItem.currentValue && (
                      <div>
                        <Label className="text-muted-foreground">Current Value</Label>
                        <p className="font-medium">£{Number(selectedInventoryItem.currentValue).toLocaleString()}</p>
                      </div>
                    )}
                    {selectedInventoryItem.warrantyExpiryDate && (
                      <div>
                        <Label className="text-muted-foreground">Warranty Expiry</Label>
                        <p className="font-medium">{new Date(selectedInventoryItem.warrantyExpiryDate).toLocaleDateString()}</p>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Maintenance Information */}
              {(selectedInventoryItem.lastMaintenanceDate || selectedInventoryItem.nextMaintenanceDate || selectedInventoryItem.maintenanceNotes) && (
                <div className="space-y-4">
                  <h3 className="font-semibold text-lg">Maintenance</h3>
                  <div className="grid grid-cols-2 gap-4">
                    {selectedInventoryItem.lastMaintenanceDate && (
                      <div>
                        <Label className="text-muted-foreground">Last Maintenance</Label>
                        <p className="font-medium">{new Date(selectedInventoryItem.lastMaintenanceDate).toLocaleDateString()}</p>
                      </div>
                    )}
                    {selectedInventoryItem.nextMaintenanceDate && (
                      <div>
                        <Label className="text-muted-foreground">Next Maintenance</Label>
                        <p className="font-medium">{new Date(selectedInventoryItem.nextMaintenanceDate).toLocaleDateString()}</p>
                      </div>
                    )}
                    {selectedInventoryItem.maintenanceNotes && (
                      <div className="col-span-2">
                        <Label className="text-muted-foreground">Maintenance Notes</Label>
                        <p className="font-medium whitespace-pre-wrap">{selectedInventoryItem.maintenanceNotes}</p>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Photos */}
              {selectedInventoryItem.photos && selectedInventoryItem.photos.length > 0 && (
                <div className="space-y-4">
                  <h3 className="font-semibold text-lg">Photos</h3>
                  <div className="grid grid-cols-3 gap-4">
                    {selectedInventoryItem.photos.map((photo, index) => (
                      <img
                        key={index}
                        src={photo}
                        alt={`${selectedInventoryItem.name} - Photo ${index + 1}`}
                        className="w-full h-32 object-cover rounded-md border"
                      />
                    ))}
                  </div>
                </div>
              )}

              {/* Action Buttons */}
              <div className="flex justify-end gap-2 pt-4 border-t">
                <Button
                  variant="outline"
                  onClick={() => setInventoryDialogOpen(false)}
                >
                  Close
                </Button>
                <Button
                  onClick={() => {
                    setInventoryDialogOpen(false);
                    window.location.href = `/asset-inventory?propertyId=${propertyId}`;
                  }}
                >
                  Edit in Inventory
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
