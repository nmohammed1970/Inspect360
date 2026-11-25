import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import {
  ExternalLink,
  Maximize2,
  MessageSquare,
  Minus,
  X,
} from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/hooks/useAuth";
import { useIsMobile } from "@/hooks/use-mobile";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import {
  conversationAvatarFallback,
  conversationAvatarSrc,
  type MessagingConversation,
} from "./types";
import { ConversationListPanel } from "./components/ConversationListPanel";
import { ChatThread } from "./components/ChatThread";
import { NewConversationDialog } from "./components/NewConversationDialog";
import {
  MESSAGING_DOCK_TOGGLE_EVENT,
  closeMessagingPanel,
  closeMiniChat,
  dismissBubble,
  expandMessagingPanel,
  initMessagingDockStore,
  minimizeMessagingPanel,
  minimizeMiniChat,
  noteIncomingBubble,
  openMessagingPanel,
  openMiniChat,
  restoreMiniChat,
  toggleMessagingPanel,
  useMessagingDockStore,
} from "./messagingDockStore";
import { isConversationActivelyViewed } from "./viewingRegistry";

function isOnMessagesPage(path: string) {
  const cleaned = path.replace(/\/+$/, "") || "/";
  return cleaned === "/messages" || cleaned.startsWith("/messages/");
}

