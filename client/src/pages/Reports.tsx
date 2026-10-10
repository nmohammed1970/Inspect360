import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Link } from "wouter";
import { cn } from "@/lib/utils";
import { pagePad, cardGridComfortable } from "@/lib/responsive";
import { PageHeader } from "@/components/PageHeader";
import {
  FileText,
  Building2,
  Home,
  Users,
  Package,
  ClipboardCheck,
  FileBarChart,
  History,
  ShieldCheck,
} from "lucide-react";
import { useCompanyModules } from "@/hooks/useCompanyModules";

export default function Reports() {
  const { tenanciesEnabled, complianceEnabled } = useCompanyModules();
  const reportCards = [
    {
      title: "Portfolio Report",
      description: "Full portfolio export as PDF or Excel — blocks, properties, inspections, and more",
      icon: FileBarChart,
      link: "/reports/portfolio",
      color: "text-primary",
      bgColor: "bg-primary/10",
      available: true,
    },
    {
      title: "Property History Report",
      description: "Complete history for one property — inspections, tenants, compliance, and more",
      icon: History,
      link: "/reports/property-history",
      color: "text-primary",
      bgColor: "bg-primary/10",
      available: true,
    },
    {
      title: "Inspections Report",
      description: "Comprehensive inspection history with status tracking and analytics",
      icon: ClipboardCheck,
      link: "/reports/inspections",
      color: "text-primary",
      bgColor: "bg-primary/10",
      available: true,
    },
    {
      title: "Blocks Report",
      description: "Block-level statistics, occupancy rates, and compliance metrics",
      icon: Building2,
      link: "/reports/blocks",
      color: "text-accent",
      bgColor: "bg-accent/10",
      available: true,
    },
    {
      title: "Properties Report",
      description: "Property portfolio overview with maintenance and inspection data",
      icon: Home,
      link: "/reports/properties",
      color: "text-chart-1",
      bgColor: "bg-chart-1/10",
      available: true,
    },
    {
      title: "Tenants Report",
      description: "Tenant occupancy, lease tracking, and rental income analysis",
      icon: Users,
      link: "/reports/tenants",
      color: "text-chart-3",
      bgColor: "bg-chart-3/10",
      available: true,
    },
    {
      title: "Inventory Report",
      description: "Asset tracking across all properties with condition reports",
      icon: Package,
      link: "/reports/inventory",
      color: "text-chart-2",
      bgColor: "bg-chart-2/10",
      available: true,
    },
    {
      title: "Compliance Report",
      description: "Document tracking and compliance management by block and property",
      icon: ShieldCheck,
      link: "/reports/compliance",
      color: "text-chart-4",
      bgColor: "bg-chart-4/10",
      available: true,
    },
  ];

  return (
    <div className={cn("container mx-auto min-w-0 space-y-4 md:space-y-6", pagePad)}>
      <PageHeader
        title="Reports"
        description="Generate detailed reports and export to PDF"
      />

      <div className={cardGridComfortable}>
        {reportCards
          .filter((report) => {
            if (report.link === "/reports/tenants") return tenanciesEnabled;
            if (report.link === "/reports/compliance") return complianceEnabled;
            return true;
          })
          .map((report) => {
          const Icon = report.icon;
          const cardContent = (
            <Card
              className={`clean-card transition-all h-full ${report.available ? "hover-elevate cursor-pointer" : "opacity-60"}`}
              data-testid={`card-report-${report.title.toLowerCase().replace(/\s+/g, "-")}`}
            >
              <CardHeader className="p-4 md:p-6">
                <div className="flex items-start justify-between gap-3 md:gap-4">
                  <div className={`w-10 h-10 md:w-12 md:h-12 rounded-xl ${report.bgColor} flex items-center justify-center flex-shrink-0`}>
                    <Icon className={`h-5 w-5 md:h-6 md:w-6 ${report.color}`} />
                  </div>
                  {report.available ? (
                    <FileText className="h-4 w-4 md:h-5 md:w-5 text-muted-foreground" />
                  ) : (
                    <Badge variant="secondary" className="text-xs">
                      Coming Soon
                    </Badge>
                  )}
                </div>
                <CardTitle className="mt-3 md:mt-4 text-base md:text-lg">{report.title}</CardTitle>
                <CardDescription className="text-sm md:text-base">
                  {report.description}
                </CardDescription>
              </CardHeader>
              <CardContent className="p-4 md:p-6 pt-0">
                <div
                  className={`flex items-center text-xs md:text-sm font-medium ${report.available ? "text-primary" : "text-muted-foreground"}`}
                >
                  {report.available ? "View Report" : "Coming Soon"}
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
            <div key={report.title}>{cardContent}</div>
          );
        })}
      </div>
    </div>
  );
}
