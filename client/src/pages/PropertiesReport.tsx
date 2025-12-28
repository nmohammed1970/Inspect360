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
  Home, 
  ArrowLeft, 
  Filter,
  Loader2,
  Building2,
  X
} from "lucide-react";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Link } from "wouter";
import { format } from "date-fns";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";

export default function PropertiesReport() {
  const { toast } = useToast();
  const [filterBlock, setFilterBlock] = useState<string>("all");
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [searchTerm, setSearchTerm] = useState("");
  const [isExporting, setIsExporting] = useState(false);

  const { data: properties = [], isLoading: propertiesLoading } = useQuery<any[]>({
    queryKey: ["/api/properties"],
  });

  const { data: blocks = [], isLoading: blocksLoading } = useQuery<any[]>({
    queryKey: ["/api/blocks"],
  });

  const { data: inspections = [], isLoading: inspectionsLoading } = useQuery<any[]>({
    queryKey: ["/api/inspections"],
  });

  const { data: tenantAssignments = [], isLoading: tenantAssignmentsLoading } = useQuery<any[]>({
    queryKey: ["/api/tenant-assignments"],
  });

  const { data: maintenanceRequests = [], isLoading: maintenanceLoading } = useQuery<any[]>({
    queryKey: ["/api/maintenance"],
  });

  const isLoading = propertiesLoading || blocksLoading || inspectionsLoading || tenantAssignmentsLoading || maintenanceLoading;

  // Calculate statistics for each property
  const propertiesWithStats = useMemo(() => {
    return properties.map(property => {
      const propertyInspections = inspections.filter(i => i.propertyId === property.id);
      const latestInspection = propertyInspections.sort((a, b) => 
        new Date(b.scheduledDate || b.createdAt).getTime() - 
        new Date(a.scheduledDate || a.createdAt).getTime()
      )[0];

      const tenantAssignment = tenantAssignments.find(
        t => t.propertyId === property.id && t.status === "active"
      );

      const propertyMaintenance = maintenanceRequests.filter(
        m => m.propertyId === property.id
      );
      const openMaintenance = propertyMaintenance.filter(
        m => m.status === "open" || m.status === "in_progress"
      ).length;

      return {
        ...property,
        block: blocks.find(b => b.id === property.blockId),
        totalInspections: propertyInspections.length,
        lastInspection: latestInspection,
        isOccupied: !!tenantAssignment,
        tenant: tenantAssignment,
        openMaintenanceCount: openMaintenance,
        totalMaintenanceCount: propertyMaintenance.length,
      };
    });
  }, [properties, blocks, inspections, tenantAssignments, maintenanceRequests]);

  // Filter properties
  const filteredProperties = useMemo(() => {
    let filtered = propertiesWithStats;

    if (filterBlock !== "all") {
      filtered = filtered.filter(p => p.blockId === filterBlock);
    }

    if (filterStatus !== "all") {
      if (filterStatus === "occupied") {
        filtered = filtered.filter(p => p.isOccupied);
      } else if (filterStatus === "vacant") {
        filtered = filtered.filter(p => !p.isOccupied);
      }
    }

    if (searchTerm) {
      const searchLower = searchTerm.toLowerCase();
      filtered = filtered.filter(p => 
        p.address?.toLowerCase().includes(searchLower) ||
        p.unitNumber?.toLowerCase().includes(searchLower) ||
        p.block?.name?.toLowerCase().includes(searchLower)
      );
    }

    return filtered.sort((a, b) => {
      // Sort by block name, then unit number
      const blockCompare = (a.block?.name || "").localeCompare(b.block?.name || "");
      if (blockCompare !== 0) return blockCompare;
      return (a.unitNumber || "").localeCompare(b.unitNumber || "");
    });
  }, [propertiesWithStats, filterBlock, filterStatus, searchTerm]);

  // Summary statistics
  const totalProperties = filteredProperties.length;
  const occupiedProperties = filteredProperties.filter(p => p.isOccupied).length;
  const vacantProperties = filteredProperties.filter(p => !p.isOccupied).length;
  const totalOpenMaintenance = filteredProperties.reduce((sum, p) => sum + p.openMaintenanceCount, 0);

  const handleExportPDF = async () => {
    setIsExporting(true);
    try {
      const filters = {
        blockId: filterBlock,
        status: filterStatus,
        searchTerm,
      };

      const response = await apiRequest("POST", "/api/reports/properties/pdf", filters);
      
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `properties-report-${format(new Date(), 'yyyy-MM-dd')}.pdf`;
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
              <Home className="h-6 w-6 sm:h-8 sm:w-8 text-primary flex-shrink-0" />
              <span>Properties Report</span>
            </h1>
            <p className="text-xs sm:text-sm md:text-base text-muted-foreground mt-1">
              Property portfolio overview with maintenance and inspection data
            </p>
          </div>
        </div>
        <Button 
          onClick={handleExportPDF} 
          disabled={isExporting || filteredProperties.length === 0}
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
            <CardDescription className="text-xs sm:text-sm">Total Properties</CardDescription>
            <CardTitle className="text-xl sm:text-2xl md:text-3xl" data-testid="stat-total-properties">{totalProperties}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="text-xs sm:text-sm">Occupied</CardDescription>
            <CardTitle className="text-xl sm:text-2xl md:text-3xl text-green-600" data-testid="stat-occupied">{occupiedProperties}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="text-xs sm:text-sm">Vacant</CardDescription>
            <CardTitle className="text-xl sm:text-2xl md:text-3xl text-orange-600" data-testid="stat-vacant">{vacantProperties}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="text-xs sm:text-sm">Open Maintenance</CardDescription>
            <CardTitle className="text-xl sm:text-2xl md:text-3xl text-destructive" data-testid="stat-open-maintenance">{totalOpenMaintenance}</CardTitle>
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
          <div className="grid gap-4 md:grid-cols-3">
            <div className="space-y-2">
              <Label>Search</Label>
              <Input
                placeholder="Search address or unit..."
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
              <Label>Occupancy Status</Label>
              <Select value={filterStatus} onValueChange={setFilterStatus}>
                <SelectTrigger data-testid="select-status">
                  <SelectValue placeholder="All" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All</SelectItem>
                  <SelectItem value="occupied">Occupied</SelectItem>
                  <SelectItem value="vacant">Vacant</SelectItem>
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
            placeholder="Search..."
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
              {(filterBlock !== "all" || filterStatus !== "all") && (
                <span className="absolute -top-1 -right-1 w-2 h-2 bg-primary rounded-full" />
              )}
            </Button>
          </SheetTrigger>
          <SheetContent side="bottom" className="h-[85vh] overflow-y-auto">
            <SheetHeader>
              <SheetTitle>Filters</SheetTitle>
              <SheetDescription>
                Filter properties by block or occupancy status
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
                <Label>Occupancy Status</Label>
                <Select value={filterStatus} onValueChange={setFilterStatus}>
                  <SelectTrigger>
                    <SelectValue placeholder="All" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All</SelectItem>
                    <SelectItem value="occupied">Occupied</SelectItem>
                    <SelectItem value="vacant">Vacant</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {(filterBlock !== "all" || filterStatus !== "all") && (
                <Button 
                  variant="outline" 
                  className="w-full"
                  onClick={() => {
                    setFilterBlock("all");
                    setFilterStatus("all");
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

      {/* Properties Table */}
      <Card>
        <CardHeader>
          <CardTitle>Properties ({filteredProperties.length})</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
          ) : filteredProperties.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground" data-testid="text-no-properties">
              No properties found matching your criteria
            </div>
          ) : (
            <div className="border rounded-lg overflow-x-auto -mx-4 sm:mx-0">
              <div className="inline-block min-w-full align-middle px-4 sm:px-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="min-w-[120px]">Block</TableHead>
                      <TableHead className="min-w-[100px]">Unit</TableHead>
                      <TableHead className="min-w-[150px] hidden sm:table-cell">Address</TableHead>
                      <TableHead className="min-w-[90px]">Status</TableHead>
                      <TableHead className="min-w-[120px] hidden md:table-cell">Tenant</TableHead>
                      <TableHead className="min-w-[100px] hidden lg:table-cell">Inspections</TableHead>
                      <TableHead className="min-w-[110px] hidden lg:table-cell">Maintenance</TableHead>
                      <TableHead className="min-w-[120px] hidden xl:table-cell">Last Inspection</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredProperties.map((property) => (
                      <TableRow key={property.id} data-testid={`row-property-${property.id}`}>
                        <TableCell className="font-medium" data-testid={`text-block-${property.id}`}>
                          {property.block ? (
                            <Link href={`/blocks/${property.block.id}`}>
                              <div className="flex items-center gap-2 text-primary hover:underline cursor-pointer" data-testid={`link-block-${property.id}`}>
                                <Building2 className="h-4 w-4 flex-shrink-0" />
                                <span className="text-sm">{property.block.name}</span>
                              </div>
                            </Link>
                          ) : (
                            <div className="flex items-center gap-2 text-muted-foreground">
                              <Building2 className="h-4 w-4 flex-shrink-0" />
                              <span className="text-sm">N/A</span>
                            </div>
                          )}
                        </TableCell>
                        <TableCell data-testid={`text-unit-${property.id}`}>
                          <Link href={`/properties/${property.id}`}>
                            <span className="text-primary hover:underline cursor-pointer text-sm" data-testid={`link-property-${property.id}`}>
                              {property.unitNumber || property.address || "View"}
                            </span>
                          </Link>
                        </TableCell>
                        <TableCell className="max-w-xs truncate hidden sm:table-cell" data-testid={`text-address-${property.id}`}>
                          <span className="text-sm">{property.address}</span>
                        </TableCell>
                        <TableCell data-testid={`badge-status-${property.id}`}>
                          <Badge variant={property.isOccupied ? "default" : "secondary"} className="text-xs">
                            {property.isOccupied ? "Occupied" : "Vacant"}
                          </Badge>
                        </TableCell>
                        <TableCell className="hidden md:table-cell" data-testid={`text-tenant-${property.id}`}>
                          {property.tenant ? (
                            <span className="text-sm">
                              {property.tenant.tenantFirstName} {property.tenant.tenantLastName}
                            </span>
                          ) : (
                            <span className="text-muted-foreground text-sm">-</span>
                          )}
                        </TableCell>
                        <TableCell className="hidden lg:table-cell" data-testid={`badge-inspections-${property.id}`}>
                          <Badge variant="outline" className="text-xs">
                            {property.totalInspections}
                          </Badge>
                        </TableCell>
                        <TableCell className="hidden lg:table-cell" data-testid={`badge-maintenance-${property.id}`}>
                          <div className="flex items-center gap-2">
                            <Badge variant={property.openMaintenanceCount > 0 ? "destructive" : "outline"} className="text-xs">
                              {property.openMaintenanceCount} open
                            </Badge>
                          </div>
                        </TableCell>
                        <TableCell className="hidden xl:table-cell" data-testid={`text-last-inspection-${property.id}`}>
                          {property.lastInspection ? (
                            <span className="text-sm">
                              {format(new Date(property.lastInspection.scheduledDate || property.lastInspection.createdAt), 'MMM d, yyyy')}
                            </span>
                          ) : (
                            <span className="text-muted-foreground text-sm">Never</span>
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
