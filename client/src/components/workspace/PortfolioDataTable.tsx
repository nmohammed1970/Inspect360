import type { ReactNode } from "react";
import { ArrowRight } from "lucide-react";
import { Link } from "wouter";
import { ContextualLink } from "@/navigation";
import { cn } from "@/lib/utils";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

type PortfolioDataTableProps = {
  children: ReactNode;
  className?: string;
  minWidth?: string;
};

/** Wrapper around shared Table with portfolio surface defaults. */
export function PortfolioDataTable({
  children,
  className,
  minWidth = "720px",
}: PortfolioDataTableProps) {
  return (
    <div
      className={cn(
        "overflow-hidden rounded-lg border border-border/80 bg-card shadow-sm",
        className,
      )}
    >
      <Table minWidth={minWidth}>{children}</Table>
    </div>
  );
}

export {
  TableHeader as PortfolioTableHeader,
  TableBody as PortfolioTableBody,
  TableRow as PortfolioTableRow,
  TableHead as PortfolioTableHead,
  TableCell as PortfolioTableCell,
};

type OpenRowLinkProps = {
  href: string;
  label?: string;
  className?: string;
  testId?: string;
  /** When set, records NavContext for breadcrumbs */
  fromLabel?: string;
};

/** Teal “Open →” row action from the template. */
export function OpenRowLink({
  href,
  label = "Open",
  className,
  testId,
  fromLabel,
}: OpenRowLinkProps) {
  const classNames = cn(
    "inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline underline-offset-2",
    className,
  );
  const children = (
    <>
      {label}
      <ArrowRight className="h-3.5 w-3.5" aria-hidden />
    </>
  );
  if (fromLabel) {
    return (
      <ContextualLink
        href={href}
        fromLabel={fromLabel}
        data-testid={testId}
        className={classNames}
      >
        {children}
      </ContextualLink>
    );
  }
  return (
    <Link href={href} data-testid={testId} className={classNames}>
      {children}
    </Link>
  );
}
