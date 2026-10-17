import { useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Plus, Edit2, Trash2, ListChecks, GripVertical } from "lucide-react";
import type { CompletionChecklist, CompletionChecklistItem } from "@shared/schema";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { DeleteConfirmDialog } from "@/components/DeleteConfirmDialog";
import { pagePad, dialogContentBase, dialogFooterSticky } from "@/lib/responsive";
import { cn } from "@/lib/utils";

interface CompletionChecklistsProps {
  embedded?: boolean;
}

function newItem(partial?: Partial<CompletionChecklistItem>): CompletionChecklistItem {
  const id = `item_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  return {
    id,
    label: partial?.label || "New step",
    type: partial?.type || "checkbox",
    required: partial?.required ?? false,
    helpText: partial?.helpText,
  };
}

export default function CompletionChecklists({ embedded = false }: CompletionChecklistsProps) {
  const { toast } = useToast();
  const [editorOpen, setEditorOpen] = useState(false);
  const [editing, setEditing] = useState<CompletionChecklist | null>(null);
  const [toDelete, setToDelete] = useState<CompletionChecklist | null>(null);

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [isActive, setIsActive] = useState(true);
  const [items, setItems] = useState<CompletionChecklistItem[]>([]);

  const { data: checklists, isLoading } = useQuery<CompletionChecklist[]>({
    queryKey: ["/api/completion-checklists"],
    queryFn: async () => {
      const res = await fetch("/api/completion-checklists", { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch checklists");
      return res.json();
    },
  });

  const openCreate = () => {
    setEditing(null);
    setName("");
    setDescription("");
    setIsActive(true);
    setItems([newItem({ label: "Clean kitchen", type: "checkbox" })]);
    setEditorOpen(true);
  };

  const openEdit = (c: CompletionChecklist) => {
    setEditing(c);
    setName(c.name);
    setDescription(c.description || "");
    setIsActive(c.isActive);
    setItems(Array.isArray(c.itemsJson) ? [...c.itemsJson] : []);
    setEditorOpen(true);
  };

  const saveMutation = useMutation({
    mutationFn: async () => {
      const payload = {
        name: name.trim(),
        description: description.trim() || null,
        isActive,
        itemsJson: items.map((item, index) => ({
          ...item,
          label: item.label.trim() || `Step ${index + 1}`,
        })),
      };
      if (!payload.name) throw new Error("Name is required");
      if (editing) {
        return apiRequest("PUT", `/api/completion-checklists/${editing.id}`, payload);
      }
      return apiRequest("POST", "/api/completion-checklists", payload);
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["/api/completion-checklists"] });
      setEditorOpen(false);
      toast({
        title: "Saved",
        description: editing ? "Checklist updated" : "Checklist created",
      });
    },
    onError: (err: Error) => {
      toast({
        variant: "destructive",
        title: "Error",
        description: err.message || "Failed to save checklist",
      });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => apiRequest("DELETE", `/api/completion-checklists/${id}`),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["/api/completion-checklists"] });
      setToDelete(null);
      toast({ title: "Deleted", description: "Checklist removed" });
    },
    onError: (err: Error) => {
      toast({
        variant: "destructive",
        title: "Error",
        description: err.message || "Failed to delete checklist",
      });
    },
  });

  const toggleActiveMutation = useMutation({
    mutationFn: async ({ id, isActive: next }: { id: string; isActive: boolean }) =>
      apiRequest("PUT", `/api/completion-checklists/${id}`, { isActive: next }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["/api/completion-checklists"] });
    },
  });

  const sorted = useMemo(() => {
    return [...(checklists || [])].sort((a, b) => a.name.localeCompare(b.name));
  }, [checklists]);

  const updateItem = (id: string, patch: Partial<CompletionChecklistItem>) => {
    setItems((prev) => prev.map((it) => (it.id === id ? { ...it, ...patch } : it)));
  };

  const removeItem = (id: string) => {
    setItems((prev) => prev.filter((it) => it.id !== id));
  };

  const moveItem = (index: number, dir: -1 | 1) => {
    setItems((prev) => {
      const next = [...prev];
      const j = index + dir;
      if (j < 0 || j >= next.length) return prev;
      const tmp = next[index]!;
      next[index] = next[j]!;
      next[j] = tmp;
      return next;
    });
  };

  return (
    <div className={cn(embedded ? "space-y-4" : pagePad, "space-y-6")}>
      {!embedded && (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Completion checklists</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Finish-the-job steps crews complete on an inspection. Attach a list to an inspection
              template so new jobs get a frozen copy.
            </p>
          </div>
          <Button onClick={openCreate} data-testid="button-create-completion-checklist">
            <Plus className="h-4 w-4 mr-2" />
            New checklist
          </Button>
        </div>
      )}

      {embedded && (
        <div className="flex justify-end">
          <Button onClick={openCreate} size="sm">
            <Plus className="h-4 w-4 mr-2" />
            New checklist
          </Button>
        </div>
      )}

      {isLoading ? (
        <div className="grid gap-4 md:grid-cols-2">
          <Skeleton className="h-28" />
          <Skeleton className="h-28" />
        </div>
      ) : sorted.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-muted-foreground">
            <ListChecks className="h-10 w-10 mx-auto mb-3 opacity-50" />
            No completion checklists yet. Create one, then attach it on an inspection template.
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {sorted.map((c) => (
            <Card key={c.id}>
              <CardHeader className="pb-2">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <CardTitle className="text-base">{c.name}</CardTitle>
                    {c.description && (
                      <CardDescription className="mt-1">{c.description}</CardDescription>
                    )}
                  </div>
                  <Badge variant={c.isActive ? "default" : "secondary"}>
                    {c.isActive ? "Active" : "Inactive"}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                <p className="text-sm text-muted-foreground">
                  {(c.itemsJson?.length ?? 0)} step{(c.itemsJson?.length ?? 0) === 1 ? "" : "s"} · v
                  {c.version}
                </p>
                <div className="flex flex-wrap items-center gap-2">
                  <Button variant="outline" size="sm" onClick={() => openEdit(c)}>
                    <Edit2 className="h-3.5 w-3.5 mr-1.5" />
                    Edit
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() =>
                      toggleActiveMutation.mutate({ id: c.id, isActive: !c.isActive })
                    }
                  >
                    {c.isActive ? "Deactivate" : "Activate"}
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-destructive"
                    onClick={() => setToDelete(c)}
                  >
                    <Trash2 className="h-3.5 w-3.5 mr-1.5" />
                    Delete
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={editorOpen} onOpenChange={setEditorOpen}>
        <DialogContent className={cn(dialogContentBase, "max-w-2xl max-h-[90vh] overflow-y-auto")}>
          <DialogHeader>
            <DialogTitle>{editing ? "Edit checklist" : "New checklist"}</DialogTitle>
            <DialogDescription>
              Steps can be checkboxes, short answers, or photo proof. Required steps are prompted at
              complete (soft — crew can still finish).
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="cc-name">Name</Label>
              <Input
                id="cc-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. End of visit"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="cc-desc">Description</Label>
              <Textarea
                id="cc-desc"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={2}
              />
            </div>
            <div className="flex items-center justify-between gap-2">
              <Label>Active</Label>
              <Switch checked={isActive} onCheckedChange={setIsActive} />
            </div>

            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label>Steps</Label>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setItems((prev) => [...prev, newItem()])}
                >
                  <Plus className="h-3.5 w-3.5 mr-1" />
                  Add step
                </Button>
              </div>
              {items.map((item, index) => (
                <div
                  key={item.id}
                  className="rounded-md border p-3 space-y-2 bg-muted/20"
                >
                  <div className="flex items-center gap-2">
                    <GripVertical className="h-4 w-4 text-muted-foreground shrink-0" />
                    <Input
                      value={item.label}
                      onChange={(e) => updateItem(item.id, { label: e.target.value })}
                      placeholder="Step label"
                      className="flex-1"
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      disabled={index === 0}
                      onClick={() => moveItem(index, -1)}
                    >
                      ↑
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      disabled={index === items.length - 1}
                      onClick={() => moveItem(index, 1)}
                    >
                      ↓
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="text-destructive"
                      onClick={() => removeItem(item.id)}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                    <div className="space-y-1">
                      <Label className="text-xs">Type</Label>
                      <Select
                        value={item.type}
                        onValueChange={(v) =>
                          updateItem(item.id, { type: v as CompletionChecklistItem["type"] })
                        }
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="checkbox">Checkbox</SelectItem>
                          <SelectItem value="text">Short text</SelectItem>
                          <SelectItem value="photo">Photo</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1 sm:col-span-2">
                      <Label className="text-xs">Help text</Label>
                      <Input
                        value={item.helpText || ""}
                        onChange={(e) => updateItem(item.id, { helpText: e.target.value })}
                        placeholder="Optional hint for crew"
                      />
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Switch
                      checked={!!item.required}
                      onCheckedChange={(v) => updateItem(item.id, { required: v })}
                    />
                    <Label className="text-sm">Required (soft warning at complete)</Label>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <DialogFooter className={dialogFooterSticky}>
            <Button variant="outline" onClick={() => setEditorOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => saveMutation.mutate()}
              disabled={saveMutation.isPending || !name.trim() || items.length === 0}
            >
              {saveMutation.isPending ? "Saving…" : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <DeleteConfirmDialog
        open={!!toDelete}
        onOpenChange={(open) => !open && setToDelete(null)}
        onConfirm={() => toDelete && deleteMutation.mutate(toDelete.id)}
        title="Delete checklist?"
        description={
          toDelete
            ? `“${toDelete.name}” will be removed and detached from any templates. Inspections that already snapshotted it keep their copy.`
            : undefined
        }
      />
    </div>
  );
}
