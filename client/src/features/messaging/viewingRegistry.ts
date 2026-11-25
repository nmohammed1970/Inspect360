/** Conversation IDs currently visible in full page or open (non-minimized) mini chats. */

const viewingIds = new Set<string>();
const listeners = new Set<() => void>();

function emit() {
  for (const listener of listeners) listener();
}

export function addViewingConversation(conversationId: string) {
  if (!conversationId || viewingIds.has(conversationId)) return;
  viewingIds.add(conversationId);
  emit();
}

export function removeViewingConversation(conversationId: string) {
  if (!conversationId || !viewingIds.has(conversationId)) return;
  viewingIds.delete(conversationId);
  emit();
}

export function isConversationActivelyViewed(conversationId: string): boolean {
  if (typeof document === "undefined" || typeof window === "undefined") return false;
  if (document.hidden || document.visibilityState === "hidden") return false;
  if (viewingIds.has(conversationId)) return true;
  const path = window.location.pathname.replace(/\/+$/, "") || "/";
  return path === `/messages/${conversationId}`;
}

export function getViewingConversationIds(): string[] {
  return [...viewingIds];
}

export function subscribeViewingRegistry(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
