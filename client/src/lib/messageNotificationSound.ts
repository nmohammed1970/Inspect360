/** WhatsApp-style incoming message chime (Web Audio; no asset file). */

import { isConversationActivelyViewed } from "@/features/messaging/viewingRegistry";


let audioCtx: AudioContext | null = null;
let unlocked = false;
let lastPlayAt = 0;
const MIN_INTERVAL_MS = 800;

function getCtx(): AudioContext | null {
  if (typeof window === "undefined") return null;
  const AC =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AC) return null;
  if (!audioCtx) audioCtx = new AC();
  return audioCtx;
}

function unlock() {
  const ctx = getCtx();
  if (!ctx) return;
  if (ctx.state === "suspended") {
    void ctx.resume();
  }
  unlocked = true;
}

function ensureUnlockListeners() {
  if (typeof window === "undefined" || (ensureUnlockListeners as { done?: boolean }).done) {
    return;
  }
  (ensureUnlockListeners as { done?: boolean }).done = true;
  const onGesture = () => unlock();
  window.addEventListener("pointerdown", onGesture, { passive: true });
  window.addEventListener("keydown", onGesture);
}

ensureUnlockListeners();

/** Short soft two-tone notification chime. */
export function playMessageReceivedSound(): void {
  const now = Date.now();
  if (now - lastPlayAt < MIN_INTERVAL_MS) return;
  lastPlayAt = now;

  const ctx = getCtx();
  if (!ctx) return;

  const start = () => {
    const t0 = ctx.currentTime;
    const tones: Array<{ freq: number; at: number; dur: number }> = [
      { freq: 880, at: 0, dur: 0.09 },
      { freq: 1174.7, at: 0.1, dur: 0.14 },
    ];

    for (const tone of tones) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = tone.freq;
      gain.gain.setValueAtTime(0.0001, t0 + tone.at);
      gain.gain.exponentialRampToValueAtTime(0.12, t0 + tone.at + 0.015);
      gain.gain.exponentialRampToValueAtTime(0.0001, t0 + tone.at + tone.dur);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(t0 + tone.at);
      osc.stop(t0 + tone.at + tone.dur + 0.02);
    }
  };

  if (ctx.state === "suspended") {
    void ctx.resume().then(() => {
      unlocked = true;
      start();
    });
    return;
  }

  if (!unlocked && ctx.state !== "running") {
    return;
  }

  start();
}

/** True when the user is focused on this conversation (full page or open mini chat). */
export function isViewingMessagingConversation(conversationId: string): boolean {
  return isConversationActivelyViewed(conversationId);
}
