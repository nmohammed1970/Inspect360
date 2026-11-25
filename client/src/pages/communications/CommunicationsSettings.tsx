import { useEffect, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { Settings2 } from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { cn } from "@/lib/utils";
import { pagePad } from "@/lib/responsive";
import type { Organization } from "@shared/schema";

type Category = {
  id: string;
  key: string;
  label: string;
  defaultPriority: string;
  approvalPolicy: string;
  firstResponseHours: number;
  resolutionHours: number;
  notifyOnAssign: boolean;
  escalateOverdue: boolean;
  defaultTeamId?: string | null;
  version: number;
  active: boolean;
};

export default function CommunicationsSettings() {
  const { toast } = useToast();
  const { user } = useAuth();
  const [guidance, setGuidance] = useState("");
  const [defaultLanding, setDefaultLanding] = useState(false);

  const orgQuery = useQuery<Organization>({
    queryKey: ["/api/organizations", user?.organizationId],
    enabled: !!user?.organizationId,
  });

  const categoriesQuery = useQuery<Category[]>({
    queryKey: ["/api/communications/categories", "all"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/communications/categories?all=1");
      return res.json();
    },
  });

  const identityQuery = useQuery<any[]>({
    queryKey: ["/api/communications/channels/identity-review"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/communications/channels/identity-review");
      return res.json();
    },
  });

  const deadLetterQuery = useQuery<any[]>({
    queryKey: ["/api/communications/channels/dead-letter"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/communications/channels/dead-letter");
      return res.json();
    },
  });

  useEffect(() => {
    if (!orgQuery.data) return;
    setGuidance(orgQuery.data.communicationsEmergencyGuidance || "");
    setDefaultLanding(orgQuery.data.communicationsDefaultLanding === true);
  }, [orgQuery.data]);

  const settingsMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("PATCH", "/api/communications/settings", {
        communicationsEmergencyGuidance: guidance,
        communicationsDefaultLanding: defaultLanding,
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/organizations"] });
      toast({ title: "Settings saved" });
    },
    onError: (e: Error) =>
      toast({ variant: "destructive", title: "Error", description: e.message }),
  });

  const categoryMutation = useMutation({
    mutationFn: async (cat: Category) => {
      const res = await apiRequest("PATCH", `/api/communications/categories/${cat.id}`, {
        version: cat.version,
        firstResponseHours: cat.firstResponseHours,
        resolutionHours: cat.resolutionHours,
        approvalPolicy: cat.approvalPolicy,
        notifyOnAssign: cat.notifyOnAssign,
        escalateOverdue: cat.escalateOverdue,
        defaultPriority: cat.defaultPriority,
        active: cat.active,
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/communications/categories"] });
      toast({ title: "Category workflow updated" });
    },
    onError: (e: Error) =>
      toast({ variant: "destructive", title: "Error", description: e.message }),
  });

  const [drafts, setDrafts] = useState<Record<string, Category>>({});

  useEffect(() => {
    if (!categoriesQuery.data) return;
    const map: Record<string, Category> = {};
    for (const c of categoriesQuery.data) map[c.id] = { ...c };
    setDrafts(map);
  }, [categoriesQuery.data]);

  return (
    <div className={cn("container mx-auto min-w-0 space-y-6", pagePad)}>
      <PageHeader
        icon={Settings2}
        title="Communications settings"
        description="Category routing, SLA targets, approvals, and channel queues"
        actions={
          <Button variant="outline" asChild>
            <Link href="/communications">Inbox</Link>
          </Button>
        }
      />

      <div className="rounded-lg border border-border/80 bg-card p-4 space-y-4">
        <h3 className="font-medium">Organisation</h3>
        <div className="space-y-2">
          <Label>Emergency guidance (shown on tenant new request)</Label>
          <Textarea
            value={guidance}
            onChange={(e) => setGuidance(e.target.value)}
            rows={3}
            placeholder="If you smell gas, leave the property and call…"
          />
        </div>
        <div className="flex items-center justify-between gap-3">
          <div>
            <Label>Default landing = Communications inbox</Label>
            <p className="text-xs text-muted-foreground mt-1">
              When enabled, staff home can prefer the communications inbox.
            </p>
          </div>
          <Switch checked={defaultLanding} onCheckedChange={setDefaultLanding} />
        </div>
        <Button
          variant="brand"
          onClick={() => settingsMutation.mutate()}
          disabled={settingsMutation.isPending}
        >
          Save organisation settings
        </Button>
      </div>

      <div className="space-y-3">
        <h3 className="font-medium">Category workflows</h3>
        <p className="text-sm text-muted-foreground">
          Policies are versioned and snapshotted onto each new case.
        </p>
        {Object.values(drafts).map((cat) => (
          <div
            key={cat.id}
            className="rounded-lg border border-border/80 bg-card p-4 grid gap-3 md:grid-cols-2 lg:grid-cols-4"
          >
            <div className="md:col-span-2 lg:col-span-4 flex items-center justify-between">
              <div>
                <div className="font-medium">{cat.label}</div>
                <div className="text-xs text-muted-foreground">{cat.key} · v{cat.version}</div>
              </div>
              <div className="flex items-center gap-2">
                <Label className="text-xs">Active</Label>
                <Switch
                  checked={cat.active}
                  onCheckedChange={(on) =>
                    setDrafts((d) => ({ ...d, [cat.id]: { ...cat, active: on } }))
                  }
                />
              </div>
            </div>
            <div>
              <Label className="text-xs">First response (hours)</Label>
              <Input
                type="number"
                value={cat.firstResponseHours}
                onChange={(e) =>
                  setDrafts((d) => ({
                    ...d,
                    [cat.id]: { ...cat, firstResponseHours: Number(e.target.value) || 1 },
                  }))
                }
              />
            </div>
            <div>
              <Label className="text-xs">Resolution (hours)</Label>
              <Input
                type="number"
                value={cat.resolutionHours}
                onChange={(e) =>
                  setDrafts((d) => ({
                    ...d,
                    [cat.id]: { ...cat, resolutionHours: Number(e.target.value) || 1 },
                  }))
                }
              />
            </div>
            <div>
              <Label className="text-xs">Approval policy</Label>
              <select
                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"
                value={cat.approvalPolicy}
                onChange={(e) =>
                  setDrafts((d) => ({
                    ...d,
                    [cat.id]: { ...cat, approvalPolicy: e.target.value },
                  }))
                }
              >
                <option value="none">None</option>
                <option value="conditional">Conditional</option>
                <option value="required">Required</option>
              </select>
            </div>
            <div>
              <Label className="text-xs">Default priority</Label>
              <select
                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"
                value={cat.defaultPriority}
                onChange={(e) =>
                  setDrafts((d) => ({
                    ...d,
                    [cat.id]: { ...cat, defaultPriority: e.target.value },
                  }))
                }
              >
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
                <option value="urgent">Urgent</option>
              </select>
            </div>
            <div className="flex items-center gap-2">
              <Switch
                checked={cat.notifyOnAssign}
                onCheckedChange={(on) =>
                  setDrafts((d) => ({ ...d, [cat.id]: { ...cat, notifyOnAssign: on } }))
                }
              />
              <Label className="text-xs">Notify on assign</Label>
            </div>
            <div className="flex items-center gap-2">
              <Switch
                checked={cat.escalateOverdue}
                onCheckedChange={(on) =>
                  setDrafts((d) => ({ ...d, [cat.id]: { ...cat, escalateOverdue: on } }))
                }
              />
              <Label className="text-xs">Escalate overdue</Label>
            </div>
            <div className="md:col-span-2 lg:col-span-4">
              <Button
                size="sm"
                variant="brand"
                onClick={() => categoryMutation.mutate(drafts[cat.id])}
                disabled={categoryMutation.isPending}
              >
                Save {cat.label}
              </Button>
            </div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="rounded-lg border border-border/80 bg-card p-4">
          <h3 className="font-medium mb-2">Identity review queue</h3>
          <p className="text-xs text-muted-foreground mb-3">
            Inbound channel messages with unmatched senders (nullable tenant).
          </p>
          <ul className="space-y-2 text-sm">
            {(identityQuery.data || []).map((item) => (
              <li key={item.channelEventId} className="border-b border-border/40 pb-2">
                {item.provider} · {item.fromAddress || "unknown sender"}
              </li>
            ))}
            {!identityQuery.data?.length ? (
              <li className="text-muted-foreground">Queue empty</li>
            ) : null}
          </ul>
        </div>
        <div className="rounded-lg border border-border/80 bg-card p-4">
          <h3 className="font-medium mb-2">Dead-letter / failed delivery</h3>
          <ul className="space-y-2 text-sm">
            {(deadLetterQuery.data || []).map((item) => (
              <li key={item.id} className="border-b border-border/40 pb-2">
                {item.provider} · {item.errorMessage || item.processingStatus}
              </li>
            ))}
            {!deadLetterQuery.data?.length ? (
              <li className="text-muted-foreground">No dead-letter events</li>
            ) : null}
          </ul>
        </div>
      </div>
    </div>
  );
}
