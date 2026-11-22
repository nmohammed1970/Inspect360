import { useEffect, useRef, useState } from "react";
import { useLocation, useParams } from "wouter";
import { Loader2 } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

/** Creates a draft invoice then redirects to the builder (or reuses existing draft). */
export default function WorkOrderInvoiceNew() {
  const params = useParams<{ workOrderId: string }>();
  const workOrderId = params.workOrderId;
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [error, setError] = useState<string | null>(null);
  const started = useRef(false);

  useEffect(() => {
    if (!workOrderId || started.current) return;
    started.current = true;

    (async () => {
      try {
        const existingRes = await fetch(`/api/work-orders/${workOrderId}/invoices`, {
          credentials: "include",
        });
        if (existingRes.ok) {
          const list = (await existingRes.json()) as Array<{ id: string; status: string }>;
          const draft = list.find((inv) => inv.status === "draft");
          if (draft) {
            setLocation(`/work-orders/${workOrderId}/invoices/${draft.id}`, { replace: true });
            return;
          }
        }

        const res = await apiRequest("POST", `/api/work-orders/${workOrderId}/invoices`);
        const invoice = await res.json();
        setLocation(`/work-orders/${workOrderId}/invoices/${invoice.id}`, { replace: true });
      } catch (e) {
        const message = e instanceof Error ? e.message : "Failed to create invoice";
        setError(message);
        toast({ title: "Could not create invoice", description: message, variant: "destructive" });
      }
    })();
  }, [workOrderId, setLocation, toast]);

  if (error) {
    return (
      <div className="p-8 text-center space-y-3">
        <p className="text-destructive">{error}</p>
        <button
          type="button"
          className="text-primary underline"
          onClick={() => setLocation("/maintenance?tab=work-orders")}
        >
          Back to maintenance
        </button>
      </div>
    );
  }

  return (
    <div className="flex items-center justify-center p-16 gap-2 text-muted-foreground">
      <Loader2 className="h-5 w-5 animate-spin" />
      Creating invoice…
    </div>
  );
}
