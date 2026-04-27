// Client-side IndexedDB for pending audio uploads. SPEC §4.1:
//   "The moment recording stops, the raw payload is written to IndexedDB
//    with status `pending_upload`. On success, the entry is deleted."
//
// Minimal wrapper — no external dep. Entries older than 30 days still show
// a warning; we don't auto-delete (never lose a capture).

export type PendingItem = {
  id: string;
  createdAt: number; // ms
  blob: Blob;
  mimeType: string;
  durationSeconds: number | null;
  attempts: number;
  lastError: string | null;
};

const DB_NAME = 'forge';
const DB_VERSION = 1;
const STORE = 'pending_uploads';

let dbPromise: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: 'id' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

function withStore<T>(
  mode: IDBTransactionMode,
  fn: (store: IDBObjectStore) => IDBRequest<T> | void,
): Promise<T> {
  return openDb().then(
    (db) =>
      new Promise((resolve, reject) => {
        const tx = db.transaction(STORE, mode);
        const store = tx.objectStore(STORE);
        let pendingResult: T | undefined;
        const req = fn(store);
        if (req) {
          req.onsuccess = () => {
            pendingResult = req.result;
          };
          req.onerror = () => reject(req.error);
        }
        tx.oncomplete = () => resolve(pendingResult as T);
        tx.onerror = () => reject(tx.error);
        tx.onabort = () => reject(tx.error);
      }),
  );
}

export async function putPending(item: Omit<PendingItem, 'attempts' | 'lastError'>): Promise<void> {
  const full: PendingItem = { ...item, attempts: 0, lastError: null };
  await withStore('readwrite', (store) => store.put(full));
}

export async function updatePending(id: string, patch: Partial<PendingItem>): Promise<void> {
  await openDb().then(
    (db) =>
      new Promise<void>((resolve, reject) => {
        const tx = db.transaction(STORE, 'readwrite');
        const store = tx.objectStore(STORE);
        const getReq = store.get(id);
        getReq.onsuccess = () => {
          const existing = getReq.result as PendingItem | undefined;
          if (!existing) {
            resolve();
            return;
          }
          store.put({ ...existing, ...patch });
        };
        getReq.onerror = () => reject(getReq.error);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      }),
  );
}

export async function deletePending(id: string): Promise<void> {
  await withStore('readwrite', (store) => store.delete(id));
}

export async function listPending(): Promise<PendingItem[]> {
  return withStore<PendingItem[]>('readonly', (store) => store.getAll());
}

export async function countPending(): Promise<number> {
  return withStore<number>('readonly', (store) => store.count());
}

// Event channel so the Unsynced badge can refresh without polling.
// Browser BroadcastChannel works across tabs; in-tab subscribers also get it.
let _channel: BroadcastChannel | null = null;
function channel(): BroadcastChannel {
  if (!_channel) _channel = new BroadcastChannel('forge:pending');
  return _channel;
}

export function notifyPendingChanged() {
  try {
    channel().postMessage('changed');
  } catch {
    // BroadcastChannel may be unavailable in restrictive contexts — badge
    // will still refresh on the next visibilitychange / mount.
  }
}

export function subscribePendingChanged(listener: () => void): () => void {
  let ch: BroadcastChannel | null = null;
  try {
    ch = channel();
    ch.addEventListener('message', listener);
  } catch {
    // Ignore — caller's fallback (visibility + focus) keeps it reasonable.
  }
  return () => {
    if (ch) ch.removeEventListener('message', listener);
  };
}
