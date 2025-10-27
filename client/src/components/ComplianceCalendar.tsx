import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { AlertCircle, CheckCircle2, Clock, Circle } from "lucide-react";

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

interface ComplianceCalendarProps {
  report: ComplianceReport | null;
  isLoading: boolean;
  entityType: 'property' | 'block';
}

function StatusCell({ data }: { data: MonthData }) {
  const getStatusIcon = () => {
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
        return `${data.month}: Not Scheduled - No inspections scheduled`;
    }
  };

  const statusLabel = getStatusLabel();

  return (
    <div 
      className={`flex items-center justify-center p-2 rounded-md border ${getStatusColor()} hover-elevate transition-all`}
      title={statusLabel}
      aria-label={statusLabel}
      role="status"
      data-testid={`cell-${data.status}-${data.month}`}
    >
      {getStatusIcon()}
    </div>
  );
}

export default function ComplianceCalendar({ report, isLoading, entityType }: ComplianceCalendarProps) {
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

  // Abbreviate month names for better mobile display
  const monthAbbreviations = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between gap-4">
          <div>
            <CardTitle className="flex items-center gap-2">
              Annual Inspection Compliance
              <Badge variant="outline" className="ml-2" data-testid="badge-overall-compliance">
                {report.overallCompliance}% Overall
              </Badge>
            </CardTitle>
            <CardDescription className="mt-1">
              {report.year} · {report.totalCompleted} of {report.totalScheduled} inspections completed
            </CardDescription>
          </div>
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
                {template.monthData.map((monthData) => (
                  <StatusCell key={monthData.month} data={monthData} />
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
