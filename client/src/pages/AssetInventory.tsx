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
import { extractFileUrlFromUploadResponse } from "@/lib/utils";
import { useLocale } from "@/contexts/LocaleContext";
import { Package, Plus, Edit2, Trash2, Building2, Home, Calendar, Wrench, Search, FileText, MapPin, Tag as TagIcon, ArrowLeft, Filter, X, ExternalLink, Download } from "lucide-react";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import type { AssetInventory, Property, Block } from "@shared/schema";
import { formatPropertyLocationLabel, formatBlockLocationLabel } from "@shared/locationLabels";
import { Badge } from "@/components/ui/badge";
import { ModernFilePickerInline } from "@/components/ModernFilePickerInline";
import { LocaleDateInput } from "@/components/LocaleDateInput";

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

// Same-origin paths for /objects/* so <img> requests use the SPA host and session cookies.
// (Absolute URLs to another host:port often 404 or miss auth after deploy / localhost changes.)
const BARE_OBJECT_ID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}[^/]*$/i;

const normalizePhotoUrl = (url: string | null | undefined): string | null => {
  if (!url) return null;

  const trimmedUrl = url.trim();
  if (!trimmedUrl) return null;

  if (trimmedUrl.startsWith("http://") || trimmedUrl.startsWith("https://")) {
    try {
      const parsedUrl = new URL(trimmedUrl);
      if (parsedUrl.pathname.startsWith("/objects/")) {
        return `${parsedUrl.pathname}${parsedUrl.search}`;
      }
      return trimmedUrl;
    } catch {
      return trimmedUrl;
    }
  }

  if (trimmedUrl.startsWith("/objects/")) {
    return trimmedUrl;
  }

  if (trimmedUrl.startsWith("/")) {
    return trimmedUrl;
  }

  if (trimmedUrl.startsWith("objects/")) {
    return `/${trimmedUrl}`;
  }

  if (trimmedUrl.includes("/objects/")) {
    const objectPathIndex = trimmedUrl.indexOf("/objects/");
    return trimmedUrl.slice(objectPathIndex);
  }

  if (BARE_OBJECT_ID.test(trimmedUrl.replace(/^\.\/+/, ""))) {
    return `/objects/${trimmedUrl.replace(/^\.\/+/, "")}`;
  }

  return `/${trimmedUrl.replace(/^\/+/, "")}`;
};

const roundToTwoDecimals = (value: number): number => Math.round(value * 100) / 100;

const getYearsUsed = (datePurchased: Date | string | null | undefined): number => {
  if (!datePurchased) return 0;
  const purchasedAt = new Date(datePurchased);
  if (Number.isNaN(purchasedAt.getTime())) return 0;

  const years = Math.floor((Date.now() - purchasedAt.getTime()) / (1000 * 60 * 60 * 24 * 365));
  return Math.max(0, years);
};

/** Filename segment of an object path is clearly an image */
const IMAGE_OBJECT_SEGMENT_EXT_RE = /\.(jpe?g|png|gif|webp|svg|bmp|ico|tiff?|heic|avif)$/i;

/**
 * Show the document card (View/Download) for PDFs and for /objects/... files that are not
 * obvious images — legacy PDFs were often stored without a .pdf suffix.
 */
const isAssetDocumentPreviewUrl = (url: string | null | undefined): boolean => {
  if (!url) return false;
  const candidates = [url, normalizePhotoUrl(url) || url];
  for (const u of candidates) {
    const path = u.split("?")[0].toLowerCase();
    if (path.endsWith(".pdf")) return true;
  }
  for (const u of candidates) {
    const path = u.split("?")[0];
    const m = path.match(/\/objects\/([^/]+)$/i);
    if (!m) continue;
    const segment = m[1];
    if (IMAGE_OBJECT_SEGMENT_EXT_RE.test(segment)) continue;
    return true;
  }
  return false;
};