export const MessagingDockHost = () => {
  const { user } = useAuth();
  const [location, setLocation] = useLocation();
  const isMobile = useIsMobile();
  const dock = useMessagingDockStore();
  const [listCategory, setListCategory] = useState<"direct" | "maintenance">(
    "direct",
  );
  const [listQuery, setListQuery] = useState("");
  const [newOpen, setNewOpen] = useState(false);
  const [mobileChatId, setMobileChatId] = useState<string | null>(null);

  useEffect(() => {
    initMessagingDockStore(user?.id);
  }, [user?.id]);

  useEffect(() => {
    const onToggle = () => toggleMessagingPanel();
    window.addEventListener(MESSAGING_DOCK_TOGGLE_EVENT, onToggle);
    return () =>
      window.removeEventListener(MESSAGING_DOCK_TOGGLE_EVENT, onToggle);
  }, []);

  useEffect(() => {
    const handler = (event: Event) => {
      const detail = (event as CustomEvent).detail as {
        type?: string;
        event?: string;
        message?: { conversationId?: string; senderId?: string };
      };
      if (detail?.type !== "messaging_message") return;
      if (detail.event && detail.event !== "created") return;
      const conversationId = detail.message?.conversationId;
      const senderId = detail.message?.senderId;
      if (!conversationId || senderId === user?.id) return;
      if (isConversationActivelyViewed(conversationId)) return;
      if (isOnMessagesPage(location)) return;
      noteIncomingBubble(conversationId);
    };
    window.addEventListener("inspect360:messaging", handler as EventListener);
    return () =>
      window.removeEventListener(
        "inspect360:messaging",
        handler as EventListener,
      );
  }, [user?.id, location]);

  if (!user || isOnMessagesPage(location)) {
    return null;
  }

  const panelVisible = dock.panelOpen && !dock.panelMinimized;
  const showFab = !dock.panelOpen;

  const openConversation = (id: string) => {
    if (isMobile) {
      setMobileChatId(id);
      openMessagingPanel();
      return;
    }
    openMiniChat(id);
  };

  const panelBody = (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-center gap-2 border-b px-3 py-2">
        <MessageSquare className="h-4 w-4 text-muted-foreground" />
        <p className="flex-1 text-sm font-semibold">Messaging</p>
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7"
          onClick={() => {
            closeMessagingPanel();
            setLocation("/messages");
          }}
          title="Open full Messages"
          data-testid="button-dock-open-full"
        >
          <ExternalLink className="h-3.5 w-3.5" />
        </Button>
        {!isMobile && (
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={() => minimizeMessagingPanel()}
            title="Minimize"
          >
            <Minus className="h-3.5 w-3.5" />
          </Button>
        )}
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7"
          onClick={() => {
            closeMessagingPanel();
            setMobileChatId(null);
          }}
          title="Close"
        >
          <X className="h-3.5 w-3.5" />
        </Button>
      </div>
      {isMobile && mobileChatId ? (
        <ChatThread
          conversationId={mobileChatId}
          compact
          showPeople={false}
          headerLeading={
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setMobileChatId(null)}
            >
              Back
            </Button>
          }
          headerTrailing={
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={() => {
                closeMessagingPanel();
                setLocation(`/messages/${mobileChatId}`);
              }}
            >
              <Maximize2 className="h-3.5 w-3.5" />
            </Button>
          }
          onExpandFull={() => {
            closeMessagingPanel();
            setLocation(`/messages/${mobileChatId}`);
          }}
        />
      ) : (
        <ConversationListPanel
          compact
          listCategory={listCategory}
          onListCategoryChange={setListCategory}
          listQuery={listQuery}
          onListQueryChange={setListQuery}
          onSelectConversation={openConversation}
          onNewConversation={() => setNewOpen(true)}
          footer={
            <div className="border-t p-2">
              <Button
                variant="outline"
                className="w-full"
                size="sm"
                onClick={() => {
                  closeMessagingPanel();
                  setLocation("/messages");
                }}
                data-testid="button-dock-full-messages"
              >
                Open full Messages
              </Button>
            </div>
          }
        />
      )}
    </div>
  );

  return (
    <>
      {/* Desktop conversation panel */}
      {!isMobile && panelVisible && (
        <div
          className="fixed bottom-4 right-4 z-[60] flex h-[min(520px,70vh)] w-[360px] flex-col overflow-hidden rounded-xl border bg-background shadow-2xl"
          data-testid="messaging-dock-panel"
        >
          {panelBody}
        </div>
      )}

      {/* Mobile sheet */}
      {isMobile && (
        <Sheet
          open={panelVisible}
          onOpenChange={(open) => {
            if (open) openMessagingPanel();
            else {
              closeMessagingPanel();
              setMobileChatId(null);
            }
          }}
        >
          <SheetContent
            side="bottom"
            className="flex h-[90vh] flex-col p-0 sm:max-w-full"
          >
            <SheetHeader className="sr-only">
              <SheetTitle>Messaging</SheetTitle>
            </SheetHeader>
            {panelBody}
          </SheetContent>
        </Sheet>
      )}

      {/* Minimized panel chip */}
      {!isMobile && dock.panelOpen && dock.panelMinimized && (
        <button
          type="button"
          className="fixed bottom-4 right-4 z-[60] flex items-center gap-2 rounded-full border bg-background px-4 py-2 shadow-lg"
          onClick={() => expandMessagingPanel()}
          data-testid="button-dock-expand-minimized"
        >
          <MessageSquare className="h-4 w-4" />
          <span className="text-sm font-medium">Messages</span>
        </button>
      )}

      {/* FAB when panel closed */}
      {showFab && !dock.panelMinimized && (
        <Button
          type="button"
          size="icon"
          className="fixed bottom-4 right-4 z-[60] h-12 w-12 rounded-full shadow-lg"
          onClick={() => openMessagingPanel()}
          data-testid="button-messaging-fab"
        >
          <MessageSquare className="h-5 w-5" />
        </Button>
      )}

      {/* Incoming bubbles (desktop) */}
      {!isMobile &&
        !panelVisible &&
        dock.bubbleConversationIds.map((id, index) => (
          <IncomingBubble
            key={id}
            conversationId={id}
            index={index}
            onOpen={() => openMiniChat(id)}
            onDismiss={() => dismissBubble(id)}
          />
        ))}

      {/* Mini chats (desktop) */}
      {!isMobile &&
        dock.openChatIds.map((id, index) => (
          <MiniChatWindow
            key={id}
            conversationId={id}
            index={index}
            panelOpen={panelVisible}
            onClose={() => closeMiniChat(id)}
            onMinimize={() => minimizeMiniChat(id)}
            onExpand={() => {
              closeMiniChat(id);
              setLocation(`/messages/${id}`);
            }}
          />
        ))}

      {/* Minimized mini-chat pills */}
      {!isMobile && dock.minimizedChatIds.length > 0 && (
        <div className="fixed bottom-20 right-4 z-[60] flex flex-col-reverse gap-2">
          {dock.minimizedChatIds.map((id) => (
            <MinimizedChatPill
              key={id}
              conversationId={id}
              onRestore={() => restoreMiniChat(id)}
              onClose={() => closeMiniChat(id)}
            />
          ))}
        </div>
      )}

      <NewConversationDialog
        open={newOpen}
        onOpenChange={setNewOpen}
        listCategory={listCategory}
        onCreated={(conv) => {
          if (conv.type === "maintenance") setListCategory("maintenance");
          openConversation(conv.id);
        }}
      />
    </>
  );
};

