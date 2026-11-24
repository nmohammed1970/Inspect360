import { Link, useLocation } from "wouter";
import { useEffect, useState } from "react";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { buildBreadcrumbs, collapseBreadcrumbs } from "./buildBreadcrumbs";
import { useBreadcrumbLabels } from "./useBreadcrumbLabels";
import { isBreadcrumbExcluded } from "./breadcrumbRegistry";
import type { BreadcrumbItem as Crumb } from "./types";

function useCollapseThreshold() {
  const [narrow, setNarrow] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 768px)");
    const update = () => setNarrow(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);
  return narrow;
}

function CrumbNodes({
  crumbs,
  overflow,
}: {
  crumbs: Crumb[];
  overflow: Crumb[];
}) {
  return (
    <>
      {crumbs.map((c, i) => {
        const isEllipsis = c.label === "…" && overflow.length > 0;
        return (
          <span key={`${c.label}-${i}-${c.href || "cur"}`} className="contents">
            {i > 0 ? <BreadcrumbSeparator /> : null}
            <BreadcrumbItem className="min-w-0">
              {isEllipsis ? (
                <DropdownMenu>
                  <DropdownMenuTrigger
                    className="flex h-auto items-center px-1 text-muted-foreground hover:text-foreground focus:outline-none"
                    aria-label="Show more breadcrumbs"
                    data-testid="breadcrumb-overflow"
                  >
                    …
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="start">
                    {overflow.map((o) =>
                      o.href ? (
                        <DropdownMenuItem key={o.href + o.label} asChild>
                          <Link href={o.href}>{o.label}</Link>
                        </DropdownMenuItem>
                      ) : (
                        <DropdownMenuItem key={o.label} disabled>
                          {o.label}
                        </DropdownMenuItem>
                      ),
                    )}
                  </DropdownMenuContent>
                </DropdownMenu>
              ) : c.current || !c.href ? (
                <BreadcrumbPage className="truncate max-w-[10rem] md:max-w-[16rem]">
                  {c.label}
                </BreadcrumbPage>
              ) : (
                <BreadcrumbLink asChild>
                  <Link
                    href={c.href}
                    className="truncate max-w-[8rem] md:max-w-[12rem]"
                  >
                    {c.label}
                  </Link>
                </BreadcrumbLink>
              )}
            </BreadcrumbItem>
          </span>
        );
      })}
    </>
  );
}

/**
 * App-wide breadcrumb bar — staff, tenant, and admin shells.
 */
export function AppBreadcrumbs() {
  const [location] = useLocation();
  const pathname = location.split("?")[0] || "/";
  const search = location.includes("?")
    ? location.slice(location.indexOf("?"))
    : "";
  const meta = useBreadcrumbLabels();
  const narrow = useCollapseThreshold();

  if (isBreadcrumbExcluded(pathname)) {
    return null;
  }

  const crumbs = buildBreadcrumbs({ pathname, search, meta });
  if (crumbs.length === 0) return null;

  const { visible, overflow } = collapseBreadcrumbs(
    crumbs,
    narrow ? 3 : 6,
  );

  return (
    <Breadcrumb className="min-w-0 overflow-hidden" data-testid="app-breadcrumbs">
      <BreadcrumbList className="flex-nowrap text-xs sm:text-sm overflow-hidden">
        <CrumbNodes crumbs={visible} overflow={overflow} />
      </BreadcrumbList>
    </Breadcrumb>
  );
}

/** Alias for gradual migration from StaffBreadcrumbs */
export { AppBreadcrumbs as StaffBreadcrumbs };
