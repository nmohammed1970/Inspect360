import type { ReactNode } from "react";
import { Loader2, Plus, Search } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import {
  messagingInitials,
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

  return (
    <div className={cn("flex min-h-0 flex-1 flex-col", className)}>
      <div className={cn("space-y-2 border-b", compact ? "p-2" : "p-3")}>
        <div className="grid grid-cols-2 gap-1 rounded-lg bg-muted p-1">
          <button
            type="button"
            className={cn(
              "rounded-md px-2 py-1.5 text-xs font-medium transition-colors",
              listCategory === "direct"
                ? "bg-background shadow-sm"
                : "text-muted-foreground",
            )}
            onClick={() => onListCategoryChange("direct")}
            data-testid="tab-direct-messages"
          >
            Direct Messages
          </button>
          <button
            type="button"
            className={cn(
              "rounded-md px-2 py-1.5 text-xs font-medium transition-colors",
              listCategory === "maintenance"
                ? "bg-background shadow-sm"
                : "text-muted-foreground",
            )}
            onClick={() => onListCategoryChange("maintenance")}
            data-testid="tab-maintenance-discussions"
          >
            Maintenance
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
                  <AvatarImage
                    src={avatarUser?.profileImageUrl || undefined}
                  />
                  <AvatarFallback>
                    {isMr ? "MR" : messagingInitials(avatarUser)}
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
                    <p className="mt-0.5 truncate text-[11px] text-muted-foreground">
                      {[
                        conv.maintenanceRequest?.reference,
                        conv.maintenanceRequest?.propertyLabel,
                        conv.maintenanceRequest?.status,
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </p>
                  )}
                  <div className="mt-0.5 flex items-center gap-2">
                    <p className="truncate text-xs text-muted-foreground">
                      {conv.lastMessage?.deletedAt
                        ? "Message deleted"
                        : conv.lastMessage?.body || "No messages yet"}
                    </p>
                    {conv.unreadCount > 0 && (
                      <Badge className="ml-auto h-5 min-w-5 justify-center rounded-full px-1.5 text-[10px]">
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
