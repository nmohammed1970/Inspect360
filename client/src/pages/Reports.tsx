import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Link } from "wouter";
import { 
  FileText, 
  Building2, 
  Home, 
  Users, 
  Package, 
  ClipboardCheck,
  FileBarChart,
  ShieldCheck
} from "lucide-react";

export default function Reports() {

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
    <div className="container mx-auto p-4 md:p-6 space-y-4 md:space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div className="min-w-0 flex-1">
          <h1 className="text-xl md:text-2xl lg:text-3xl font-bold">Reports</h1>
          <p className="text-sm md:text-base text-muted-foreground">
            Generate detailed reports and export to PDF
          </p>
        </div>
      </div>

      {/* Report Cards Grid */}
      <div className="grid gap-4 md:gap-6 grid-cols-1 md:grid-cols-2 lg:grid-cols-3">
        {reportCards.map((report) => {
          const Icon = report.icon;
          const cardContent = (
            <Card 
              className={`glass-card transition-all h-full ${report.available ? 'hover-elevate cursor-pointer' : 'opacity-60'}`}
              data-testid={`card-report-${report.title.toLowerCase().replace(/\s+/g, '-')}`}
            >
              <CardHeader className="p-4 md:p-6">
                <div className="flex items-start justify-between gap-3 md:gap-4">
                  <div className={`w-10 h-10 md:w-12 md:h-12 rounded-xl ${report.bgColor} flex items-center justify-center flex-shrink-0`}>
                    <Icon className={`h-5 w-5 md:h-6 md:w-6 ${report.color}`} />
                  </div>
                  {report.available ? (
                    <FileText className="h-4 w-4 md:h-5 md:w-5 text-muted-foreground" />
                  ) : (
                    <Badge variant="secondary" className="text-xs">Coming Soon</Badge>
                  )}
                </div>
                <CardTitle className="mt-3 md:mt-4 text-base md:text-lg">{report.title}</CardTitle>
                <CardDescription className="text-sm md:text-base">
                  {report.description}
                </CardDescription>
              </CardHeader>
              <CardContent className="p-4 md:p-6 pt-0">
                <div className={`flex items-center text-xs md:text-sm font-medium ${report.available ? 'text-primary' : 'text-muted-foreground'}`}>
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
