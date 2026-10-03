export type EntitlementLockCode = 'TRIAL_EXPIRED' | 'CREDITS_EXPIRED';

type LockListener = (code: EntitlementLockCode) => void;

const lockListeners = new Set<LockListener>();

export function subscribeEntitlementLock(listener: LockListener): () => void {
  lockListeners.add(listener);
  return () => {
    lockListeners.delete(listener);
  };
}

export function notifyEntitlementLock(code: EntitlementLockCode) {
  lockListeners.forEach((listener) => listener(code));
}

export function isEntitlementLockCode(value: unknown): value is EntitlementLockCode {
  return value === 'TRIAL_EXPIRED' || value === 'CREDITS_EXPIRED';
}
