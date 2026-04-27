import 'server-only';

// Bucket-level limits are enforced by Supabase Storage (see migration), but we
// pre-validate so the server action returns a friendly error before sending
// 15MB to Storage just to be rejected.
export const MAX_PHOTO_BYTES = 15 * 1024 * 1024;

// Mirrors the bucket's allowed_mime_types. iPhone defaults to HEIC; we accept
// it as-is (no transcoding in v1 per SPEC §19).
const PHOTO_MIME_TO_EXT: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/heic': 'heic',
  'image/heif': 'heif',
};

export function isAcceptedPhotoMime(mime: string): boolean {
  return mime in PHOTO_MIME_TO_EXT;
}

export function photoMimeToExtension(mime: string): string {
  return PHOTO_MIME_TO_EXT[mime] ?? 'bin';
}
