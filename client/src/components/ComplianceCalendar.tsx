import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { AlertCircle, CheckCircle2, Clock, Circle, CalendarPlus, X, Loader2 } from "lucide-react";
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
  report: ComplianceReport | null;
  isLoading: boolean;
  entityType: 'property' | 'block';
  entityId?: string;
}

interface StatusCellProps {
  data: MonthData;
  isPending: boolean;
  isClickable: boolean;
  isDisabled: boolean;
  onClick: () => void;
}

function StatusCell({ data, isPending, isClickable, isDisabled, onClick }: StatusCellProps) {
  const effectivelyClickable = (isClickable || isPending) && !isDisabled;
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
        return `${data.month}: Overdue - ${data.overdue || 0} of ${data.count} inspections overdue`;
      case 'due':
        return `${data.month}: Due Soon - ${data.count} inspections due within 30 days`;
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

  return (
    <div 
      className={`flex items-center justify-center p-2 rounded-md border ${getStatusColor()} hover-elevate transition-all ${effectivelyClickable ? 'cursor-pointer' : ''} ${isDisabled ? 'opacity-50' : ''}`}
      title={statusLabel}
      aria-label={statusLabel}
      role={effectivelyClickable ? "button" : "status"}
      onClick={effectivelyClickable ? onClick : undefined}
      data-testid={`cell-${isPending ? 'pending' : data.status}-${data.month}`}
    >
      {getStatusIcon()}
    </div>
  );
}

export default function ComplianceCalendar({ report, isLoading, entityType, entityId }: ComplianceCalendarProps) {
  const { toast } = useToast();
  const [pendingSelections, setPendingSelections] = useState<PendingSelection[]>([]);

  const bulkScheduleMutation = useMutation({
    mutationFn: async (selections: PendingSelection[]) => {
      const response = await apiRequest("POST", "/api/inspections/bulk-schedule", {
        entityType,
        entityId,
        year: report?.year || new Date().getFullYear(),
        selections: selections.map(s => ({
          templateId: s.templateId,
          monthIndex: s.monthIndex
        }))
      });
      return response.json();
    },
    onSuccess: (data) => {
      toast({
        title: "Inspections Scheduled",
        description: `Successfully scheduled ${data.count} inspection${data.count !== 1 ? 's' : ''}.`,
      });
      setPendingSelections([]);
      queryClient.invalidateQueries({ queryKey: ['/api/compliance/property'] });
      queryClient.invalidateQueries({ queryKey: ['/api/compliance/block'] });
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
    bulkScheduleMutation.mutate(pendingSelections);
  };

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Annual Inspection Compliance</CardTitle>
          <CardDescription>Loading compliance report...</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="h-64 flex items-center justify-center">
            <div className="text-muted-foreground">Loading...</div>
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
          <CardDescription>
            Track inspection compliance across all months for {entityType === 'property' ? 'this property' : 'this block'}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="py-12 text-center">
            <AlertCircle className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
            <h3 className="text-lg font-semibold mb-2">No Inspection Templates</h3>
            <p className="text-muted-foreground">
              Create inspection templates and schedule inspections to track compliance.
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
            <CardDescription className="mt-1">
              {report.year} · {report.totalCompleted} of {report.totalScheduled} inspections completed
              {canSchedule && " · Click empty cells to select for scheduling"}
            </CardDescription>
          </div>
          {pendingSelections.length > 0 && (
            <div className="flex items-center gap-2">
              <Badge variant="secondary" data-testid="badge-pending-count">
                {pendingSelections.length} selected
              </Badge>
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
