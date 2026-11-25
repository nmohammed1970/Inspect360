import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Check,
  CheckCheck,
  Copy,
  CornerUpLeft,
  Forward,
  Loader2,
  MoreHorizontal,
  Paperclip,
  Pencil,
  Search,
  Send,
  Smile,
  Trash2,
  Users,
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
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import { getTeamRoleDisplayLabel } from "@shared/roleLabels";
import {
  conversationAvatarFallback,
  conversationAvatarSrc,
  messagingDisplayName,
  messagingInitials,
  type MessagingAttachment,
  type MessagingConversation,
  type MessagingMessage,
} from "../types";
import {
  markOptimisticFailed,
  upsertOptimisticMessage,
} from "../applyMessagingEvent";
import {
  getMessagingWsConnected,
  subscribeMessagingWsConnected,
} from "../wsConnectionState";
import {
  addViewingConversation,
  removeViewingConversation,
} from "../viewingRegistry";
import {
  COMPOSER_EMOJIS,
  REACTION_EMOJIS,
  formatMessageDay,
  formatMessageTime,
  lastSeenLabel,
  receiptStatus,
} from "../messagingFormat";
import { AttachmentChip } from "./AttachmentChip";

export interface ChatThreadProps {
  conversationId: string;
  compact?: boolean;
  /** When false, do not register viewing / mark read (e.g. minimized). */
  active?: boolean;
  className?: string;
  headerLeading?: ReactNode;
  headerTrailing?: ReactNode;
  showPeople?: boolean;
  showSearch?: boolean;
  onExpandFull?: () => void;
}

