import { Link } from "wouter";
import { cn } from "@/lib/utils";

type CellStackProps = {
  title: string;
  sub?: string | null;
  href?: string | null;
  subHref?: string | null;
  className?: string;
};

/**
 * Primary title (+ optional link) with muted secondary line for table cells.
 */
export function CellStack({ title, sub, href, subHref, className }: CellStackProps) {
  const titleNode = href ? (
    <Link href={href}>
      <span className="font-medium text-sm text-primary hover:underline cursor-pointer leading-snug focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 rounded-sm">
        {title || "—"}
      </span>
    </Link>
  ) : (
    <div className="font-medium text-sm text-foreground leading-snug">{title || "—"}</div>
  );

  const subNode = sub ? (
    subHref ? (
      <Link href={subHref}>
        <div className="text-xs text-primary/80 hover:underline cursor-pointer leading-snug line-clamp-2">
          {sub}
        </div>
      </Link>
    ) : (
      <div className="text-xs text-muted-foreground leading-snug line-clamp-2" title={sub}>
        {sub}
      </div>
    )
  ) : null;

  return (
    <div className={cn("min-w-0 space-y-0.5", className)}>
      {titleNode}
      {subNode}
    </div>
  );
}