const IncomingBubble = ({
  conversationId,
  index,
  onOpen,
  onDismiss,
}: {
  conversationId: string;
  index: number;
  onOpen: () => void;
  onDismiss: () => void;
}) => {
  const { data: conv } = useQuery<MessagingConversation>({
    queryKey: ["/api/messaging/conversations", conversationId, "detail"],
    queryFn: async () => {
      const res = await apiRequest(
        "GET",
        `/api/messaging/conversations/${conversationId}`,
      );
      return res.json();
    },
  });

  const { user } = useAuth();
  const peer =
    conv?.participants?.find((p) => p.id !== user?.id) ||
    conv?.participants?.[0];
  const unread = conv?.unreadCount ?? 0;
  const offset = 72 + index * 56;

  return (
    <div
      className="fixed z-[60]"
      style={{ bottom: `${offset}px`, right: "1rem" }}
    >
      <div className="relative">
        <button
          type="button"
          onClick={onOpen}
          className="flex h-12 w-12 items-center justify-center rounded-full border bg-background shadow-lg transition hover:scale-105"
          data-testid={`button-incoming-bubble-${conversationId}`}
        >
          <Avatar className="h-12 w-12">
            <AvatarImage src={conversationAvatarSrc(conv, peer)} />
            <AvatarFallback>
              {conversationAvatarFallback(conv, peer)}
            </AvatarFallback>
          </Avatar>
        </button>
        {unread > 0 && (
          <Badge className="absolute -right-1 -top-1 h-5 min-w-5 justify-center rounded-full px-1 text-[10px]">
            {unread > 99 ? "99+" : unread}
          </Badge>
        )}
        <button
          type="button"
          className="absolute -left-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full border bg-background text-muted-foreground shadow"
          onClick={(e) => {
            e.stopPropagation();
            onDismiss();
          }}
          aria-label="Dismiss"
        >
          <X className="h-3 w-3" />
        </button>
      </div>
    </div>
  );
};

const MiniChatWindow = ({
  conversationId,
  index,
  panelOpen,
  onClose,
  onMinimize,
  onExpand,
}: {
  conversationId: string;
  index: number;
  panelOpen: boolean;
  onClose: () => void;
  onMinimize: () => void;
  onExpand: () => void;
}) => {
  // Stack left of the dock panel (360) or FAB (~56) at right-4
  const anchorWidth = panelOpen ? 360 : 56;
  const right = 16 + anchorWidth + 12 + index * (320 + 12);

  return (
    <div
      className="fixed bottom-4 z-[60] flex h-[min(480px,65vh)] w-[320px] flex-col overflow-hidden rounded-xl border bg-background shadow-2xl"
      style={{ right: `${right}px` }}
      data-testid={`mini-chat-${conversationId}`}
    >
      <ChatThread
        conversationId={conversationId}
        compact
        showPeople={false}
        showSearch={false}
        headerTrailing={
          <div className="flex items-center gap-0.5">
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={onExpand}
              title="Open full"
            >
              <Maximize2 className="h-3.5 w-3.5" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={onMinimize}
              title="Minimize"
            >
              <Minus className="h-3.5 w-3.5" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={onClose}
              title="Close"
            >
              <X className="h-3.5 w-3.5" />
            </Button>
          </div>
        }
        onExpandFull={onExpand}
      />
    </div>
  );
};

const MinimizedChatPill = ({
  conversationId,
  onRestore,
  onClose,
}: {
  conversationId: string;
  onRestore: () => void;
  onClose: () => void;
}) => {
  const { user } = useAuth();
  const { data: conv } = useQuery<MessagingConversation>({
    queryKey: ["/api/messaging/conversations", conversationId, "detail"],
    queryFn: async () => {
      const res = await apiRequest(
        "GET",
        `/api/messaging/conversations/${conversationId}`,
      );
      return res.json();
    },
  });
  const peer =
    conv?.participants?.find((p) => p.id !== user?.id) ||
    conv?.participants?.[0];

  return (
    <div className="flex items-center gap-1 rounded-full border bg-background py-1 pl-1 pr-2 shadow-md">
      <button
        type="button"
        className="flex max-w-[10rem] items-center gap-2"
        onClick={onRestore}
      >
        <Avatar className="h-7 w-7">
          <AvatarImage src={conversationAvatarSrc(conv, peer)} />
          <AvatarFallback className="text-[10px]">
            {conversationAvatarFallback(conv, peer)}
          </AvatarFallback>
        </Avatar>
        <span className="truncate text-xs font-medium">
          {conv?.title || "Chat"}
        </span>
      </button>
      <button type="button" onClick={onClose} aria-label="Close">
        <X className="h-3.5 w-3.5 text-muted-foreground" />
      </button>
    </div>
  );
};
