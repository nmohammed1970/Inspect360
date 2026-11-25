import { useEffect, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Link, useLocation } from "wouter";
import { Plus } from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { cn } from "@/lib/utils";
import { pagePad } from "@/lib/responsive";
import type { Organization } from "@shared/schema";

const SHORTCUTS = [
  { key: "maintenance", label: "Repair / maintenance" },
  { key: "rent_payments", label: "Rent & payments" },
  { key: "tenancy", label: "Tenancy" },
  { key: "general", label: "General" },
];

type TenancyPayload = {
  tenancy?: { id: string; propertyId: string } | null;
  property?: { id: string; name?: string; address?: string } | null;
  block?: { id: string; name?: string } | null;
} | null;

export default function TenantNewRequest() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const { user } = useAuth();
  const [shortcut, setShortcut] = useState("general");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [propertyId, setPropertyId] = useState("");
  const [tenancyId, setTenancyId] = useState("");

  const { data: organization } = useQuery<Organization>({
    queryKey: ["/api/organizations", user?.organizationId],
    enabled: !!user?.organizationId,
  });

  const tenancyQuery = useQuery<TenancyPayload>({
    queryKey: ["/api/tenant/tenancy"],
  });

  useEffect(() => {
    const t = tenancyQuery.data;
    if (!t?.tenancy) return;
    setTenancyId(t.tenancy.id);
    setPropertyId(t.property?.id || t.tenancy.propertyId || "");
  }, [tenancyQuery.data]);

  const createMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/communications/tenant/cases", {
        subject,
        body,
        shortcut,
        categoryKey: shortcut,
        propertyId: propertyId || undefined,
        tenancyId: tenancyId || undefined,
        blockId: tenancyQuery.data?.block?.id || undefined,
      });
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/communications/tenant/cases"] });
      queryClient.invalidateQueries({ queryKey: ["/api/tenant/maintenance-requests"] });
      toast({ title: "Request submitted" });
      const caseId = data?.case?.id;
      if (caseId) setLocation(`/tenant/requests/${caseId}`);
      else setLocation("/tenant/requests");
    },
    onError: (e: Error) =>
      toast({ variant: "destructive", title: "Error", description: e.message }),
  });

  const propertyLabel =
    tenancyQuery.data?.property?.name ||
    tenancyQuery.data?.property?.address ||
    "Your property";

  return (
    <div className={cn("container mx-auto max-w-2xl space-y-6", pagePad)}>
      <PageHeader
        icon={Plus}
        title="New request"
        description="Tell us what you need help with"
        actions={
          <Button variant="outline" asChild>
            <Link href="/tenant/requests">Cancel</Link>
          </Button>
        }
      />

      {organization?.communicationsEmergencyGuidance ? (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
          {organization.communicationsEmergencyGuidance}
        </div>
      ) : (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
          If there is an immediate danger (gas leak, fire, flood), leave the property if
          needed and contact emergency services before waiting for a reply.
        </div>
      )}

      <div className="rounded-lg border border-border/80 bg-card p-4 space-y-4">
        <div className="space-y-2">
          <Label>Property / tenancy</Label>
          <div className="rounded-md border border-border/60 bg-muted/30 px-3 py-2 text-sm">
            {tenancyQuery.isLoading
              ? "Loading…"
              : tenancyQuery.data?.tenancy
                ? propertyLabel
                : "No active tenancy on file — you can still submit a general request."}
          </div>
        </div>
        <div className="space-y-2">
          <Label>What is this about?</Label>
          <div className="flex flex-wrap gap-2">
            {SHORTCUTS.map((s) => (
              <Button
                key={s.key}
                type="button"
                size="sm"
                variant={shortcut === s.key ? "brand" : "outline"}
                onClick={() => setShortcut(s.key)}
              >
                {s.label}
              </Button>
            ))}
          </div>
        </div>
        <div className="space-y-2">
          <Label>Subject</Label>
          <Input value={subject} onChange={(e) => setSubject(e.target.value)} />
        </div>
        <div className="space-y-2">
          <Label>Details</Label>
          <Textarea value={body} onChange={(e) => setBody(e.target.value)} rows={5} />
        </div>
        <Button
          variant="brand"
          disabled={!subject.trim() || !body.trim() || createMutation.isPending}
          onClick={() => createMutation.mutate()}
        >
          Submit request
        </Button>
      </div>
    </div>
  );
}
