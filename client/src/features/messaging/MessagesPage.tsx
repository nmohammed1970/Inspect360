import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocation, useParams } from "wouter";
import {
  Check,
  CheckCheck,
  Copy,
  CornerUpLeft,
  Forward,
  Loader2,
  MessageSquare,
  MoreHorizontal,
  Paperclip,
  Pencil,
  Plus,
  Search,
  Send,
  Smile,
  Trash2,
  X,
} from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { getTeamRoleDisplayLabel } from "@shared/roleLabels";
import {
  messagingDisplayName,
  messagingInitials,
  type MessagingAttachment,
  type MessagingConversation,
  type MessagingMessage,
  type MessagingUserSummary,
} from "./types";

const REACTION_EMOJIS = ["👍", "❤️", "😂", "🎉", "👀", "🙏"];
const COMPOSER_EMOJIS = ["😀", "🙂", "😅", "🙏", "👍", "✅", "🔥", "🎉"];

function formatTime(value?: string | Date | null) {
  if (!value) return "";
  const d = new Date(value);
  return d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

function formatDay(value?: string | Date | null) {
  if (!value) return "";
  const d = new Date(value);
  const today = new Date();
  if (d.toDateString() === today.toDateString()) return "Today";
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);
  if (d.toDateString() === yesterday.toDateString()) return "Yesterday";
  return d.toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

function lastSeenLabel(user?: MessagingUserSummary | null) {
  if (!user) return "";
  if (user.online) return "Online";
  if (!user.lastSeenAt) return "Offline";
  return `Last seen ${new Date(user.lastSeenAt).toLocaleString(undefined, {
    dateStyle: "short",
    timeStyle: "short",
  })}`;
}

function receiptStatus(
  message: MessagingMessage,
  selfId: string,
): "sent" | "delivered" | "read" {
  if (message.senderId !== selfId) return "sent";
  const others = message.receipts.filter((r) => r.userId !== selfId);
  if (others.some((r) => r.readAt)) return "read";
  if (others.some((r) => r.deliveredAt)) return "delivered";
  return "sent";
}

export default function MessagesPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const params = useParams<{ conversationId?: string }>();
  const [, setLocation] = useLocation();
  const activeId = params.conversationId;

  const [listQuery, setListQuery] = useState("");
  const [composer, setComposer] = useState("");
  const [replyTo, setReplyTo] = useState<MessagingMessage | null>(null);
  const [editing, setEditing] = useState<MessagingMessage | null>(null);
  const [newOpen, setNewOpen] = useState(false);
  const [directoryQuery, setDirectoryQuery] = useState("");
  const [selectedPeople, setSelectedPeople] = useState<string[]>([]);
  const [groupTitle, setGroupTitle] = useState("");
  const [threadSearch, setThreadSearch] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [forwardMsg, setForwardMsg] = useState<MessagingMessage | null>(null);
  const [pendingFiles, setPendingFiles] = useState<
    Array<{
      objectPath: string;
      fileName: string;
      mimeType: string;
      byteSize: number;
      previewUrl?: string;
    }>
  >([]);
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const [typingUserIds, setTypingUserIds] = useState<string[]>([]);
  const [dragOver, setDragOver] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const typingTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const olderCursor = useRef<string | null>(null);
  const [loadingOlder, setLoadingOlder] = useState(false);

  const { data: conversations = [], isLoading: loadingList } = useQuery<
    MessagingConversation[]
  >({
    queryKey: ["/api/messaging/conversations", listQuery],
    queryFn: async () => {
      const q = listQuery.trim()
        ? `?q=${encodeURIComponent(listQuery.trim())}`
        : "";
      const res = await apiRequest("GET", `/api/messaging/conversations${q}`);
      return res.json();
    },
    enabled: !!user,
  });

  const activeConversation = useMemo(
    () => conversations.find((c) => c.id === activeId) ?? null,
    [conversations, activeId],
  );

  const messagesKey = ["/api/messaging/conversations", activeId, "messages"] as const;

  const { data: messagesPage, isLoading: loadingMessages } = useQuery<{
    messages: MessagingMessage[];
    nextCursor: string | null;
  }>({
    queryKey: messagesKey,
    queryFn: async () => {
      const res = await apiRequest(
        "GET",
        `/api/messaging/conversations/${activeId}/messages?limit=40`,
      );
      return res.json();
    },
    enabled: !!user && !!activeId,
  });

  const messages = messagesPage?.messages ?? [];
  olderCursor.current = messagesPage?.nextCursor ?? null;

  const { data: directory = [] } = useQuery<MessagingUserSummary[]>({
    queryKey: ["/api/messaging/directory", directoryQuery],
    queryFn: async () => {
      const q = directoryQuery.trim()
        ? `?q=${encodeURIComponent(directoryQuery.trim())}`
        : "";
      const res = await apiRequest("GET", `/api/messaging/directory${q}`);
      return res.json();
    },
    enabled: !!user && newOpen,
  });

  const { data: searchHits = [] } = useQuery<MessagingMessage[]>({
    queryKey: ["/api/messaging/conversations", activeId, "search", threadSearch],
    queryFn: async () => {
      const res = await apiRequest(
        "GET",
        `/api/messaging/conversations/${activeId}/search?q=${encodeURIComponent(threadSearch.trim())}`,
      );
      return res.json();
    },
    enabled: !!activeId && searchOpen && threadSearch.trim().length > 0,
  });

  useEffect(() => {
    if (!activeId || !user) return;
    apiRequest("POST", `/api/messaging/conversations/${activeId}/read`)
      .then(() => {
        queryClient.invalidateQueries({ queryKey: ["/api/messaging/unread-count"] });
        queryClient.invalidateQueries({ queryKey: ["/api/messaging/conversations"] });
      })
      .catch(() => undefined);
  }, [activeId, user, messages.length, queryClient]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length, activeId]);

  useEffect(() => {
    const handler = (event: Event) => {
      const detail = (event as CustomEvent).detail as {
        type?: string;
        message?: MessagingMessage;
        event?: string;
        conversationId?: string;
        userId?: string;
        isTyping?: boolean;
      };
      if (!detail?.type) return;

      if (detail.type === "messaging_message" && detail.message) {
        const msg = detail.message;
        queryClient.invalidateQueries({ queryKey: ["/api/messaging/conversations"] });
        queryClient.invalidateQueries({ queryKey: ["/api/messaging/unread-count"] });
        if (msg.conversationId === activeId) {
          queryClient.setQueryData(messagesKey, (prev: any) => {
            if (!prev?.messages) return prev;
            const exists = prev.messages.some((m: MessagingMessage) => m.id === msg.id);
            if (exists) {
              return {
                ...prev,
                messages: prev.messages.map((m: MessagingMessage) =>
                  m.id === msg.id ? msg : m,
                ),
              };
            }
            return { ...prev, messages: [...prev.messages, msg] };
          });
        }
      }

      if (detail.type === "messaging_typing" && detail.conversationId === activeId) {
        const uid = detail.userId;
        if (!uid || uid === user?.id) return;
        setTypingUserIds((prev) => {
          if (detail.isTyping) {
            return prev.includes(uid) ? prev : [...prev, uid];
          }
          return prev.filter((id) => id !== uid);
        });
      }

      if (detail.type === "messaging_receipt") {
        queryClient.invalidateQueries({ queryKey: messagesKey });
      }
    };
    window.addEventListener("inspect360:messaging", handler as EventListener);
    return () =>
      window.removeEventListener("inspect360:messaging", handler as EventListener);
  }, [activeId, messagesKey, queryClient, user?.id]);

  const sendTyping = useCallback(
    (isTyping: boolean) => {
      if (!activeId) return;
      window.dispatchEvent(
        new CustomEvent("inspect360:messaging-outbound", {
          detail: {
            type: "messaging_typing",
            conversationId: activeId,
            isTyping,
          },
        }),
      );
    },
    [activeId],
  );

  const createConversationMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/messaging/conversations", {
        participantIds: selectedPeople,
        title: selectedPeople.length > 1 ? groupTitle.trim() || undefined : undefined,
      });
      return res.json() as Promise<MessagingConversation>;
    },
    onSuccess: (conv) => {
      queryClient.invalidateQueries({ queryKey: ["/api/messaging/conversations"] });
      setNewOpen(false);
      setSelectedPeople([]);
      setGroupTitle("");
      setLocation(`/messages/${conv.id}`);
    },
    onError: (err: Error) => {
      toast({ title: "Could not start chat", description: err.message, variant: "destructive" });
    },
  });

  const sendMutation = useMutation({
    mutationFn: async () => {
      if (!activeId) return;
      if (editing) {
        const res = await apiRequest("PATCH", `/api/messaging/messages/${editing.id}`, {
          body: composer.trim(),
        });
        return res.json();
      }
      const clientMessageId =
        typeof crypto !== "undefined" && "randomUUID" in crypto
          ? crypto.randomUUID()
          : `${Date.now()}-${Math.random()}`;
      const res = await apiRequest(
        "POST",
        `/api/messaging/conversations/${activeId}/messages`,
        {
          body: composer.trim() || null,
          clientMessageId,
          replyToMessageId: replyTo?.id ?? null,
          attachments: pendingFiles.map(({ objectPath, fileName, mimeType, byteSize }) => ({
            objectPath,
            fileName,
            mimeType,
            byteSize,
          })),
        },
      );
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.message || "Failed to send");
      }
      return res.json();
    },
    onSuccess: () => {
      setComposer("");
      setReplyTo(null);
      setEditing(null);
      setPendingFiles([]);
      sendTyping(false);
      queryClient.invalidateQueries({ queryKey: messagesKey });
      queryClient.invalidateQueries({ queryKey: ["/api/messaging/conversations"] });
      queryClient.invalidateQueries({ queryKey: ["/api/messaging/unread-count"] });
    },
    onError: (err: Error) => {
      toast({ title: "Send failed", description: err.message, variant: "destructive" });
    },
  });

  const uploadFiles = async (files: FileList | File[]) => {
    const list = Array.from(files);
    if (!list.length) return;
    const form = new FormData();
    for (const f of list) form.append("files", f);
    setUploadProgress(10);
    try {
      const res = await fetch("/api/messaging/attachments/upload", {
        method: "POST",
        body: form,
        credentials: "include",
      });
      setUploadProgress(80);
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Upload failed");
      const next = (data.files as MessagingAttachment[]).map((f) => ({
        objectPath: f.objectPath,
        fileName: f.fileName,
        mimeType: f.mimeType,
        byteSize: f.byteSize,
        previewUrl: f.mimeType.startsWith("image/")
          ? undefined
          : undefined,
      }));
      setPendingFiles((prev) => [...prev, ...next].slice(0, 5));
      setUploadProgress(100);
    } catch (err) {
      toast({
        title: "Upload failed",
        description: err instanceof Error ? err.message : "Try again",
        variant: "destructive",
      });
    } finally {
      setTimeout(() => setUploadProgress(null), 400);
    }
  };

  const loadOlder = async () => {
    if (!activeId || !olderCursor.current || loadingOlder) return;
    setLoadingOlder(true);
    try {
      const res = await apiRequest(
        "GET",
        `/api/messaging/conversations/${activeId}/messages?limit=40&cursor=${olderCursor.current}`,
      );
      const page = await res.json();
      queryClient.setQueryData(messagesKey, (prev: any) => {
        if (!prev) return page;
        const ids = new Set(prev.messages.map((m: MessagingMessage) => m.id));
        const merged = [
          ...page.messages.filter((m: MessagingMessage) => !ids.has(m.id)),
          ...prev.messages,
        ];
        return { messages: merged, nextCursor: page.nextCursor };
      });
    } finally {
      setLoadingOlder(false);
    }
  };

  const peers =
    activeConversation?.participants.filter((p) => p.id !== user?.id) ?? [];
  const headerSubtitle =
    peers.length === 1 ? lastSeenLabel(peers[0]) : `${peers.length} participants`;

  const typingLabel =
    typingUserIds.length === 0
      ? null
      : typingUserIds
          .map((id) =>
            messagingDisplayName(
              activeConversation?.participants.find((p) => p.id === id),
            ),
          )
          .join(", ") + " typing…";

  const grouped = useMemo(() => {
    const out: Array<{ day: string; items: MessagingMessage[] }> = [];
    for (const msg of messages) {
      const day = formatDay(msg.createdAt);
      const last = out[out.length - 1];
      if (!last || last.day !== day) out.push({ day, items: [msg] });
      else last.items.push(msg);
    }
    return out;
  }, [messages]);

  return (
    <div className="flex h-[calc(100vh-3.5rem)] min-h-0 w-full overflow-hidden bg-background">
      {/* Conversation list */}
      <aside
        className={cn(
          "flex w-full flex-col border-r md:w-80 lg:w-96",
          activeId ? "hidden md:flex" : "flex",
        )}
      >
        <div className="flex items-center gap-2 border-b p-3">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              className="pl-8"
              placeholder="Search conversations"
              value={listQuery}
              onChange={(e) => setListQuery(e.target.value)}
              data-testid="input-messaging-search"
            />
          </div>
          <Button
            size="icon"
            onClick={() => setNewOpen(true)}
            data-testid="button-new-conversation"
          >
            <Plus className="h-4 w-4" />
          </Button>
        </div>
        <ScrollArea className="flex-1">
          {loadingList ? (
            <div className="flex justify-center p-8">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : conversations.length === 0 ? (
            <div className="p-6 text-center text-sm text-muted-foreground">
              No conversations yet. Start a new message.
            </div>
          ) : (
            conversations.map((conv) => {
              const other = conv.participants.filter((p) => p.id !== user?.id);
              const avatarUser = other[0];
              return (
                <button
                  key={conv.id}
                  type="button"
                  onClick={() => setLocation(`/messages/${conv.id}`)}
                  className={cn(
                    "flex w-full items-start gap-3 border-b px-3 py-3 text-left transition-colors hover:bg-muted/50",
                    activeId === conv.id && "bg-muted",
                  )}
                  data-testid={`button-conversation-${conv.id}`}
                >
                  <Avatar className="h-10 w-10">
                    <AvatarImage src={avatarUser?.profileImageUrl || undefined} />
                    <AvatarFallback>{messagingInitials(avatarUser)}</AvatarFallback>
                  </Avatar>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <p className="truncate text-sm font-medium">{conv.title}</p>
                      <span className="shrink-0 text-[11px] text-muted-foreground">
                        {formatTime(conv.lastMessageAt || conv.lastMessage?.createdAt)}
                      </span>
                    </div>
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
      </aside>

      {/* Thread */}
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
          <>
            <header className="flex items-center gap-3 border-b px-3 py-2.5">
              <Button
                variant="ghost"
                size="sm"
                className="md:hidden"
                onClick={() => setLocation("/messages")}
              >
                Back
              </Button>
              <Avatar className="h-9 w-9">
                <AvatarImage src={peers[0]?.profileImageUrl || undefined} />
                <AvatarFallback>{messagingInitials(peers[0])}</AvatarFallback>
              </Avatar>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold">
                  {activeConversation?.title || "Conversation"}
                </p>
                <p className="truncate text-xs text-muted-foreground">
                  {typingLabel || headerSubtitle}
                </p>
              </div>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setSearchOpen((v) => !v)}
                data-testid="button-thread-search"
              >
                <Search className="h-4 w-4" />
              </Button>
            </header>

            {searchOpen && (
              <div className="border-b p-2">
                <Input
                  placeholder="Search in conversation"
                  value={threadSearch}
                  onChange={(e) => setThreadSearch(e.target.value)}
                  data-testid="input-thread-search"
                />
                {threadSearch.trim() && (
                  <div className="mt-2 max-h-40 space-y-1 overflow-auto">
                    {searchHits.map((hit) => (
                      <button
                        key={hit.id}
                        type="button"
                        className="block w-full truncate rounded px-2 py-1 text-left text-xs hover:bg-muted"
                        onClick={() => {
                          document
                            .getElementById(`msg-${hit.id}`)
                            ?.scrollIntoView({ behavior: "smooth", block: "center" });
                        }}
                      >
                        {hit.body}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}

            <div className="relative flex-1 overflow-hidden">
              <ScrollArea className="h-full px-3 py-4">
                {olderCursor.current && (
                  <div className="mb-3 flex justify-center">
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={loadingOlder}
                      onClick={loadOlder}
                    >
                      {loadingOlder ? "Loading…" : "Load older messages"}
                    </Button>
                  </div>
                )}
                {loadingMessages ? (
                  <div className="flex justify-center p-8">
                    <Loader2 className="h-5 w-5 animate-spin" />
                  </div>
                ) : messages.length === 0 ? (
                  <p className="py-10 text-center text-sm text-muted-foreground">
                    Say hello — send the first message.
                  </p>
                ) : (
                  grouped.map((group) => (
                    <div key={group.day} className="mb-4">
                      <div className="mb-3 flex justify-center">
                        <span className="rounded-full bg-muted px-3 py-0.5 text-[11px] text-muted-foreground">
                          {group.day}
                        </span>
                      </div>
                      <div className="space-y-2">
                        {group.items.map((msg) => {
                          const mine = msg.senderId === user?.id;
                          const status = receiptStatus(msg, user?.id || "");
                          return (
                            <div
                              id={`msg-${msg.id}`}
                              key={msg.id}
                              className={cn(
                                "flex gap-2",
                                mine ? "justify-end" : "justify-start",
                              )}
                            >
                              {!mine && (
                                <Avatar className="mt-1 h-7 w-7">
                                  <AvatarImage
                                    src={msg.sender?.profileImageUrl || undefined}
                                  />
                                  <AvatarFallback>
                                    {messagingInitials(msg.sender)}
                                  </AvatarFallback>
                                </Avatar>
                              )}
                              <div
                                className={cn(
                                  "max-w-[85%] rounded-2xl px-3 py-2 text-sm sm:max-w-[70%]",
                                  mine
                                    ? "bg-primary text-primary-foreground"
                                    : "bg-muted",
                                  msg.deletedAt && "italic opacity-70",
                                )}
                              >
                                {msg.replyTo && (
                                  <div
                                    className={cn(
                                      "mb-1 rounded border-l-2 px-2 py-1 text-[11px] opacity-80",
                                      mine
                                        ? "border-primary-foreground/50"
                                        : "border-foreground/30",
                                    )}
                                  >
                                    {msg.replyTo.deletedAt
                                      ? "Original deleted"
                                      : msg.replyTo.body}
                                  </div>
                                )}
                                {msg.deletedAt ? (
                                  <p>This message was deleted</p>
                                ) : (
                                  <>
                                    {msg.body && (
                                      <p className="whitespace-pre-wrap break-words">
                                        {msg.body}
                                      </p>
                                    )}
                                    {msg.attachments?.length > 0 && (
                                      <div className="mt-2 space-y-2">
                                        {msg.attachments.map((att) => (
                                          <AttachmentChip
                                            key={att.id}
                                            attachment={att}
                                            tone={mine ? "primary" : "muted"}
                                          />
                                        ))}
                                      </div>
                                    )}
                                  </>
                                )}
                                <div
                                  className={cn(
                                    "mt-1 flex items-center gap-1 text-[10px]",
                                    mine
                                      ? "justify-end text-primary-foreground/80"
                                      : "text-muted-foreground",
                                  )}
                                >
                                  <span>{formatTime(msg.createdAt)}</span>
                                  {msg.editedAt && !msg.deletedAt && <span>· edited</span>}
                                  {mine && !msg.deletedAt && (
                                    status === "read" ? (
                                      <CheckCheck className="h-3 w-3" />
                                    ) : status === "delivered" ? (
                                      <CheckCheck className="h-3 w-3 opacity-60" />
                                    ) : (
                                      <Check className="h-3 w-3 opacity-60" />
                                    )
                                  )}
                                </div>
                                {!msg.deletedAt && msg.reactions?.length > 0 && (
                                  <div className="mt-1 flex flex-wrap gap-1">
                                    {Object.entries(
                                      msg.reactions.reduce<Record<string, number>>(
                                        (acc, r) => {
                                          acc[r.emoji] = (acc[r.emoji] || 0) + 1;
                                          return acc;
                                        },
                                        {},
                                      ),
                                    ).map(([emoji, count]) => (
                                      <button
                                        key={emoji}
                                        type="button"
                                        className="rounded-full bg-background/80 px-1.5 text-[11px] text-foreground"
                                        onClick={() =>
                                          apiRequest(
                                            "POST",
                                            `/api/messaging/messages/${msg.id}/reactions`,
                                            { emoji },
                                          ).then(() =>
                                            queryClient.invalidateQueries({
                                              queryKey: messagesKey,
                                            }),
                                          )
                                        }
                                      >
                                        {emoji} {count}
                                      </button>
                                    ))}
                                  </div>
                                )}
                              </div>
                              {!msg.deletedAt && (
                                <DropdownMenu>
                                  <DropdownMenuTrigger asChild>
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      className="h-7 w-7 shrink-0 opacity-60"
                                    >
                                      <MoreHorizontal className="h-3.5 w-3.5" />
                                    </Button>
                                  </DropdownMenuTrigger>
                                  <DropdownMenuContent align={mine ? "end" : "start"}>
                                    <DropdownMenuItem
                                      onClick={() => setReplyTo(msg)}
                                    >
                                      <CornerUpLeft className="mr-2 h-3.5 w-3.5" />
                                      Reply
                                    </DropdownMenuItem>
                                    {msg.body && (
                                      <DropdownMenuItem
                                        onClick={() => {
                                          navigator.clipboard.writeText(msg.body || "");
                                          toast({ title: "Copied" });
                                        }}
                                      >
                                        <Copy className="mr-2 h-3.5 w-3.5" />
                                        Copy
                                      </DropdownMenuItem>
                                    )}
                                    <DropdownMenuItem
                                      onClick={() => setForwardMsg(msg)}
                                    >
                                      <Forward className="mr-2 h-3.5 w-3.5" />
                                      Forward
                                    </DropdownMenuItem>
                                    {REACTION_EMOJIS.map((emoji) => (
                                      <DropdownMenuItem
                                        key={emoji}
                                        onClick={() =>
                                          apiRequest(
                                            "POST",
                                            `/api/messaging/messages/${msg.id}/reactions`,
                                            { emoji },
                                          ).then(() =>
                                            queryClient.invalidateQueries({
                                              queryKey: messagesKey,
                                            }),
                                          )
                                        }
                                      >
                                        <Smile className="mr-2 h-3.5 w-3.5" />
                                        React {emoji}
                                      </DropdownMenuItem>
                                    ))}
                                    {mine && (
                                      <>
                                        <DropdownMenuItem
                                          onClick={() => {
                                            setEditing(msg);
                                            setComposer(msg.body || "");
                                          }}
                                        >
                                          <Pencil className="mr-2 h-3.5 w-3.5" />
                                          Edit
                                        </DropdownMenuItem>
                                        <DropdownMenuItem
                                          className="text-destructive"
                                          onClick={() =>
                                            apiRequest(
                                              "DELETE",
                                              `/api/messaging/messages/${msg.id}`,
                                            ).then(() =>
                                              queryClient.invalidateQueries({
                                                queryKey: messagesKey,
                                              }),
                                            )
                                          }
                                        >
                                          <Trash2 className="mr-2 h-3.5 w-3.5" />
                                          Delete
                                        </DropdownMenuItem>
                                      </>
                                    )}
                                  </DropdownMenuContent>
                                </DropdownMenu>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ))
                )}
                <div ref={bottomRef} />
              </ScrollArea>
            </div>

            <div
              className={cn(
                "border-t p-3",
                dragOver && "bg-primary/5 ring-2 ring-inset ring-primary/30",
              )}
              onDragOver={(e) => {
                e.preventDefault();
                setDragOver(true);
              }}
              onDragLeave={() => setDragOver(false)}
              onDrop={(e) => {
                e.preventDefault();
                setDragOver(false);
                if (e.dataTransfer.files?.length) uploadFiles(e.dataTransfer.files);
              }}
            >
              {(replyTo || editing) && (
                <div className="mb-2 flex items-center gap-2 rounded-md bg-muted px-2 py-1.5 text-xs">
                  <span className="flex-1 truncate">
                    {editing
                      ? `Editing message`
                      : `Replying to: ${replyTo?.body || "attachment"}`}
                  </span>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6"
                    onClick={() => {
                      setReplyTo(null);
                      setEditing(null);
                      if (editing) setComposer("");
                    }}
                  >
                    <X className="h-3.5 w-3.5" />
                  </Button>
                </div>
              )}
              {pendingFiles.length > 0 && (
                <div className="mb-2 flex flex-wrap gap-2">
                  {pendingFiles.map((f) => (
                    <div
                      key={f.objectPath}
                      className="flex items-center gap-1 rounded-md border px-2 py-1 text-xs"
                    >
                      <Paperclip className="h-3 w-3" />
                      <span className="max-w-[10rem] truncate">{f.fileName}</span>
                      <button
                        type="button"
                        onClick={() =>
                          setPendingFiles((prev) =>
                            prev.filter((p) => p.objectPath !== f.objectPath),
                          )
                        }
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
              {uploadProgress != null && (
                <div className="mb-2 h-1 overflow-hidden rounded bg-muted">
                  <div
                    className="h-full bg-primary transition-all"
                    style={{ width: `${uploadProgress}%` }}
                  />
                </div>
              )}
              <div className="flex items-end gap-2">
                <input
                  ref={fileInputRef}
                  type="file"
                  className="hidden"
                  multiple
                  accept="image/*,video/mp4,application/pdf,.doc,.docx,.xls,.xlsx,.txt"
                  onChange={(e) => {
                    if (e.target.files) uploadFiles(e.target.files);
                    e.target.value = "";
                  }}
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={() => fileInputRef.current?.click()}
                  data-testid="button-attach-files"
                >
                  <Paperclip className="h-4 w-4" />
                </Button>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button type="button" variant="ghost" size="icon">
                      <Smile className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent>
                    <div className="grid grid-cols-4 gap-1 p-1">
                      {COMPOSER_EMOJIS.map((emoji) => (
                        <button
                          key={emoji}
                          type="button"
                          className="rounded p-1 text-lg hover:bg-muted"
                          onClick={() => setComposer((c) => c + emoji)}
                        >
                          {emoji}
                        </button>
                      ))}
                    </div>
                  </DropdownMenuContent>
                </DropdownMenu>
                <Textarea
                  value={composer}
                  onChange={(e) => {
                    setComposer(e.target.value);
                    sendTyping(true);
                    if (typingTimer.current) clearTimeout(typingTimer.current);
                    typingTimer.current = setTimeout(() => sendTyping(false), 2500);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      if (composer.trim() || pendingFiles.length) sendMutation.mutate();
                    }
                  }}
                  placeholder="Write a message…"
                  className="min-h-[44px] max-h-32 flex-1 resize-none"
                  data-testid="input-message-composer"
                />
                <Button
                  size="icon"
                  disabled={
                    sendMutation.isPending ||
                    (!composer.trim() && pendingFiles.length === 0)
                  }
                  onClick={() => sendMutation.mutate()}
                  data-testid="button-send-message"
                >
                  {sendMutation.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Send className="h-4 w-4" />
                  )}
                </Button>
              </div>
            </div>
          </>
        )}
      </section>

      {/* New conversation */}
      <Dialog open={newOpen} onOpenChange={setNewOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>New conversation</DialogTitle>
          </DialogHeader>
          <Input
            placeholder="Search people"
            value={directoryQuery}
            onChange={(e) => setDirectoryQuery(e.target.value)}
            data-testid="input-directory-search"
          />
          {selectedPeople.length > 1 && (
            <Input
              placeholder="Group title"
              value={groupTitle}
              onChange={(e) => setGroupTitle(e.target.value)}
            />
          )}
          <ScrollArea className="h-64">
            <div className="space-y-1">
              {directory.map((person) => {
                const selected = selectedPeople.includes(person.id);
                return (
                  <button
                    key={person.id}
                    type="button"
                    className={cn(
                      "flex w-full items-center gap-3 rounded-md px-2 py-2 text-left hover:bg-muted",
                      selected && "bg-muted",
                    )}
                    onClick={() =>
                      setSelectedPeople((prev) =>
                        selected
                          ? prev.filter((id) => id !== person.id)
                          : [...prev, person.id],
                      )
                    }
                    data-testid={`button-directory-user-${person.id}`}
                  >
                    <Avatar className="h-8 w-8">
                      <AvatarImage src={person.profileImageUrl || undefined} />
                      <AvatarFallback>{messagingInitials(person)}</AvatarFallback>
                    </Avatar>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">
                        {messagingDisplayName(person)}
                      </p>
                      <p className="truncate text-xs text-muted-foreground">
                        {getTeamRoleDisplayLabel(person.role || "")}
                      </p>
                    </div>
                    {selected && <Check className="h-4 w-4 text-primary" />}
                  </button>
                );
              })}
            </div>
          </ScrollArea>
          <Button
            disabled={
              selectedPeople.length === 0 ||
              (selectedPeople.length > 1 && !groupTitle.trim()) ||
              createConversationMutation.isPending
            }
            onClick={() => createConversationMutation.mutate()}
            data-testid="button-create-conversation"
          >
            {createConversationMutation.isPending ? "Starting…" : "Start chat"}
          </Button>
        </DialogContent>
      </Dialog>

      {/* Forward */}
      <Dialog open={!!forwardMsg} onOpenChange={(o) => !o && setForwardMsg(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Forward message</DialogTitle>
          </DialogHeader>
          <ScrollArea className="h-64">
            <div className="space-y-1">
              {conversations
                .filter((c) => c.id !== activeId)
                .map((conv) => (
                  <button
                    key={conv.id}
                    type="button"
                    className="flex w-full items-center gap-3 rounded-md px-2 py-2 text-left hover:bg-muted"
                    onClick={async () => {
                      if (!forwardMsg) return;
                      await apiRequest(
                        "POST",
                        `/api/messaging/messages/${forwardMsg.id}/forward`,
                        { targetConversationId: conv.id },
                      );
                      toast({ title: "Message forwarded" });
                      setForwardMsg(null);
                      setLocation(`/messages/${conv.id}`);
                    }}
                  >
                    <p className="truncate text-sm">{conv.title}</p>
                  </button>
                ))}
            </div>
          </ScrollArea>
        </DialogContent>
      </Dialog>
    </div>
  );
}

const AttachmentChip = ({
  attachment,
  tone,
}: {
  attachment: MessagingAttachment;
  tone: "primary" | "muted";
}) => {
  const href = `/api/messaging/attachments/${attachment.id}/download`;
  if (attachment.mimeType.startsWith("image/")) {
    return (
      <a href={href} target="_blank" rel="noreferrer" className="block">
        <img
          src={href}
          alt={attachment.fileName}
          className="max-h-48 max-w-full rounded-md object-cover"
        />
      </a>
    );
  }
  return (
    <a
      href={href}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs underline-offset-2 hover:underline",
        tone === "primary" ? "bg-primary-foreground/15" : "bg-background",
      )}
    >
      <Paperclip className="h-3 w-3" />
      {attachment.fileName}
    </a>
  );
};
