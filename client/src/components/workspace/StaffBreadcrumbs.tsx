import { Link, useLocation } from "wouter";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";

const SEGMENT_LABELS: Record<string, string> = {
  dashboard: "Dashboard",
  blocks: "Blocks",
  properties: "Properties",
  inspections: "Inspections",
  comparisons: "Comparisons",
  compliance: "Compliance",
  hmo: "HMO portfolio",
  rules: "Rules",
  maintenance: "Maintenance",
  finance: "Quotes & Invoicing",
  feedback: "Feedback",
  analytics: "Work orders",
  reports: "Reports",
  "asset-inventory": "Asset Inventory",
  "community-moderation": "Community",
  billing: "Billing",
  contacts: "Contacts",
  settings: "Settings",
  team: "Team",
  profile: "Profile",
  credits: "Credits",
  capture: "Capture",
  review: "Review",
  report: "Report",
  tenants: "Tenants",
};

function labelFor(segment: string): string {
  if (SEGMENT_LABELS[segment]) return SEGMENT_LABELS[segment];
  // UUID-ish ids → "Details"
  if (/^[0-9a-f-]{8,}$/i.test(segment)) return "Details";
  return segment
    .split("-")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

/**
 * Path-derived breadcrumbs for the staff shell (Workspace > …).
 */
export function StaffBreadcrumbs() {
  const [location] = useLocation();
  const path = location.split("?")[0] || "/";
  const parts = path.split("/").filter(Boolean);

  if (parts.length === 0) {
    return (
      <Breadcrumb className="hidden min-w-0 sm:block">
        <BreadcrumbList className="text-xs sm:text-sm">
          <BreadcrumbItem>
            <BreadcrumbPage>Workspace</BreadcrumbPage>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>Dashboard</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>
    );
  }

  const crumbs = parts.map((seg, i) => {
    const href = "/" + parts.slice(0, i + 1).join("/");
    return { href, label: labelFor(seg), isLast: i === parts.length - 1 };
  });

  return (
    <Breadcrumb className="hidden min-w-0 sm:block">
      <BreadcrumbList className="flex-nowrap text-xs sm:text-sm overflow-hidden">
        <BreadcrumbItem>
          <BreadcrumbLink asChild>
            <Link href="/dashboard">Workspace</Link>
          </BreadcrumbLink>
        </BreadcrumbItem>
        {crumbs.map((c) => (
          <span key={c.href} className="contents">
            <BreadcrumbSeparator />
            <BreadcrumbItem className="min-w-0">
              {c.isLast ? (
                <BreadcrumbPage className="truncate max-w-[10rem] md:max-w-[16rem]">
                  {c.label}
                </BreadcrumbPage>
              ) : (
                <BreadcrumbLink asChild>
                  <Link href={c.href} className="truncate max-w-[8rem] md:max-w-[12rem]">
                    {c.label}
                  </Link>
                </BreadcrumbLink>
              )}
            </BreadcrumbItem>
          </span>
        ))}
      </BreadcrumbList>
    </Breadcrumb>
  );
}
