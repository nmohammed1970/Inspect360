import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { MessageSquare, Send } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";

export type DiscussionMessage = {
  id: string;
  body: string;
  authorUserId: string;
  createdAt: string;
  author?: {
    id: string;
    firstName?: string | null;
    lastName?: string | null;
    role?: string | null;
  } | null;
};

interface MaintenanceRequestDiscussionProps {
  requestId: string;
  /** Staff: `/api/maintenance/${id}/messages` — Tenant: `/api/tenant/maintenance-requests/${id}/messages` */
  apiBase: string;
  requestTitle?: string;
  className?: string;
}

function authorLabel(m: DiscussionMessage): string {
  const name = [m.author?.firstName, m.author?.lastName].filter(Boolean).join(" ").trim();
  if (name) return name;
  if (m.author?.role === "tenant") return "Tenant";
  if (m.author?.role === "maintenance_admin") return "Maintenance admin";
  if (m.author?.role === "owner") return "Owner";
  return "User";
}

export function MaintenanceRequestDiscussion({
  requestId,
  apiBase,
  requestTitle,
  className,
}: MaintenanceRequestDiscussionProps) {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState("");
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const queryKey = [apiBase, "messages"] as const;

  const { data: messages = [], isLoading } = useQuery<DiscussionMessage[]>({
    queryKey,
    queryFn: async () => {
      const res = await apiRequest("GET", apiBase);
      return res.json();
    },
    enabled: !!requestId,
    refetchInterval: 15_000,
  });

  const postMutation = useMutation({
    mutationFn: async (body: string) => {
      const res = await apiRequest("POST", apiBase, { body });
      return res.json();
    },
    onSuccess: () => {
      setDraft("");
      queryClient.invalidateQueries({ queryKey });
    },
    onError: (e: Error) => {
      toast({
        title: "Failed to send",
        description: e.message,
        variant: "destructive",
      });
    },
  });

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length]);

  const send = () => {
    const body = draft.trim();
    if (!body || postMutation.isPending) return;
    postMutation.mutate(body);
  };

  return (
    <div className={cn("flex flex-col gap-3 min-h-0", className)}>
      {requestTitle ? (
        <p className="text-sm text-muted-foreground line-clamp-2">{requestTitle}</p>
      ) : null}

      <ScrollArea className="h-[280px] rounded-md border bg-muted/20 p-3">
        {isLoading ? (
          <p className="text-sm text-muted-foreground">Loading discussion…</p>
        ) : messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 py-10 text-center text-muted-foreground">
            <MessageSquare className="h-8 w-8 opacity-40" />
            <p className="text-sm">No messages yet. Suggest a tip or ask a question.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {messages.map((m) => {
              const mine = m.authorUserId === user?.id;
              return (
                <div
                  key={m.id}
                  className={cn("flex flex-col gap-0.5", mine ? "items-end" : "items-start")}
                  data-testid={`discussion-message-${m.id}`}
                >
                  <div className="flex items-baseline gap-2 text-xs text-muted-foreground">
                    <span className="font-medium text-foreground">{authorLabel(m)}</span>
                    <span>
                      {m.createdAt
                        ? new Date(m.createdAt).toLocaleString(undefined, {
                            dateStyle: "medium",
                            timeStyle: "short",
                          })
                        : ""}
                    </span>
                  </div>
                  <div
                    className={cn(
                      "max-w-[90%] rounded-lg px-3 py-2 text-sm whitespace-pre-wrap",
                      mine
                        ? "bg-primary text-primary-foreground"
                        : "bg-background border",
                    )}
                  >
                    {m.body}
                  </div>
                </div>
              );
            })}
            <div ref={bottomRef} />
          </div>
        )}
      </ScrollArea>

      <div className="flex gap-2 items-end">
        <Textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Write a message…"
          className="min-h-[72px] resize-none"
          maxLength={4000}
          data-testid="input-discussion-body"
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              send();
            }
          }}
        />
        <Button
          size="icon"
          className="shrink-0 h-10 w-10"
          disabled={!draft.trim() || postMutation.isPending}
          onClick={send}
          data-testid="button-discussion-send"
        >
          <Send className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
