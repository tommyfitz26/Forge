import 'server-only';

export class BodyTooLargeError extends Error {
  constructor() {
    super('BODY_TOO_LARGE');
    this.name = 'BodyTooLargeError';
  }
}

export class MissingBodyError extends Error {
  constructor() {
    super('MISSING_BODY');
    this.name = 'MissingBodyError';
  }
}

/**
 * Read a Request body into a Buffer with a hard byte cap.
 *
 * SPEC §4.1: Whisper has a 25MB hard limit. If `Content-Length` is present and
 * exceeds the cap, reject immediately. If absent (iOS Shortcut chunked uploads
 * sometimes omit it), stream the body and abort the moment the cap is crossed.
 */
export async function readBodyWithCap(req: Request, maxBytes: number): Promise<Uint8Array> {
  const cl = req.headers.get('content-length');
  if (cl) {
    const n = Number(cl);
    if (!Number.isFinite(n) || n < 0) {
      throw new BodyTooLargeError();
    }
    if (n > maxBytes) {
      throw new BodyTooLargeError();
    }
  }

  if (!req.body) throw new MissingBodyError();
  const reader = req.body.getReader();

  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value) continue;
      total += value.byteLength;
      if (total > maxBytes) {
        throw new BodyTooLargeError();
      }
      chunks.push(value);
    }
  } catch (err) {
    try {
      await reader.cancel();
    } catch {
      // ignore cancel failures — the error we care about is the one we're about to throw
    }
    throw err;
  }

  const out = new Uint8Array(total);
  let offset = 0;
  for (const c of chunks) {
    out.set(c, offset);
    offset += c.byteLength;
  }
  return out;
}

/**
 * Reconstruct a Request with the captured body so `.formData()` can parse
 * multipart. Headers are preserved (including `content-type` boundary).
 */
export function requestFromBuffer(original: Request, body: Uint8Array): Request {
  return new Request(original.url, {
    method: original.method,
    headers: original.headers,
    // Buffer the body — original.body is now drained, and Request wants a
    // fresh body source anyway. Cast to ArrayBuffer via .buffer because
    // some TS libs don't accept Uint8Array directly as BodyInit.
    body: body.buffer as ArrayBuffer,
  });
}
