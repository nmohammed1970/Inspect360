import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { RefreshCw, ExternalLink, CheckCircle, AlertCircle } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface FixfloSyncButtonProps {
  requestId: string;
  propertyId: string;
  fixfloIssueId?: string | null;
  fixfloStatus?: string | null;
  fixfloContractorName?: string | null;
  title: string;
}

export function FixfloSyncButton({
  requestId,
  propertyId,
  fixfloIssueId,
  fixfloStatus,
  fixfloContractorName,
  title,
}: FixfloSyncButtonProps) {
  const { toast } = useToast();
  const [isDialogOpen, setIsDialogOpen] = useState(false);

  // Sync to Fixflo mutation
  const syncMutation = useMutation({
    mutationFn: async () => {
      return await apiRequest("POST", "/api/fixflo/issues", {
        maintenanceRequestId: requestId,
        propertyId,
      });
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/maintenance"] });
      toast({
        title: "Synced to Fixflo",
        description: `Maintenance request "${title}" has been synced to Fixflo`,
      });
      setIsDialogOpen(false);
    },
    onError: (error: Error) => {
      toast({
        variant: "destructive",
        title: "Sync Failed",
        description: error.message || "Failed to sync to Fixflo. Please check your integration settings.",
      });
    },
  });

  const handleSync = () => {
    syncMutation.mutate();
  };

  // If already synced, show status badge
  if (fixfloIssueId) {
    return (
      <div className="flex flex-col gap-1" data-testid={`fixflo-status-${requestId}`}>
        <Tooltip>
          <TooltipTrigger asChild>
            <Badge 
              variant="outline" 
              className="gap-1 cursor-help"
              data-testid={`badge-fixflo-status-${requestId}`}
            >
              <CheckCircle className="w-3 h-3 text-green-500" />
              Synced to Fixflo
            </Badge>
          </TooltipTrigger>
          <TooltipContent>
            <div className="text-xs space-y-1">
              <p><strong>Issue ID:</strong> {fixfloIssueId}</p>
              {fixfloStatus && <p><strong>Status:</strong> {fixfloStatus}</p>}
              {fixfloContractorName && <p><strong>Contractor:</strong> {fixfloContractorName}</p>}
            </div>
          </TooltipContent>
        </Tooltip>
        {fixfloContractorName && (
          <Badge variant="secondary" className="text-xs" data-testid={`badge-contractor-${requestId}`}>
            {fixfloContractorName}
          </Badge>
        )}
      </div>
    );
  }

  // Show sync button for unsync'd requests
  return (
    <>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setIsDialogOpen(true)}
            className="gap-2"
            data-testid={`button-sync-fixflo-${requestId}`}
          >
            <ExternalLink className="w-4 h-4" />
            Sync to Fixflo
          </Button>
        </TooltipTrigger>
        <TooltipContent>
          <p>Send this maintenance request to Fixflo</p>
        </TooltipContent>
      </Tooltip>

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Sync to Fixflo</DialogTitle>
            <DialogDescription>
              This will create a new issue in Fixflo for this maintenance request.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <p className="text-sm font-medium">Maintenance Request</p>
              <p className="text-sm text-muted-foreground">{title}</p>
            </div>
            <div className="p-4 bg-muted rounded-md">
              <p className="text-xs text-muted-foreground mb-2">
                The following information will be synced to Fixflo:
              </p>
              <ul className="text-xs text-muted-foreground space-y-1 list-disc list-inside">
                <li>Request title and description</li>
                <li>Priority level</li>
                <li>Property information</li>
                <li>Any uploaded photos</li>
              </ul>
            </div>
            <div className="flex items-start gap-2 p-3 bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-800 rounded-md">
              <AlertCircle className="w-4 h-4 text-blue-600 dark:text-blue-400 mt-0.5" />
              <p className="text-xs text-blue-900 dark:text-blue-100">
                Once synced, status updates from Fixflo will automatically be reflected here.
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setIsDialogOpen(false)}
              disabled={syncMutation.isPending}
              data-testid="button-cancel-sync"
            >
              Cancel
            </Button>
            <Button
              onClick={handleSync}
              disabled={syncMutation.isPending}
              data-testid="button-confirm-sync"
            >
              {syncMutation.isPending ? (
                <>
                  <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                  Syncing...
                </>
              ) : (
                <>
                  <ExternalLink className="w-4 h-4 mr-2" />
                  Sync to Fixflo
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
