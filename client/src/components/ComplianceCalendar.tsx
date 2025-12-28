import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { AlertCircle, CheckCircle2, Clock, Circle, CalendarPlus, X, Loader2, ChevronLeft, ChevronRight } from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

interface MonthData {
  month: string;
  status: 'completed' | 'overdue' | 'due' | 'scheduled' | 'not_scheduled';
  count: number;
  completed?: number;
  overdue?: number;
}

interface TemplateCompliance {
  templateId: string;
  templateName: string;
  monthData: MonthData[];
  complianceRate: number;
  totalScheduled: number;
  totalCompleted: number;
}

interface ComplianceReport {
  year: number;
  months: string[];
  templates: TemplateCompliance[];
  overallCompliance: number;
  totalScheduled: number;
  totalCompleted: number;
}

interface PendingSelection {
  templateId: string;
  templateName: string;
  monthIndex: number;
  month: string;
}

interface ComplianceCalendarProps {
  entityType: 'property' | 'block';
  entityId?: string;
}

interface StatusCellProps {
  data: MonthData;
  isPending: boolean;
  isClickable: boolean;
  isDisabled: boolean;
  onClick: () => void;
  onNavigate?: () => void;
}

function StatusCell({ data, isPending, isClickable, isDisabled, onClick, onNavigate }: StatusCellProps) {
  const effectivelyClickable = (isClickable || isPending) && !isDisabled;
  const isNavigable = (data.status === 'overdue' || data.status === 'due') && onNavigate;
  
  const getStatusIcon = () => {
    if (isPending) {
      return <CalendarPlus className="h-4 w-4 text-primary" data-testid={`icon-pending-${data.month}`} />;
    }
    switch (data.status) {
      case 'completed':
        return <CheckCircle2 className="h-4 w-4 text-green-600" data-testid={`icon-completed-${data.month}`} />;
      case 'overdue':
        return <AlertCircle className="h-4 w-4 text-destructive" data-testid={`icon-overdue-${data.month}`} />;
      case 'due':
        return <Clock className="h-4 w-4 text-yellow-600" data-testid={`icon-due-${data.month}`} />;
      case 'scheduled':
        return <Circle className="h-4 w-4 text-blue-600" data-testid={`icon-scheduled-${data.month}`} />;
      case 'not_scheduled':
      default:
        return <Circle className="h-4 w-4 text-muted-foreground/30" data-testid={`icon-not-scheduled-${data.month}`} />;
    }
  };

  const getStatusColor = () => {
    if (isPending) {
      return 'bg-primary/20 border-primary/50 ring-2 ring-primary/30';
    }
    switch (data.status) {
      case 'completed':
        return 'bg-green-100 dark:bg-green-950 border-green-300 dark:border-green-800';
      case 'overdue':
        return 'bg-destructive/10 border-destructive/30';
      case 'due':
        return 'bg-yellow-100 dark:bg-yellow-950 border-yellow-300 dark:border-yellow-800';
      case 'scheduled':
        return 'bg-blue-100 dark:bg-blue-950 border-blue-300 dark:border-blue-800';
      case 'not_scheduled':
      default:
        return 'bg-muted/30 border-border/30';
    }
  };

  const getStatusLabel = () => {
    if (isPending) {
      return `${data.month}: Selected for scheduling - Click to deselect`;
    }
    switch (data.status) {
      case 'completed':
        return `${data.month}: Completed - ${data.completed || 0} of ${data.count} inspections completed`;
      case 'overdue':
        return `${data.month}: Overdue - ${data.overdue || 0} of ${data.count} inspections overdue - Click to view`;
      case 'due':
        return `${data.month}: Due Soon - ${data.count} inspections due within 30 days - Click to view`;
      case 'scheduled':
        return `${data.month}: Scheduled - ${data.count} inspections scheduled`;
      case 'not_scheduled':
      default:
        return isClickable 
          ? `${data.month}: Not Scheduled - Click to select for scheduling`
          : `${data.month}: Not Scheduled - No inspections scheduled`;
    }
  };

  const statusLabel = getStatusLabel();
  const canClick = effectivelyClickable || isNavigable;

  const handleClick = () => {
    if (isNavigable) {
      onNavigate?.();
    } else if (effectivelyClickable) {
      onClick();
    }
  };

  return (
    <div 
      className={`flex items-center justify-center p-2 rounded-md border ${getStatusColor()} hover-elevate transition-all ${canClick ? 'cursor-pointer' : ''} ${isDisabled ? 'opacity-50' : ''}`}
      title={statusLabel}
      aria-label={statusLabel}
      role={canClick ? "button" : "status"}
      onClick={canClick ? handleClick : undefined}
      data-testid={`cell-${isPending ? 'pending' : data.status}-${data.month}`}
    >
      {getStatusIcon()}
    </div>
  );
}

