import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { FileText, ArrowRight, User, Building2, Calendar, Plus } from "lucide-react";
import { format } from "date-fns";
import { Link } from "wouter";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { apiRequest, queryClient } from "@/lib/queryClient";

interface ComparisonReport {
  id: string;
  propertyId: string;
  tenantId: string;
  checkInInspectionId: string;
  checkOutInspectionId: string;
  status: "draft" | "under_review" | "awaiting_signatures" | "signed" | "filed";
  totalEstimatedCost: string;
  operatorSignature: string | null;
  tenantSignature: string | null;
  createdAt: string;
  updatedAt: string;
}

const statusConfig = {
  draft: { label: "Draft", color: "bg-gray-500" },
  under_review: { label: "Under Review", color: "bg-blue-500" },
  awaiting_signatures: { label: "Awaiting Signatures", color: "bg-amber-500" },
  signed: { label: "Signed", color: "bg-green-500" },
  filed: { label: "Filed", color: "bg-slate-600" },
};

export default function ComparisonReports() {
  const { toast } = useToast();
  const { user } = useAuth();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [selectedPropertyId, setSelectedPropertyId] = useState("");
  const [selectedCheckInId, setSelectedCheckInId] = useState("");
  const [selectedCheckOutId, setSelectedCheckOutId] = useState("");

  const handleDialogOpenChange = (open: boolean) => {
    setIsDialogOpen(open);
    if (open) {
      queryClient.invalidateQueries({ queryKey: ["/api/inspections/my"] });
    }
  };

  const { data: reports = [], isLoading } = useQuery<ComparisonReport[]>({
    queryKey: ["/api/comparison-reports"],
  });

  const { data: properties = [] } = useQuery<any[]>({
    queryKey: ["/api/properties"],
  });

  // Fetch all inspections
  const { data: allInspections = [] } = useQuery<any[]>({
    queryKey: ["/api/inspections/my"],
  });

  // Filter inspections by selected property and type
  const checkInInspections = allInspections.filter(
    (i) => i.propertyId === selectedPropertyId && i.type === "check_in" && i.status === "completed"
  );
  
  const checkOutInspections = allInspections.filter(
    (i) => i.propertyId === selectedPropertyId && i.type === "check_out" && i.status === "completed"
  );

  const generateReportMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", "/api/comparison-reports", {
        propertyId: selectedPropertyId,
        checkInInspectionId: selectedCheckInId,
        checkOutInspectionId: selectedCheckOutId,
      });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/comparison-reports"] });
      // Invalidate organization query to update credit balance on dashboard and billing pages
      if (user?.organizationId) {
        queryClient.invalidateQueries({ queryKey: [`/api/organizations/${user.organizationId}`] });
      }
      setIsDialogOpen(false);
      setSelectedPropertyId("");
      setSelectedCheckInId("");
      setSelectedCheckOutId("");
      toast({
        title: "Success",
        description: "Comparison report generated successfully. AI analysis is processing...",
      });
    },
    onError: (error: any) => {
      toast({
        variant: "destructive",
        title: "Error",
        description: error.message || "Failed to generate comparison report",
      });
    },
  });

  const getPropertyName = (propertyId: string) => {
    const property = properties.find(p => p.id === propertyId);
    return property?.name || "Unknown Property";
  };

  return (
    <div className="container mx-auto px-4 py-8 space-y-6" data-testid="page-comparison-reports">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-4xl font-bold flex items-center gap-3" data-testid="heading-comparison-reports">
            <FileText className="w-10 h-10 text-primary" />
            Comparison Reports
          </h1>
          <p className="text-muted-foreground mt-2">
            AI-powered check-in vs check-out analysis with cost estimation and signatures
          </p>
        </div>
        <Dialog open={isDialogOpen} onOpenChange={handleDialogOpenChange}>
          <DialogTrigger asChild>
            <Button data-testid="button-generate-report">
              <Plus className="w-4 h-4 mr-2" />
              Generate Report
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Generate Comparison Report</DialogTitle>
              <DialogDescription>
                Compare check-in and check-out inspections to analyze damages and estimate costs. Costs 2 credits.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <label className="text-sm font-medium mb-2 block">Property</label>
                <Select value={selectedPropertyId} onValueChange={setSelectedPropertyId}>
                  <SelectTrigger data-testid="select-property">
                    <SelectValue placeholder="Select property" />
                  </SelectTrigger>
                  <SelectContent>
                    {properties.map((property) => (
                      <SelectItem key={property.id} value={property.id}>
                        {property.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {selectedPropertyId && (
                <>
                  <div>
                    <label className="text-sm font-medium mb-2 block">Check-In Inspection</label>
                    <Select value={selectedCheckInId} onValueChange={setSelectedCheckInId}>
                      <SelectTrigger data-testid="select-check-in">
                        <SelectValue placeholder="Select check-in inspection" />
                      </SelectTrigger>
                      <SelectContent>
                        {checkInInspections.length === 0 ? (
                          <div className="p-2 text-sm text-muted-foreground">
                            No completed check-in inspections
                          </div>
                        ) : (
                          checkInInspections.map((inspection) => (
                            <SelectItem key={inspection.id} value={inspection.id}>
                              {format(new Date(inspection.scheduledDate), "MMM d, yyyy")}
                            </SelectItem>
                          ))
                        )}
                      </SelectContent>
                    </Select>
                  </div>

                  <div>
                    <label className="text-sm font-medium mb-2 block">Check-Out Inspection</label>
                    <Select value={selectedCheckOutId} onValueChange={setSelectedCheckOutId}>
                      <SelectTrigger data-testid="select-check-out">
                        <SelectValue placeholder="Select check-out inspection" />
                      </SelectTrigger>
                      <SelectContent>
                        {checkOutInspections.length === 0 ? (
                          <div className="p-2 text-sm text-muted-foreground">
                            No completed check-out inspections
                          </div>
                        ) : (
                          checkOutInspections.map((inspection) => (
                            <SelectItem key={inspection.id} value={inspection.id}>
                              {format(new Date(inspection.scheduledDate), "MMM d, yyyy")}
                            </SelectItem>
                          ))
                        )}
                      </SelectContent>
                    </Select>
                  </div>
                </>
              )}

              <Button
                className="w-full"
                onClick={() => generateReportMutation.mutate()}
                disabled={!selectedPropertyId || !selectedCheckInId || !selectedCheckOutId || generateReportMutation.isPending}
                data-testid="button-confirm-generate"
              >
                {generateReportMutation.isPending ? "Generating..." : "Generate Report (2 credits)"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {isLoading ? (
        <div className="grid gap-4">
          {[1, 2, 3].map((i) => (
            <Card key={i}>
              <CardContent className="p-6">
                <div className="space-y-3">
                  <Skeleton className="h-6 w-1/3" />
                  <Skeleton className="h-4 w-2/3" />
                  <Skeleton className="h-4 w-1/2" />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : reports.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16">
            <FileText className="w-16 h-16 text-muted-foreground/50 mb-4" />
            <h3 className="text-xl font-semibold mb-2">No Comparison Reports</h3>
            <p className="text-muted-foreground text-center max-w-md mb-4">
              Generate comparison reports to analyze check-in vs check-out inspections with AI-powered cost estimation.
            </p>
            <Button onClick={() => setIsDialogOpen(true)} data-testid="button-generate-first">
              <Plus className="w-4 h-4 mr-2" />
              Generate Your First Report
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4">
          {reports.map((report) => {
            const statusInfo = statusConfig[report.status];
            const totalCost = parseFloat(report.totalEstimatedCost);
            
            return (
              <Card 
                key={report.id} 
                className="hover-elevate transition-all duration-150"
                data-testid={`card-report-${report.id}`}
              >
                <CardContent className="p-6">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 space-y-3">
                      {/* Status and Date */}
                      <div className="flex items-center gap-3 flex-wrap">
                        <Badge className={`${statusInfo.color} text-white`}>
                          {statusInfo.label}
                        </Badge>
                        <div className="flex items-center gap-2 text-sm text-muted-foreground">
                          <Calendar className="w-4 h-4" />
                          {format(new Date(report.createdAt), "MMM d, yyyy")}
                        </div>
                      </div>

                      {/* Property */}
                      <div className="flex items-center gap-2">
                        <Building2 className="w-4 h-4 text-muted-foreground" />
                        <span className="font-medium">{getPropertyName(report.propertyId)}</span>
                      </div>

                      {/* Cost */}
                      <div className="flex items-center gap-2">
                        <span className="w-4 h-4 text-muted-foreground flex items-center justify-center font-semibold">£</span>
                        <span className="text-lg font-semibold">
                          £{totalCost.toFixed(2)}
                        </span>
                        <span className="text-sm text-muted-foreground">estimated tenant liability</span>
                      </div>

                      {/* Signatures */}
                      <div className="flex items-center gap-6 text-sm">
                        <div className="flex items-center gap-2">
                          <User className="w-4 h-4 text-muted-foreground" />
                          <span className="text-muted-foreground">Operator:</span>
                          {report.operatorSignature ? (
                            <Badge variant="outline" className="text-green-600 border-green-600">
                              Signed
                            </Badge>
                          ) : (
                            <Badge variant="outline">Pending</Badge>
                          )}
                        </div>
                        <div className="flex items-center gap-2">
                          <User className="w-4 h-4 text-muted-foreground" />
                          <span className="text-muted-foreground">Tenant:</span>
                          {report.tenantSignature ? (
                            <Badge variant="outline" className="text-green-600 border-green-600">
                              Signed
                            </Badge>
                          ) : (
                            <Badge variant="outline">Pending</Badge>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* View Button */}
                    <Link href={`/comparisons/${report.id}`}>
                      <a>
                        <Button variant="outline" size="sm" data-testid={`button-view-${report.id}`}>
                          View Details
                          <ArrowRight className="w-4 h-4 ml-2" />
                        </Button>
                      </a>
                    </Link>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
