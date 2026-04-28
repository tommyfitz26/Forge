// Convert the URL-safe base64 VAPID public key into the Uint8Array that
// PushManager.subscribe({ applicationServerKey }) requires. Browsers throw
// "InvalidAccessError" if you hand them the raw base64 string. Pure helper —
// no DOM/Node dependencies — so it's testable from vitest.

export function urlBase64ToUint8Array(base64: string): Uint8Array {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4);
  const normalized = (base64 + padding).replace(/-/g, '+').replace(/_/g, '/');
  const bin = typeof atob === 'function' ? atob(normalized) : Buffer.from(normalized, 'base64').toString('binary');
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
