import { useEffect, useRef, useState } from "react";
import SignatureCanvas from "react-signature-canvas";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { createSignatureValue, parseSignatureValue } from "@shared/signature";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { dialogContentBase } from "@/lib/responsive";
import { cn } from "@/lib/utils";
import {
  WorkOrderCompletionChecklistPanel,
  useWorkOrderCompletionChecklist,
} from "@/components/WorkOrderCompletionChecklistPanel";

type Props = {
  workOrderId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCompleted?: () => void;
  existingSignature?: unknown;
};

export function WorkOrderCompleteDialog({
  workOrderId,
  open,
  onOpenChange,
  onCompleted,
  existingSignature,
}: Props) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const padRef = useRef<SignatureCanvas>(null);
  const [padKey, setPadKey] = useState(0);
  const [signerName, setSignerName] = useState("");
  const [savedImage, setSavedImage] = useState<string | null>(null);
  const [editingPad, setEditingPad] = useState(true);

  const { data: checklist } = useWorkOrderCompletionChecklist(
    open && workOrderId ? workOrderId : undefined,
  );

  const parsedExisting = parseSignatureValue(existingSignature);
  const displayImage = savedImage || parsedExisting?.image || null;
  const requiredIncomplete = checklist?.progress?.requiredIncomplete ?? 0;
  const hasChecklist = !!checklist?.snapshot?.items?.length;
  const checklistOk = !hasChecklist || requiredIncomplete === 0;

  useEffect(() => {
    if (!open) {
      setSavedImage(null);
      setSignerName("");
      setEditingPad(true);
      setPadKey((k) => k + 1);
      return;
    }
    if (parsedExisting?.image) {
      setSavedImage(parsedExisting.image);
      setEditingPad(false);
      if (parsedExisting.signedByName) setSignerName(parsedExisting.signedByName);
    } else {
      setEditingPad(true);
    }
  }, [open, workOrderId]);

  const completeMutation = useMutation({
    mutationFn: async () => {
      let image = savedImage || parsedExisting?.image || null;
      if (!image && padRef.current && !padRef.current.isEmpty()) {
        image = padRef.current.toDataURL();
      }
      if (!image) {
        throw new Error("Customer signature is required");
      }
      if (requiredIncomplete > 0) {
        throw new Error(
          `${requiredIncomplete} required checklist step${
            requiredIncomplete === 1 ? " is" : "s are"
          } still unfinished.`,
        );
      }
      const payload = createSignatureValue(image, signerName.trim() || undefined);
      await apiRequest("PUT", `/api/work-orders/${workOrderId}/customer-signature`, payload);
      await apiRequest("PATCH", `/api/work-orders/${workOrderId}/status`, {
        status: "completed",
      });
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["/api/work-orders"] });
      await queryClient.invalidateQueries({ queryKey: ["/api/analytics/work-orders"] });
      toast({ title: "Work order completed" });
      onOpenChange(false);
      onCompleted?.();
    },
    onError: (err: Error) => {
      toast({
        variant: "destructive",
        title: "Cannot complete",
        description: err.message,
      });
    },
  });

  return (
    <Dialog open={open && !!workOrderId} onOpenChange={onOpenChange}>
      <DialogContent
        className={cn(dialogContentBase, "max-w-lg max-h-[90vh] overflow-y-auto")}
        data-testid="dialog-complete-work-order"
      >
        <DialogHeader>
          <DialogTitle>Complete work order</DialogTitle>
          <DialogDescription>
            Finish required checklist steps and capture the customer signature before marking
            completed.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {workOrderId && hasChecklist && (
            <WorkOrderCompletionChecklistPanel workOrderId={workOrderId} compact />
          )}

          {hasChecklist && requiredIncomplete > 0 && (
            <p className="text-sm text-amber-700 dark:text-amber-400 font-medium">
              {requiredIncomplete} required checklist step
              {requiredIncomplete === 1 ? " is" : "s are"} still unfinished.
            </p>
          )}

          <div className="space-y-2">
            <Label htmlFor="customer-signer-name">Customer name (optional)</Label>
            <Input
              id="customer-signer-name"
              value={signerName}
              onChange={(e) => setSignerName(e.target.value)}
              placeholder="Name of person signing"
              data-testid="input-customer-signer-name"
            />
          </div>

          <div className="space-y-2">
            <Label>Customer signature</Label>
            {!editingPad && displayImage ? (
              <div className="space-y-2">
                <img
                  src={displayImage}
                  alt="Customer signature"
                  className="w-full max-h-40 object-contain border rounded-md bg-white"
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setEditingPad(true);
                    setSavedImage(null);
                    setPadKey((k) => k + 1);
                  }}
                >
                  Re-sign
                </Button>
              </div>
            ) : (
              <div className="space-y-2">
                <div className="border rounded-md bg-white overflow-hidden">
                  <SignatureCanvas
                    key={padKey}
                    ref={padRef}
                    canvasProps={{
                      className: "w-full h-36",
                      style: { width: "100%", height: 144 },
                    }}
                    backgroundColor="#ffffff"
                  />
                </div>
                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      padRef.current?.clear();
                      setPadKey((k) => k + 1);
                    }}
                  >
                    Clear
                  </Button>
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    onClick={() => {
                      if (!padRef.current || padRef.current.isEmpty()) {
                        toast({
                          variant: "destructive",
                          title: "Draw a signature first",
                        });
                        return;
                      }
                      setSavedImage(padRef.current.toDataURL());
                      setEditingPad(false);
                    }}
                  >
                    Use signature
                  </Button>
                </div>
              </div>
            )}
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={() => completeMutation.mutate()}
            disabled={!checklistOk || completeMutation.isPending}
            data-testid="button-confirm-complete-work-order"
          >
            {completeMutation.isPending ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Completing…
              </>
            ) : (
              "Mark completed"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