/** Filename for Save As: browsers often ignore Content-Disposition when <a download> has no value. */
const getAssetDocumentDownloadName = (url: string): string => {
  const resolved = normalizePhotoUrl(url) || url;
  const path = resolved.split("?")[0];
  const segment = path.split("/").filter(Boolean).pop() || "document";
  const safe = segment.replace(/[<>:"/\\|?*]/g, "_");
  const lower = safe.toLowerCase();
  if (lower.endsWith(".pdf")) return safe;
  if (/\.[a-z0-9]{2,5}$/i.test(safe)) return safe;
  return `${safe}.pdf`;
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
  /** Scope: single property or block (all assets assigned there) */
  const [filterPropertyBlock, setFilterPropertyBlock] = useState<string>("all");
  /** Internal "Specific location" text saved on assets (not addresses) */
  const [filterSpecificLocation, setFilterSpecificLocation] = useState<string>("all");
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
      setFilterPropertyBlock(blockIdFromUrl);
    } else if (propertyIdFromUrl) {
      setFilterPropertyBlock(propertyIdFromUrl);
    }
  }, [blockIdFromUrl, propertyIdFromUrl]);

  useEffect(() => {
    const purchasePrice = Number(formData.purchasePrice);
    const expectedLifespanYears = Number(formData.expectedLifespanYears);
    const yearsUsed = getYearsUsed(formData.datePurchased as any);

    if (purchasePrice > 0 && expectedLifespanYears > 0) {
      const depreciationPerYear = roundToTwoDecimals(purchasePrice / expectedLifespanYears);
      const currentValue = roundToTwoDecimals(
        Math.max(0, purchasePrice - (depreciationPerYear * yearsUsed)),
      );
      const depreciationPerYearValue = depreciationPerYear.toFixed(2);
      const currentValueValue = currentValue.toFixed(2);
      setFormData((prev) => {
        if (
          Number(prev.depreciationPerYear) === depreciationPerYear &&
          Number(prev.currentValue) === currentValue
        ) {
          return prev;
        }
        return {
          ...prev,
          depreciationPerYear: depreciationPerYearValue as any,
          currentValue: currentValueValue as any,
        };
      });
      return;
    }

    setFormData((prev) => {
      if (
        (prev.depreciationPerYear == null || prev.depreciationPerYear === "") &&
        (prev.currentValue == null || prev.currentValue === "")
      ) {
        return prev;
      }
      return {
        ...prev,
        depreciationPerYear: null,
        currentValue: null,
      };
    });
  }, [formData.purchasePrice, formData.expectedLifespanYears, formData.datePurchased]);

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

  const [isUploadingPhotos, setIsUploadingPhotos] = useState(false);
  const [photoUploadProgress, setPhotoUploadProgress] = useState(0);

  const handlePhotoFilesSelected = async (files: File[]) => {
    if (files.length === 0) return;

    setIsUploadingPhotos(true);
    setPhotoUploadProgress(0);

    try {
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        
        // Get upload parameters
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
          uploadURL = `${window.location.origin}${uploadURL}`;
        }

        // Upload file
        const uploadResponse = await fetch(uploadURL, {
          method: 'PUT',
          body: file,
          headers: {
            'Content-Type': file.type,
          },
        });

        if (!uploadResponse.ok) {
          throw new Error(`Upload failed: ${uploadResponse.statusText}`);
        }

        // Extract file URL
        let photoUrl: string | null = null;
        try {
          const text = await uploadResponse.text();
          let responseBody: any = null;
          if (text) {
            try {
              responseBody = JSON.parse(text);
            } catch {
              responseBody = text;
            }
          }

          const mockFile = {
            response: {
              body: responseBody,
              url: uploadResponse.headers.get('Location') || undefined,
            },
            meta: {
              originalUploadURL: uploadURL,
            },
          };

          photoUrl = extractFileUrlFromUploadResponse(mockFile, responseBody);
        } catch (e) {
          // Fallback: extract from upload URL
          try {
            const urlObj = new URL(uploadURL);
            photoUrl = urlObj.pathname;
          } catch {
            photoUrl = uploadURL;
          }
        }

        if (photoUrl) {
          const normalizedPhotoUrl = normalizePhotoUrl(photoUrl) || photoUrl;

          setUploadedPhotos(prev => {
            if (prev.includes(normalizedPhotoUrl)) {
              return prev;
            }
            return [...prev, normalizedPhotoUrl];
          });

          toast({
            title: "Photo uploaded",
            description: "Photo has been uploaded successfully",
          });
        }

        setPhotoUploadProgress(Math.round(((i + 1) / files.length) * 100));
      }
    } catch (error: any) {
      console.error('[AssetInventory] Upload error:', error);
      toast({
        variant: "destructive",
        title: "Upload Error",
        description: error.message || "Failed to upload photos",
      });
    } finally {
      setIsUploadingPhotos(false);
    }
  };

  const handleCloseDialog = () => {
    setIsDialogOpen(false);
    setEditingAsset(null);
    setFormData({});
    setUploadedPhotos([]);
    setIsUploadingPhotos(false);
    setPhotoUploadProgress(0);
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

    const toNullableNumericString = (value: any) => {
      if (value === null || value === undefined || value === "") return null;
      const numericValue = typeof value === "string" ? Number(value) : value;
      if (Number.isNaN(numericValue)) return null;
      return Number(numericValue).toFixed(2);
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
      purchasePrice: toNullableNumericString(formData.purchasePrice),
      expectedLifespanYears: formData.expectedLifespanYears || null,
      depreciationPerYear: toNullableNumericString(formData.depreciationPerYear),
      currentValue: toNullableNumericString(formData.currentValue),
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

  const renderDocumentCard = (url: string, compact: boolean = true) => {
    const resolvedUrl = normalizePhotoUrl(url) || url;
    const downloadName = getAssetDocumentDownloadName(url);
    return (
      <div className={`flex w-full flex-col items-center justify-center rounded border bg-muted/40 px-2 text-center ${compact ? "h-24" : "h-full"}`}>
        <FileText className={`mb-1 text-primary ${compact ? "h-8 w-8" : "h-10 w-10"}`} />
        <span className={`font-medium ${compact ? "text-xs" : "text-sm"}`}>Document</span>
        <div className={`mt-1 flex items-center gap-2 ${compact ? "text-xs" : "text-sm"}`}>
          <a href={resolvedUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-primary hover:underline">
            <ExternalLink className="h-3.5 w-3.5" />
            View
          </a>
          <a
            href={resolvedUrl}
            download={downloadName}
            className="inline-flex items-center gap-1 text-primary hover:underline"
          >
            <Download className="h-3.5 w-3.5" />
            Download
          </a>
        </div>
      </div>
    );
  };

  // Filter assets (search includes linked property/block name and address)
  const filteredAssets = useMemo(() => {
    if (!assets) return [];

    const q = searchTerm.trim().toLowerCase();

    return assets.filter((asset) => {
      const matchesSearch =
        q === "" ||
        (() => {
          if (asset.name?.toLowerCase().includes(q)) return true;
          if (asset.description?.toLowerCase().includes(q)) return true;
          if (asset.location?.toLowerCase().includes(q)) return true;
          if (asset.propertyId && properties) {
            const p = properties.find((x) => x.id === asset.propertyId);
            if (p) {
              if (p.name?.toLowerCase().includes(q)) return true;
              if (p.address?.toLowerCase().includes(q)) return true;
              if (formatPropertyLocationLabel(p).toLowerCase().includes(q)) return true;
            }
          }
          if (asset.blockId && blocks) {
            const b = blocks.find((x) => x.id === asset.blockId);
            if (b) {
              if (b.name?.toLowerCase().includes(q)) return true;
              if (b.address?.toLowerCase().includes(q)) return true;
              if (formatBlockLocationLabel(b).toLowerCase().includes(q)) return true;
            }
          }
          return false;
        })();

      const matchesCategory = filterCategory === "all" || asset.category === filterCategory;
      const matchesCondition = filterCondition === "all" || asset.condition === filterCondition;
      const matchesPropertyBlock =
        filterPropertyBlock === "all" ||
        asset.propertyId === filterPropertyBlock ||
        asset.blockId === filterPropertyBlock;
      const matchesSpecificLocation =
        filterSpecificLocation === "all" ||
        (asset.location?.trim() ?? "") === filterSpecificLocation;

      return (
        matchesSearch &&
        matchesCategory &&
        matchesCondition &&
        matchesPropertyBlock &&
        matchesSpecificLocation
      );
    });
  }, [
    assets,
    searchTerm,
    filterCategory,
    filterCondition,
    filterPropertyBlock,
    filterSpecificLocation,
    properties,
    blocks,
  ]);

  // Property / block scope options (for filtering assets to one building or unit)
  const propertyBlockOptions = useMemo(() => {
    const locs: Array<{ id: string; name: string; type: "property" | "block" }> = [];
    properties?.forEach((p) =>
      locs.push({ id: p.id, name: formatPropertyLocationLabel(p), type: "property" }),
    );
    blocks?.forEach((b) => locs.push({ id: b.id, name: formatBlockLocationLabel(b), type: "block" }));
    return locs;
  }, [properties, blocks]);

  // Distinct "Specific location" values from assets (room/area text — not property addresses)
  const specificLocationOptions = useMemo(() => {
    if (!assets?.length) return [];
    const seen = new Set<string>();
    for (const a of assets) {
      const t = a.location?.trim();
      if (t) seen.add(t);
    }
    return Array.from(seen).sort((a, b) => a.localeCompare(b));
  }, [assets]);

  if (isLoading) {
    return <div className="container mx-auto p-4 md:p-6">Loading...</div>;
  }

  return (
    <div className="container mx-auto p-4 md:p-6 space-y-4 md:space-y-6">
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
        <div className="min-w-0 flex-1">
          <h1 className="text-xl md:text-2xl lg:text-3xl font-bold">
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
                            {formatPropertyLocationLabel(property)}
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
                            {formatBlockLocationLabel(block)}
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
                    <LocaleDateInput
                      id="datePurchased"
                      value={formData.datePurchased}
                      onChange={(ymd) =>
                        setFormData({
                          ...formData,
                          datePurchased: ymd ? (new Date(`${ymd}T12:00:00`) as any) : undefined,
                        })
                      }
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
                      placeholder="0.00"
                      data-testid="input-depreciation"
                      readOnly
                    />
                  </div>

                  <div>
                    <Label htmlFor="currentValue">Current Value ({locale.currencySymbol})</Label>
                    <Input
                      id="currentValue"
                      type="number"
                      step="0.01"
                      value={formData.currentValue?.toString() || ""}
                      placeholder="0.00"
                      data-testid="input-current-value"
                      readOnly
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
                    <LocaleDateInput
                      id="warrantyExpiryDate"
                      value={formData.warrantyExpiryDate}
                      onChange={(ymd) =>
                        setFormData({
                          ...formData,
                          warrantyExpiryDate: ymd ? (new Date(`${ymd}T12:00:00`) as any) : undefined,
                        })
                      }
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
                    <LocaleDateInput
                      id="lastMaintenanceDate"
                      value={formData.lastMaintenanceDate}
                      onChange={(ymd) =>
                        setFormData({
                          ...formData,
                          lastMaintenanceDate: ymd ? (new Date(`${ymd}T12:00:00`) as any) : undefined,
                        })
                      }
                      data-testid="input-last-maintenance"
                    />
                  </div>

                  <div>
                    <Label htmlFor="nextMaintenanceDate">Next Maintenance Date</Label>
                    <LocaleDateInput
                      id="nextMaintenanceDate"
                      value={formData.nextMaintenanceDate}
                      onChange={(ymd) =>
                        setFormData({
                          ...formData,
                          nextMaintenanceDate: ymd ? (new Date(`${ymd}T12:00:00`) as any) : undefined,
                        })
                      }
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
                <h3 className="font-semibold text-lg">Photos & Documents</h3>
                {uploadedPhotos.length > 0 && (
                  <div className="grid grid-cols-4 gap-2">
                    {uploadedPhotos.map((url, index) => (
                      <div key={index} className="relative">
                        {(() => {
                          const resolvedUrl = normalizePhotoUrl(url) || url;
                          if (isAssetDocumentPreviewUrl(url)) {
                            return renderDocumentCard(url);
                          }
                          return (
                            <img
                              src={resolvedUrl}
                              alt={`Asset file ${index + 1}`}
                              className="w-full h-24 object-cover rounded"
                            />
                          );
                        })()}
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
                <ModernFilePickerInline
                  onFilesSelected={handlePhotoFilesSelected}
                  maxFiles={10}
                  maxFileSize={10 * 1024 * 1024}
                  accept="image/*,.pdf,application/pdf"
                  multiple={true}
                  isUploading={isUploadingPhotos}
                  uploadProgress={photoUploadProgress}
                  height={300}
                />
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

      {/* Filters - Desktop */}
      <div className="hidden md:flex gap-4 items-center flex-wrap">
        <div className="relative flex-1 min-w-[300px]">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Search by asset, description, location, property name, or block name..."
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

        <Select value={filterPropertyBlock} onValueChange={setFilterPropertyBlock}>
          <SelectTrigger className="w-[min(100%,220px)] min-w-[180px]" data-testid="select-filter-property-block">
            <SelectValue placeholder="All properties & blocks" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All properties & blocks</SelectItem>
            {propertyBlockOptions.map((loc) => (
              <SelectItem key={loc.id} value={loc.id}>
                {loc.type === "property" ? <Home className="w-3 h-3 inline mr-1" /> : <Building2 className="w-3 h-3 inline mr-1" />}
                {loc.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={filterSpecificLocation} onValueChange={setFilterSpecificLocation}>
          <SelectTrigger className="w-[min(100%,200px)] min-w-[160px]" data-testid="select-filter-specific-location">
            <SelectValue placeholder="All specific locations" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All specific locations</SelectItem>
            {specificLocationOptions.map((locText) => (
              <SelectItem key={locText} value={locText}>
                <MapPin className="w-3 h-3 inline mr-1" />
                {locText}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Filters - Mobile */}
      <div className="flex md:hidden gap-2 items-center mb-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Search assets, property, or block..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-9"
            data-testid="input-search-assets-mobile"
          />
        </div>
        <Sheet>
          <SheetTrigger asChild>
            <Button variant="outline" size="icon" className="shrink-0">
              <Filter className="w-4 h-4" />
              {(filterCategory !== "all" || filterCondition !== "all" || filterPropertyBlock !== "all" || filterSpecificLocation !== "all") && (
                <span className="absolute -top-1 -right-1 w-2 h-2 bg-primary rounded-full" />
              )}
            </Button>
          </SheetTrigger>
          <SheetContent side="bottom" className="h-[85vh] overflow-y-auto">
            <SheetHeader>
              <SheetTitle>Filters</SheetTitle>
              <SheetDescription>
                Filter by category, condition, property/block, or specific on-site location
              </SheetDescription>
            </SheetHeader>
            <div className="space-y-4 mt-6">
              <div className="space-y-2">
                <label className="text-sm font-medium">Category</label>
                <Select value={filterCategory} onValueChange={setFilterCategory}>
                  <SelectTrigger>
                    <SelectValue placeholder="All Categories" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Categories</SelectItem>
                    {assetCategories.map((cat) => (
                      <SelectItem key={cat} value={cat}>{cat}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">Condition</label>
                <Select value={filterCondition} onValueChange={setFilterCondition}>
                  <SelectTrigger>
                    <SelectValue placeholder="All Conditions" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Conditions</SelectItem>
                    {Object.entries(conditionLabels).map(([value, label]) => (
                      <SelectItem key={value} value={value}>{label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">Property or block</label>
                <Select value={filterPropertyBlock} onValueChange={setFilterPropertyBlock}>
                  <SelectTrigger>
                    <SelectValue placeholder="All properties & blocks" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All properties & blocks</SelectItem>
                    {propertyBlockOptions.map((loc) => (
                      <SelectItem key={loc.id} value={loc.id}>
                        {loc.type === "property" ? <Home className="w-3 h-3 inline mr-1" /> : <Building2 className="w-3 h-3 inline mr-1" />}
                        {loc.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">Specific location</label>
                <p className="text-xs text-muted-foreground">Room or area text saved on each asset (not the property address)</p>
                <Select value={filterSpecificLocation} onValueChange={setFilterSpecificLocation}>
                  <SelectTrigger>
                    <SelectValue placeholder="All specific locations" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All specific locations</SelectItem>
                    {specificLocationOptions.map((locText) => (
                      <SelectItem key={locText} value={locText}>
                        <MapPin className="w-3 h-3 inline mr-1" />
                        {locText}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {(filterCategory !== "all" || filterCondition !== "all" || filterPropertyBlock !== "all" || filterSpecificLocation !== "all") && (
                <Button 
                  variant="outline" 
                  className="w-full"
                  onClick={() => {
                    setFilterCategory("all");
                    setFilterCondition("all");
                    setFilterPropertyBlock("all");
                    setFilterSpecificLocation("all");
                  }}
                >
                  <X className="w-4 h-4 mr-2" />
                  Clear All Filters
                </Button>
              )}
            </div>
          </SheetContent>
        </Sheet>
      </div>

      {/* Assets Grid */}
      {!filteredAssets || filteredAssets.length === 0 ? (
        <Card>
          <CardContent className="p-12 text-center">
            <Package className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
            <h3 className="text-lg font-semibold mb-2">
              {searchTerm || filterCategory !== "all" || filterCondition !== "all" || filterPropertyBlock !== "all" || filterSpecificLocation !== "all" ? "No Assets Found" : "No Assets Yet"}
            </h3>
            <p className="text-muted-foreground mb-4">
              {searchTerm || filterCategory !== "all" || filterCondition !== "all" || filterPropertyBlock !== "all" || filterSpecificLocation !== "all"
                ? "Try adjusting your search or filters"
                : "Get started by adding your first asset"}
            </p>
            {!searchTerm && filterCategory === "all" && filterCondition === "all" && filterPropertyBlock === "all" && filterSpecificLocation === "all" && (
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
                      {isAssetDocumentPreviewUrl(asset.photos[0]) ? (
                        renderDocumentCard(firstPhoto, false)
                      ) : (
                        <img
                          src={firstPhoto}
                          alt={asset.name}
                          className="w-full h-full object-cover"
                        />
                      )}
                      {asset.photos.length > 1 && (
                        <Badge className="absolute top-2 right-2 text-xs">
                          +{asset.photos.length - 1} more
                        </Badge>
                      )}
                    </div>
                  ) : null;
                })()}

                <div className="space-y-2 text-sm">
                  {(asset.propertyId || asset.blockId) && (
                    <div className="flex items-center gap-2 text-muted-foreground">
                      {asset.propertyId ? (
                        <Home className="w-4 h-4 shrink-0" />
                      ) : (
                        <Building2 className="w-4 h-4 shrink-0" />
                      )}
                      <span className="truncate">
                        {asset.propertyId
                          ? (() => {
                              const p = properties?.find((x) => x.id === asset.propertyId);
                              return p
                                ? formatPropertyLocationLabel(p)
                                : "Property";
                            })()
                          : (() => {
                              const b = blocks?.find((x) => x.id === asset.blockId);
                              return b ? formatBlockLocationLabel(b) : "Block";
                            })()}
                      </span>
                    </div>
                  )}

                  {asset.location && (
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <MapPin className="w-4 h-4 shrink-0" />
                      <span className="truncate">{asset.location}</span>
                    </div>
                  )}

                  {asset.purchasePrice && (
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <span className="w-4 h-4 shrink-0 flex items-center justify-center font-semibold">£</span>
                      <span>Purchase: {locale.formatCurrency(parseFloat(asset.purchasePrice.toString()), false)}</span>
                    </div>
                  )}

                  {asset.datePurchased && (
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <Calendar className="w-4 h-4 shrink-0" />
                      <span>Purchased: {locale.formatDate(new Date(asset.datePurchased), "PPP")}</span>
                    </div>
                  )}

                  {asset.lastMaintenanceDate && (
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <Wrench className="w-4 h-4 shrink-0" />
                      <span>Last Maintained: {locale.formatDate(new Date(asset.lastMaintenanceDate), "PPP")}</span>
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
