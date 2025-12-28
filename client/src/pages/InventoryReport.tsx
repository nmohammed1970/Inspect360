import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { 
  FileDown, 
  Package, 
  ArrowLeft, 
  Filter,
  Loader2,
  Building2,
  Home,
  X
} from "lucide-react";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Link } from "wouter";
import { format } from "date-fns";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";

export default function InventoryReport() {
  const { toast } = useToast();
  const [filterBlock, setFilterBlock] = useState<string>("all");
  const [filterProperty, setFilterProperty] = useState<string>("all");
  const [filterCategory, setFilterCategory] = useState<string>("all");
  const [filterCondition, setFilterCondition] = useState<string>("all");
  const [searchTerm, setSearchTerm] = useState("");
  const [isExporting, setIsExporting] = useState(false);

  const { data: assetInventory = [], isLoading: inventoryLoading } = useQuery<any[]>({
    queryKey: ["/api/asset-inventory"],
  });

  const { data: properties = [], isLoading: propertiesLoading } = useQuery<any[]>({
    queryKey: ["/api/properties"],
  });

  const { data: blocks = [], isLoading: blocksLoading } = useQuery<any[]>({
    queryKey: ["/api/blocks"],
  });

  const isLoading = inventoryLoading || propertiesLoading || blocksLoading;

  // Enrich inventory data with property and block information
  const enrichedInventory = useMemo(() => {
    return assetInventory.map(asset => {
      const property = properties.find(p => p.id === asset.propertyId);
      const block = property ? blocks.find(b => b.id === property.blockId) : 
                    blocks.find(b => b.id === asset.blockId);

      return {
        ...asset,
        property,
        block,
      };
    });
  }, [assetInventory, properties, blocks]);

  // Get unique categories
  const categories = useMemo(() => {
    const cats = new Set<string>();
    enrichedInventory.forEach(item => {
      if (item.category) cats.add(item.category);
    });
    return Array.from(cats).sort();
  }, [enrichedInventory]);

  // Filter inventory
  const filteredInventory = useMemo(() => {
    let filtered = enrichedInventory;

    if (filterBlock !== "all") {
      filtered = filtered.filter(i => 
        i.blockId === filterBlock || i.property?.blockId === filterBlock
      );
    }

    if (filterProperty !== "all") {
      filtered = filtered.filter(i => i.propertyId === filterProperty);
    }

    if (filterCategory !== "all") {
      filtered = filtered.filter(i => i.category === filterCategory);
    }

    if (filterCondition !== "all") {
      filtered = filtered.filter(i => i.condition === filterCondition);
    }

    if (searchTerm) {
      const searchLower = searchTerm.toLowerCase();
      filtered = filtered.filter(i => 
        i.name?.toLowerCase().includes(searchLower) ||
        i.description?.toLowerCase().includes(searchLower) ||
        i.serialNumber?.toLowerCase().includes(searchLower) ||
        i.location?.toLowerCase().includes(searchLower)
      );
    }

    return filtered.sort((a, b) => {
      // Sort by block, then property, then category, then name
      const blockCompare = (a.block?.name || "").localeCompare(b.block?.name || "");
      if (blockCompare !== 0) return blockCompare;
      
      const propertyCompare = (a.property?.unitNumber || "").localeCompare(b.property?.unitNumber || "");
      if (propertyCompare !== 0) return propertyCompare;
      
      const categoryCompare = (a.category || "").localeCompare(b.category || "");
      if (categoryCompare !== 0) return categoryCompare;
      
      return (a.name || "").localeCompare(b.name || "");
    });
  }, [enrichedInventory, filterBlock, filterProperty, filterCategory, filterCondition, searchTerm]);

  // Summary statistics
  const totalAssets = filteredInventory.length;
  const blockAssets = filteredInventory.filter(i => i.blockId && !i.propertyId).length;
  const propertyAssets = filteredInventory.filter(i => i.propertyId).length;
  const damagedAssets = filteredInventory.filter(i => 
    i.condition === "poor" || i.condition === "damaged"
  ).length;

  const handleExportPDF = async () => {
    setIsExporting(true);
    try {
      const filters = {
        blockId: filterBlock,
        propertyId: filterProperty,
        category: filterCategory,
        condition: filterCondition,
        searchTerm,
      };

      const response = await apiRequest("POST", "/api/reports/inventory/pdf", filters);
      
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `inventory-report-${format(new Date(), 'yyyy-MM-dd')}.pdf`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);

      toast({
        title: "Report exported",
        description: "Your PDF report has been downloaded successfully",
      });
    } catch (error) {
      console.error("Export error:", error);
      toast({
        title: "Export failed",
        description: "Failed to generate PDF report. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <div className="container mx-auto p-4 sm:p-6 space-y-4 sm:space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-center gap-2 sm:gap-4">
          <Link href="/reports">
            <Button variant="ghost" size="icon" className="h-9 w-9 sm:h-10 sm:w-10" data-testid="button-back">
              <ArrowLeft className="h-4 w-4 sm:h-5 sm:w-5" />
            </Button>
          </Link>
          <div>
            <h1 className="text-xl sm:text-2xl md:text-3xl font-bold tracking-tight flex items-center gap-2">
              <Package className="h-6 w-6 sm:h-8 sm:w-8 text-primary flex-shrink-0" />
              <span>Inventory Report</span>
            </h1>
            <p className="text-xs sm:text-sm md:text-base text-muted-foreground mt-1">
              Asset tracking and inventory management across blocks and properties
            </p>
          </div>
        </div>
        <Button 
          onClick={handleExportPDF} 
          disabled={isExporting || filteredInventory.length === 0}
          size="sm"
          className="sm:size-default self-start sm:self-auto"
          data-testid="button-export-pdf"
        >
          {isExporting ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              <span className="hidden sm:inline">Generating...</span>
              <span className="sm:hidden">Exporting</span>
            </>
          ) : (
            <>
              <FileDown className="mr-2 h-4 w-4" />
              <span className="hidden sm:inline">Export PDF</span>
              <span className="sm:hidden">Export</span>
            </>
          )}
        </Button>
      </div>

      {/* Summary Statistics */}
      <div className="grid gap-3 sm:gap-4 grid-cols-2 md:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="text-xs sm:text-sm">Total Assets</CardDescription>
            <CardTitle className="text-xl sm:text-2xl md:text-3xl" data-testid="stat-total-assets">{totalAssets}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="text-xs sm:text-sm">Block Assets</CardDescription>
            <CardTitle className="text-xl sm:text-2xl md:text-3xl text-primary" data-testid="stat-block-assets">{blockAssets}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="text-xs sm:text-sm">Property Assets</CardDescription>
            <CardTitle className="text-xl sm:text-2xl md:text-3xl text-accent" data-testid="stat-property-assets">{propertyAssets}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="text-xs sm:text-sm">Needs Attention</CardDescription>
            <CardTitle className="text-xl sm:text-2xl md:text-3xl text-destructive" data-testid="stat-needs-attention">{damagedAssets}</CardTitle>
          </CardHeader>
        </Card>
      </div>

      {/* Filters - Desktop */}
      <Card className="hidden md:block">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Filter className="h-5 w-5" />
            Filters
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-5">
            <div className="space-y-2">
              <Label>Search</Label>
              <Input
                placeholder="Search assets..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                data-testid="input-search"
              />
            </div>

            <div className="space-y-2">
              <Label>Block</Label>
              <Select value={filterBlock} onValueChange={setFilterBlock}>
                <SelectTrigger data-testid="select-block">
                  <SelectValue placeholder="All blocks" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Blocks</SelectItem>
                  {blocks.map((block) => (
                    <SelectItem key={block.id} value={block.id}>
                      {block.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Property</Label>
              <Select value={filterProperty} onValueChange={setFilterProperty}>
                <SelectTrigger data-testid="select-property">
                  <SelectValue placeholder="All properties" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Properties</SelectItem>
                  {properties.map((property) => (
                    <SelectItem key={property.id} value={property.id}>
                      {property.unitNumber || property.address}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Category</Label>
              <Select value={filterCategory} onValueChange={setFilterCategory}>
                <SelectTrigger data-testid="select-category">
                  <SelectValue placeholder="All categories" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Categories</SelectItem>
                  {categories.map((category) => (
                    <SelectItem key={category} value={category}>
                      {category}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Condition</Label>
              <Select value={filterCondition} onValueChange={setFilterCondition}>
                <SelectTrigger data-testid="select-condition">
                  <SelectValue placeholder="All conditions" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All</SelectItem>
                  <SelectItem value="excellent">Excellent</SelectItem>
                  <SelectItem value="good">Good</SelectItem>
                  <SelectItem value="fair">Fair</SelectItem>
                  <SelectItem value="poor">Poor</SelectItem>
                  <SelectItem value="damaged">Damaged</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Filters - Mobile */}
      <div className="flex md:hidden gap-2 items-center mb-4">
        <div className="relative flex-1">
          <Input
            placeholder="Search assets..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full"
            data-testid="input-search-mobile"
          />
        </div>
        <Sheet>
          <SheetTrigger asChild>
            <Button variant="outline" size="icon" className="shrink-0">
              <Filter className="w-4 h-4" />
              {(filterBlock !== "all" || filterProperty !== "all" || filterCategory !== "all" || filterCondition !== "all") && (
                <span className="absolute -top-1 -right-1 w-2 h-2 bg-primary rounded-full" />
              )}
            </Button>
          </SheetTrigger>
          <SheetContent side="bottom" className="h-[85vh] overflow-y-auto">
            <SheetHeader>
              <SheetTitle>Filters</SheetTitle>
              <SheetDescription>
                Filter assets by block, property, category, or condition
              </SheetDescription>
            </SheetHeader>
            <div className="space-y-4 mt-6">
              <div className="space-y-2">
                <Label>Block</Label>
                <Select value={filterBlock} onValueChange={setFilterBlock}>
                  <SelectTrigger>
                    <SelectValue placeholder="All blocks" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Blocks</SelectItem>
                    {blocks.map((block) => (
                      <SelectItem key={block.id} value={block.id}>
                        {block.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Property</Label>
                <Select value={filterProperty} onValueChange={setFilterProperty}>
                  <SelectTrigger>
                    <SelectValue placeholder="All properties" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Properties</SelectItem>
                    {properties.map((property) => (
                      <SelectItem key={property.id} value={property.id}>
                        {property.unitNumber || property.address}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Category</Label>
                <Select value={filterCategory} onValueChange={setFilterCategory}>
                  <SelectTrigger>
                    <SelectValue placeholder="All categories" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Categories</SelectItem>
                    {categories.map((category) => (
                      <SelectItem key={category} value={category}>
                        {category}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Condition</Label>
                <Select value={filterCondition} onValueChange={setFilterCondition}>
                  <SelectTrigger>
                    <SelectValue placeholder="All conditions" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All</SelectItem>
                    <SelectItem value="excellent">Excellent</SelectItem>
                    <SelectItem value="good">Good</SelectItem>
                    <SelectItem value="fair">Fair</SelectItem>
                    <SelectItem value="poor">Poor</SelectItem>
                    <SelectItem value="damaged">Damaged</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {(filterBlock !== "all" || filterProperty !== "all" || filterCategory !== "all" || filterCondition !== "all") && (
                <Button 
                  variant="outline" 
                  className="w-full"
                  onClick={() => {
                    setFilterBlock("all");
                    setFilterProperty("all");
                    setFilterCategory("all");
                    setFilterCondition("all");
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

      {/* Inventory Table */}
      <Card>
        <CardHeader>
          <CardTitle>Asset Inventory ({filteredInventory.length})</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
          ) : filteredInventory.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground" data-testid="text-no-inventory">
              No inventory items found matching your criteria
            </div>
          ) : (
            <div className="border rounded-lg overflow-x-auto -mx-4 sm:mx-0">
              <div className="inline-block min-w-full align-middle px-4 sm:px-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="min-w-[150px]">Asset Name</TableHead>
                      <TableHead className="min-w-[100px] hidden sm:table-cell">Category</TableHead>
                      <TableHead className="min-w-[120px] hidden md:table-cell">Location</TableHead>
                      <TableHead className="min-w-[120px] hidden lg:table-cell">Block</TableHead>
                      <TableHead className="min-w-[120px] hidden lg:table-cell">Property</TableHead>
                      <TableHead className="min-w-[100px]">Condition</TableHead>
                      <TableHead className="min-w-[120px] hidden xl:table-cell">Serial Number</TableHead>
                      <TableHead className="min-w-[100px] hidden md:table-cell">Added</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredInventory.map((asset) => (
                      <TableRow key={asset.id} data-testid={`row-asset-${asset.id}`}>
                        <TableCell className="font-medium">
                          <div className="text-sm">{asset.name}</div>
                          <div className="text-xs text-muted-foreground sm:hidden mt-1">
                            {asset.category || "Uncategorized"}
                          </div>
                        </TableCell>
                        <TableCell className="hidden sm:table-cell">
                          <Badge variant="outline" className="text-xs">
                            {asset.category || "Uncategorized"}
                          </Badge>
                        </TableCell>
                        <TableCell className="hidden md:table-cell">
                          <span className="text-sm">{asset.location || "N/A"}</span>
                        </TableCell>
                        <TableCell className="hidden lg:table-cell">
                          {asset.block ? (
                            <Link href={`/blocks/${asset.block.id}`}>
                              <div className="flex items-center gap-2 text-primary hover:underline cursor-pointer" data-testid={`link-block-${asset.id}`}>
                                <Building2 className="h-4 w-4 flex-shrink-0" />
                                <span className="text-sm">{asset.block.name}</span>
                              </div>
                            </Link>
                          ) : (
                            <span className="text-muted-foreground text-sm">-</span>
                          )}
                        </TableCell>
                        <TableCell className="hidden lg:table-cell">
                          {asset.property ? (
                            <Link href={`/properties/${asset.property.id}`}>
                              <div className="flex items-center gap-2 text-primary hover:underline cursor-pointer" data-testid={`link-property-${asset.id}`}>
                                <Home className="h-4 w-4 flex-shrink-0" />
                                <span className="text-sm">{asset.property.unitNumber}</span>
                              </div>
                            </Link>
                          ) : (
                            <span className="text-muted-foreground text-sm">-</span>
                          )}
                        </TableCell>
                        <TableCell>
                          <Badge 
                            variant={
                              asset.condition === "excellent" || asset.condition === "good"
                                ? "default"
                                : asset.condition === "fair"
                                ? "secondary"
                                : "destructive"
                            }
                            className="text-xs"
                          >
                            {asset.condition || "Unknown"}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-sm font-mono hidden xl:table-cell">
                          {asset.serialNumber || "-"}
                        </TableCell>
                        <TableCell className="hidden md:table-cell">
                          {asset.createdAt ? (
                            <span className="text-sm">{format(new Date(asset.createdAt), 'MMM d, yyyy')}</span>
                          ) : (
                            <span className="text-muted-foreground text-sm">-</span>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
