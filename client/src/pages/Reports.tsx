import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Link } from "wouter";
import { useState } from "react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { format } from "date-fns";
import { 
  FileText, 
  Building2, 
  Home, 
  Users, 
  Package, 
  ClipboardCheck,
  BarChart3,
  FileBarChart,
  ShieldCheck,
  Download,
  Loader2
} from "lucide-react";

export default function Reports() {
  const { toast } = useToast();
  const [isGenerating, setIsGenerating] = useState(false);

  const handleProduceReport = async () => {
    setIsGenerating(true);
    try {
      const response = await apiRequest("GET", "/api/reports/comprehensive/excel");
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `comprehensive-report-${format(new Date(), 'yyyy-MM-dd')}.xlsx`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);

      toast({
        title: "Report Generated",
        description: "Your comprehensive Excel report has been downloaded successfully.",
      });
    } catch (error: any) {
      console.error("Export error:", error);
      toast({
        title: "Export Failed",
        description: error.message || "Failed to generate Excel report. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsGenerating(false);
    }
  };

  const reportCards = [
    {
      title: "Inspections Report",
      description: "Comprehensive inspection history with status tracking and analytics",
      icon: ClipboardCheck,
      link: "/reports/inspections",
      color: "text-primary",
      bgColor: "bg-primary/10",
      available: true
    },
    {
      title: "Blocks Report",
      description: "Block-level statistics, occupancy rates, and compliance metrics",
      icon: Building2,
      link: "/reports/blocks",
      color: "text-accent",
      bgColor: "bg-accent/10",
      available: true
    },
    {
      title: "Properties Report",
      description: "Property portfolio overview with maintenance and inspection data",
      icon: Home,
      link: "/reports/properties",
      color: "text-chart-1",
      bgColor: "bg-chart-1/10",
      available: true
    },
    {
      title: "Tenants Report",
      description: "Tenant occupancy, lease tracking, and rental income analysis",
      icon: Users,
      link: "/reports/tenants",
      color: "text-chart-3",
      bgColor: "bg-chart-3/10",
      available: true
    },
    {
      title: "Inventory Report",
      description: "Asset tracking across all properties with condition reports",
      icon: Package,
      link: "/reports/inventory",
      color: "text-chart-2",
      bgColor: "bg-chart-2/10",
      available: true
    },
    {
      title: "Compliance Report",
      description: "Document tracking and compliance management by block and property",
      icon: ShieldCheck,
      link: "/reports/compliance",
      color: "text-chart-4",
      bgColor: "bg-chart-4/10",
      available: true
    }
  ];

  return (
    <div className="container mx-auto p-6 md:p-8 lg:p-12 space-y-8">
      {/* Header */}
      <div className="space-y-2">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center">
            <FileBarChart className="h-6 w-6 text-primary" />
          </div>
          <div>
            <h1 className="text-4xl md:text-5xl font-bold tracking-tight">Reports</h1>
            <p className="text-lg text-muted-foreground mt-1">
              Generate detailed reports and export to PDF
            </p>
          </div>
        </div>
      </div>

      {/* Info Banner */}
      <Card className="glass-card border-primary/20">
        <CardContent className="p-6">
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-start gap-4 flex-1">
              <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
                <BarChart3 className="h-5 w-5 text-primary" />
              </div>
              <div className="space-y-1">
                <h3 className="font-semibold">Professional BTR Reporting</h3>
                <p className="text-sm text-muted-foreground">
                  Each report includes advanced filtering options and PDF export functionality. 
                  Apply filters to focus on specific date ranges, properties, or criteria, then export 
                  professional reports for stakeholders, audits, or record-keeping.
                </p>
              </div>
            </div>
            <Button
              onClick={handleProduceReport}
              disabled={isGenerating}
              className="flex-shrink-0"
              size="lg"
            >
              {isGenerating ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Generating...
                </>
              ) : (
                <>
                  <Download className="h-4 w-4 mr-2" />
                  Produce Report
                </>
              )}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Report Cards Grid */}
      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        {reportCards.map((report) => {
          const Icon = report.icon;
          const cardContent = (
            <Card 
              className={`glass-card transition-all h-full ${report.available ? 'hover-elevate cursor-pointer' : 'opacity-60'}`}
              data-testid={`card-report-${report.title.toLowerCase().replace(/\s+/g, '-')}`}
            >
              <CardHeader>
                <div className="flex items-start justify-between gap-4">
                  <div className={`w-12 h-12 rounded-xl ${report.bgColor} flex items-center justify-center flex-shrink-0`}>
                    <Icon className={`h-6 w-6 ${report.color}`} />
                  </div>
                  {report.available ? (
                    <FileText className="h-5 w-5 text-muted-foreground" />
                  ) : (
                    <Badge variant="secondary">Coming Soon</Badge>
                  )}
                </div>
                <CardTitle className="mt-4">{report.title}</CardTitle>
                <CardDescription className="text-base">
                  {report.description}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className={`flex items-center text-sm font-medium ${report.available ? 'text-primary' : 'text-muted-foreground'}`}>
                  {report.available ? 'View Report' : 'Coming Soon'}
                  {report.available && <span className="ml-2">→</span>}
                </div>
              </CardContent>
            </Card>
          );
          
          return report.available ? (
            <Link key={report.title} href={report.link}>
              {cardContent}
            </Link>
          ) : (
            <div key={report.title}>
              {cardContent}
            </div>
          );
        })}
      </div>
    </div>
  );
}
