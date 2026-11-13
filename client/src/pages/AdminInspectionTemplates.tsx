import { useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import {
  ClipboardList,
  Copy,
  Eye,
  Loader2,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  Sparkles,
  Building2,
} from "lucide-react";
import { TemplateBuilder } from "@/components/TemplateBuilder";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { cn } from "@/lib/utils";
import { pagePad } from "@/lib/responsive";
import type { InspectionTemplate } from "@shared/schema";

type AdminTemplateListItem = {
  id: string;
  source: "platform" | "org";
  name: string;
  description: string | null;
  scope: string;
  version: number;
  isActive: boolean | null;
  updatedAt: string | null;
  createdAt: string | null;
  organizationId: string | null;
  organizationName: string | null;
  origin: "builtin" | "custom" | "from_builtin";
  platformTemplateId: string | null;
  sourceOrganizationId: string | null;
};

type ListResponse = {
  items: AdminTemplateListItem[];
  counts: { builtin: number; custom: number; fromBuiltin: number; instances: number };
};

type OrgLite = { id: string; name: string };

type EditorTarget =
  | { mode: "platform"; id: string | null; template: InspectionTemplate | null }
  | { mode: "org"; id: string; template: InspectionTemplate };

function formatDate(value: string | null | undefined) {
  if (!value) return "—";
  try {
    return new Date(value).toLocaleDateString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  } catch {
    return "—";
  }
}

function OriginBadge({ origin }: { origin: AdminTemplateListItem["origin"] }) {
  if (origin === "builtin") {
    return (
      <Badge className="bg-primary/15 text-primary hover:bg-primary/15 border-0 font-medium">
        Built-in
      </Badge>
    );
  }
  if (origin === "from_builtin") {
    return (
      <Badge variant="secondary" className="font-medium">
        From built-in
      </Badge>
    );
  }
  return (
    <Badge variant="outline" className="font-medium">
      Custom
    </Badge>
  );
}

function ScopeBadge({ scope }: { scope: string }) {
  return (
    <Badge variant="outline" className="capitalize text-xs font-normal">
      {scope}
    </Badge>
  );
}

function toBuilderTemplate(raw: any): InspectionTemplate {
  return {
    id: raw.id,
    organizationId: raw.organizationId || "",
    name: raw.name,
    description: raw.description ?? null,
    scope: raw.scope,
    version: raw.version ?? 1,
    parentTemplateId: raw.parentTemplateId ?? null,
    isActive: raw.isActive ?? true,
    structureJson: raw.structureJson,
    categoryId: null,
    aiMaxWords: raw.aiMaxWords ?? 150,
    aiInstruction: raw.aiInstruction ?? null,
    aiIncludeRecommendedActions: raw.aiIncludeRecommendedActions ?? false,
    aiIncludeMaintenanceIssues: raw.aiIncludeMaintenanceIssues ?? false,
    reportConfig: raw.reportConfig ?? null,
    completionChecklistId: null,
    platformTemplateId: raw.platformTemplateId ?? null,
    createdBy: raw.createdBy || raw.createdByAdminId || "platform",
    createdAt: raw.createdAt ? new Date(raw.createdAt) : null,
    updatedAt: raw.updatedAt ? new Date(raw.updatedAt) : null,
  } as InspectionTemplate;
}

export default function AdminInspectionTemplates() {
  const { toast } = useToast();
  const [tab, setTab] = useState<"builtin" | "instances">("builtin");
  const [search, setSearch] = useState("");
  const [scope, setScope] = useState("all");
  const [status, setStatus] = useState("all");
  const [organizationId, setOrganizationId] = useState("all");

  const [promoteTarget, setPromoteTarget] = useState<AdminTemplateListItem | null>(null);
  const [copyTarget, setCopyTarget] = useState<AdminTemplateListItem | null>(null);
  const [copySelected, setCopySelected] = useState<string[]>([]);
  const [copySearch, setCopySearch] = useState("");
  const [viewTarget, setViewTarget] = useState<AdminTemplateListItem | null>(null);
  const [editor, setEditor] = useState<EditorTarget | null>(null);

  // Instance tab: custom org templates only (built-in copies stay in Built-in catalog)
  const listType = tab === "builtin" ? "builtin" : "custom";

  const { data, isLoading, refetch, isFetching } = useQuery<ListResponse>({
    queryKey: [
      "/api/admin/inspection-templates",
      listType,
      search,
      scope,
      status,
      organizationId,
    ],
    queryFn: async () => {
      const params = new URLSearchParams();
      params.set("type", listType);
      if (search.trim()) params.set("search", search.trim());
      if (scope !== "all") params.set("scope", scope);
      if (status !== "all") params.set("status", status);
      if (tab === "instances" && organizationId !== "all") {
        params.set("organizationId", organizationId);
      }
      return (await apiRequest("GET", `/api/admin/inspection-templates?${params}`)).json();
    },
  });

  const { data: orgs = [] } = useQuery<OrgLite[]>({
    queryKey: ["/api/admin/inspection-templates/organizations"],
    queryFn: async () =>
      (await apiRequest("GET", "/api/admin/inspection-templates/organizations")).json(),
  });

  const instanceItems = useMemo(
    () => (data?.items || []).filter((i) => i.source === "org" && i.origin === "custom"),
    [data?.items],
  );

  const builtinItems = useMemo(
    () => (data?.items || []).filter((i) => i.source === "platform"),
    [data?.items],
  );

  const filteredCopyOrgs = useMemo(() => {
    const q = copySearch.trim().toLowerCase();
    return orgs.filter((o) => {
      if (copyTarget?.organizationId && o.id === copyTarget.organizationId) return false;
      if (!q) return true;
      return o.name.toLowerCase().includes(q);
    });
  }, [orgs, copySearch, copyTarget]);

  const promoteMutation = useMutation({
    mutationFn: async (templateId: string) =>
      (await apiRequest("POST", "/api/admin/inspection-templates/promote", { templateId })).json(),
    onSuccess: (result: any) => {
      toast({
        title: "Promoted to built-in",
        description: `Distributed to ${result.distributed} instance(s); ${result.skipped} skipped.`,
      });
      setPromoteTarget(null);
      queryClient.invalidateQueries({ queryKey: ["/api/admin/inspection-templates"] });
    },
    onError: (e: Error) =>
      toast({ title: "Promote failed", description: e.message, variant: "destructive" }),
  });

  const copyMutation = useMutation({
    mutationFn: async () =>
      (
        await apiRequest("POST", "/api/admin/inspection-templates/copy", {
          templateId: copyTarget!.id,
          targetOrganizationIds: copySelected,
        })
      ).json(),
    onSuccess: (result: any) => {
      const created = result.created?.length ?? 0;
      const errors = result.errors?.length ?? 0;
      toast({
        title: "Copy complete",
        description: `Created ${created} copy(ies)${errors ? `; ${errors} error(s)` : ""}.`,
      });
      setCopyTarget(null);
      setCopySelected([]);
      setCopySearch("");
      queryClient.invalidateQueries({ queryKey: ["/api/admin/inspection-templates"] });
    },
    onError: (e: Error) =>
      toast({ title: "Copy failed", description: e.message, variant: "destructive" }),
  });

  const openEdit = async (item: AdminTemplateListItem) => {
    try {
      const source = item.source === "platform" ? "platform" : "org";
      const res = await apiRequest(
        "GET",
        `/api/admin/inspection-templates/${item.id}?source=${source}`,
      );
      const payload = await res.json();
      const template = toBuilderTemplate(payload.template);
      if (item.source === "platform") {
        setEditor({ mode: "platform", id: item.id, template });
      } else {
        if (item.origin !== "custom") {
          toast({
            title: "View only",
            description: "Instance copies from built-in are view-only. Edit the Built-in catalog.",
          });
          setViewTarget(item);
          return;
        }
        setEditor({ mode: "org", id: item.id, template });
      }
    } catch (e: any) {
      toast({ title: "Failed to load template", description: e.message, variant: "destructive" });
    }
  };

  const openView = async (item: AdminTemplateListItem) => {
    setViewTarget(item);
  };

  const persistFn = async (payload: Record<string, unknown>, existingId: string | null) => {
    if (!editor) throw new Error("No editor context");
    if (editor.mode === "platform") {
      if (existingId) {
        const res = await apiRequest(
          "PUT",
          `/api/admin/inspection-templates/platform/${existingId}`,
          payload,
        );
        return toBuilderTemplate(await res.json());
      }
      const res = await apiRequest("POST", "/api/admin/inspection-templates/platform", payload);
      return toBuilderTemplate(await res.json());
    }
    const res = await apiRequest(
      "PUT",
      `/api/admin/inspection-templates/org/${editor.id}`,
      payload,
    );
    return toBuilderTemplate(await res.json());
  };

  const counts = data?.counts;

  return (
    <div className={cn("container mx-auto max-w-7xl min-w-0", pagePad)}>
      <div className="mb-6 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div className="min-w-0 space-y-1">
          <div className="flex items-center gap-2 text-primary">
            <ClipboardList className="h-6 w-6 shrink-0" />
            <span className="text-xs font-semibold uppercase tracking-wide">Template Settings</span>
          </div>
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight">Inspection Templates</h1>
          <p className="text-muted-foreground max-w-2xl text-sm md:text-base">
            Manage the global built-in catalog, review every instance template, promote customs to
            all instances, and copy customs between organizations.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => refetch()}
            disabled={isFetching}
          >
            {isFetching ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            <span className="ml-2">Refresh</span>
          </Button>
          {tab === "builtin" && (
            <Button
              size="sm"
              onClick={() => setEditor({ mode: "platform", id: null, template: null })}
            >
              <Plus className="h-4 w-4 mr-2" />
              New inspection
            </Button>
          )}
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-3 mb-6">
        <Card className="shadow-none border-border/80">
          <CardHeader className="pb-2 pt-4 px-4">
            <CardDescription>Built-in catalog</CardDescription>
            <CardTitle className="text-2xl tabular-nums">{counts?.builtin ?? "—"}</CardTitle>
          </CardHeader>
        </Card>
        <Card className="shadow-none border-border/80">
          <CardHeader className="pb-2 pt-4 px-4">
            <CardDescription>Custom (instances)</CardDescription>
            <CardTitle className="text-2xl tabular-nums">{counts?.custom ?? "—"}</CardTitle>
          </CardHeader>
        </Card>
        <Card className="shadow-none border-border/80">
          <CardHeader className="pb-2 pt-4 px-4">
            <CardDescription>Instances</CardDescription>
            <CardTitle className="text-2xl tabular-nums">{counts?.instances ?? "—"}</CardTitle>
          </CardHeader>
        </Card>
      </div>

      <Tabs value={tab} onValueChange={(v) => setTab(v as "builtin" | "instances")}>
        <div className="sticky top-0 z-10 -mx-1 px-1 py-2 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80 border-b mb-4">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <TabsList className="h-10">
              <TabsTrigger value="builtin" className="gap-1.5">
                <Sparkles className="h-3.5 w-3.5" />
                Built-in catalog
              </TabsTrigger>
              <TabsTrigger value="instances" className="gap-1.5">
                <Building2 className="h-3.5 w-3.5" />
                Instance templates
              </TabsTrigger>
            </TabsList>

            <div className="flex flex-wrap gap-2 items-center">
              <div className="relative min-w-[200px] flex-1 sm:flex-none sm:w-56">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  className="pl-8 h-9"
                  placeholder="Search templates…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>
              <Select value={scope} onValueChange={setScope}>
                <SelectTrigger className="h-9 w-[130px]">
                  <SelectValue placeholder="Scope" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All scopes</SelectItem>
                  <SelectItem value="property">Property</SelectItem>
                  <SelectItem value="block">Block</SelectItem>
                  <SelectItem value="both">Both</SelectItem>
                </SelectContent>
              </Select>
              <Select value={status} onValueChange={setStatus}>
                <SelectTrigger className="h-9 w-[130px]">
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All status</SelectItem>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="inactive">Inactive</SelectItem>
                </SelectContent>
              </Select>
              {tab === "instances" && (
                <>
                  <Select value={organizationId} onValueChange={setOrganizationId}>
                    <SelectTrigger className="h-9 w-[180px]">
                      <SelectValue placeholder="Instance" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All instances</SelectItem>
                      {orgs.map((o) => (
                        <SelectItem key={o.id} value={o.id}>
                          {o.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </>
              )}
            </div>
          </div>
        </div>

        <TabsContent value="builtin" className="mt-0">
          <Card className="shadow-none overflow-hidden">
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Global built-in templates</CardTitle>
              <CardDescription>
                These seed every new instance and can be distributed when a custom template is
                promoted. Edits update the catalog for future seeds; existing instance copies are
                not overwritten.
              </CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              {isLoading ? (
                <div className="flex items-center justify-center py-16 text-muted-foreground">
                  <Loader2 className="h-5 w-5 animate-spin mr-2" />
                  Loading catalog…
                </div>
              ) : builtinItems.length === 0 ? (
                <div className="py-16 text-center text-muted-foreground text-sm">
                  No built-in templates match your filters.
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow className="hover:bg-transparent">
                        <TableHead className="min-w-[220px]">Template</TableHead>
                        <TableHead>Scope</TableHead>
                        <TableHead>Version</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Updated</TableHead>
                        <TableHead className="text-right w-[160px]">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {builtinItems.map((item) => (
                        <TableRow key={item.id}>
                          <TableCell>
                            <div className="space-y-1 min-w-0">
                              <div className="font-medium truncate">{item.name}</div>
                              {item.description && (
                                <p className="text-xs text-muted-foreground line-clamp-2 max-w-md">
                                  {item.description}
                                </p>
                              )}
                            </div>
                          </TableCell>
                          <TableCell>
                            <ScopeBadge scope={item.scope} />
                          </TableCell>
                          <TableCell className="tabular-nums text-muted-foreground">
                            v{item.version}
                          </TableCell>
                          <TableCell>
                            {item.isActive !== false ? (
                              <Badge className="bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 hover:bg-emerald-500/15 border-0">
                                Active
                              </Badge>
                            ) : (
                              <Badge variant="secondary">Inactive</Badge>
                            )}
                          </TableCell>
                          <TableCell className="text-muted-foreground text-sm whitespace-nowrap">
                            {formatDate(item.updatedAt)}
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="inline-flex gap-1">
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8"
                                onClick={() => openView(item)}
                                title="View"
                              >
                                <Eye className="h-4 w-4" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8"
                                onClick={() => openEdit(item)}
                                title="Edit"
                              >
                                <Pencil className="h-4 w-4" />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="instances" className="mt-0">
          <Card className="shadow-none overflow-hidden">
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Custom templates across instances</CardTitle>
              <CardDescription>
                Only custom instance templates are listed here. Edit them, promote to the built-in
                catalog, or copy to other instances. Built-in templates live under Built-in catalog.
              </CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              {isLoading ? (
                <div className="flex items-center justify-center py-16 text-muted-foreground">
                  <Loader2 className="h-5 w-5 animate-spin mr-2" />
                  Loading templates…
                </div>
              ) : instanceItems.length === 0 ? (
                <div className="py-16 text-center text-muted-foreground text-sm">
                  No instance templates match your filters.
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow className="hover:bg-transparent">
                        <TableHead className="min-w-[200px]">Template</TableHead>
                        <TableHead className="min-w-[140px]">Instance</TableHead>
                        <TableHead>Origin</TableHead>
                        <TableHead>Scope</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Updated</TableHead>
                        <TableHead className="text-right w-[200px]">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {instanceItems.map((item) => {
                        const isCustom = item.origin === "custom";
                        return (
                          <TableRow key={item.id}>
                            <TableCell>
                              <div className="space-y-1 min-w-0">
                                <div className="font-medium truncate">{item.name}</div>
                                {item.description && (
                                  <p className="text-xs text-muted-foreground line-clamp-1 max-w-sm">
                                    {item.description}
                                  </p>
                                )}
                              </div>
                            </TableCell>
                            <TableCell className="text-sm">
                              {item.organizationName || "—"}
                            </TableCell>
                            <TableCell>
                              <OriginBadge origin={item.origin} />
                            </TableCell>
                            <TableCell>
                              <ScopeBadge scope={item.scope} />
                            </TableCell>
                            <TableCell>
                              {item.isActive !== false ? (
                                <Badge className="bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 hover:bg-emerald-500/15 border-0">
                                  Active
                                </Badge>
                              ) : (
                                <Badge variant="secondary">Inactive</Badge>
                              )}
                            </TableCell>
                            <TableCell className="text-muted-foreground text-sm whitespace-nowrap">
                              {formatDate(item.updatedAt)}
                            </TableCell>
                            <TableCell className="text-right">
                              <div className="inline-flex gap-1 justify-end">
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-8 w-8"
                                  onClick={() => openView(item)}
                                  title="View"
                                >
                                  <Eye className="h-4 w-4" />
                                </Button>
                                {isCustom && (
                                  <>
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      className="h-8 w-8"
                                      onClick={() => openEdit(item)}
                                      title="Edit"
                                    >
                                      <Pencil className="h-4 w-4" />
                                    </Button>
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      className="h-8 w-8"
                                      onClick={() => setPromoteTarget(item)}
                                      title="Promote to built-in"
                                    >
                                      <Sparkles className="h-4 w-4" />
                                    </Button>
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      className="h-8 w-8"
                                      onClick={() => {
                                        setCopyTarget(item);
                                        setCopySelected([]);
                                        setCopySearch("");
                                      }}
                                      title="Copy to instances"
                                    >
                                      <Copy className="h-4 w-4" />
                                    </Button>
                                  </>
                                )}
                              </div>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
          <p className="text-xs text-muted-foreground mt-3">
            Showing {instanceItems.length} template
            {instanceItems.length === 1 ? "" : "s"}
            {counts ? ` · ${counts.custom} custom across all instances` : ""}
          </p>
        </TabsContent>
      </Tabs>

      {/* Promote dialog */}
      <Dialog open={!!promoteTarget} onOpenChange={(open) => !open && setPromoteTarget(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Promote to built-in</DialogTitle>
            <DialogDescription>
              Add <span className="font-medium text-foreground">{promoteTarget?.name}</span> to the
              global catalog and create a copy on every instance that does not already have it.
              Existing customized copies are not overwritten.
            </DialogDescription>
          </DialogHeader>
          <div className="rounded-md border bg-muted/40 px-3 py-2 text-sm">
            Will target approximately <strong>{counts?.instances ?? "—"}</strong> instance
            {(counts?.instances ?? 0) === 1 ? "" : "s"} (source instance already linked).
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPromoteTarget(null)}>
              Cancel
            </Button>
            <Button
              onClick={() => promoteTarget && promoteMutation.mutate(promoteTarget.id)}
              disabled={promoteMutation.isPending}
            >
              {promoteMutation.isPending && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              Promote & distribute
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Copy dialog */}
      <Dialog
        open={!!copyTarget}
        onOpenChange={(open) => {
          if (!open) {
            setCopyTarget(null);
            setCopySelected([]);
            setCopySearch("");
          }
        }}
      >
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Copy to instances</DialogTitle>
            <DialogDescription>
              Deep-clone <span className="font-medium text-foreground">{copyTarget?.name}</span> into
              selected organizations. Org-specific category and checklist links are cleared.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                className="pl-8"
                placeholder="Filter instances…"
                value={copySearch}
                onChange={(e) => setCopySearch(e.target.value)}
              />
            </div>
            <div className="max-h-64 overflow-y-auto rounded-md border divide-y">
              {filteredCopyOrgs.length === 0 ? (
                <p className="p-4 text-sm text-muted-foreground text-center">No instances found</p>
              ) : (
                filteredCopyOrgs.map((org) => {
                  const checked = copySelected.includes(org.id);
                  return (
                    <label
                      key={org.id}
                      className="flex items-center gap-3 px-3 py-2.5 cursor-pointer hover:bg-muted/50"
                    >
                      <Checkbox
                        checked={checked}
                        onCheckedChange={(v) => {
                          setCopySelected((prev) =>
                            v ? [...prev, org.id] : prev.filter((id) => id !== org.id),
                          );
                        }}
                      />
                      <span className="text-sm font-medium">{org.name}</span>
                    </label>
                  );
                })
              )}
            </div>
            <p className="text-xs text-muted-foreground">
              {copySelected.length} selected
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCopyTarget(null)}>
              Cancel
            </Button>
            <Button
              onClick={() => copyMutation.mutate()}
              disabled={copySelected.length === 0 || copyMutation.isPending}
            >
              {copyMutation.isPending && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              Copy to {copySelected.length || ""} instance
              {copySelected.length === 1 ? "" : "s"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* View dialog */}
      <Dialog open={!!viewTarget} onOpenChange={(open) => !open && setViewTarget(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="pr-6">{viewTarget?.name}</DialogTitle>
            <DialogDescription>Template summary</DialogDescription>
          </DialogHeader>
          {viewTarget && (
            <div className="space-y-3 text-sm">
              <div className="flex flex-wrap gap-2">
                <OriginBadge origin={viewTarget.origin} />
                <ScopeBadge scope={viewTarget.scope} />
                <Badge variant="outline">v{viewTarget.version}</Badge>
              </div>
              {viewTarget.organizationName && (
                <div>
                  <Label className="text-muted-foreground">Instance</Label>
                  <p className="font-medium">{viewTarget.organizationName}</p>
                </div>
              )}
              {viewTarget.description && (
                <div>
                  <Label className="text-muted-foreground">Description</Label>
                  <p className="whitespace-pre-wrap text-muted-foreground leading-relaxed">
                    {viewTarget.description}
                  </p>
                </div>
              )}
              <div className="grid grid-cols-2 gap-3 pt-1">
                <div>
                  <Label className="text-muted-foreground">Updated</Label>
                  <p>{formatDate(viewTarget.updatedAt)}</p>
                </div>
                <div>
                  <Label className="text-muted-foreground">Status</Label>
                  <p>{viewTarget.isActive !== false ? "Active" : "Inactive"}</p>
                </div>
              </div>
            </div>
          )}
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setViewTarget(null)}>
              Close
            </Button>
            {viewTarget &&
              (viewTarget.source === "platform" || viewTarget.origin === "custom") && (
                <Button
                  onClick={() => {
                    const item = viewTarget;
                    setViewTarget(null);
                    openEdit(item);
                  }}
                >
                  <Pencil className="h-4 w-4 mr-2" />
                  Edit
                </Button>
              )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {editor && (
        <TemplateBuilder
          template={editor.template}
          categories={[]}
          hideOrgFields
          persistFn={persistFn}
          onClose={() => setEditor(null)}
          onSave={() => {
            queryClient.invalidateQueries({ queryKey: ["/api/admin/inspection-templates"] });
          }}
        />
      )}
    </div>
  );
}
