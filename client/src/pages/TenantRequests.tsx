import { PreviewableImage } from "@/components/ImagePreview";
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ArrowLeft, MessageSquare, ClipboardList, Plus } from "lucide-react";
import { useLocation, Link, useSearch } from "wouter";
import { format } from "date-fns";
import {
  Breadcrumb,
  BreadcrumbList,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbSeparator,
  BreadcrumbPage,
} from "@/components/ui/breadcrumb";
import { TenantLogRequestDialog } from "@/components/TenantLogRequestDialog";
import { cn } from "@/lib/utils";
import { pagePad, textBreak } from "@/lib/responsive";

const statusColors: Record<string, string> = {
  open: "bg-yellow-100 text-yellow-800",
  in_progress: "bg-blue-100 text-blue-800",
  completed: "bg-green-100 text-green-800",
  closed: "bg-gray-100 text-gray-800",
};

const priorityColors: Record<string, string> = {
  low: "bg-gray-100 text-gray-800",
  medium: "bg-blue-100 text-blue-800",
  high: "bg-orange-100 text-orange-800",
  urgent: "bg-red-100 text-red-800",
};

interface TenantRequestsProps {
  /** When true (e.g. /tenant/log-request), open the create dialog on mount */
  openCreateOnMount?: boolean;
}

export default function TenantRequests({ openCreateOnMount = false }: TenantRequestsProps) {
  const [, navigate] = useLocation();
  const search = useSearch();
  const urlParams = new URLSearchParams(search);
  const shouldCreate = urlParams.get("create") === "true";

  const [isCreateOpen, setIsCreateOpen] = useState(openCreateOnMount || shouldCreate);

  const { data: requests = [], isLoading } = useQuery<any[]>({
    queryKey: ["/api/tenant/maintenance-requests"],
  });

  useEffect(() => {
    if (shouldCreate || openCreateOnMount) {
      setIsCreateOpen(true);
    }
  }, [shouldCreate, openCreateOnMount]);

  const handleDialogChange = (open: boolean) => {
    setIsCreateOpen(open);
    if (!open && shouldCreate) {
      navigate("/tenant/requests", { replace: true });
    }
    if (!open && openCreateOnMount) {
      navigate("/tenant/requests", { replace: true });
    }
  };

  if (isLoading) {
    return (
      <div className={cn(pagePad, "space-y-4 md:space-y-6 min-w-0")}>
        <Skeleton className="h-12 w-64" />
        <Skeleton className="h-32" />
        <Skeleton className="h-32" />
      </div>
    );
  }

  return (
    <div className={cn(pagePad, "space-y-4 md:space-y-6 min-w-0")}>
      <Breadcrumb className="mb-4">
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink asChild>
              <Link href="/tenant/home">Home</Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>Requests</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-4">
        <div className="flex items-start sm:items-center gap-3 sm:gap-4 min-w-0">
          <Button
            variant="ghost"
            onClick={() => navigate("/tenant/home")}
            data-testid="button-back-home"
            className="shrink-0"
          >
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back
          </Button>
          <div className="min-w-0">
            <h1 className="text-xl md:text-2xl font-bold">My Maintenance Requests</h1>
            <p className="text-muted-foreground text-sm">
              Track your submitted maintenance requests
            </p>
          </div>
        </div>
        <Button
          onClick={() => setIsCreateOpen(true)}
          data-testid="button-log-new-request"
          className="w-full sm:w-auto shrink-0"
        >
          <Plus className="h-4 w-4 mr-2" />
          Log a Maintenance Request
        </Button>
      </div>

      {requests.length === 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>No Requests Yet</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-muted-foreground">
              You haven't submitted any maintenance requests yet.
            </p>
            <div className="flex flex-col sm:flex-row gap-2">
              <Button onClick={() => setIsCreateOpen(true)} data-testid="button-new-request">
                <ClipboardList className="h-4 w-4 mr-2" />
                Log a Maintenance Request
              </Button>
              <Button variant="outline" onClick={() => navigate("/tenant/maintenance")} data-testid="button-ai-help">
                <MessageSquare className="h-4 w-4 mr-2" />
                Get AI Help
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {requests.map((request) => (
            <Card key={request.id} data-testid={`request-${request.id}`}>
              <CardHeader>
                <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                  <div className={cn("flex-1 min-w-0", textBreak)}>
                    <CardTitle className="text-lg">{request.title}</CardTitle>
                    {request.description && (
                      <p className="text-sm text-muted-foreground mt-2">
                        {request.description}
                      </p>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-2 shrink-0">
                    <Badge className={statusColors[request.status] || ""}>
                      {request.status}
                    </Badge>
                    <Badge className={priorityColors[request.priority] || ""}>
                      {request.priority}
                    </Badge>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-4 min-w-0">
                {request.photoUrls && request.photoUrls.length > 0 && (
                  <div className="flex gap-2 overflow-x-auto max-w-full">
                    {request.photoUrls.map((url: string, index: number) => (
                      <PreviewableImage
                        key={index}
                        src={url}
                        alt={`Maintenance photo ${index + 1}`}
                        title={request.title || "Maintenance request"}
                        caption={`Photo ${index + 1}`}
                        gallery={request.photoUrls.map((src: string, photoIndex: number) => ({
                          src,
                          alt: `Maintenance photo ${photoIndex + 1}`,
                          title: request.title || "Maintenance request",
                          caption: `Photo ${photoIndex + 1}`,
                        }))}
                        index={index}
                        className="h-24 w-24 object-cover rounded-lg shrink-0"
                      />
                    ))}
                  </div>
                )}
                {request.aiSuggestedFixes && (
                  <div className={cn("p-3 bg-muted rounded-lg", textBreak)}>
                    <div className="text-sm font-semibold mb-1">AI Suggested Fixes:</div>
                    <div className="text-sm text-muted-foreground whitespace-pre-wrap">
                      {request.aiSuggestedFixes}
                    </div>
                  </div>
                )}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1 text-xs text-muted-foreground">
                  <span>
                    Submitted: {format(new Date(request.createdAt), "MMM dd, yyyy HH:mm")}
                  </span>
                  {request.assignedTo && (
                    <span>
                      Assigned to maintenance team
                    </span>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <TenantLogRequestDialog
        open={isCreateOpen}
        onOpenChange={handleDialogChange}
      />
    </div>
  );
}
