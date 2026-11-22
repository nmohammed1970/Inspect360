import { Download, ExternalLink, FileText, Maximize2 } from "lucide-react";
import { PreviewableImage } from "@/components/ImagePreview";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { overviewCardClass } from "@/components/property/overviewChrome";

type PropertyFloorPlanPanelProps = {
  floorPlanUrl: string;
  fileName?: string | null;
  mimeType?: string | null;
  analysisStatus?: string | null;
  className?: string;
};

function isPdfFloorPlan(mimeType?: string | null, fileName?: string | null) {
  return (
    (mimeType || "").includes("pdf") ||
    (fileName || "").toLowerCase().endsWith(".pdf")
  );
}

export function PropertyFloorPlanPanel({
  floorPlanUrl,
  fileName,
  mimeType,
  analysisStatus,
  className,
}: PropertyFloorPlanPanelProps) {
  const pdf = isPdfFloorPlan(mimeType, fileName);
  const displayName = fileName || (pdf ? "PDF floor plan" : "Uploaded floor plan");
  const analysed = analysisStatus === "complete";

  return (
    <Card className={cn(overviewCardClass, className)} data-testid="card-floor-plan">
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0 space-y-1">
            <CardTitle className="flex items-center gap-2 text-base">
              <FileText className="h-4 w-4 text-primary" />
              Floor plan
            </CardTitle>
            <CardDescription className="flex flex-wrap items-center gap-2">
              <span className="truncate max-w-[min(100%,20rem)]">{displayName}</span>
              {analysed && (
                <Badge
                  variant="outline"
                  className="border-emerald-200 bg-emerald-50 text-emerald-800"
                >
                  Analysed
                </Badge>
              )}
            </CardDescription>
          </div>
          <div className="flex flex-wrap gap-1.5">
            <Button variant="outline" size="sm" className="h-8 gap-1.5" asChild>
              <a href={floorPlanUrl} target="_blank" rel="noreferrer">
                {pdf ? <ExternalLink className="h-3.5 w-3.5" /> : <Maximize2 className="h-3.5 w-3.5" />}
                {pdf ? "Open" : "View"}
              </a>
            </Button>
            <Button variant="outline" size="sm" className="h-8 gap-1.5" asChild>
              <a href={floorPlanUrl} download={fileName || undefined} target="_blank" rel="noreferrer">
                <Download className="h-3.5 w-3.5" />
                Download
              </a>
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {pdf ? (
          <div className="flex min-h-[240px] flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-border/80 bg-muted/30 px-4 py-10">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 text-primary">
              <FileText className="h-7 w-7" />
            </div>
            <div className="max-w-full space-y-1 text-center">
              <p className="truncate text-sm font-medium text-foreground px-2">{displayName}</p>
              <p className="text-xs text-muted-foreground">PDF document · open or download to view</p>
            </div>
          </div>
        ) : (
          <div className="overflow-hidden rounded-xl border border-border/80 bg-muted/30">
            <PreviewableImage
              src={floorPlanUrl}
              alt="Floor plan"
              title={displayName}
              className="mx-auto w-full min-h-[240px] max-h-[420px] object-contain p-2"
            />
          </div>
        )}
      </CardContent>
    </Card>
  );
}
