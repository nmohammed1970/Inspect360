/** Shared flag so MessagesPage can enable poll fallback when /ws is down. */

type Listener = (connected: boolean) => void;

let connected = false;
const listeners = new Set<Listener>();

export function setMessagingWsConnected(next: boolean) {
  if (connected === next) return;
  connected = next;
  listeners.forEach((fn) => fn(connected));
}

export function getMessagingWsConnected() {
  return connected;
}

export function subscribeMessagingWsConnected(listener: Listener) {
  listeners.add(listener);
  listener(connected);
  return () => {
    listeners.delete(listener);
  };
}
