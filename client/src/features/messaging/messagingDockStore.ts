import { useSyncExternalStore } from "react";

export const MAX_OPEN_MINI_CHATS = 3;

export type MessagingDockState = {
  panelOpen: boolean;
  panelMinimized: boolean;
  openChatIds: string[];
  minimizedChatIds: string[];
  dismissedBubbleIds: string[];
  bubbleConversationIds: string[];
};

const defaultState: MessagingDockState = {
  panelOpen: false,
  panelMinimized: false,
  openChatIds: [],
  minimizedChatIds: [],
  dismissedBubbleIds: [],
  bubbleConversationIds: [],
};

let state: MessagingDockState = { ...defaultState };
let storageKey = "inspect360:messaging-dock";
const listeners = new Set<() => void>();

function emit() {
  for (const listener of listeners) listener();
}

function persist() {
  if (typeof window === "undefined") return;
  try {
    const payload = {
      panelOpen: state.panelOpen,
      panelMinimized: state.panelMinimized,
      openChatIds: state.openChatIds,
      minimizedChatIds: state.minimizedChatIds,
      dismissedBubbleIds: state.dismissedBubbleIds,
    };
    window.localStorage.setItem(storageKey, JSON.stringify(payload));
  } catch {
    /* ignore quota */
  }
}

function setState(partial: Partial<MessagingDockState>) {
  state = { ...state, ...partial };
  persist();
  emit();
}

export function initMessagingDockStore(userId: string | undefined) {
  storageKey = userId
    ? `inspect360:messaging-dock:${userId}`
    : "inspect360:messaging-dock";
  if (typeof window === "undefined") {
    state = { ...defaultState };
    emit();
    return;
  }
  try {
    const raw = window.localStorage.getItem(storageKey);
    if (!raw) {
      state = { ...defaultState };
    } else {
      const parsed = JSON.parse(raw) as Partial<MessagingDockState>;
      state = {
        ...defaultState,
        panelOpen: !!parsed.panelOpen,
        panelMinimized: !!parsed.panelMinimized,
        openChatIds: Array.isArray(parsed.openChatIds)
          ? parsed.openChatIds.slice(0, MAX_OPEN_MINI_CHATS)
          : [],
        minimizedChatIds: Array.isArray(parsed.minimizedChatIds)
          ? parsed.minimizedChatIds
          : [],
        dismissedBubbleIds: Array.isArray(parsed.dismissedBubbleIds)
          ? parsed.dismissedBubbleIds
          : [],
        bubbleConversationIds: [],
      };
    }
  } catch {
    state = { ...defaultState };
  }
  emit();
}

export function getMessagingDockState() {
  return state;
}

export function subscribeMessagingDock(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useMessagingDockStore(): MessagingDockState {
  return useSyncExternalStore(
    subscribeMessagingDock,
    getMessagingDockState,
    () => defaultState,
  );
}

export function toggleMessagingPanel() {
  if (state.panelOpen && !state.panelMinimized) {
    setState({ panelOpen: false, panelMinimized: false });
  } else {
    setState({ panelOpen: true, panelMinimized: false });
  }
}

export function openMessagingPanel() {
  setState({ panelOpen: true, panelMinimized: false });
}

export function closeMessagingPanel() {
  setState({ panelOpen: false, panelMinimized: false });
}

export function minimizeMessagingPanel() {
  setState({ panelMinimized: true, panelOpen: true });
}

export function expandMessagingPanel() {
  setState({ panelOpen: true, panelMinimized: false });
}

export function openMiniChat(conversationId: string) {
  if (!conversationId) return;
  let openChatIds = state.openChatIds.filter((id) => id !== conversationId);
  openChatIds = [conversationId, ...openChatIds];
  let minimizedChatIds = state.minimizedChatIds.filter(
    (id) => id !== conversationId,
  );
  while (openChatIds.length > MAX_OPEN_MINI_CHATS) {
    const dropped = openChatIds.pop();
    if (dropped && !minimizedChatIds.includes(dropped)) {
      minimizedChatIds = [...minimizedChatIds, dropped];
    }
  }
  setState({
    openChatIds,
    minimizedChatIds,
    panelOpen: true,
    panelMinimized: false,
    bubbleConversationIds: state.bubbleConversationIds.filter(
      (id) => id !== conversationId,
    ),
    dismissedBubbleIds: state.dismissedBubbleIds.filter(
      (id) => id !== conversationId,
    ),
  });
}

export function closeMiniChat(conversationId: string) {
  setState({
    openChatIds: state.openChatIds.filter((id) => id !== conversationId),
    minimizedChatIds: state.minimizedChatIds.filter(
      (id) => id !== conversationId,
    ),
  });
}

export function minimizeMiniChat(conversationId: string) {
  setState({
    openChatIds: state.openChatIds.filter((id) => id !== conversationId),
    minimizedChatIds: state.minimizedChatIds.includes(conversationId)
      ? state.minimizedChatIds
      : [...state.minimizedChatIds, conversationId],
  });
}

export function restoreMiniChat(conversationId: string) {
  openMiniChat(conversationId);
}

export function dismissBubble(conversationId: string) {
  setState({
    bubbleConversationIds: state.bubbleConversationIds.filter(
      (id) => id !== conversationId,
    ),
    dismissedBubbleIds: state.dismissedBubbleIds.includes(conversationId)
      ? state.dismissedBubbleIds
      : [...state.dismissedBubbleIds, conversationId],
  });
}

export function noteIncomingBubble(conversationId: string) {
  if (!conversationId) return;
  if (state.openChatIds.includes(conversationId)) return;
  if (state.dismissedBubbleIds.includes(conversationId)) return;
  if (state.bubbleConversationIds.includes(conversationId)) return;
  if (state.panelOpen && !state.panelMinimized) return;
  setState({
    bubbleConversationIds: [
      conversationId,
      ...state.bubbleConversationIds,
    ].slice(0, 5),
  });
}

export function clearBubblesForOpenChats() {
  setState({
    bubbleConversationIds: state.bubbleConversationIds.filter(
      (id) => !state.openChatIds.includes(id),
    ),
  });
}

/** Custom event so header button can toggle without prop drilling. */
export const MESSAGING_DOCK_TOGGLE_EVENT = "inspect360:messaging-dock-toggle";

export function dispatchToggleMessagingDock() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(MESSAGING_DOCK_TOGGLE_EVENT));
}
