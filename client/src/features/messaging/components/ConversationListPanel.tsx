import type { ReactNode } from "react";
import { useMemo } from "react";
import { Loader2, Plus, Search } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { StatusPill } from "@/components/workspace/StatusPill";
import { cn } from "@/lib/utils";
import { maintenanceRequestStatusTone } from "@shared/statusPriorityStyles";
import {
  conversationAvatarFallback,
  conversationAvatarSrc,
  messagingDisplayName,
  type MessagingConversation,
} from "../types";
import { formatMessageTime } from "../messagingFormat";

export interface ConversationListPanelProps {
  listCategory: "direct" | "maintenance";
  onListCategoryChange: (category: "direct" | "maintenance") => void;
  listQuery: string;
  onListQueryChange: (query: string) => void;
  activeId?: string | null;
  onSelectConversation: (conversationId: string) => void;
  onNewConversation: () => void;
  compact?: boolean;
  className?: string;
  footer?: ReactNode;
}

function humanizeStatus(status?: string | null) {
  if (!status) return "Unknown";
  return status
    .split("_")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function lastMessagePreview(
  conv: MessagingConversation,
  selfId?: string,
): string {
  const last = conv.lastMessage;
  if (!last) return "No messages yet";
  if (last.deletedAt) return "Message deleted";

  const sender =
    last.senderId === selfId
      ? "You"
      : messagingDisplayName(
          conv.participants.find((p) => p.id === last.senderId),
        );
  const body = last.body?.trim() || "Attachment";
  return `${sender}: ${body}`;
}

const unreadBadgeClass =
  "ml-1 h-4 min-w-4 justify-center rounded-full bg-destructive px-1 text-[10px] font-semibold text-destructive-foreground";

export const ConversationListPanel = ({
  listCategory,
  onListCategoryChange,
  listQuery,
  onListQueryChange,
  activeId,
  onSelectConversation,
  onNewConversation,
  compact = false,
  className,
  footer,
}: ConversationListPanelProps) => {
  const { user } = useAuth();

  const { data: conversations = [], isLoading: loadingList } = useQuery<
    MessagingConversation[]
  >({
    queryKey: ["/api/messaging/conversations", listCategory, listQuery],
    queryFn: async () => {
      const params = new URLSearchParams();
      params.set("category", listCategory);
      if (listQuery.trim()) params.set("q", listQuery.trim());
      const res = await apiRequest(
        "GET",
        `/api/messaging/conversations?${params.toString()}`,
      );
      return res.json();
    },
    enabled: !!user,
  });

  const { data: allConversations = [] } = useQuery<MessagingConversation[]>({
    queryKey: ["/api/messaging/conversations", "all", ""],
    queryFn: async () => {
      const res = await apiRequest(
        "GET",
        `/api/messaging/conversations?category=all`,
      );
      return res.json();
    },
    enabled: !!user,
  });

  const { directUnread, maintenanceUnread } = useMemo(() => {
    let direct = 0;
    let maintenance = 0;
    for (const conv of allConversations) {
      const count = conv.unreadCount || 0;
      if (count <= 0) continue;
      if (conv.type === "maintenance") maintenance += count;
      else direct += count;
    }
    return { directUnread: direct, maintenanceUnread: maintenance };
  }, [allConversations]);

  return (
    <div className={cn("flex min-h-0 flex-1 flex-col", className)}>
      <div className={cn("space-y-2 border-b", compact ? "p-2" : "p-3")}>
        <div className="grid grid-cols-2 gap-1 rounded-lg bg-muted p-1">
          <button
            type="button"
            className={cn(
              "inline-flex items-center justify-center gap-1 rounded-md px-2 py-1.5 text-xs font-medium transition-colors",
              listCategory === "direct"
                ? "bg-background shadow-sm"
                : "text-muted-foreground",
            )}
            onClick={() => onListCategoryChange("direct")}
            data-testid="tab-direct-messages"
          >
            <span>Direct Messages</span>
            {directUnread > 0 && (
              <Badge
                className={unreadBadgeClass}
                data-testid="badge-tab-direct-unread"
              >
                {directUnread > 99 ? "99+" : directUnread}
              </Badge>
            )}
          </button>
          <button
            type="button"
            className={cn(
              "inline-flex items-center justify-center gap-1 rounded-md px-2 py-1.5 text-xs font-medium transition-colors",
              listCategory === "maintenance"
                ? "bg-background shadow-sm"
                : "text-muted-foreground",
            )}
            onClick={() => onListCategoryChange("maintenance")}
            data-testid="tab-maintenance-discussions"
          >
            <span>Maintenance</span>
            {maintenanceUnread > 0 && (
              <Badge
                className={unreadBadgeClass}
                data-testid="badge-tab-maintenance-unread"
              >
                {maintenanceUnread > 99 ? "99+" : maintenanceUnread}
              </Badge>
            )}
          </button>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              className="pl-8"
              placeholder={
                listCategory === "maintenance"
                  ? "Search maintenance discussions"
                  : "Search conversations"
              }
              value={listQuery}
              onChange={(e) => onListQueryChange(e.target.value)}
              data-testid="input-messaging-search"
            />
          </div>
          <Button
            size="icon"
            onClick={onNewConversation}
            data-testid="button-new-conversation"
          >
            <Plus className="h-4 w-4" />
          </Button>
        </div>
      </div>
      <ScrollArea className="min-h-0 flex-1">
        {loadingList ? (
          <div className="flex justify-center p-8">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : conversations.length === 0 ? (
          <div className="p-6 text-center text-sm text-muted-foreground">
            {listCategory === "maintenance"
              ? "No maintenance discussions yet. Start one from a request."
              : "No conversations yet. Start a new message."}
          </div>
        ) : (
          conversations.map((conv) => {
            const other = conv.participants.filter((p) => p.id !== user?.id);
            const avatarUser = other[0];
            const isMr = conv.type === "maintenance";
            const status = conv.maintenanceRequest?.status;
            return (
              <button
                key={conv.id}
                type="button"
                onClick={() => onSelectConversation(conv.id)}
                className={cn(
                  "flex w-full items-start gap-3 border-b text-left transition-colors hover:bg-muted/50",
                  compact ? "px-2 py-2.5" : "px-3 py-3",
                  activeId === conv.id && "bg-muted",
                )}
                data-testid={`button-conversation-${conv.id}`}
              >
                <Avatar className={cn(compact ? "h-9 w-9" : "h-10 w-10")}>
                  <AvatarImage src={conversationAvatarSrc(conv, avatarUser)} />
                  <AvatarFallback>
                    {conversationAvatarFallback(conv, avatarUser)}
                  </AvatarFallback>
                </Avatar>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <p className="truncate text-sm font-medium">{conv.title}</p>
                    <span className="shrink-0 text-[11px] text-muted-foreground">
                      {formatMessageTime(
                        conv.lastMessageAt || conv.lastMessage?.createdAt,
                      )}
                    </span>
                  </div>
                  {isMr && (
                    <div className="mt-0.5 flex min-w-0 items-center gap-1.5">
                      {conv.maintenanceRequest?.propertyLabel ? (
                        <p className="min-w-0 truncate text-[11px] text-muted-foreground">
                          {conv.maintenanceRequest.propertyLabel}
                        </p>
                      ) : null}
                      {status ? (
                        <StatusPill
                          tone={maintenanceRequestStatusTone(status)}
                          className="shrink-0 px-1.5 py-0 text-[10px]"
                        >
                          {humanizeStatus(status)}
                        </StatusPill>
                      ) : null}
                    </div>
                  )}
                  <div className="mt-0.5 flex items-center gap-2">
                    <p className="truncate text-xs text-muted-foreground">
                      {lastMessagePreview(conv, user?.id)}
                    </p>
                    {conv.unreadCount > 0 && (
                      <Badge
                        className={cn(
                          "ml-auto h-5 min-w-5 justify-center rounded-full px-1.5 text-[10px]",
                          "bg-destructive text-destructive-foreground hover:bg-destructive",
                        )}
                      >
                        {conv.unreadCount > 99 ? "99+" : conv.unreadCount}
                      </Badge>
                    )}
                  </div>
                </div>
              </button>
            );
          })
        )}
      </ScrollArea>
      {footer}
    </div>
  );
};
