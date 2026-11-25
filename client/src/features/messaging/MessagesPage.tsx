import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation, useParams } from "wouter";
import { MessageSquare } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { MessagingConversation } from "./types";
import { ConversationListPanel } from "./components/ConversationListPanel";
import { ChatThread } from "./components/ChatThread";
import { NewConversationDialog } from "./components/NewConversationDialog";

export default function MessagesPage() {
  const { user } = useAuth();
  const params = useParams<{ conversationId?: string }>();
  const [, setLocation] = useLocation();
  const activeId = params.conversationId;

  const [listCategory, setListCategory] = useState<"direct" | "maintenance">(
    "direct",
  );
  const [listQuery, setListQuery] = useState("");
  const [newOpen, setNewOpen] = useState(false);

  const { data: activeConversationDetail } = useQuery<MessagingConversation>({
    queryKey: ["/api/messaging/conversations", activeId, "detail"],
    queryFn: async () => {
      const res = await apiRequest(
        "GET",
        `/api/messaging/conversations/${activeId}`,
      );
      return res.json();
    },
    enabled: !!user && !!activeId,
  });

  const isMaintenanceThread = activeConversationDetail?.type === "maintenance";

  useEffect(() => {
    if (!activeConversationDetail) return;
    if (
      activeConversationDetail.type === "maintenance" &&
      listCategory !== "maintenance"
    ) {
      setListCategory("maintenance");
    } else if (
      (activeConversationDetail.type === "direct" ||
        activeConversationDetail.type === "group") &&
      listCategory !== "direct"
    ) {
      setListCategory("direct");
    }
  }, [activeConversationDetail?.id, activeConversationDetail?.type]);

  const viewMaintenanceRequest = () => {
    const mrId =
      activeConversationDetail?.maintenanceRequestId ||
      activeConversationDetail?.maintenanceRequest?.requestId;
    if (!mrId) return;
    if (user?.role === "tenant") {
      setLocation("/tenant/requests");
    } else {
      setLocation(`/maintenance?requestId=${encodeURIComponent(mrId)}`);
    }
  };

  const headerLeading = useMemo(
    () => (
      <Button
        variant="ghost"
        size="sm"
        className="md:hidden"
        onClick={() => setLocation("/messages")}
      >
        Back
      </Button>
    ),
    [setLocation],
  );

  const headerTrailing = useMemo(
    () =>
      isMaintenanceThread ? (
        <Button
          variant="outline"
          size="sm"
          className="h-8 shrink-0"
          onClick={viewMaintenanceRequest}
          data-testid="button-view-maintenance-request"
        >
          View request
        </Button>
      ) : null,
    [isMaintenanceThread, activeConversationDetail, user?.role],
  );

  return (
    <div className="flex h-[calc(100vh-3.5rem)] min-h-0 w-full overflow-hidden bg-background">
      <aside
        className={cn(
          "flex w-full flex-col border-r md:w-80 lg:w-96",
          activeId ? "hidden md:flex" : "flex",
        )}
      >
        <ConversationListPanel
          listCategory={listCategory}
          onListCategoryChange={setListCategory}
          listQuery={listQuery}
          onListQueryChange={setListQuery}
          activeId={activeId}
          onSelectConversation={(id) => setLocation(`/messages/${id}`)}
          onNewConversation={() => setNewOpen(true)}
        />
      </aside>

      <section
        className={cn(
          "flex min-w-0 flex-1 flex-col",
          !activeId ? "hidden md:flex" : "flex",
        )}
      >
        {!activeId ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-3 text-muted-foreground">
            <MessageSquare className="h-10 w-10 opacity-40" />
            <p className="text-sm">Select a conversation or start a new one</p>
          </div>
        ) : (
          <ChatThread
            conversationId={activeId}
            headerLeading={headerLeading}
            headerTrailing={headerTrailing}
            onExpandFull={() => setLocation(`/messages/${activeId}`)}
          />
        )}
      </section>

      <NewConversationDialog
        open={newOpen}
        onOpenChange={setNewOpen}
        listCategory={listCategory}
        onCreated={(conv) => {
          if (conv.type === "maintenance") setListCategory("maintenance");
          setLocation(`/messages/${conv.id}`);
        }}
      />
    </div>
  );
}
