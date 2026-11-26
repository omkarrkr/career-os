import { AuthClient, type Lock } from './auth-client';

const channel = typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel('careeros-session') : null;
const hasLocks = typeof navigator !== 'undefined' && !!navigator.locks;
const lock: Lock = operation => hasLocks ? navigator.locks.request('careeros-auth', operation) : operation();
const origin = import.meta.env.VITE_API_ORIGIN || '';
if (origin && (!/^https?:\/\//.test(origin) || new URL(origin).origin !== origin.replace(/\/$/, ''))) {
  throw new Error('VITE_API_ORIGIN must be an HTTP(S) origin without a path.');
}
export const auth = new AuthClient({ origin, lock, canRefresh: hasLocks, announce: event => channel?.postMessage(event) });
channel?.addEventListener('message', () => auth.invalidate('Your session changed in another tab. Please sign in again.'));
