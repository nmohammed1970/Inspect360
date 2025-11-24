import { useState, useMemo, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useSearch, Link } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useLocale } from "@/contexts/LocaleContext";
import { Package, Plus, Edit2, Trash2, Building2, Home, Calendar, Wrench, Search, DollarSign, FileText, MapPin, Tag as TagIcon, ArrowLeft } from "lucide-react";
import type { AssetInventory, Property, Block } from "@shared/schema";
import { Badge } from "@/components/ui/badge";
import { format } from "date-fns";
import Uppy from "@uppy/core";
import { Dashboard } from "@uppy/react";
import AwsS3 from "@uppy/aws-s3";

const conditionLabels = {
  excellent: "Excellent",
  good: "Good",
  fair: "Fair",
  poor: "Poor",
  needs_replacement: "Needs Replacement",
};

const cleanlinessLabels = {
  very_clean: "Very Clean",
  clean: "Clean",
  acceptable: "Acceptable",
  needs_cleaning: "Needs Cleaning",
  not_applicable: "Not Applicable",
};

const assetCategories = [
  "HVAC",
  "Appliances",
  "Furniture",
  "Plumbing",
  "Electrical",
  "Flooring",
  "Windows & Doors",
  "Security",
  "Landscaping",
  "Lighting",
  "Kitchen Equipment",
  "Bathroom Fixtures",
  "Other",
];

// Helper function to normalize photo URLs (convert relative to absolute)
const normalizePhotoUrl = (url: string | null | undefined): string | null => {
  if (!url) return null;
  
  // If already absolute URL, return as is
  if (url.startsWith('http://') || url.startsWith('https://')) {
    return url;
  }
  
  // If relative path, convert to absolute
  if (url.startsWith('/')) {
    return `${window.location.origin}${url}`;
  }
  
  // Return as is if it's already in a valid format
  return url;
};

