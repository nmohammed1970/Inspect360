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
      <div className="p-6 space-y-6">
        <Skeleton className="h-12 w-64" />
        <Skeleton className="h-32" />
        <Skeleton className="h-32" />
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
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
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-4">
          <Button
            variant="ghost"
            onClick={() => navigate("/tenant/home")}
            data-testid="button-back-home"
          >
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back
          </Button>
          <div>
            <h1 className="text-2xl font-bold">My Maintenance Requests</h1>
            <p className="text-muted-foreground text-sm">
              Track your submitted maintenance requests
            </p>
          </div>
        </div>
        <Button
          onClick={() => setIsCreateOpen(true)}
          data-testid="button-log-new-request"
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
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <CardTitle className="text-lg">{request.title}</CardTitle>
                    {request.description && (
                      <p className="text-sm text-muted-foreground mt-2">
                        {request.description}
                      </p>
                    )}
                  </div>
                  <div className="flex gap-2">
                    <Badge className={statusColors[request.status] || ""}>
                      {request.status}
                    </Badge>
                    <Badge className={priorityColors[request.priority] || ""}>
                      {request.priority}
                    </Badge>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                {request.photoUrls && request.photoUrls.length > 0 && (
                  <div className="flex gap-2 overflow-x-auto">
                    {request.photoUrls.map((url: string, index: number) => (
                      <img
                        key={index}
                        src={url}
                        alt={`Photo ${index + 1}`}
                        className="h-24 w-24 object-cover rounded-lg"
                      />
                    ))}
                  </div>
                )}
                {request.aiSuggestedFixes && (
                  <div className="p-3 bg-muted rounded-lg">
                    <div className="text-sm font-semibold mb-1">AI Suggested Fixes:</div>
                    <div className="text-sm text-muted-foreground whitespace-pre-wrap">
                      {request.aiSuggestedFixes}
                    </div>
                  </div>
                )}
                <div className="flex items-center justify-between text-xs text-muted-foreground">
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
