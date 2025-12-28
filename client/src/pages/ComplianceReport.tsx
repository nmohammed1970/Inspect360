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
  ShieldCheck, 
  ArrowLeft, 
  Filter,
  Loader2,
  Building2,
  Home,
  Calendar,
  AlertTriangle,
  X
} from "lucide-react";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Link } from "wouter";
import { format, differenceInDays, isPast } from "date-fns";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";

export default function ComplianceReport() {
  const { toast } = useToast();
  const [filterBlock, setFilterBlock] = useState<string>("all");
  const [filterProperty, setFilterProperty] = useState<string>("all");
  const [filterType, setFilterType] = useState<string>("all");
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [searchTerm, setSearchTerm] = useState("");
  const [isExporting, setIsExporting] = useState(false);

  const { data: complianceDocuments = [], isLoading: documentsLoading } = useQuery<any[]>({
    queryKey: ["/api/compliance"],
  });

  const { data: properties = [], isLoading: propertiesLoading } = useQuery<any[]>({
    queryKey: ["/api/properties"],
  });

  const { data: blocks = [], isLoading: blocksLoading } = useQuery<any[]>({
    queryKey: ["/api/blocks"],
  });

  const isLoading = documentsLoading || propertiesLoading || blocksLoading;

  // Get unique document types
  const documentTypes = useMemo(() => {
    const types = new Set<string>();
    complianceDocuments.forEach(doc => {
      if (doc.documentType) types.add(doc.documentType);
    });
    return Array.from(types).sort();
  }, [complianceDocuments]);

  // Enrich documents with property and block information
  const enrichedDocuments = useMemo(() => {
    return complianceDocuments.map(doc => {
      const property = properties.find(p => p.id === doc.propertyId);
      const block = property ? blocks.find(b => b.id === property.blockId) : 
                    blocks.find(b => b.id === doc.blockId);

      let status = "current";
      let daysUntilExpiry = null;

      if (doc.expiryDate) {
        const expiryDate = new Date(doc.expiryDate);
        daysUntilExpiry = differenceInDays(expiryDate, new Date());
        
        if (isPast(expiryDate)) {
          status = "expired";
        } else if (daysUntilExpiry <= 30) {
          status = "expiring-soon";
        } else {
          status = "current";
        }
      }

      return {
        ...doc,
        property,
        block,
        status,
        daysUntilExpiry,
      };
    });
  }, [complianceDocuments, properties, blocks]);

  // Filter documents
  const filteredDocuments = useMemo(() => {
    let filtered = enrichedDocuments;

    if (filterBlock !== "all") {
      filtered = filtered.filter(d => 
        d.blockId === filterBlock || d.property?.blockId === filterBlock
      );
    }

    if (filterProperty !== "all") {
      filtered = filtered.filter(d => d.propertyId === filterProperty);
    }

    if (filterType !== "all") {
      filtered = filtered.filter(d => d.documentType === filterType);
    }

    if (filterStatus !== "all") {
      filtered = filtered.filter(d => d.status === filterStatus);
    }

    if (searchTerm) {
      const searchLower = searchTerm.toLowerCase();
      filtered = filtered.filter(d => 
        d.documentType?.toLowerCase().includes(searchLower) ||
        d.property?.address?.toLowerCase().includes(searchLower) ||
        d.property?.unitNumber?.toLowerCase().includes(searchLower) ||
        d.block?.name?.toLowerCase().includes(searchLower)
      );
    }

    return filtered.sort((a, b) => {
      // Sort by status (expired first, then expiring soon, then current), then by expiry date
      const statusOrder = { "expired": 0, "expiring-soon": 1, "current": 2 };
      const statusCompare = statusOrder[a.status as keyof typeof statusOrder] - 
                           statusOrder[b.status as keyof typeof statusOrder];
      if (statusCompare !== 0) return statusCompare;

      // Then by expiry date
      if (a.expiryDate && b.expiryDate) {
        return new Date(a.expiryDate).getTime() - new Date(b.expiryDate).getTime();
      }
      if (a.expiryDate) return -1;
      if (b.expiryDate) return 1;
      
      // Finally by document type
      return (a.documentType || "").localeCompare(b.documentType || "");
    });
  }, [enrichedDocuments, filterBlock, filterProperty, filterType, filterStatus, searchTerm]);

  // Summary statistics
  const totalDocuments = filteredDocuments.length;
  const currentDocuments = filteredDocuments.filter(d => d.status === "current").length;
  const expiringSoon = filteredDocuments.filter(d => d.status === "expiring-soon").length;
  const expired = filteredDocuments.filter(d => d.status === "expired").length;

  const handleExportPDF = async () => {
    setIsExporting(true);
    try {
      const filters = {
        blockId: filterBlock,
        propertyId: filterProperty,
        documentType: filterType,
        status: filterStatus,
        searchTerm,
      };

      const response = await apiRequest("POST", "/api/reports/compliance/pdf", filters);
      
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `compliance-report-${format(new Date(), 'yyyy-MM-dd')}.pdf`;
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
              <ShieldCheck className="h-6 w-6 sm:h-8 sm:w-8 text-primary flex-shrink-0" />
              <span>Compliance Report</span>
            </h1>
            <p className="text-xs sm:text-sm md:text-base text-muted-foreground mt-1">
              Document tracking and compliance management by block and property
            </p>
          </div>
        </div>
        <Button 
          onClick={handleExportPDF} 
          disabled={isExporting || filteredDocuments.length === 0}
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
            <CardDescription className="text-xs sm:text-sm">Total Documents</CardDescription>
            <CardTitle className="text-xl sm:text-2xl md:text-3xl" data-testid="stat-total-documents">{totalDocuments}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="text-xs sm:text-sm">Current</CardDescription>
            <CardTitle className="text-xl sm:text-2xl md:text-3xl text-green-600" data-testid="stat-current">{currentDocuments}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="text-xs sm:text-sm">Expiring Soon</CardDescription>
            <CardTitle className="text-xl sm:text-2xl md:text-3xl text-orange-600" data-testid="stat-expiring-soon">{expiringSoon}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="text-xs sm:text-sm">Expired</CardDescription>
            <CardTitle className="text-xl sm:text-2xl md:text-3xl text-destructive" data-testid="stat-expired">{expired}</CardTitle>
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
                placeholder="Search documents..."
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
              <Label>Document Type</Label>
              <Select value={filterType} onValueChange={setFilterType}>
                <SelectTrigger data-testid="select-type">
                  <SelectValue placeholder="All types" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Types</SelectItem>
                  {documentTypes.map((type) => (
                    <SelectItem key={type} value={type}>
                      {type}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Status</Label>
              <Select value={filterStatus} onValueChange={setFilterStatus}>
                <SelectTrigger data-testid="select-status">
                  <SelectValue placeholder="All statuses" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All</SelectItem>
                  <SelectItem value="current">Current</SelectItem>
                  <SelectItem value="expiring-soon">Expiring Soon (30 days)</SelectItem>
                  <SelectItem value="expired">Expired</SelectItem>
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
              {(filterBlock !== "all" || filterProperty !== "all" || filterType !== "all" || filterStatus !== "all") && (
                <span className="absolute -top-1 -right-1 w-2 h-2 bg-primary rounded-full" />
              )}
            </Button>
          </SheetTrigger>
          <SheetContent side="bottom" className="h-[85vh] overflow-y-auto">
            <SheetHeader>
              <SheetTitle>Filters</SheetTitle>
              <SheetDescription>
                Filter compliance documents by block, property, type, or status
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
                <Label>Document Type</Label>
                <Select value={filterType} onValueChange={setFilterType}>
                  <SelectTrigger>
                    <SelectValue placeholder="All types" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Types</SelectItem>
                    {documentTypes.map((type) => (
                      <SelectItem key={type} value={type}>
                        {type}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Status</Label>
                <Select value={filterStatus} onValueChange={setFilterStatus}>
                  <SelectTrigger>
                    <SelectValue placeholder="All statuses" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All</SelectItem>
                    <SelectItem value="current">Current</SelectItem>
                    <SelectItem value="expiring-soon">Expiring Soon (30 days)</SelectItem>
                    <SelectItem value="expired">Expired</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {(filterBlock !== "all" || filterProperty !== "all" || filterType !== "all" || filterStatus !== "all") && (
                <Button 
                  variant="outline" 
                  className="w-full"
                  onClick={() => {
                    setFilterBlock("all");
                    setFilterProperty("all");
                    setFilterType("all");
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

      {/* Documents Table */}
      <Card>
        <CardHeader>
          <CardTitle>Compliance Documents ({filteredDocuments.length})</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
          ) : filteredDocuments.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground" data-testid="text-no-documents">
              No compliance documents found matching your criteria
            </div>
          ) : (
            <div className="border rounded-lg overflow-x-auto -mx-4 sm:mx-0">
              <div className="inline-block min-w-full align-middle px-4 sm:px-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="min-w-[150px]">Document Type</TableHead>
                      <TableHead className="min-w-[100px] hidden sm:table-cell">Location</TableHead>
                      <TableHead className="min-w-[120px] hidden lg:table-cell">Block</TableHead>
                      <TableHead className="min-w-[120px] hidden lg:table-cell">Property</TableHead>
                      <TableHead className="min-w-[140px]">Expiry Date</TableHead>
                      <TableHead className="min-w-[100px]">Status</TableHead>
                      <TableHead className="min-w-[100px] hidden md:table-cell">Uploaded</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredDocuments.map((doc) => (
                      <TableRow key={doc.id} data-testid={`row-document-${doc.id}`}>
                        <TableCell className="font-medium">
                          <div className="text-sm">{doc.documentType}</div>
                          <div className="text-xs sm:hidden mt-1">
                            <Badge variant="outline" className="text-xs">
                              {doc.blockId && !doc.propertyId ? "Block-Level" : "Property-Level"}
                            </Badge>
                          </div>
                        </TableCell>
                        <TableCell className="hidden sm:table-cell">
                          <Badge variant="outline" className="text-xs">
                            {doc.blockId && !doc.propertyId ? "Block-Level" : "Property-Level"}
                          </Badge>
                        </TableCell>
                        <TableCell className="hidden lg:table-cell">
                          {doc.block ? (
                            <Link href={`/blocks/${doc.block.id}`}>
                              <div className="flex items-center gap-2 text-primary hover:underline cursor-pointer" data-testid={`link-block-${doc.id}`}>
                                <Building2 className="h-4 w-4 flex-shrink-0" />
                                <span className="text-sm">{doc.block.name}</span>
                              </div>
                            </Link>
                          ) : (
                            <span className="text-muted-foreground text-sm">-</span>
                          )}
                        </TableCell>
                        <TableCell className="hidden lg:table-cell">
                          {doc.property ? (
                            <Link href={`/properties/${doc.property.id}`}>
                              <div className="flex items-center gap-2 text-primary hover:underline cursor-pointer" data-testid={`link-property-${doc.id}`}>
                                <Home className="h-4 w-4 flex-shrink-0" />
                                <span className="text-sm">{doc.property.unitNumber}</span>
                              </div>
                            </Link>
                          ) : (
                            <span className="text-muted-foreground text-sm">-</span>
                          )}
                        </TableCell>
                        <TableCell>
                          {doc.expiryDate ? (
                            <div className="space-y-1">
                              <div className="flex items-center gap-2">
                                <Calendar className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                                <span className="text-sm">{format(new Date(doc.expiryDate), 'MMM d, yyyy')}</span>
                              </div>
                              {doc.daysUntilExpiry !== null && doc.daysUntilExpiry >= 0 && (
                                <div className="text-xs text-muted-foreground">
                                  {doc.daysUntilExpiry} days left
                                </div>
                              )}
                              {doc.daysUntilExpiry !== null && doc.daysUntilExpiry < 0 && (
                                <div className="text-xs text-destructive flex items-center gap-1">
                                  <AlertTriangle className="h-3 w-3" />
                                  {Math.abs(doc.daysUntilExpiry)} days overdue
                                </div>
                              )}
                            </div>
                          ) : (
                            <span className="text-muted-foreground text-sm">No expiry</span>
                          )}
                        </TableCell>
                        <TableCell>
                          <Badge 
                            variant={
                              doc.status === "expired" 
                                ? "destructive" 
                                : doc.status === "expiring-soon" 
                                ? "outline" 
                                : "default"
                            }
                            className="text-xs"
                          >
                            {doc.status === "expired" 
                              ? "Expired" 
                              : doc.status === "expiring-soon"
                              ? "Expiring Soon"
                              : "Current"}
                          </Badge>
                        </TableCell>
                        <TableCell className="hidden md:table-cell">
                          {doc.createdAt ? (
                            <span className="text-sm">{format(new Date(doc.createdAt), 'MMM d, yyyy')}</span>
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
