export interface MessagingUserSummary {
  id: string;
  firstName?: string | null;
  lastName?: string | null;
  email?: string | null;
  role?: string | null;
  profileImageUrl?: string | null;
  lastSeenAt?: string | Date | null;
  online?: boolean;
  lastReadAt?: string | Date | null;
}

export interface MessagingAttachment {
  id: string;
  messageId: string;
  objectPath: string;
  fileName: string;
  mimeType: string;
  byteSize: number;
  sortOrder: number;
}

export interface MessagingReaction {
  id: string;
  messageId: string;
  userId: string;
  emoji: string;
}

export interface MessagingReceipt {
  id: string;
  messageId: string;
  userId: string;
  deliveredAt?: string | Date | null;
  readAt?: string | Date | null;
}

export interface MessagingMessage {
  id: string;
  conversationId: string;
  organizationId: string;
  senderId: string;
  body: string | null;
  clientMessageId?: string | null;
  replyToMessageId?: string | null;
  replyTo?: {
    id: string;
    body: string | null;
    senderId: string;
    deletedAt?: string | Date | null;
  } | null;
  editedAt?: string | Date | null;
  deletedAt?: string | Date | null;
  createdAt: string | Date;
  sender?: MessagingUserSummary | null;
  attachments: MessagingAttachment[];
  reactions: MessagingReaction[];
  receipts: MessagingReceipt[];
}

export interface MessagingConversation {
  id: string;
  type: string;
  title: string;
  organizationId: string;
  lastMessageAt?: string | Date | null;
  createdAt?: string | Date | null;
  participants: MessagingUserSummary[];
  unreadCount: number;
  lastMessage?: {
    id: string;
    body: string | null;
    senderId: string;
    createdAt: string | Date;
    deletedAt?: string | Date | null;
  } | null;
}

export function messagingDisplayName(u?: MessagingUserSummary | null): string {
  if (!u) return "User";
  const name = [u.firstName, u.lastName].filter(Boolean).join(" ").trim();
  return name || u.email || "User";
}

export function messagingInitials(u?: MessagingUserSummary | null): string {
  const name = messagingDisplayName(u);
  const parts = name.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return `${parts[0]![0]}${parts[1]![0]}`.toUpperCase();
  return name.slice(0, 2).toUpperCase();
}