export const ChatThread = ({
  conversationId,
  compact = false,
  active = true,
  className,
  headerLeading,
  headerTrailing,
  showPeople = true,
  showSearch = true,
  onExpandFull,
}: ChatThreadProps) => {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const activeId = conversationId;

  const [composer, setComposer] = useState("");
  const [replyTo, setReplyTo] = useState<MessagingMessage | null>(null);
  const [editing, setEditing] = useState<MessagingMessage | null>(null);
  const [threadSearch, setThreadSearch] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [peopleOpen, setPeopleOpen] = useState(false);
  const [forwardMsg, setForwardMsg] = useState<MessagingMessage | null>(null);
  const [pendingFiles, setPendingFiles] = useState<
    Array<{
      objectPath: string;
      fileName: string;
      mimeType: string;
      byteSize: number;
    }>
  >([]);
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const [typingUserIds, setTypingUserIds] = useState<string[]>([]);
  const [dragOver, setDragOver] = useState(false);
  const [wsConnected, setWsConnected] = useState(getMessagingWsConnected);
  const [tabVisible, setTabVisible] = useState(
    () => typeof document === "undefined" || document.visibilityState === "visible",
  );
  const bottomRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const typingTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const olderCursor = useRef<string | null>(null);
  const [loadingOlder, setLoadingOlder] = useState(false);

  useEffect(() => subscribeMessagingWsConnected(setWsConnected), []);
  useEffect(() => {
    const onVis = () => setTabVisible(document.visibilityState === "visible");
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, []);

  useEffect(() => {
    if (!activeId || !active) return;
    addViewingConversation(activeId);
    return () => removeViewingConversation(activeId);
  }, [activeId, active]);

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

  const { data: conversationLists } = useQuery<MessagingConversation[]>({
    queryKey: ["/api/messaging/conversations", "direct", ""],
    queryFn: async () => {
      const res = await apiRequest(
        "GET",
        `/api/messaging/conversations?category=direct`,
      );
      return res.json();
    },
    enabled: !!user && !!forwardMsg,
  });

  const { data: maintenanceLists } = useQuery<MessagingConversation[]>({
    queryKey: ["/api/messaging/conversations", "maintenance", ""],
    queryFn: async () => {
      const res = await apiRequest(
        "GET",
        `/api/messaging/conversations?category=maintenance`,
      );
      return res.json();
    },
    enabled: !!user && !!forwardMsg,
  });

  const forwardTargets = useMemo(() => {
    const map = new Map<string, MessagingConversation>();
    for (const c of conversationLists || []) map.set(c.id, c);
    for (const c of maintenanceLists || []) map.set(c.id, c);
    return [...map.values()].filter((c) => c.id !== activeId);
  }, [conversationLists, maintenanceLists, activeId]);

  const activeConversation = activeConversationDetail ?? null;

  const messagesKey = [
    "/api/messaging/conversations",
    activeId,
    "messages",
  ] as const;

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
    refetchInterval:
      !!activeId && active && tabVisible && !wsConnected ? 4000 : false,
  });

  const messages = messagesPage?.messages ?? [];
  olderCursor.current = messagesPage?.nextCursor ?? null;

  const { data: searchHits = [] } = useQuery<MessagingMessage[]>({
    queryKey: [
      "/api/messaging/conversations",
      activeId,
      "search",
      threadSearch,
    ],
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
    if (!activeId || !user || !active) return;
    apiRequest("POST", `/api/messaging/conversations/${activeId}/read`)
      .then(() => {
        queryClient.invalidateQueries({
          queryKey: ["/api/messaging/unread-count"],
        });
        queryClient.invalidateQueries({
          queryKey: ["/api/messaging/conversations"],
        });
      })
      .catch(() => undefined);
  }, [activeId, user, messages.length, queryClient, active]);

  useEffect(() => {
    if (!active) return;
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length, activeId, active]);

  useEffect(() => {
    const handler = (event: Event) => {
      const detail = (event as CustomEvent).detail as {
        type?: string;
        conversationId?: string;
        userId?: string;
        isTyping?: boolean;
        online?: boolean;
        lastSeenAt?: string | null;
      };
      if (!detail?.type) return;

      if (
        detail.type === "messaging_typing" &&
        detail.conversationId === activeId
      ) {
        const uid = detail.userId;
        if (!uid || uid === user?.id) return;
        setTypingUserIds((prev) => {
          if (detail.isTyping) {
            return prev.includes(uid) ? prev : [...prev, uid];
          }
          return prev.filter((id) => id !== uid);
        });
      }

      if (detail.type === "messaging_presence" && detail.userId) {
        queryClient.setQueriesData<MessagingConversation[]>(
          { queryKey: ["/api/messaging/conversations"] },
          (list) => {
            if (!Array.isArray(list)) return list;
            return list.map((conv) => ({
              ...conv,
              participants: conv.participants.map((p) =>
                p.id === detail.userId
                  ? {
                      ...p,
                      online: detail.online,
                      lastSeenAt: detail.lastSeenAt ?? p.lastSeenAt,
                    }
                  : p,
              ),
            }));
          },
        );
      }
    };
    window.addEventListener("inspect360:messaging", handler as EventListener);
    return () =>
      window.removeEventListener(
        "inspect360:messaging",
        handler as EventListener,
      );
  }, [activeId, queryClient, user?.id]);

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

  const postMessage = async (input: {
    conversationId: string;
    body: string | null;
    clientMessageId: string;
    replyToMessageId?: string | null;
    attachments: Array<{
      objectPath: string;
      fileName: string;
      mimeType: string;
      byteSize: number;
    }>;
  }) => {
    const res = await apiRequest(
      "POST",
      `/api/messaging/conversations/${input.conversationId}/messages`,
      {
        body: input.body,
        clientMessageId: input.clientMessageId,
        replyToMessageId: input.replyToMessageId ?? null,
        attachments: input.attachments,
      },
    );
    return res.json() as Promise<MessagingMessage>;
  };

  const sendMutation = useMutation({
    mutationFn: async (retry?: {
      clientMessageId: string;
      body: string | null;
      replyToMessageId?: string | null;
      attachments: Array<{
        objectPath: string;
        fileName: string;
        mimeType: string;
        byteSize: number;
      }>;
    }) => {
      if (!activeId || !user) return null;
      if (editing && !retry) {
        const res = await apiRequest(
          "PATCH",
          `/api/messaging/messages/${editing.id}`,
          { body: composer.trim() },
        );
        return res.json() as Promise<MessagingMessage>;
      }

      const clientMessageId =
        retry?.clientMessageId ||
        (typeof crypto !== "undefined" && "randomUUID" in crypto
          ? crypto.randomUUID()
          : `${Date.now()}-${Math.random()}`);
      const body = retry ? retry.body : composer.trim() || null;
      const replyToMessageId = retry
        ? retry.replyToMessageId
        : replyTo?.id ?? null;
      const attachments = retry
        ? retry.attachments
        : pendingFiles.map(({ objectPath, fileName, mimeType, byteSize }) => ({
            objectPath,
            fileName,
            mimeType,
            byteSize,
          }));

      if (!retry) {
        const optimistic: MessagingMessage = {
          id: `temp-${clientMessageId}`,
          conversationId: activeId,
          organizationId: user.organizationId || "",
          senderId: user.id,
          body,
          clientMessageId,
          replyToMessageId: replyToMessageId ?? null,
          replyTo: replyTo
            ? {
                id: replyTo.id,
                body: replyTo.body,
                senderId: replyTo.senderId,
                deletedAt: replyTo.deletedAt,
              }
            : null,
          createdAt: new Date().toISOString(),
          sender: {
            id: user.id,
            firstName: user.firstName,
            lastName: user.lastName,
            profileImageUrl: user.profileImageUrl,
            role: user.role,
          },
          attachments: attachments.map((a, i) => ({
            id: `temp-att-${clientMessageId}-${i}`,
            messageId: `temp-${clientMessageId}`,
            objectPath: a.objectPath,
            fileName: a.fileName,
            mimeType: a.mimeType,
            byteSize: a.byteSize,
            sortOrder: i,
          })),
          reactions: [],
          receipts: [],
          pending: true,
          failed: false,
        };
        upsertOptimisticMessage(queryClient, activeId, optimistic);
        setComposer("");
        setReplyTo(null);
        setPendingFiles([]);
        sendTyping(false);
      }

      try {
        const saved = await postMessage({
          conversationId: activeId,
          body,
          clientMessageId,
          replyToMessageId,
          attachments,
        });
        upsertOptimisticMessage(queryClient, activeId, {
          ...saved,
          pending: false,
          failed: false,
        });
        return saved;
      } catch (err) {
        markOptimisticFailed(queryClient, activeId, clientMessageId);
        throw err;
      }
    },
    onSuccess: (saved) => {
      if (editing) {
        setEditing(null);
        setComposer("");
        if (saved && activeId) {
          upsertOptimisticMessage(queryClient, activeId, {
            ...saved,
            pending: false,
            failed: false,
          });
        }
      }
    },
    onError: (err: Error) => {
      toast({
        title: "Send failed",
        description: err.message,
        variant: "destructive",
      });
    },
  });

  const retryFailedMessage = (msg: MessagingMessage) => {
    if (!msg.clientMessageId || !activeId) return;
    upsertOptimisticMessage(queryClient, activeId, {
      ...msg,
      pending: true,
      failed: false,
    });
    sendMutation.mutate({
      clientMessageId: msg.clientMessageId,
      body: msg.body,
      replyToMessageId: msg.replyToMessageId,
      attachments: (msg.attachments || []).map((a) => ({
        objectPath: a.objectPath,
        fileName: a.fileName,
        mimeType: a.mimeType,
        byteSize: a.byteSize,
      })),
    });
  };

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
      const next = (data.files as MessagingAttachment[]).map((f, i) => ({
        objectPath: f.objectPath,
        fileName: f.fileName || list[i]?.name || "file",
        mimeType: f.mimeType,
        byteSize: f.byteSize,
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
  const isMaintenanceThread = activeConversation?.type === "maintenance";
  const headerSubtitle = isMaintenanceThread
    ? [
        activeConversation?.maintenanceRequest?.reference,
        activeConversation?.maintenanceRequest?.propertyLabel,
        activeConversation?.maintenanceRequest?.status
          ? `Status: ${activeConversation.maintenanceRequest.status}`
          : null,
      ]
        .filter(Boolean)
        .join(" · ") || `${peers.length} participants`
    : peers.length === 1
      ? lastSeenLabel(peers[0])
      : `${peers.length} participants`;

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
      const day = formatMessageDay(msg.createdAt);
      const last = out[out.length - 1];
      if (!last || last.day !== day) out.push({ day, items: [msg] });
      else last.items.push(msg);
    }
    return out;
  }, [messages]);

  return (
    <div className={cn("flex min-h-0 flex-1 flex-col", className)}>
      <header
        className={cn(
          "flex items-center gap-2 border-b",
          compact ? "px-2 py-2" : "gap-3 px-3 py-2.5",
        )}
      >
        {headerLeading}
        <Avatar className={cn(compact ? "h-8 w-8" : "h-9 w-9")}>
          <AvatarImage
            src={conversationAvatarSrc(activeConversation, peers[0])}
          />
          <AvatarFallback>
            {conversationAvatarFallback(activeConversation, peers[0])}
          </AvatarFallback>
        </Avatar>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold">
            {activeConversation?.title || "Conversation"}
          </p>
          <p className="truncate text-xs text-muted-foreground">
            {typingLabel || headerSubtitle}
          </p>
        </div>
        {showPeople && !compact && (
          <Button
            variant="ghost"
            size="sm"
            className="h-8 shrink-0 gap-1.5"
            onClick={() => {
              setPeopleOpen(true);
              queryClient.invalidateQueries({
                queryKey: [
                  "/api/messaging/conversations",
                  activeId,
                  "detail",
                ],
              });
            }}
            data-testid="button-thread-people"
          >
            <Users className="h-4 w-4" />
            <span className="hidden sm:inline">People</span>
            {(activeConversation?.participants.length ?? 0) > 0 && (
              <span className="text-xs text-muted-foreground">
                {activeConversation?.participants.length}
              </span>
            )}
          </Button>
        )}
        {showSearch && (
          <Button
            variant="ghost"
            size="icon"
            className={compact ? "h-7 w-7" : undefined}
            onClick={() => setSearchOpen((v) => !v)}
            data-testid="button-thread-search"
          >
            <Search className="h-4 w-4" />
          </Button>
        )}
        {headerTrailing}
      </header>

      {showPeople && (
        <Sheet open={peopleOpen} onOpenChange={setPeopleOpen}>
          <SheetContent side="right" className="w-full sm:max-w-sm">
            <SheetHeader>
              <SheetTitle>
                {isMaintenanceThread ? "Discussion people" : "People"}
              </SheetTitle>
            </SheetHeader>
            <ScrollArea className="mt-4 h-[calc(100vh-6rem)] pr-2">
              {(activeConversation?.participants.length ?? 0) === 0 ? (
                <p className="px-1 text-sm text-muted-foreground">
                  No participants yet.
                </p>
              ) : (
                <ul className="space-y-1">
                  {(activeConversation?.participants ?? []).map((person) => (
                    <li
                      key={person.id}
                      className="flex items-center gap-3 rounded-md px-1 py-2"
                    >
                      <Avatar className="h-9 w-9">
                        <AvatarImage
                          src={person.profileImageUrl || undefined}
                        />
                        <AvatarFallback>
                          {messagingInitials(person)}
                        </AvatarFallback>
                      </Avatar>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">
                          {messagingDisplayName(person)}
                          {person.id === user?.id ? " (you)" : ""}
                        </p>
                        <p className="truncate text-xs text-muted-foreground">
                          {getTeamRoleDisplayLabel(person.role || "")}
                          {person.online ? " · Online" : ""}
                        </p>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </ScrollArea>
          </SheetContent>
        </Sheet>
      )}

      {searchOpen && (
        <div className="border-b p-2">
          <Input
            placeholder="Search in conversation"
            value={threadSearch}
            onChange={(e) => setThreadSearch(e.target.value)}
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
                      .getElementById(`msg-${activeId}-${hit.id}`)
                      ?.scrollIntoView({
                        behavior: "smooth",
                        block: "center",
                      });
                  }}
                >
                  {hit.body}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      <div className="relative min-h-0 flex-1 overflow-hidden">
        <ScrollArea className={cn("h-full", compact ? "px-2 py-2" : "px-3 py-4")}>
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
                        id={`msg-${activeId}-${msg.id}`}
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
                            <span>{formatMessageTime(msg.createdAt)}</span>
                            {msg.editedAt && !msg.deletedAt && (
                              <span>· edited</span>
                            )}
                            {msg.pending && <span>· sending…</span>}
                            {msg.failed && (
                              <button
                                type="button"
                                className="underline"
                                onClick={() => retryFailedMessage(msg)}
                              >
                                Failed · Retry
                              </button>
                            )}
                            {mine &&
                              !msg.deletedAt &&
                              !msg.pending &&
                              !msg.failed &&
                              (status === "read" ? (
                                <CheckCheck className="h-3 w-3" />
                              ) : status === "delivered" ? (
                                <CheckCheck className="h-3 w-3 opacity-60" />
                              ) : (
                                <Check className="h-3 w-3 opacity-60" />
                              ))}
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
                                    )
                                      .then((r) => r.json())
                                      .then((updated: MessagingMessage) => {
                                        upsertOptimisticMessage(
                                          queryClient,
                                          activeId,
                                          updated,
                                        );
                                      })
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
                            <DropdownMenuContent
                              align={mine ? "end" : "start"}
                            >
                              <DropdownMenuItem
                                onClick={() => setReplyTo(msg)}
                              >
                                <CornerUpLeft className="mr-2 h-3.5 w-3.5" />
                                Reply
                              </DropdownMenuItem>
                              {msg.body && (
                                <DropdownMenuItem
                                  onClick={() => {
                                    navigator.clipboard.writeText(
                                      msg.body || "",
                                    );
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
                                    )
                                      .then((r) => r.json())
                                      .then((updated: MessagingMessage) => {
                                        upsertOptimisticMessage(
                                          queryClient,
                                          activeId,
                                          updated,
                                        );
                                      })
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
                                      )
                                        .then((r) => r.json())
                                        .then((updated: MessagingMessage) => {
                                          upsertOptimisticMessage(
                                            queryClient,
                                            activeId,
                                            updated,
                                          );
                                        })
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
          "border-t",
          compact ? "p-2" : "p-3",
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
            className={compact ? "h-8 w-8" : undefined}
            onClick={() => fileInputRef.current?.click()}
          >
            <Paperclip className="h-4 w-4" />
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className={compact ? "h-8 w-8" : undefined}
              >
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
              typingTimer.current = setTimeout(
                () => sendTyping(false),
                2500,
              );
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                if (composer.trim() || pendingFiles.length)
                  sendMutation.mutate();
              }
            }}
            placeholder="Write a message…"
            className="min-h-[40px] max-h-28 flex-1 resize-none"
          />
          <Button
            size="icon"
            className={compact ? "h-8 w-8" : undefined}
            disabled={
              sendMutation.isPending ||
              (!composer.trim() && pendingFiles.length === 0)
            }
            onClick={() => sendMutation.mutate()}
          >
            {sendMutation.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Send className="h-4 w-4" />
            )}
          </Button>
        </div>
      </div>

      <Dialog
        open={!!forwardMsg}
        onOpenChange={(o) => !o && setForwardMsg(null)}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Forward message</DialogTitle>
          </DialogHeader>
          <ScrollArea className="h-64">
            <div className="space-y-1">
              {forwardTargets.map((conv) => (
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
                    onExpandFull?.();
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
};
