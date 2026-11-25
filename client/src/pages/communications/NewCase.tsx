import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Link, useLocation } from "wouter";
import { Plus } from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { cn } from "@/lib/utils";
import { pagePad } from "@/lib/responsive";

type Category = { id: string; key: string; label: string };

export default function NewCase() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [priority, setPriority] = useState("medium");

  const categoriesQuery = useQuery<Category[]>({
    queryKey: ["/api/communications/categories"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/communications/categories");
      return res.json();
    },
  });

  const createMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/communications/cases", {
        subject,
        body,
        categoryId: categoryId || undefined,
        priority,
        source: "app",
      });
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/communications/cases"] });
      toast({ title: "Case created" });
      setLocation(`/communications/cases/${data.case.id}`);
    },
    onError: (e: Error) =>
      toast({ variant: "destructive", title: "Error", description: e.message }),
  });

  return (
    <div className={cn("container mx-auto max-w-2xl space-y-6", pagePad)}>
      <PageHeader
        icon={Plus}
        title="New case"
        description="Log a communications case manually"
        actions={
          <Button variant="outline" asChild>
            <Link href="/communications">Cancel</Link>
          </Button>
        }
      />
      <div className="rounded-lg border border-border/80 bg-card p-4 space-y-4">
        <div className="space-y-2">
          <Label>Subject</Label>
          <Input value={subject} onChange={(e) => setSubject(e.target.value)} />
        </div>
        <div className="space-y-2">
          <Label>Details</Label>
          <Textarea value={body} onChange={(e) => setBody(e.target.value)} rows={5} />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="space-y-2">
            <Label>Category</Label>
            <select
              className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"
              value={categoryId}
              onChange={(e) => setCategoryId(e.target.value)}
            >
              <option value="">Auto / general</option>
              {(categoriesQuery.data || []).map((c) => (
                <option key={c.id} value={c.id}>
                  {c.label}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-2">
            <Label>Priority</Label>
            <select
              className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"
              value={priority}
              onChange={(e) => setPriority(e.target.value)}
            >
              <option value="low">Low</option>
              <option value="medium">Medium</option>
              <option value="high">High</option>
              <option value="urgent">Urgent</option>
            </select>
          </div>
        </div>
        <Button
          variant="brand"
          disabled={!subject.trim() || !body.trim() || createMutation.isPending}
          onClick={() => createMutation.mutate()}
        >
          Create case
        </Button>
      </div>
    </div>
  );
}
