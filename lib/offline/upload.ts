import {
  deletePending,
  listPending,
  notifyPendingChanged,
  putPending,
  updatePending,
  type PendingItem,
} from './idb';

type UploadOk = { ok: true; id: string };
type UploadErr = { ok: false; status: number; error: string };

async function uploadOnce(item: PendingItem): Promise<UploadOk | UploadErr> {
  const fd = new FormData();
  // Prefer a File so the server can read .name/.type; fall back to Blob.
  const ext = item.mimeType.split('/')[1]?.replace(/^x-/, '') ?? 'bin';
  const file = new File([item.blob], `capture-${item.id}.${ext}`, { type: item.mimeType });
  fd.append('audio', file);
  if (item.durationSeconds != null) {
    fd.append('duration_seconds', String(item.durationSeconds));
  }

  let res: Response;
  try {
    res = await fetch('/api/capture', { method: 'POST', body: fd });
  } catch (err) {
    return { ok: false, status: 0, error: err instanceof Error ? err.message : 'network_error' };
  }
  if (res.ok) {
    const data = (await res.json().catch(() => ({}))) as { id?: string };
    if (!data.id) {
      return { ok: false, status: res.status, error: 'missing_id' };
    }
    return { ok: true, id: data.id };
  }
  const text = await res.text().catch(() => '');
  return { ok: false, status: res.status, error: text || `http_${res.status}` };
}

/**
 * Retry-until-success upload. Backoff: 1s → 2s → 4s → … capped at 30s.
 * Runs until success, permanent failure, or the caller cancels via AbortSignal.
 * Permanent failures (4xx except 408/429) surface immediately — retrying
 * won't help.
 */
export async function uploadWithBackoff(
  item: PendingItem,
  opts?: { signal?: AbortSignal },
): Promise<UploadOk | UploadErr> {
  let delay = 1000;
  const MAX_DELAY = 30_000;
  while (true) {
    if (opts?.signal?.aborted) {
      return { ok: false, status: 0, error: 'aborted' };
    }
    const result = await uploadOnce(item);
    if (result.ok) return result;

    // Permanent (client error that retrying won't fix) → bail early.
    const perm =
      result.status >= 400 &&
      result.status < 500 &&
      result.status !== 408 &&
      result.status !== 429;
    if (perm) return result;

    await updatePending(item.id, {
      attempts: item.attempts + 1,
      lastError: result.error,
    });
    notifyPendingChanged();
    item.attempts += 1;

    await new Promise<void>((resolve, reject) => {
      const t = setTimeout(resolve, delay);
      opts?.signal?.addEventListener(
        'abort',
        () => {
          clearTimeout(t);
          reject(new Error('aborted'));
        },
        { once: true },
      );
    }).catch(() => {
      // aborted — next loop iteration will return with status 0
    });

    delay = Math.min(delay * 2, MAX_DELAY);
  }
}

/** Save to IDB then kick off retry loop. Returns the final result. */
export async function saveAndUpload(input: {
  blob: Blob;
  mimeType: string;
  durationSeconds: number | null;
}): Promise<UploadOk | UploadErr> {
  const id = crypto.randomUUID();
  const item: PendingItem = {
    id,
    createdAt: Date.now(),
    blob: input.blob,
    mimeType: input.mimeType,
    durationSeconds: input.durationSeconds,
    attempts: 0,
    lastError: null,
  };
  await putPending(item);
  notifyPendingChanged();

  const result = await uploadWithBackoff(item);
  if (result.ok) {
    await deletePending(id);
    notifyPendingChanged();
  }
  return result;
}

/**
 * Re-attempt every stored pending_upload. Used by the Unsynced badge's
 * "Retry all" button and on window.online events.
 */
export async function retryAllPending(): Promise<void> {
  const items = await listPending();
  for (const item of items) {
    const result = await uploadWithBackoff(item);
    if (result.ok) {
      await deletePending(item.id);
      notifyPendingChanged();
    }
  }
}