export default function AssetInventory() {
  const { toast } = useToast();
  const { user } = useAuth();
  const locale = useLocale();
  const searchParams = useSearch();
  const urlParams = new URLSearchParams(searchParams);
  const blockIdFromUrl = urlParams.get("blockId");
  const propertyIdFromUrl = urlParams.get("propertyId");
  
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingAsset, setEditingAsset] = useState<AssetInventory | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [filterCategory, setFilterCategory] = useState<string>("all");
  const [filterCondition, setFilterCondition] = useState<string>("all");
  const [filterLocation, setFilterLocation] = useState<string>("all");
  const [uploadedPhotos, setUploadedPhotos] = useState<string[]>([]);

  // Form state
  const [formData, setFormData] = useState<Partial<AssetInventory>>({});

  // Fetch assets
  const { data: assets, isLoading } = useQuery<AssetInventory[]>({
    queryKey: ["/api/asset-inventory"],
  });

  // Fetch properties
  const { data: properties } = useQuery<Property[]>({
    queryKey: ["/api/properties"],
  });

  // Fetch blocks
  const { data: blocks } = useQuery<Block[]>({
    queryKey: ["/api/blocks"],
  });

  // Auto-filter by block or property if in URL
  useEffect(() => {
    if (blockIdFromUrl) {
      setFilterLocation(blockIdFromUrl);
    } else if (propertyIdFromUrl) {
      setFilterLocation(propertyIdFromUrl);
    }
  }, [blockIdFromUrl, propertyIdFromUrl]);

  // Find the current block if filtering by block
  const currentBlock = useMemo(() => {
    if (!blockIdFromUrl || !blocks) return null;
    return blocks.find(b => b.id === blockIdFromUrl);
  }, [blockIdFromUrl, blocks]);

  // Find the current property if filtering by property
  const currentProperty = useMemo(() => {
    if (!propertyIdFromUrl || !properties) return null;
    return properties.find(p => p.id === propertyIdFromUrl);
  }, [propertyIdFromUrl, properties]);

  // Create/Update mutations
  const saveMutation = useMutation({
    mutationFn: async (data: Partial<AssetInventory>) => {
      if (editingAsset) {
        const res = await apiRequest("PATCH", `/api/asset-inventory/${editingAsset.id}`, data);
        return await res.json();
      } else {
        const res = await apiRequest("POST", "/api/asset-inventory", data);
        return await res.json();
      }
    },
    onSuccess: (result, variables) => {
      // Invalidate global asset inventory query
      queryClient.invalidateQueries({ queryKey: ["/api/asset-inventory"] });
      
      // Invalidate property-specific inventory query if propertyId exists in submitted data
      if (variables.propertyId) {
        queryClient.invalidateQueries({ queryKey: ["/api/properties", variables.propertyId, "inventory"] });
      }
      
      // Invalidate block-specific inventory query if blockId exists in submitted data
      if (variables.blockId) {
        queryClient.invalidateQueries({ queryKey: ["/api/blocks", variables.blockId, "inventory"] });
      }
      
      // Also invalidate URL-based context if different from submitted data
      if (propertyIdFromUrl && propertyIdFromUrl !== variables.propertyId) {
        queryClient.invalidateQueries({ queryKey: ["/api/properties", propertyIdFromUrl, "inventory"] });
      }
      if (blockIdFromUrl && blockIdFromUrl !== variables.blockId) {
        queryClient.invalidateQueries({ queryKey: ["/api/blocks", blockIdFromUrl, "inventory"] });
      }
      
      toast({
        title: "Success",
        description: editingAsset ? "Asset updated successfully" : "Asset created successfully",
      });
      handleCloseDialog();
    },
    onError: (error: Error) => {
      toast({
        variant: "destructive",
        title: "Error",
        description: error.message || "Failed to save asset",
      });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await apiRequest("DELETE", `/api/asset-inventory/${id}`);
      // DELETE endpoints typically return 204 No Content with empty body
      // Only parse JSON if there's content
      if (res.status === 204 || res.headers.get("content-length") === "0") {
        return null;
      }
      const text = await res.text();
      return text ? JSON.parse(text) : null;
    },
    onSuccess: () => {
      // Invalidate global asset inventory
      queryClient.invalidateQueries({ queryKey: ["/api/asset-inventory"] });
      
      // Invalidate all property and block inventory queries
      queryClient.invalidateQueries({ queryKey: ["/api/properties"], predicate: (query) => 
        query.queryKey[2] === "inventory"
      });
      queryClient.invalidateQueries({ queryKey: ["/api/blocks"], predicate: (query) => 
        query.queryKey[2] === "inventory"
      });
      
      toast({
        title: "Success",
        description: "Asset deleted successfully",
      });
    },
    onError: (error: Error) => {
      toast({
        variant: "destructive",
        title: "Error",
        description: error.message || "Failed to delete asset",
      });
    },
  });

  const uppy = useMemo(() => {
    const uppyInstance = new Uppy({
      restrictions: {
        maxFileSize: 10 * 1024 * 1024,
        maxNumberOfFiles: 10,
        allowedFileTypes: ['image/*'],
      },
      autoProceed: false,
    });

    uppyInstance.use(AwsS3, {
      shouldUseMultipart: false,
      getUploadParameters: async (file) => {
        try {
          const response = await fetch('/api/objects/upload', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
          });

          if (!response.ok) {
            throw new Error(`Failed to get upload URL: ${response.statusText}`);
          }

          const data = await response.json();
          
          if (!data.uploadURL) {
            throw new Error("Invalid upload URL response");
          }

          // Ensure URL is absolute
          let uploadURL = data.uploadURL;
          if (uploadURL.startsWith('/')) {
            // Convert relative URL to absolute
            uploadURL = `${window.location.origin}${uploadURL}`;
          }

          // Validate URL
          try {
            new URL(uploadURL);
          } catch (e) {
            throw new Error(`Invalid upload URL format: ${uploadURL}`);
          }

          // Extract objectId from upload URL for later use
          const urlObj = new URL(uploadURL);
          const objectId = urlObj.searchParams.get('objectId') || urlObj.pathname.split('/').pop() || '';
          
          // Store metadata for later retrieval
          uppyInstance.setFileMeta(file.id, { 
            originalUploadURL: uploadURL,
            objectId: objectId,
          });

          return {
            method: 'PUT',
            url: uploadURL,
            fields: {},
            headers: {
              'Content-Type': file.type || 'application/octet-stream',
            },
          };
        } catch (error: any) {
          console.error("[AssetInventory] Upload URL error:", error);
          throw new Error(`Failed to get upload URL: ${error.message}`);
        }
      },
    });

    uppyInstance.on('upload-success', async (file, response) => {
      console.log('[AssetInventory] Upload success event:', { 
        file: { id: file?.id, name: file?.name, meta: file?.meta },
        response,
        fileResponse: file?.response,
        fullFile: file
      });
      
      // Extract the file URL from the PUT response
      // The upload-direct endpoint returns: { url: "/objects/...", uploadURL: "/objects/..." }
      let photoUrl: string | null = null;
      
      // Method 1: Check file.response.body (Uppy stores PUT response here)
      if (file?.response?.body) {
        try {
          const body = typeof file.response.body === 'string' 
            ? JSON.parse(file.response.body) 
            : file.response.body;
          photoUrl = body?.url || body?.uploadURL;
          console.log('[AssetInventory] Method 1 - Extracted from file.response.body:', photoUrl);
        } catch (e) {
          console.warn('[AssetInventory] Method 1 - Failed to parse:', e);
        }
      }
      
      // Method 2: Check file.response directly (sometimes it's already parsed)
      if (!photoUrl && file?.response) {
        photoUrl = file.response.url || file.response.uploadURL;
        if (photoUrl) {
          console.log('[AssetInventory] Method 2 - Extracted from file.response:', photoUrl);
        }
      }
      
      // Method 3: Check response.body directly
      if (!photoUrl && response?.body) {
        try {
          const body = typeof response.body === 'string' 
            ? JSON.parse(response.body) 
            : response.body;
          photoUrl = body?.url || body?.uploadURL;
          // Validate it's a file path, not an upload endpoint
          if (photoUrl && photoUrl.includes('/upload-direct')) {
            photoUrl = null; // Reject upload endpoint URLs
          }
          if (photoUrl) {
            console.log('[AssetInventory] Method 3 - Extracted from response.body:', photoUrl);
          }
        } catch (e) {
          console.warn('[AssetInventory] Method 3 - Failed to parse:', e);
        }
      }
      
      // Method 4: Construct from objectId if we have it (prioritize this over response properties)
      if (!photoUrl && file?.meta?.objectId) {
        photoUrl = `/objects/${file.meta.objectId}`;
        console.log('[AssetInventory] Method 4 - Constructed from objectId:', photoUrl);
      }
      
      // Method 5: Extract objectId from upload URL and construct path
      if (!photoUrl && file?.meta?.originalUploadURL) {
        try {
          const uploadUrl = file.meta.originalUploadURL;
          const urlObj = new URL(uploadUrl);
          const objectId = urlObj.searchParams.get('objectId');
          if (objectId) {
            photoUrl = `/objects/${objectId}`;
            console.log('[AssetInventory] Method 5 - Constructed from upload URL objectId:', photoUrl);
          }
        } catch (e) {
          console.warn('[AssetInventory] Method 5 - Failed to extract objectId:', e);
        }
      }
      
      // Method 6: Check top-level response properties (only if it's a valid file path)
      if (!photoUrl && response) {
        const candidate = response.uploadURL || response.url;
        // Only use if it's a file path, not an upload endpoint
        if (candidate && !candidate.includes('/upload-direct') && candidate.startsWith('/objects/')) {
          photoUrl = candidate;
          console.log('[AssetInventory] Method 6 - Extracted from response top-level:', photoUrl);
        }
      }
      
      if (!photoUrl) {
        console.error('[AssetInventory] No photo URL found. Full debug info:', {
          fileResponse: file?.response,
          response,
          fileMeta: file?.meta,
          fileKeys: file ? Object.keys(file) : null,
          responseKeys: response ? Object.keys(response) : null
        });
        toast({
          variant: "destructive",
          title: "Upload Error",
          description: "Upload succeeded but could not get photo URL. Please try again.",
        });
        return;
      }
      
      // Remove query params if any
      photoUrl = photoUrl.split('?')[0];
      
      // Ensure it's a valid file path (should start with /objects/)
      if (!photoUrl.startsWith('/objects/')) {
        console.error('[AssetInventory] Invalid photo URL format:', photoUrl);
        toast({
          variant: "destructive",
          title: "Upload Error",
          description: "Invalid photo URL format. Please try again.",
        });
        return;
      }
      
      // Convert relative path to absolute URL for display
      const absolutePhotoUrl = `${window.location.origin}${photoUrl}`;
      console.log('[AssetInventory] Final photo URL:', absolutePhotoUrl);
      
      // Add photo to preview immediately
      setUploadedPhotos(prev => {
        // Avoid duplicates
        if (prev.includes(absolutePhotoUrl)) {
          return prev;
        }
        return [...prev, absolutePhotoUrl];
      });
      
      // Set ACL for the uploaded photo (in background, don't block UI)
      fetch('/api/objects/set-acl', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ photoUrl: absolutePhotoUrl }),
      })
      .then(async (aclResponse) => {
        if (aclResponse.ok) {
          const { objectPath } = await aclResponse.json();
          // If objectPath is different, update it (though it should be the same)
          if (objectPath && objectPath !== photoUrl) {
            const finalUrl = objectPath.startsWith('/') 
              ? `${window.location.origin}${objectPath}` 
              : objectPath;
            
            setUploadedPhotos(prev => {
              const index = prev.indexOf(absolutePhotoUrl);
              if (index >= 0) {
                const updated = [...prev];
                updated[index] = finalUrl;
                return updated;
              }
              return prev;
            });
          }
        }
      })
      .catch(error => {
        console.error('[AssetInventory] Error setting ACL (non-blocking):', error);
      });
      
      toast({
        title: "Photo uploaded",
        description: "Photo has been uploaded successfully",
      });
    });

    return uppyInstance;
  }, [toast]);

  const handleCloseDialog = () => {
    setIsDialogOpen(false);
    setEditingAsset(null);
    setFormData({});
    setUploadedPhotos([]);
    uppy.cancelAll();
  };

  const handleOpenDialog = (asset?: AssetInventory) => {
    if (asset) {
      setEditingAsset(asset);
      setFormData(asset);
      setUploadedPhotos(asset.photos || []);
    } else {
      // Pre-populate property or block based on URL context
      const initialFormData: Partial<AssetInventory> = {};
      if (propertyIdFromUrl) {
        initialFormData.propertyId = propertyIdFromUrl;
      } else if (blockIdFromUrl) {
        initialFormData.blockId = blockIdFromUrl;
      }
      setFormData(initialFormData);
      setUploadedPhotos([]);
    }
    setIsDialogOpen(true);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    // Helper to convert dates - handles string inputs, Date objects, and undefined
    const convertDate = (value: any) => {
      if (!value || value === '') return null;
      if (value instanceof Date) return value;
      // If it's a string, try to parse it
      const parsed = new Date(value);
      return isNaN(parsed.getTime()) ? null : parsed;
    };
    
    // Explicitly build submit data with proper type conversions
    const submitData: any = {
      organizationId: user?.organizationId || formData.organizationId,
      name: formData.name,
      category: formData.category || null,
      description: formData.description || null,
      condition: formData.condition,
      cleanliness: formData.cleanliness || null,
      propertyId: formData.propertyId || null,
      blockId: formData.blockId || null,
      location: formData.location || null,
      datePurchased: convertDate(formData.datePurchased),
      purchasePrice: formData.purchasePrice || null,
      expectedLifespanYears: formData.expectedLifespanYears || null,
      depreciationPerYear: formData.depreciationPerYear || null,
      currentValue: formData.currentValue || null,
      supplier: formData.supplier || null,
      supplierContact: formData.supplierContact || null,
      serialNumber: formData.serialNumber || null,
      modelNumber: formData.modelNumber || null,
      warrantyExpiryDate: convertDate(formData.warrantyExpiryDate),
      lastMaintenanceDate: convertDate(formData.lastMaintenanceDate),
      nextMaintenanceDate: convertDate(formData.nextMaintenanceDate),
      maintenanceNotes: formData.maintenanceNotes || null,
      photos: uploadedPhotos.length > 0 ? uploadedPhotos : formData.photos || [],
      documents: formData.documents || [],
    };

    saveMutation.mutate(submitData);
  };

  // Calculate current value based on purchase price and depreciation
  const calculateCurrentValue = (purchasePrice: number, depreciationPerYear: number, datePurchased: Date) => {
    const yearsOwned = Math.floor((Date.now() - new Date(datePurchased).getTime()) / (1000 * 60 * 60 * 24 * 365));
    const totalDepreciation = depreciationPerYear * yearsOwned;
    return Math.max(0, purchasePrice - totalDepreciation);
  };

  // Filter assets
  const filteredAssets = useMemo(() => {
    if (!assets) return [];
    
    return assets.filter(asset => {
      const matchesSearch = searchTerm === "" ||
        asset.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        asset.description?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        asset.location?.toLowerCase().includes(searchTerm.toLowerCase());
      
      const matchesCategory = filterCategory === "all" || asset.category === filterCategory;
      const matchesCondition = filterCondition === "all" || asset.condition === filterCondition;
      const matchesLocation = filterLocation === "all" || asset.propertyId === filterLocation || asset.blockId === filterLocation;
      
      return matchesSearch && matchesCategory && matchesCondition && matchesLocation;
    });
  }, [assets, searchTerm, filterCategory, filterCondition, filterLocation]);

  // Get unique locations
  const locations = useMemo(() => {
    const locs: Array<{ id: string; name: string; type: "property" | "block" }> = [];
    properties?.forEach(p => locs.push({ id: p.id, name: p.address, type: "property" }));
    blocks?.forEach(b => locs.push({ id: b.id, name: b.name, type: "block" }));
    return locs;
  }, [properties, blocks]);

  if (isLoading) {
    return <div className="p-8">Loading...</div>;
  }

  return (
    <div className="p-8 space-y-6">
      {/* Header with optional block or property breadcrumb */}
      {currentBlock && (
        <Link href={`/blocks/${currentBlock.id}`}>
          <Button variant="ghost" className="mb-2" data-testid="button-back-to-block">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to {currentBlock.name}
          </Button>
        </Link>
      )}
      {currentProperty && (
        <Link href={`/properties/${currentProperty.id}`}>
          <Button variant="ghost" className="mb-2" data-testid="button-back-to-property">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to {currentProperty.name}
          </Button>
        </Link>
      )}
      
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">
            {currentBlock 
              ? `${currentBlock.name} - Asset Inventory` 
              : currentProperty 
              ? `${currentProperty.name} - Asset Inventory`
              : 'Asset Inventory'
            }
          </h1>
          <p className="text-muted-foreground mt-1">
            {currentBlock 
              ? `Assets and equipment in ${currentBlock.name}` 
              : currentProperty
              ? `Assets and equipment in ${currentProperty.name}`
              : 'Manage physical assets and equipment across your properties'
            }
          </p>
        </div>

        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogTrigger asChild>
            <Button onClick={() => handleOpenDialog()} data-testid="button-add-asset" style={{ backgroundColor: '#00D2BD' }} className="hover:opacity-90">
              <Plus className="w-4 h-4 mr-2" />
              Add Asset
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{editingAsset ? "Edit Asset" : "Add New Asset"}</DialogTitle>
              <DialogDescription>
                {editingAsset ? "Update asset information" : "Add a new asset to your inventory"}
              </DialogDescription>
            </DialogHeader>

            <form onSubmit={handleSubmit} className="space-y-6">
              {/* Basic Information */}
              <div className="space-y-4">
                <h3 className="font-semibold text-lg">Basic Information</h3>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="name">Asset Name *</Label>
                    <Input
                      id="name"
                      value={formData.name || ""}
                      onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                      placeholder="e.g., Refrigerator - Unit 101"
                      required
                      data-testid="input-asset-name"
                    />
                  </div>

                  <div>
                    <Label htmlFor="category">Category</Label>
                    <Select
                      value={formData.category || ""}
                      onValueChange={(value) => setFormData({ ...formData, category: value })}
                    >
                      <SelectTrigger data-testid="select-category">
                        <SelectValue placeholder="Select category" />
                      </SelectTrigger>
                      <SelectContent>
                        {assetCategories.map((cat) => (
                          <SelectItem key={cat} value={cat}>{cat}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div>
                    <Label htmlFor="condition">Condition *</Label>
                    <Select
                      value={formData.condition || ""}
                      onValueChange={(value) => setFormData({ ...formData, condition: value as any })}
                    >
                      <SelectTrigger data-testid="select-condition">
                        <SelectValue placeholder="Select condition" />
                      </SelectTrigger>
                      <SelectContent>
                        {Object.entries(conditionLabels).map(([value, label]) => (
                          <SelectItem key={value} value={value}>{label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div>
                    <Label htmlFor="cleanliness">Cleanliness</Label>
                    <Select
                      value={formData.cleanliness || ""}
                      onValueChange={(value) => setFormData({ ...formData, cleanliness: value as any })}
                    >
                      <SelectTrigger data-testid="select-cleanliness">
                        <SelectValue placeholder="Select cleanliness" />
                      </SelectTrigger>
                      <SelectContent>
                        {Object.entries(cleanlinessLabels).map(([value, label]) => (
                          <SelectItem key={value} value={value}>{label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div>
                  <Label htmlFor="description">Description</Label>
                  <Textarea
                    id="description"
                    value={formData.description || ""}
                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                    placeholder="Detailed description of the asset..."
                    rows={3}
                    data-testid="textarea-description"
                  />
                </div>
              </div>

              {/* Location & Assignment */}
              <div className="space-y-4">
                <h3 className="font-semibold text-lg">Location & Assignment</h3>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="property">Property</Label>
                    <Select
                      value={formData.propertyId || ""}
                      onValueChange={(value) => setFormData({ ...formData, propertyId: value, blockId: undefined })}
                    >
                      <SelectTrigger data-testid="select-property">
                        <SelectValue placeholder="Select property" />
                      </SelectTrigger>
                      <SelectContent>
                        {properties?.map((property) => (
                          <SelectItem key={property.id} value={property.id}>
                            {property.address}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div>
                    <Label htmlFor="block">Block</Label>
                    <Select
                      value={formData.blockId || ""}
                      onValueChange={(value) => setFormData({ ...formData, blockId: value, propertyId: undefined })}
                    >
                      <SelectTrigger data-testid="select-block">
                        <SelectValue placeholder="Select block" />
                      </SelectTrigger>
                      <SelectContent>
                        {blocks?.map((block) => (
                          <SelectItem key={block.id} value={block.id}>
                            {block.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="col-span-2">
                    <Label htmlFor="location">Specific Location</Label>
                    <Input
                      id="location"
                      value={formData.location || ""}
                      onChange={(e) => setFormData({ ...formData, location: e.target.value })}
                      placeholder="e.g., Unit 101 - Kitchen, Common Area - Lobby"
                      data-testid="input-location"
                    />
                  </div>
                </div>
              </div>

              {/* Purchase & Financial Information */}
              <div className="space-y-4">
                <h3 className="font-semibold text-lg">Purchase & Financial Information</h3>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="datePurchased">Date Purchased</Label>
                    <Input
                      id="datePurchased"
                      type="date"
                      value={formData.datePurchased ? format(new Date(formData.datePurchased), 'yyyy-MM-dd') : ""}
                      onChange={(e) => setFormData({ ...formData, datePurchased: e.target.value ? new Date(e.target.value) as any : undefined })}
                      data-testid="input-date-purchased"
                    />
                  </div>

                  <div>
                    <Label htmlFor="purchasePrice">Purchase Price ({locale.currencySymbol})</Label>
                    <Input
                      id="purchasePrice"
                      type="number"
                      step="0.01"
                      value={formData.purchasePrice?.toString() || ""}
                      onChange={(e) => setFormData({ ...formData, purchasePrice: e.target.value as any })}
                      placeholder="0.00"
                      data-testid="input-purchase-price"
                    />
                  </div>

                  <div>
                    <Label htmlFor="expectedLifespanYears">Expected Lifespan (years)</Label>
                    <Input
                      id="expectedLifespanYears"
                      type="number"
                      value={formData.expectedLifespanYears?.toString() || ""}
                      onChange={(e) => setFormData({ ...formData, expectedLifespanYears: parseInt(e.target.value) as any })}
                      placeholder="10"
                      data-testid="input-lifespan"
                    />
                  </div>

                  <div>
                    <Label htmlFor="depreciationPerYear">Depreciation per Year ({locale.currencySymbol})</Label>
                    <Input
                      id="depreciationPerYear"
                      type="number"
                      step="0.01"
                      value={formData.depreciationPerYear?.toString() || ""}
                      onChange={(e) => setFormData({ ...formData, depreciationPerYear: e.target.value as any })}
                      placeholder="0.00"
                      data-testid="input-depreciation"
                    />
                  </div>
                </div>
              </div>

              {/* Supplier & Product Information */}
              <div className="space-y-4">
                <h3 className="font-semibold text-lg">Supplier & Product Information</h3>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="supplier">Supplier</Label>
                    <Input
                      id="supplier"
                      value={formData.supplier || ""}
                      onChange={(e) => setFormData({ ...formData, supplier: e.target.value })}
                      placeholder="e.g., Home Depot, Lowe's"
                      data-testid="input-supplier"
                    />
                  </div>

                  <div>
                    <Label htmlFor="supplierContact">Supplier Contact</Label>
                    <Input
                      id="supplierContact"
                      value={formData.supplierContact || ""}
                      onChange={(e) => setFormData({ ...formData, supplierContact: e.target.value })}
                      placeholder="Phone or email"
                      data-testid="input-supplier-contact"
                    />
                  </div>

                  <div>
                    <Label htmlFor="serialNumber">Serial Number</Label>
                    <Input
                      id="serialNumber"
                      value={formData.serialNumber || ""}
                      onChange={(e) => setFormData({ ...formData, serialNumber: e.target.value })}
                      placeholder="SN-123456"
                      data-testid="input-serial-number"
                    />
                  </div>

                  <div>
                    <Label htmlFor="modelNumber">Model Number</Label>
                    <Input
                      id="modelNumber"
                      value={formData.modelNumber || ""}
                      onChange={(e) => setFormData({ ...formData, modelNumber: e.target.value })}
                      placeholder="Model-XYZ"
                      data-testid="input-model-number"
                    />
                  </div>

                  <div>
                    <Label htmlFor="warrantyExpiryDate">Warranty Expiry Date</Label>
                    <Input
                      id="warrantyExpiryDate"
                      type="date"
                      value={formData.warrantyExpiryDate ? format(new Date(formData.warrantyExpiryDate), 'yyyy-MM-dd') : ""}
                      onChange={(e) => setFormData({ ...formData, warrantyExpiryDate: e.target.value ? new Date(e.target.value) as any : undefined })}
                      data-testid="input-warranty-expiry"
                    />
                  </div>
                </div>
              </div>

              {/* Maintenance Information */}
              <div className="space-y-4">
                <h3 className="font-semibold text-lg">Maintenance Information</h3>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="lastMaintenanceDate">Last Maintenance Date</Label>
                    <Input
                      id="lastMaintenanceDate"
                      type="date"
                      value={formData.lastMaintenanceDate ? format(new Date(formData.lastMaintenanceDate), 'yyyy-MM-dd') : ""}
                      onChange={(e) => setFormData({ ...formData, lastMaintenanceDate: e.target.value ? new Date(e.target.value) as any : undefined })}
                      data-testid="input-last-maintenance"
                    />
                  </div>

                  <div>
                    <Label htmlFor="nextMaintenanceDate">Next Maintenance Date</Label>
                    <Input
                      id="nextMaintenanceDate"
                      type="date"
                      value={formData.nextMaintenanceDate ? format(new Date(formData.nextMaintenanceDate), 'yyyy-MM-dd') : ""}
                      onChange={(e) => setFormData({ ...formData, nextMaintenanceDate: e.target.value ? new Date(e.target.value) as any : undefined })}
                      data-testid="input-next-maintenance"
                    />
                  </div>

                  <div className="col-span-2">
                    <Label htmlFor="maintenanceNotes">Maintenance Notes</Label>
                    <Textarea
                      id="maintenanceNotes"
                      value={formData.maintenanceNotes || ""}
                      onChange={(e) => setFormData({ ...formData, maintenanceNotes: e.target.value })}
                      placeholder="Notes about maintenance history or requirements..."
                      rows={3}
                      data-testid="textarea-maintenance-notes"
                    />
                  </div>
                </div>
              </div>

              {/* Photos */}
              <div className="space-y-4">
                <h3 className="font-semibold text-lg">Photos</h3>
                {uploadedPhotos.length > 0 && (
                  <div className="grid grid-cols-4 gap-2">
                    {uploadedPhotos.map((url, index) => (
                      <div key={index} className="relative">
                        <img src={normalizePhotoUrl(url) || url} alt={`Asset photo ${index + 1}`} className="w-full h-24 object-cover rounded" />
                        <Button
                          type="button"
                          size="icon"
                          variant="destructive"
                          className="absolute top-1 right-1 h-6 w-6"
                          onClick={() => setUploadedPhotos(prev => prev.filter((_, i) => i !== index))}
                        >
                          <Trash2 className="w-3 h-3" />
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
                <Dashboard uppy={uppy} proudlyDisplayPoweredByUppy={false} height={300} />
              </div>

              <DialogFooter>
                <Button type="button" variant="outline" onClick={handleCloseDialog}>
                  Cancel
                </Button>
                <Button type="submit" disabled={saveMutation.isPending} data-testid="button-submit-asset">
                  {editingAsset ? "Update Asset" : "Create Asset"}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {/* Filters */}
      <div className="flex gap-4 items-center flex-wrap">
        <div className="relative flex-1 min-w-[300px]">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Search assets by name, description, or location..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-9"
            data-testid="input-search-assets"
          />
        </div>

        <Select value={filterCategory} onValueChange={setFilterCategory}>
          <SelectTrigger className="w-48" data-testid="select-filter-category">
            <SelectValue placeholder="All Categories" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Categories</SelectItem>
            {assetCategories.map((cat) => (
              <SelectItem key={cat} value={cat}>{cat}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={filterCondition} onValueChange={setFilterCondition}>
          <SelectTrigger className="w-48" data-testid="select-filter-condition">
            <SelectValue placeholder="All Conditions" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Conditions</SelectItem>
            {Object.entries(conditionLabels).map(([value, label]) => (
              <SelectItem key={value} value={value}>{label}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={filterLocation} onValueChange={setFilterLocation}>
          <SelectTrigger className="w-48" data-testid="select-filter-location">
            <SelectValue placeholder="All Locations" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Locations</SelectItem>
            {locations.map((loc) => (
              <SelectItem key={loc.id} value={loc.id}>
                {loc.type === "property" ? <Home className="w-3 h-3 inline mr-1" /> : <Building2 className="w-3 h-3 inline mr-1" />}
                {loc.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Assets Grid */}
      {!filteredAssets || filteredAssets.length === 0 ? (
        <Card>
          <CardContent className="p-12 text-center">
            <Package className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
            <h3 className="text-lg font-semibold mb-2">
              {searchTerm || filterCategory !== "all" || filterCondition !== "all" ? "No Assets Found" : "No Assets Yet"}
            </h3>
            <p className="text-muted-foreground mb-4">
              {searchTerm || filterCategory !== "all" || filterCondition !== "all"
                ? "Try adjusting your search or filters"
                : "Get started by adding your first asset"}
            </p>
            {!searchTerm && filterCategory === "all" && filterCondition === "all" && (
              <Button onClick={() => handleOpenDialog()} data-testid="button-add-first-asset" style={{ backgroundColor: '#00D2BD' }} className="hover:opacity-90">
                <Plus className="w-4 h-4 mr-2" />
                Add Your First Asset
              </Button>
            )}
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredAssets.map((asset) => (
            <Card key={asset.id} className="hover-elevate" data-testid={`card-asset-${asset.id}`}>
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <CardTitle className="text-lg truncate">{asset.name}</CardTitle>
                    <div className="flex gap-2 mt-2 flex-wrap">
                      {asset.category && (
                        <Badge variant="outline" className="text-xs">
                          <TagIcon className="w-3 h-3 mr-1" />
                          {asset.category}
                        </Badge>
                      )}
                      <Badge variant={
                        asset.condition === "excellent" ? "default" :
                        asset.condition === "good" ? "secondary" :
                        asset.condition === "fair" ? "outline" :
                        "destructive"
                      } className="text-xs">
                        {conditionLabels[asset.condition]}
                      </Badge>
                    </div>
                  </div>

                  <div className="flex gap-1">
                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={() => handleOpenDialog(asset)}
                      data-testid={`button-edit-${asset.id}`}
                    >
                      <Edit2 className="w-4 h-4" />
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={() => {
                        if (confirm("Are you sure you want to delete this asset?")) {
                          deleteMutation.mutate(asset.id);
                        }
                      }}
                      data-testid={`button-delete-${asset.id}`}
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              </CardHeader>

              <CardContent className="space-y-3">
                {asset.photos && asset.photos.length > 0 && (() => {
                  const firstPhoto = normalizePhotoUrl(asset.photos[0]);
                  return firstPhoto ? (
                    <div className="relative h-32 rounded overflow-hidden">
                      <img src={firstPhoto} alt={asset.name} className="w-full h-full object-cover" onError={(e) => {
                        console.error('Failed to load image:', firstPhoto);
                        (e.target as HTMLImageElement).style.display = 'none';
                      }} />
                      {asset.photos.length > 1 && (
                        <Badge className="absolute top-2 right-2 text-xs">
                          +{asset.photos.length - 1} more
                        </Badge>
                      )}
                    </div>
                  ) : null;
                })()}

                <div className="space-y-2 text-sm">
                  {asset.location && (
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <MapPin className="w-4 h-4 shrink-0" />
                      <span className="truncate">{asset.location}</span>
                    </div>
                  )}

                  {asset.purchasePrice && (
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <DollarSign className="w-4 h-4 shrink-0" />
                      <span>Purchase: {locale.formatCurrency(parseFloat(asset.purchasePrice.toString()) * 100, false)}</span>
                    </div>
                  )}

                  {asset.datePurchased && (
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <Calendar className="w-4 h-4 shrink-0" />
                      <span>Purchased: {format(new Date(asset.datePurchased), 'MMM d, yyyy')}</span>
                    </div>
                  )}

                  {asset.lastMaintenanceDate && (
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <Wrench className="w-4 h-4 shrink-0" />
                      <span>Last Maintained: {format(new Date(asset.lastMaintenanceDate), 'MMM d, yyyy')}</span>
                    </div>
                  )}

                  {asset.description && (
                    <div className="flex items-start gap-2 text-muted-foreground">
                      <FileText className="w-4 h-4 shrink-0 mt-0.5" />
                      <span className="line-clamp-2">{asset.description}</span>
                    </div>
                  )}

                  {asset.cleanliness && asset.cleanliness in cleanlinessLabels && (
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-muted-foreground">Cleanliness:</span>
                      <Badge variant="secondary" className="text-xs">
                        {cleanlinessLabels[asset.cleanliness as keyof typeof cleanlinessLabels]}
                      </Badge>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
