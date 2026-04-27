import { describe, it, expect } from 'vitest';
import {
  readBodyWithCap,
  BodyTooLargeError,
  MissingBodyError,
} from '@/lib/http/read-body';

function makeReq(body: BodyInit | null, headers?: Record<string, string>): Request {
  return new Request('http://test.example/', {
    method: 'POST',
    ...(headers ? { headers } : {}),
    ...(body !== null ? { body } : {}),
  });
}

describe('readBodyWithCap', () => {
  it('reads a small body within the cap', async () => {
    const payload = new Uint8Array([1, 2, 3, 4, 5]);
    const req = makeReq(payload, { 'content-length': '5' });
    const out = await readBodyWithCap(req, 100);
    expect(out).toEqual(payload);
  });

  it('rejects immediately when Content-Length exceeds the cap', async () => {
    const req = makeReq(new Uint8Array(10), { 'content-length': '999999999' });
    await expect(readBodyWithCap(req, 100)).rejects.toBeInstanceOf(BodyTooLargeError);
  });

  it('rejects a malformed Content-Length', async () => {
    const req = makeReq(new Uint8Array(1), { 'content-length': 'not-a-number' });
    await expect(readBodyWithCap(req, 100)).rejects.toBeInstanceOf(BodyTooLargeError);
  });

  it('streams and aborts when body exceeds cap without Content-Length', async () => {
    // Build a ReadableStream that pushes 1KB chunks indefinitely.
    const chunk = new Uint8Array(1024).fill(1);
    let pushed = 0;
    const stream = new ReadableStream<Uint8Array>({
      async pull(controller) {
        if (pushed >= 10_000) {
          controller.close();
          return;
        }
        controller.enqueue(chunk);
        pushed += chunk.byteLength;
      },
    });
    // No content-length header → streaming cap takes effect.
    const req = new Request('http://test/', {
      method: 'POST',
      // Node's fetch requires duplex: 'half' when sending a ReadableStream.
      // @ts-expect-error — duplex is a runtime property some TS libs omit.
      duplex: 'half',
      body: stream,
    });
    await expect(readBodyWithCap(req, 5_000)).rejects.toBeInstanceOf(BodyTooLargeError);
  });

  it('throws MissingBodyError when there is no body', async () => {
    const req = new Request('http://test/', { method: 'POST' });
    await expect(readBodyWithCap(req, 100)).rejects.toBeInstanceOf(MissingBodyError);
  });
});
