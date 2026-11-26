import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { BookOpen, Download, ExternalLink, FileText } from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { PdfActionButton } from "@/components/PdfActionButton";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { cn } from "@/lib/utils";
import { pagePad } from "@/lib/responsive";
import { useState } from "react";

export default function CommunicationsGuide() {
  const { toast } = useToast();
  const [downloading, setDownloading] = useState(false);

  const guideQuery = useQuery<string>({
    queryKey: ["/api/communications/guide"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/communications/guide");
      return res.text();
    },
  });

  const downloadPdf = async () => {
    setDownloading(true);
    try {
      const res = await apiRequest("GET", "/api/communications/guide.pdf");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "communications-hub-guide.pdf";
      a.click();
      URL.revokeObjectURL(url);
      toast({ title: "PDF downloaded" });
    } catch (e: any) {
      toast({
        variant: "destructive",
        title: "PDF download failed",
        description: e?.message || "Try again",
      });
    } finally {
      setDownloading(false);
    }
  };

  return (
    <div className={cn("container mx-auto min-w-0 space-y-6", pagePad)}>
      <PageHeader
        icon={BookOpen}
        title="How Communications Hub works"
        description="What we added and how operators and tenants use it day to day"
        actions={
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" asChild>
              <Link href="/communications">Inbox</Link>
            </Button>
            <PdfActionButton
              variant="brand"
              onClick={downloadPdf}
              pending={downloading}
              data-testid="button-download-comms-guide-pdf"
            >
              <Download className="w-4 h-4 mr-1.5" />
              Download PDF
            </PdfActionButton>
          </div>
        }
      />

      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_16rem] gap-4">
        <div className="rounded-lg border border-border/80 bg-card overflow-hidden min-h-[24rem]">
          {guideQuery.isLoading ? (
            <div className="p-6 space-y-3">
              <Skeleton className="h-8 w-2/3" />
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-5/6" />
              <Skeleton className="h-4 w-4/5" />
            </div>
          ) : guideQuery.isError ? (
            <div className="p-6 text-sm text-muted-foreground">
              Could not load the guide. Use Download PDF or open the HTML version.
            </div>
          ) : (
            <iframe
              title="Communications Hub guide"
              srcDoc={guideQuery.data}
              className="w-full min-h-[70vh] border-0 bg-white"
              sandbox=""
            />
          )}
        </div>

        <aside className="space-y-3">
          <div className="rounded-lg border border-border/80 bg-card p-4 space-y-2">
            <div className="flex items-center gap-2 text-sm font-medium">
              <FileText className="w-4 h-4" />
              Report
            </div>
            <p className="text-xs text-muted-foreground">
              Branded PDF of this guide — same content as the preview.
            </p>
            <PdfActionButton
              className="w-full"
              variant="brand"
              onClick={downloadPdf}
              pending={downloading}
            >
              <Download className="w-4 h-4 mr-1.5" />
              Download PDF
            </PdfActionButton>
            <Button className="w-full" variant="outline" asChild>
              <a href="/api/communications/guide" target="_blank" rel="noreferrer">
                <ExternalLink className="w-4 h-4 mr-1.5" />
                Open HTML
              </a>
            </Button>
          </div>
          <div className="rounded-lg border border-border/80 bg-card p-4 space-y-2 text-sm">
            <p className="font-medium">Quick links</p>
            <ul className="space-y-1 text-muted-foreground">
              <li>
                <Link href="/communications" className="hover:text-foreground underline-offset-2 hover:underline">
                  Inbox
                </Link>
              </li>
              <li>
                <Link href="/communications/settings" className="hover:text-foreground underline-offset-2 hover:underline">
                  Workflow settings
                </Link>
              </li>
              <li>
                <Link href="/communications/analytics" className="hover:text-foreground underline-offset-2 hover:underline">
                  Analytics
                </Link>
              </li>
              <li>
                <Link href="/settings" className="hover:text-foreground underline-offset-2 hover:underline">
                  Enable module (Internal Modules)
                </Link>
              </li>
            </ul>
          </div>
        </aside>
      </div>
    </div>
  );
}
