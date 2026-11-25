import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Loader2, AlertCircle } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatGbpMinor } from "@shared/rentSchema";

function money(minor: number | null | undefined) {
  return formatGbpMinor(Number(minor) || 0);
}

export default function TenantMyRent() {
  const { toast } = useToast();
  const [ref, setRef] = useState("");
  const [note, setNote] = useState("");
  const [amount, setAmount] = useState("");

  const { data, isLoading, error } = useQuery<any>({
    queryKey: ["/api/tenant/me/rent"],
    queryFn: async () => (await apiRequest("GET", "/api/tenant/me/rent")).json(),
  });

  const discrepancyMutation = useMutation({
    mutationFn: async () =>
      (
        await apiRequest("POST", "/api/tenant/me/rent/discrepancy", {
          reference: ref,
          note,
          amount,
        })
      ).json(),
    onSuccess: (r) => {
      toast({ title: r.message || "Discrepancy submitted" });
      setRef("");
      setNote("");
      setAmount("");
    },
    onError: (e: Error) => toast({ variant: "destructive", title: e.message }),
  });

  if (isLoading) {
    return (
      <div className="flex justify-center p-12">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6">
        <Card>
          <CardHeader>
            <CardTitle>My Rent</CardTitle>
            <CardDescription>{(error as Error).message}</CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  const balances = data?.balances || {};

  return (
    <div className="p-4 sm:p-6 space-y-4 max-w-3xl mx-auto">
      <div>
        <h1 className="text-2xl font-bold">My Rent</h1>
        <p className="text-sm text-muted-foreground">
          {data?.property?.name} · Reference {data?.account?.payerReference}
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Card>
          <CardContent className="pt-4">
            <div className="text-xs text-muted-foreground">Monthly rent</div>
            <div className="text-2xl font-bold">{money(data?.monthlyRentMinor)}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="text-xs text-muted-foreground">Next due</div>
            <div className="text-2xl font-bold">
              {balances.nextDueDate ? String(balances.nextDueDate).slice(0, 10) : "—"}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="text-xs text-muted-foreground">Overdue balance</div>
            <div className={`text-2xl font-bold ${balances.arrearsMinor ? "text-red-700" : ""}`}>
              {money(balances.arrearsMinor)}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="text-xs text-muted-foreground">Credit (unapplied)</div>
            <div className="text-2xl font-bold">{money(data?.account?.unappliedCreditMinor)}</div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Charge history</CardTitle>
        </CardHeader>
        <CardContent className="space-y-1">
          {(data?.charges || []).map((c: any) => (
            <div key={c.id} className="flex justify-between text-sm border-b py-2">
              <span>
                {String(c.dueDate).slice(0, 10)} · {c.status}
              </span>
              <span>
                {money(c.allocatedMinor)} / {money(c.amountMinor)}
              </span>
            </div>
          ))}
          {!data?.charges?.length && (
            <p className="text-sm text-muted-foreground">No charges yet.</p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Receipts</CardTitle>
        </CardHeader>
        <CardContent className="space-y-1">
          {(data?.receipts || []).map((r: any) => (
            <div key={r.id} className="flex justify-between text-sm border-b py-2">
              <span>
                {String(r.receivedAt).slice(0, 10)} · {r.reference || r.id.slice(0, 8)}
              </span>
              <b>{money(r.amountMinor)}</b>
            </div>
          ))}
          {!data?.receipts?.length && (
            <p className="text-sm text-muted-foreground">No confirmed receipts.</p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <AlertCircle className="h-4 w-4" /> Report a payment discrepancy
          </CardTitle>
          <CardDescription>
            This does not mark rent as paid. Staff will review your evidence before updating the ledger.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div>
            <Label>Payment reference</Label>
            <Input value={ref} onChange={(e) => setRef(e.target.value)} />
          </div>
          <div>
            <Label>Amount you paid (£)</Label>
            <Input value={amount} onChange={(e) => setAmount(e.target.value)} />
          </div>
          <div>
            <Label>Notes</Label>
            <Textarea rows={3} value={note} onChange={(e) => setNote(e.target.value)} />
          </div>
          <Button
            disabled={discrepancyMutation.isPending || (!ref && !note)}
            onClick={() => discrepancyMutation.mutate()}
          >
            Submit for review
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
