import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Plus, FileText, ArrowRight, AlertCircle } from "lucide-react";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";
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
import { Alert, AlertDescription } from "@/components/ui/alert";
import type { ComparisonReport, Unit, Inspection, Property, InspectionItem } from "@shared/schema";

type ComparisonReportWithDetails = ComparisonReport & {
  unit?: { unitNumber: string; property?: { name: string } };
  checkInInspection?: Inspection;
  checkOutInspection?: Inspection;
};

type ItemComparisonData = {
  checkIn: InspectionItem[];
  checkOut: InspectionItem[];
};

export default function Comparisons() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [isGenerateOpen, setIsGenerateOpen] = useState(false);
  const [selectedUnitId, setSelectedUnitId] = useState<string>("");
  const [selectedCheckIn, setSelectedCheckIn] = useState<string>("");
  const [selectedCheckOut, setSelectedCheckOut] = useState<string>("");
  const [selectedReportId, setSelectedReportId] = useState<string | null>(null);

  // Fetch all properties and units
  const { data: properties = [] } = useQuery<Property[]>({
    queryKey: ["/api/properties"],
  });

  const { data: units = [] } = useQuery<Unit[]>({
    queryKey: ["/api/units"],
  });

  // Fetch inspections for selected unit
  const { data: unitInspections = [] } = useQuery<Inspection[], Error, Inspection[]>({
    queryKey: ["/api/inspections/my"],
    select: (inspections: Inspection[]) => 
      selectedUnitId 
        ? inspections.filter((i: Inspection) => i.unitId === selectedUnitId)
        : [],
  });

  // Fetch all comparison reports
  const { data: allReports = [], isLoading } = useQuery<ComparisonReport[]>({
    queryKey: ["/api/comparisons/all"],
    queryFn: async () => {
      // Fetch comparison reports for all units
      const reports: ComparisonReport[] = [];
      for (const unit of units) {
        const response = await fetch(`/api/comparisons/${unit.id}`);
        const unitReports: ComparisonReport[] = await response.json();
        reports.push(...unitReports);
      }
      return reports;
    },
    enabled: units.length > 0,
  });

  // Generate comparison mutation
  const generateMutation = useMutation({
    mutationFn: async () => {
      return apiRequest("/api/ai/generate-comparison", "POST", {
        unitId: selectedUnitId,
        checkInInspectionId: selectedCheckIn,
        checkOutInspectionId: selectedCheckOut,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/comparisons/all"] });
      // Invalidate organization query to update credit balance on dashboard and billing pages
      if (user?.organizationId) {
        queryClient.invalidateQueries({ queryKey: [`/api/organizations/${user.organizationId}`] });
      }
      setIsGenerateOpen(false);
      setSelectedUnitId("");
      setSelectedCheckIn("");
      setSelectedCheckOut("");
      toast({
        title: "Success",
        description: "Comparison report generated successfully",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to generate comparison report",
        variant: "destructive",
      });
    },
  });

  const checkInInspections = unitInspections.filter(i => i.type === "check_in");
  const checkOutInspections = unitInspections.filter(i => i.type === "check_out");

  const selectedReport = allReports.find(r => r.id === selectedReportId);
  
  // Type guard for item comparisons
  const isItemComparisonData = (data: unknown): data is ItemComparisonData => {
    if (!data || typeof data !== 'object' || data === null) return false;
    return (
      'checkIn' in data && Array.isArray(data.checkIn) && 
      'checkOut' in data && Array.isArray(data.checkOut)
    );
  };
  
  const itemComparisons = selectedReport?.itemComparisons && isItemComparisonData(selectedReport.itemComparisons)
    ? selectedReport.itemComparisons
    : null;

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold" data-testid="heading-comparisons">Comparison Reports</h1>
          <p className="text-muted-foreground">AI-powered check-in vs check-out analysis</p>
        </div>
        <Dialog open={isGenerateOpen} onOpenChange={setIsGenerateOpen}>
          <DialogTrigger asChild>
            <Button data-testid="button-generate-comparison">
              <Plus className="w-4 h-4 mr-2" />
              Generate Report
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>Generate Comparison Report</DialogTitle>
              <DialogDescription>
                Compare check-in and check-out inspections to identify changes (costs 2 credits)
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <Alert>
                <AlertCircle className="w-4 h-4" />
                <AlertDescription>
                  This AI analysis costs 2 inspection credits
                </AlertDescription>
              </Alert>

              <div>
                <label className="text-sm font-medium mb-2 block">Unit</label>
                <Select value={selectedUnitId} onValueChange={setSelectedUnitId}>
                  <SelectTrigger data-testid="select-unit">
                    <SelectValue placeholder="Select a unit" />
                  </SelectTrigger>
                  <SelectContent>
                    {units.map((unit) => (
                      <SelectItem key={unit.id} value={unit.id} data-testid={`option-unit-${unit.id}`}>
                        Unit {unit.unitNumber}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {selectedUnitId && (
                <>
                  <div>
                    <label className="text-sm font-medium mb-2 block">Check-in Inspection</label>
                    <Select value={selectedCheckIn} onValueChange={setSelectedCheckIn}>
                      <SelectTrigger data-testid="select-check-in">
                        <SelectValue placeholder="Select check-in inspection" />
                      </SelectTrigger>
                      <SelectContent>
                        {checkInInspections.length === 0 ? (
                          <div className="p-2 text-sm text-muted-foreground">No check-in inspections found</div>
                        ) : (
                          checkInInspections.map((inspection) => (
                            <SelectItem 
                              key={inspection.id} 
                              value={inspection.id}
                              data-testid={`option-check-in-${inspection.id}`}
                            >
                              {format(new Date(inspection.scheduledDate?.toString() || Date.now()), 'PPP')}
                            </SelectItem>
                          ))
                        )}
                      </SelectContent>
                    </Select>
                  </div>

                  <div>
                    <label className="text-sm font-medium mb-2 block">Check-out Inspection</label>
                    <Select value={selectedCheckOut} onValueChange={setSelectedCheckOut}>
                      <SelectTrigger data-testid="select-check-out">
                        <SelectValue placeholder="Select check-out inspection" />
                      </SelectTrigger>
                      <SelectContent>
                        {checkOutInspections.length === 0 ? (
                          <div className="p-2 text-sm text-muted-foreground">No check-out inspections found</div>
                        ) : (
                          checkOutInspections.map((inspection) => (
                            <SelectItem 
                              key={inspection.id} 
                              value={inspection.id}
                              data-testid={`option-check-out-${inspection.id}`}
                            >
                              {format(new Date(inspection.scheduledDate?.toString() || Date.now()), 'PPP')}
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
                onClick={() => generateMutation.mutate()}
                disabled={!selectedUnitId || !selectedCheckIn || !selectedCheckOut || generateMutation.isPending}
                data-testid="button-submit-generate"
              >
                {generateMutation.isPending ? "Generating..." : "Generate Report (2 credits)"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {/* Reports List */}
      <div className="grid gap-4">
        {isLoading ? (
          <div className="text-center py-8 text-muted-foreground">Loading...</div>
        ) : allReports.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-12">
              <FileText className="w-12 h-12 text-muted-foreground mb-4" />
              <p className="text-lg font-semibold mb-2" data-testid="text-no-reports">No comparison reports</p>
              <p className="text-sm text-muted-foreground">
                Generate your first comparison report to get started
              </p>
            </CardContent>
          </Card>
        ) : (
          allReports.map((report) => {
            const unit = units.find(u => u.id === report.unitId);
            const isExpanded = selectedReportId === report.id;

            return (
              <Card key={report.id} data-testid={`card-report-${report.id}`}>
                <CardHeader>
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1">
                      <CardTitle className="text-lg mb-2" data-testid={`text-unit-${report.id}`}>
                        Unit {unit?.unitNumber || "Unknown"}
                      </CardTitle>
                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <span>Generated {format(new Date(report.createdAt?.toString() || Date.now()), 'PPP')}</span>
                      </div>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setSelectedReportId(isExpanded ? null : report.id)}
                      data-testid={`button-toggle-${report.id}`}
                    >
                      {isExpanded ? "Hide Details" : "View Details"}
                    </Button>
                  </div>
                </CardHeader>

                {isExpanded && (
                  <CardContent className="space-y-6">
                    {/* AI Summary */}
                    <div>
                      <h3 className="font-semibold mb-2">AI Summary</h3>
                      <div className="p-4 bg-muted rounded-md">
                        <p className="text-sm whitespace-pre-wrap" data-testid={`text-summary-${report.id}`}>
                          {report.aiSummary || "No summary available"}
                        </p>
                      </div>
                    </div>

                    {/* Item Comparisons */}
                    {itemComparisons && (
                      <div>
                        <h3 className="font-semibold mb-4">Item-by-Item Comparison</h3>
                        <div className="space-y-4">
                          {itemComparisons.checkIn && itemComparisons.checkIn.length > 0 && (
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                              {/* Check-in Column */}
                              <div>
                                <div className="flex items-center gap-2 mb-3">
                                  <Badge variant="secondary">Check-in</Badge>
                                  <span className="text-sm text-muted-foreground">
                                    {format(new Date(report.createdAt?.toString() || Date.now()), 'PP')}
                                  </span>
                                </div>
                                <div className="space-y-3">
                                  {itemComparisons.checkIn.map((item, idx: number) => (
                                    <div 
                                      key={idx} 
                                      className="p-3 border rounded-md space-y-2"
                                      data-testid={`item-check-in-${idx}`}
                                    >
                                      {item.photoUrl && (
                                        <img 
                                          src={item.photoUrl} 
                                          alt={item.itemName} 
                                          className="w-full h-32 object-cover rounded-md"
                                          data-testid={`photo-check-in-${idx}`}
                                        />
                                      )}
                                      <div className="font-medium text-sm">{item.itemName}</div>
                                      <div className="text-xs text-muted-foreground">{item.category}</div>
                                      <div className="flex items-center gap-2">
                                        <span className="text-xs">Condition:</span>
                                        <Badge variant="outline">
                                          {item.conditionRating != null ? `${item.conditionRating}/10` : 'N/A'}
                                        </Badge>
                                      </div>
                                      {item.aiAnalysis && (
                                        <p className="text-xs text-muted-foreground line-clamp-2">
                                          {item.aiAnalysis}
                                        </p>
                                      )}
                                    </div>
                                  ))}
                                </div>
                              </div>

                              {/* Check-out Column */}
                              <div>
                                <div className="flex items-center gap-2 mb-3">
                                  <Badge variant="default">Check-out</Badge>
                                  <span className="text-sm text-muted-foreground">
                                    {format(new Date(report.createdAt?.toString() || Date.now()), 'PP')}
                                  </span>
                                </div>
                                <div className="space-y-3">
                                  {itemComparisons.checkOut?.map((item, idx: number) => {
                                    const checkInItem = itemComparisons.checkIn[idx];
                                    const ratingChange = (item.conditionRating || 0) - (checkInItem?.conditionRating || 0);
                                    
                                    return (
                                      <div 
                                        key={idx} 
                                        className="p-3 border rounded-md space-y-2"
                                        data-testid={`item-check-out-${idx}`}
                                      >
                                        {item.photoUrl && (
                                          <img 
                                            src={item.photoUrl} 
                                            alt={item.itemName} 
                                            className="w-full h-32 object-cover rounded-md"
                                            data-testid={`photo-check-out-${idx}`}
                                          />
                                        )}
                                        <div className="font-medium text-sm">{item.itemName}</div>
                                        <div className="text-xs text-muted-foreground">{item.category}</div>
                                        <div className="flex items-center gap-2">
                                          <span className="text-xs">Condition:</span>
                                          <Badge variant="outline">
                                            {item.conditionRating != null ? `${item.conditionRating}/10` : 'N/A'}
                                          </Badge>
                                          {item.conditionRating != null && checkInItem?.conditionRating != null && ratingChange !== 0 && (
                                            <Badge 
                                              variant={ratingChange > 0 ? "default" : "destructive"}
                                              className="text-xs"
                                            >
                                              {ratingChange > 0 ? "+" : ""}{ratingChange}
                                            </Badge>
                                          )}
                                        </div>
                                        {item.aiAnalysis && (
                                          <p className="text-xs text-muted-foreground line-clamp-2">
                                            {item.aiAnalysis}
                                          </p>
                                        )}
                                      </div>
                                    );
                                  })}
                                </div>
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </CardContent>
                )}
              </Card>
            );
          })
        )}
      </div>
    </div>
  );
}