export default function ComplianceCalendar({ entityType, entityId }: ComplianceCalendarProps) {
  const { toast } = useToast();
  const [, navigate] = useLocation();
  const currentYear = new Date().getFullYear();
  const [selectedYear, setSelectedYear] = useState(currentYear);
  const [pendingSelections, setPendingSelections] = useState<PendingSelection[]>([]);
  const [selectedType, setSelectedType] = useState<string>('routine');

  // Always fetch compliance report with year parameter
  const { data: report, isLoading } = useQuery<ComplianceReport>({
    queryKey: [`/api/${entityType === 'property' ? 'properties' : 'blocks'}`, entityId, 'compliance-report', selectedYear],
    queryFn: async () => {
      const endpoint = entityType === 'property' 
        ? `/api/properties/${entityId}/compliance-report?year=${selectedYear}`
        : `/api/blocks/${entityId}/compliance-report?year=${selectedYear}`;
      const res = await fetch(endpoint, { credentials: "include" });
      if (!res.ok) return null;
      return res.json();
    },
    enabled: !!entityId,
  });

  const bulkScheduleMutation = useMutation({
    mutationFn: async (params: { selections: PendingSelection[], yearToSchedule: number }) => {
      const response = await apiRequest("POST", "/api/inspections/bulk-schedule", {
        entityType,
        entityId,
        year: params.yearToSchedule,
        type: selectedType,
        selections: params.selections.map(s => ({
          templateId: s.templateId,
          monthIndex: s.monthIndex
        }))
      });
      const result = await response.json();
      return { ...result, yearScheduled: params.yearToSchedule };
    },
    onSuccess: (data) => {
      toast({
        title: "Inspections Scheduled",
        description: `Successfully scheduled ${data.count} inspection${data.count !== 1 ? 's' : ''}.`,
      });
      setPendingSelections([]);
      // Invalidate the calendar data for this entity and the year that was scheduled
      const baseKey = entityType === 'property' ? '/api/properties' : '/api/blocks';
      queryClient.invalidateQueries({ queryKey: [baseKey, entityId, 'compliance-report', data.yearScheduled] });
      // Also invalidate Dashboard's query key pattern
      queryClient.invalidateQueries({ queryKey: ['/api/compliance-report', entityType, entityId] });
      queryClient.invalidateQueries({ queryKey: ['/api/inspections'] });
    },
    onError: (error: Error) => {
      toast({
        title: "Scheduling Failed",
        description: error.message || "Failed to schedule inspections. Please try again.",
        variant: "destructive",
      });
    }
  });

  const toggleSelection = (templateId: string, templateName: string, monthIndex: number, month: string) => {
    setPendingSelections(prev => {
      const exists = prev.find(s => s.templateId === templateId && s.monthIndex === monthIndex);
      if (exists) {
        return prev.filter(s => !(s.templateId === templateId && s.monthIndex === monthIndex));
      }
      return [...prev, { templateId, templateName, monthIndex, month }];
    });
  };

  const isPending = (templateId: string, monthIndex: number) => {
    return pendingSelections.some(s => s.templateId === templateId && s.monthIndex === monthIndex);
  };

  const clearSelections = () => {
    setPendingSelections([]);
  };

  const handleSchedule = () => {
    if (pendingSelections.length === 0) return;
    bulkScheduleMutation.mutate({ selections: pendingSelections, yearToSchedule: selectedYear });
  };

  const yearNavigator = (
    <div className="flex items-center gap-1">
      <Button 
        variant="ghost" 
        size="icon" 
        className="h-6 w-6"
        onClick={() => setSelectedYear(y => y - 1)}
        data-testid="button-prev-year"
      >
        <ChevronLeft className="h-4 w-4" />
      </Button>
      <span className="font-medium min-w-[4rem] text-center" data-testid="text-selected-year">{selectedYear}</span>
      <Button 
        variant="ghost" 
        size="icon" 
        className="h-6 w-6"
        onClick={() => setSelectedYear(y => y + 1)}
        data-testid="button-next-year"
      >
        <ChevronRight className="h-4 w-4" />
      </Button>
    </div>
  );

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Annual Inspection Compliance</CardTitle>
          <CardDescription className="flex items-center gap-2">
            {yearNavigator}
            <span className="text-muted-foreground">· Loading compliance report...</span>
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="h-64 flex items-center justify-center">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!report || report.templates.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Annual Inspection Compliance</CardTitle>
          <CardDescription className="flex items-center gap-2">
            {yearNavigator}
            <span className="text-muted-foreground">· Track inspection compliance for {entityType === 'property' ? 'this property' : 'this block'}</span>
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="py-12 text-center">
            <AlertCircle className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
            <h3 className="text-lg font-semibold mb-2">No Inspections for {selectedYear}</h3>
            <p className="text-muted-foreground">
              No inspection templates or scheduled inspections found for this year.
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  const monthAbbreviations = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const canSchedule = !!entityId;

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <CardTitle className="flex items-center gap-2">
              Annual Inspection Compliance
              <Badge variant="outline" className="ml-2" data-testid="badge-overall-compliance">
                {report.overallCompliance}% Overall
              </Badge>
            </CardTitle>
            <CardDescription className="mt-1 flex items-center gap-2 flex-wrap">
              {yearNavigator}
              <span className="text-muted-foreground">·</span>
              <span>{report.totalCompleted} of {report.totalScheduled} inspections completed</span>
              {canSchedule && <span className="text-muted-foreground">· Click empty cells to select for scheduling</span>}
            </CardDescription>
          </div>
          {pendingSelections.length > 0 && (
            <div className="flex items-center gap-2 flex-wrap">
              <Badge variant="secondary" data-testid="badge-pending-count">
                {pendingSelections.length} selected
              </Badge>
              <Select value={selectedType} onValueChange={setSelectedType}>
                <SelectTrigger className="w-[140px]" data-testid="select-inspection-type">
                  <SelectValue placeholder="Select type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="check_in">Check In</SelectItem>
                  <SelectItem value="check_out">Check Out</SelectItem>
                  <SelectItem value="routine">Routine</SelectItem>
                  <SelectItem value="maintenance">Maintenance</SelectItem>
                  <SelectItem value="esg_sustainability_inspection">ESG Sustainability Inspection</SelectItem>
                  <SelectItem value="fire_hazard_assessment">Fire Hazard Assessment</SelectItem>
                  <SelectItem value="maintenance_inspection">Maintenance Inspection</SelectItem>
                  <SelectItem value="damage">Damage</SelectItem>
                  <SelectItem value="emergency">Emergency</SelectItem>
                  <SelectItem value="safety_compliance">Safety & Compliance</SelectItem>
                  <SelectItem value="compliance_regulatory">Compliance / Regulatory</SelectItem>
                  <SelectItem value="pre_purchase">Pre-Purchase</SelectItem>
                  <SelectItem value="specialized">Specialized</SelectItem>
                </SelectContent>
              </Select>
              <Button
                variant="ghost"
                size="sm"
                onClick={clearSelections}
                data-testid="button-clear-selections"
              >
                <X className="h-4 w-4 mr-1" />
                Clear
              </Button>
              <Button
                onClick={handleSchedule}
                disabled={bulkScheduleMutation.isPending}
                data-testid="button-schedule-inspections"
              >
                {bulkScheduleMutation.isPending ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <CalendarPlus className="h-4 w-4 mr-2" />
                )}
                Schedule Inspections
              </Button>
            </div>
          )}
        </div>
      </CardHeader>
      <CardContent>
        {/* Legend */}
        <div className="mb-6 flex flex-wrap gap-4 text-sm">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 text-green-600" />
            <span className="text-muted-foreground">Completed</span>
          </div>
          <div className="flex items-center gap-2">
            <AlertCircle className="h-4 w-4 text-destructive" />
            <span className="text-muted-foreground">Overdue</span>
          </div>
          <div className="flex items-center gap-2">
            <Clock className="h-4 w-4 text-yellow-600" />
            <span className="text-muted-foreground">Due Soon</span>
          </div>
          <div className="flex items-center gap-2">
            <Circle className="h-4 w-4 text-blue-600" />
            <span className="text-muted-foreground">Scheduled</span>
          </div>
          <div className="flex items-center gap-2">
            <Circle className="h-4 w-4 text-muted-foreground/30" />
            <span className="text-muted-foreground">Not Scheduled</span>
          </div>
          {canSchedule && (
            <div className="flex items-center gap-2">
              <CalendarPlus className="h-4 w-4 text-primary" />
              <span className="text-muted-foreground">Pending Selection</span>
            </div>
          )}
        </div>

        {/* Compliance Grid */}
        <div className="overflow-x-auto">
          <div className="min-w-[800px]">
            {/* Header Row */}
            <div className="grid gap-2 mb-2" style={{ gridTemplateColumns: '200px repeat(12, 1fr) 80px' }}>
              <div className="font-semibold text-sm p-2">Template</div>
              {monthAbbreviations.map((month, idx) => (
                <div key={month} className="font-semibold text-sm text-center p-2" data-testid={`header-${report.months[idx]}`}>
                  {month}
                </div>
              ))}
              <div className="font-semibold text-sm text-center p-2">Rate</div>
            </div>

            {/* Template Rows */}
            {report.templates.map((template) => (
              <div 
                key={template.templateId} 
                className="grid gap-2 mb-2 items-center"
                style={{ gridTemplateColumns: '200px repeat(12, 1fr) 80px' }}
                data-testid={`row-template-${template.templateId}`}
              >
                {/* Template Name */}
                <div className="text-sm font-medium p-2 truncate" title={template.templateName}>
                  {template.templateName}
                </div>

                {/* Month Cells */}
                {template.monthData.map((monthData, monthIndex) => (
                  <StatusCell 
                    key={monthData.month} 
                    data={monthData}
                    isPending={isPending(template.templateId, monthIndex)}
                    isClickable={canSchedule && monthData.status === 'not_scheduled'}
                    isDisabled={bulkScheduleMutation.isPending}
                    onClick={() => toggleSelection(template.templateId, template.templateName, monthIndex, monthData.month)}
                    onNavigate={() => {
                      const filterType = monthData.status === 'overdue' ? 'overdue=true' : 'dueSoon=true';
                      const entityFilter = entityType === 'property' ? `propertyId=${entityId}` : `blockId=${entityId}`;
                      navigate(`/inspections?${entityFilter}&${filterType}`);
                    }}
                  />
                ))}

                {/* Compliance Rate */}
                <div className="text-center p-2">
                  <Badge 
                    variant={template.complianceRate >= 80 ? "default" : template.complianceRate >= 60 ? "secondary" : "destructive"}
                    data-testid={`badge-rate-${template.templateId}`}
                  >
                    {template.complianceRate}%
                  </Badge>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Summary Stats */}
        <div className="mt-6 pt-6 border-t grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <div className="text-sm text-muted-foreground">Total Inspections</div>
            <div className="text-2xl font-bold" data-testid="stat-total-scheduled">{report.totalScheduled}</div>
          </div>
          <div>
            <div className="text-sm text-muted-foreground">Completed</div>
            <div className="text-2xl font-bold text-green-600" data-testid="stat-total-completed">{report.totalCompleted}</div>
          </div>
          <div>
            <div className="text-sm text-muted-foreground">Pending</div>
            <div className="text-2xl font-bold text-yellow-600" data-testid="stat-total-pending">
              {report.totalScheduled - report.totalCompleted}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
