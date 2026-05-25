// Picker session id management. The id ties the studio (publisher) and any
// number of popped-out controls windows together via the backend relay
// (POST /picker-sessions/:id/messages + GET /picker-sessions/:id/stream).
//
// Persisted to localStorage so a reload reuses the same session and the
// already-open picker windows stay connected.

const STORAGE_KEY = 'loggingstudio.picker_session';

export function getOrCreatePickerSessionID(): string {
  if (typeof window === 'undefined') return '';
  const existing = window.localStorage.getItem(STORAGE_KEY);
  if (existing) return existing;
  const fresh = generatePickerSessionID();
  window.localStorage.setItem(STORAGE_KEY, fresh);
  return fresh;
}

export function rotatePickerSessionID(): string {
  const fresh = generatePickerSessionID();
  window.localStorage.setItem(STORAGE_KEY, fresh);
  return fresh;
}

// 12 hex chars / 48 bits of entropy — plenty for guessing-resistance on a
// LAN where the URL is the only thing protecting the session.
function generatePickerSessionID(): string {
  const bytes = new Uint8Array(6);
  crypto.getRandomValues(bytes);
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

export function pickerControlsURL(sessionID: string): string {
  if (typeof window === 'undefined') return '';
  return `${window.location.origin}/picker?session=${sessionID}`;
}
