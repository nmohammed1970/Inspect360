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
  ClipboardCheck, 
  ArrowLeft, 
  Calendar,
  Filter,
  Loader2,
  X
} from "lucide-react";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Link } from "wouter";
import { format } from "date-fns";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";

export default function InspectionsReport() {
  const { toast } = useToast();
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [filterType, setFilterType] = useState<string>("all");
  const [filterProperty, setFilterProperty] = useState<string>("all");
  const [filterBlock, setFilterBlock] = useState<string>("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [isExporting, setIsExporting] = useState(false);

  const { data: inspections = [], isLoading: inspectionsLoading } = useQuery<any[]>({
    queryKey: ["/api/inspections/my"],
  });

  const { data: properties = [] } = useQuery<any[]>({
    queryKey: ["/api/properties"],
  });

  const { data: blocks = [] } = useQuery<any[]>({
    queryKey: ["/api/blocks"],
  });

  // Filter inspections
  const filteredInspections = useMemo(() => {
    let filtered = inspections;

    if (filterStatus !== "all") {
      filtered = filtered.filter(i => i.status === filterStatus);
    }

    if (filterType !== "all") {
      filtered = filtered.filter(i => i.type === filterType);
    }

    if (filterProperty !== "all") {
      filtered = filtered.filter(i => i.propertyId === filterProperty);
    }

    if (filterBlock !== "all") {
      const blockProperties = properties.filter(p => p.blockId === filterBlock);
      const blockPropertyIds = blockProperties.map(p => p.id);
      filtered = filtered.filter(i => blockPropertyIds.includes(i.propertyId));
    }

    if (dateFrom) {
      filtered = filtered.filter(i => {
        const inspectionDate = new Date(i.scheduledDate || i.createdAt);
        return inspectionDate >= new Date(dateFrom);
      });
    }

    if (dateTo) {
      filtered = filtered.filter(i => {
        const inspectionDate = new Date(i.scheduledDate || i.createdAt);
        return inspectionDate <= new Date(dateTo);
      });
    }

    return filtered.sort((a, b) => {
      const dateA = new Date(a.scheduledDate || a.createdAt);
      const dateB = new Date(b.scheduledDate || b.createdAt);
      return dateB.getTime() - dateA.getTime();
    });
  }, [inspections, filterStatus, filterType, filterProperty, filterBlock, dateFrom, dateTo, properties]);

  const handleExportPDF = async () => {
    setIsExporting(true);
    try {
      const filters = {
        status: filterStatus,
        type: filterType,
        propertyId: filterProperty,
        blockId: filterBlock,
        dateFrom,
        dateTo,
      };

      const response = await apiRequest("POST", "/api/reports/inspections/pdf", filters);
      
      // Create blob from response and download
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `inspections-report-${format(new Date(), 'yyyy-MM-dd')}.pdf`;
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

  const getStatusBadge = (status: string) => {
    const statusMap: Record<string, { variant: any; label: string }> = {
      scheduled: { variant: "secondary", label: "Scheduled" },
      in_progress: { variant: "default", label: "In Progress" },
      completed: { variant: "default", label: "Completed" },
      cancelled: { variant: "destructive", label: "Cancelled" },
    };

    const config = statusMap[status] || { variant: "secondary", label: status };
    return <Badge variant={config.variant}>{config.label}</Badge>;
  };

  return (
    <div className="container mx-auto p-4 sm:p-6 md:p-8 lg:p-12 space-y-4 sm:space-y-6 md:space-y-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
        <div className="space-y-2">
          <Link href="/reports">
            <Button variant="ghost" className="mb-2" size="sm" data-testid="button-back-reports">
              <ArrowLeft className="mr-2 h-4 w-4" />
              <span className="hidden sm:inline">Back to Reports</span>
              <span className="sm:hidden">Back</span>
            </Button>
          </Link>
          <div className="flex items-center gap-2 sm:gap-3">
            <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-xl bg-primary/10 flex items-center justify-center flex-shrink-0">
              <ClipboardCheck className="h-5 w-5 sm:h-6 sm:w-6 text-primary" />
            </div>
            <div>
              <h1 className="text-2xl sm:text-3xl md:text-4xl lg:text-5xl font-bold tracking-tight">Inspections Report</h1>
              <p className="text-sm sm:text-base md:text-lg text-muted-foreground mt-1">
                Comprehensive inspection history and analytics
              </p>
            </div>
          </div>
        </div>
        <Button
          onClick={handleExportPDF}
          disabled={isExporting || filteredInspections.length === 0}
          size="sm"
          className="sm:size-lg self-start sm:self-auto"
          data-testid="button-export-pdf"
        >
          {isExporting ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 sm:h-5 sm:w-5 animate-spin" />
              <span className="hidden sm:inline">Exporting...</span>
              <span className="sm:hidden">Exporting</span>
            </>
          ) : (
            <>
              <FileDown className="mr-2 h-4 w-4 sm:h-5 sm:w-5" />
              <span className="hidden sm:inline">Export PDF</span>
              <span className="sm:hidden">Export</span>
            </>
          )}
        </Button>
      </div>

      {/* Filters - Desktop */}
      <Card className="glass-card hidden md:block">
        <CardHeader>
          <div className="flex items-center gap-2">
            <Filter className="h-5 w-5 text-primary" />
            <CardTitle>Filters</CardTitle>
          </div>
          <CardDescription>Customize your report by applying filters</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            <div className="space-y-2">
              <Label>Status</Label>
              <Select value={filterStatus} onValueChange={setFilterStatus}>
                <SelectTrigger data-testid="select-filter-status">
                  <SelectValue placeholder="All statuses" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Statuses</SelectItem>
                  <SelectItem value="scheduled">Scheduled</SelectItem>
                  <SelectItem value="in_progress">In Progress</SelectItem>
                  <SelectItem value="completed">Completed</SelectItem>
                  <SelectItem value="cancelled">Cancelled</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Type</Label>
              <Select value={filterType} onValueChange={setFilterType}>
                <SelectTrigger data-testid="select-filter-type">
                  <SelectValue placeholder="All types" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Types</SelectItem>
                  <SelectItem value="check-in">Check-In</SelectItem>
                  <SelectItem value="check-out">Check-Out</SelectItem>
                  <SelectItem value="periodic">Periodic</SelectItem>
                  <SelectItem value="maintenance">Maintenance</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Block</Label>
              <Select value={filterBlock} onValueChange={setFilterBlock}>
                <SelectTrigger data-testid="select-filter-block">
                  <SelectValue placeholder="All blocks" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Blocks</SelectItem>
                  {blocks.map((block: any) => (
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
                <SelectTrigger data-testid="select-filter-property">
                  <SelectValue placeholder="All properties" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Properties</SelectItem>
                  {properties.map((property: any) => (
                    <SelectItem key={property.id} value={property.id}>
                      {property.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Date From</Label>
              <Input
                type="date"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
                data-testid="input-date-from"
              />
            </div>

            <div className="space-y-2">
              <Label>Date To</Label>
              <Input
                type="date"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
                data-testid="input-date-to"
              />
            </div>
          </div>

          {(filterStatus !== "all" || filterType !== "all" || filterProperty !== "all" || filterBlock !== "all" || dateFrom || dateTo) && (
            <Button
              variant="outline"
              className="mt-4"
              onClick={() => {
                setFilterStatus("all");
                setFilterType("all");
                setFilterProperty("all");
                setFilterBlock("all");
                setDateFrom("");
                setDateTo("");
              }}
              data-testid="button-clear-filters"
            >
              <X className="w-4 h-4 mr-2" />
              Clear All Filters
            </Button>
          )}
        </CardContent>
      </Card>

      {/* Filters - Mobile */}
      <div className="flex md:hidden gap-2 items-center mb-4">
        <Sheet>
          <SheetTrigger asChild>
            <Button variant="outline" size="icon" className="shrink-0">
              <Filter className="w-4 h-4" />
              {(filterStatus !== "all" || filterType !== "all" || filterProperty !== "all" || filterBlock !== "all" || dateFrom || dateTo) && (
                <span className="absolute -top-1 -right-1 w-2 h-2 bg-primary rounded-full" />
              )}
            </Button>
          </SheetTrigger>
          <SheetContent side="bottom" className="h-[85vh] overflow-y-auto">
            <SheetHeader>
              <SheetTitle>Filters</SheetTitle>
              <SheetDescription>
                Customize your report by applying filters
              </SheetDescription>
            </SheetHeader>
            <div className="space-y-4 mt-6">
              <div className="space-y-2">
                <Label>Status</Label>
                <Select value={filterStatus} onValueChange={setFilterStatus}>
                  <SelectTrigger>
                    <SelectValue placeholder="All statuses" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Statuses</SelectItem>
                    <SelectItem value="scheduled">Scheduled</SelectItem>
                    <SelectItem value="in_progress">In Progress</SelectItem>
                    <SelectItem value="completed">Completed</SelectItem>
                    <SelectItem value="cancelled">Cancelled</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Type</Label>
                <Select value={filterType} onValueChange={setFilterType}>
                  <SelectTrigger>
                    <SelectValue placeholder="All types" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Types</SelectItem>
                    <SelectItem value="check-in">Check-In</SelectItem>
                    <SelectItem value="check-out">Check-Out</SelectItem>
                    <SelectItem value="periodic">Periodic</SelectItem>
                    <SelectItem value="maintenance">Maintenance</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Block</Label>
                <Select value={filterBlock} onValueChange={setFilterBlock}>
                  <SelectTrigger>
                    <SelectValue placeholder="All blocks" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Blocks</SelectItem>
                    {blocks.map((block: any) => (
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
                    {properties.map((property: any) => (
                      <SelectItem key={property.id} value={property.id}>
                        {property.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Date From</Label>
                <Input
                  type="date"
                  value={dateFrom}
                  onChange={(e) => setDateFrom(e.target.value)}
                />
              </div>

              <div className="space-y-2">
                <Label>Date To</Label>
                <Input
                  type="date"
                  value={dateTo}
                  onChange={(e) => setDateTo(e.target.value)}
                />
              </div>

              {(filterStatus !== "all" || filterType !== "all" || filterProperty !== "all" || filterBlock !== "all" || dateFrom || dateTo) && (
                <Button
                  variant="outline"
                  className="w-full"
                  onClick={() => {
                    setFilterStatus("all");
                    setFilterType("all");
                    setFilterProperty("all");
                    setFilterBlock("all");
                    setDateFrom("");
                    setDateTo("");
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

      {/* Summary Statistics */}
      <div className="grid gap-3 sm:gap-4 grid-cols-2 md:grid-cols-4">
        <Card>
          <CardHeader className="pb-2 sm:pb-3">
            <CardDescription className="text-xs sm:text-sm">Total Inspections</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-xl sm:text-2xl font-bold">{filteredInspections.length}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2 sm:pb-3">
            <CardDescription className="text-xs sm:text-sm">Completed</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-xl sm:text-2xl font-bold">
              {filteredInspections.filter(i => i.status === "completed").length}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2 sm:pb-3">
            <CardDescription className="text-xs sm:text-sm">In Progress</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-xl sm:text-2xl font-bold">
              {filteredInspections.filter(i => i.status === "in_progress").length}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2 sm:pb-3">
            <CardDescription className="text-xs sm:text-sm">Scheduled</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-xl sm:text-2xl font-bold">
              {filteredInspections.filter(i => i.status === "scheduled").length}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Inspections Table */}
      <Card className="glass-card">
        <CardHeader>
          <CardTitle>Inspection Records</CardTitle>
          <CardDescription>
            Showing {filteredInspections.length} inspection{filteredInspections.length !== 1 ? 's' : ''}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {inspectionsLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
          ) : filteredInspections.length === 0 ? (
            <div className="text-center py-12">
              <ClipboardCheck className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
              <p className="text-muted-foreground">No inspections found matching your filters</p>
            </div>
          ) : (
            <div className="overflow-x-auto -mx-4 sm:mx-0">
              <div className="inline-block min-w-full align-middle px-4 sm:px-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="min-w-[100px]">Date</TableHead>
                      <TableHead className="min-w-[150px]">Property</TableHead>
                      <TableHead className="min-w-[100px] hidden sm:table-cell">Type</TableHead>
                      <TableHead className="min-w-[120px] hidden md:table-cell">Inspector</TableHead>
                      <TableHead className="min-w-[100px]">Status</TableHead>
                      <TableHead className="text-right min-w-[80px]">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredInspections.map((inspection: any) => {
                      const property = properties.find(p => p.id === inspection.propertyId);
                      const inspectionDate = new Date(inspection.scheduledDate || inspection.createdAt);
                      
                      return (
                        <TableRow key={inspection.id}>
                          <TableCell className="whitespace-nowrap">
                            <div className="flex items-center gap-2">
                              <Calendar className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                              <span className="text-sm">{format(inspectionDate, 'MMM d, yyyy')}</span>
                            </div>
                          </TableCell>
                          <TableCell className="font-medium min-w-[150px]">
                            {property ? (
                              <Link href={`/properties/${property.id}`}>
                                <span className="text-primary hover:underline cursor-pointer text-sm" data-testid={`link-property-${inspection.id}`}>
                                  {property.name || property.address || "View Property"}
                                </span>
                              </Link>
                            ) : (
                              <span className="text-sm">Unknown Property</span>
                            )}
                          </TableCell>
                          <TableCell className="capitalize hidden sm:table-cell">
                            <span className="text-sm">{inspection.type?.replace('-', ' ') || "N/A"}</span>
                          </TableCell>
                          <TableCell className="hidden md:table-cell">
                            <span className="text-sm">{inspection.inspector || "Unassigned"}</span>
                          </TableCell>
                          <TableCell>
                            {getStatusBadge(inspection.status)}
                          </TableCell>
                          <TableCell className="text-right">
                            <Link href={`/inspections/${inspection.id}`}>
                              <Button variant="ghost" size="sm" className="h-8">
                                <span className="hidden sm:inline">View</span>
                                <span className="sm:hidden">→</span>
                              </Button>
                            </Link>
                          </TableCell>
                        </TableRow>
                      );
                    })}
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
