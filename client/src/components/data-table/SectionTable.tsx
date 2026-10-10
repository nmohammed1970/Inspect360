import type { LucideIcon } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

type SectionTableProps = {
  title: string;
  icon: LucideIcon;
  count: number;
  children: React.ReactNode;
  id?: string;
  className?: string;
};

/**
 * Report section chrome: icon + title + count badge wrapping a table.
 */
export function SectionTable({
  title,
  icon: Icon,
  count,
  children,
  id,
  className,
}: SectionTableProps) {
  return (
    <Card
      id={id}
      className={cn(
        "clean-card overflow-hidden shadow-card scroll-mt-4",
        className,
      )}
    >
      <CardHeader className="border-b bg-muted/40 py-3.5 px-4 md:px-5">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-9 h-9 rounded-lg bg-muted flex items-center justify-center flex-shrink-0">
              <Icon className="h-4 w-4 text-muted-foreground" aria-hidden />
            </div>
            <CardTitle className="text-base md:text-lg font-semibold tracking-tight truncate font-heading">
              {title}
            </CardTitle>
          </div>
          <Badge variant="secondary" className="tabular-nums font-medium flex-shrink-0">
            {count}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="p-0 bg-background min-w-0">
        <div className="overflow-x-auto overscroll-x-contain">{children}</div>
      </CardContent>
    </Card>
  );
}
