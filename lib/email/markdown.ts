import 'server-only';
import { marked } from 'marked';

// Wrapper around `marked` with the option set we want for transactional email:
// - GFM on (autolinks, tables, strikethrough — small enough to be free)
// - breaks on (a single newline becomes <br>) — markdown convention is for
//   newlines to be ignored, but for emails we want soft breaks to render
// - synchronous parse (no async extensions)
//
// The output is sent through Resend's `html` field. Resend's pipeline already
// adds a multipart text/html structure; we don't need to wrap in a <html>
// document — Gmail/Apple Mail render fragments fine.

marked.use({
  async: false,
  gfm: true,
  breaks: true,
});

export function renderMarkdownToHtml(md: string): string {
  const out = marked.parse(md);
  if (typeof out !== 'string') {
    // Configured async: false — this branch is unreachable in practice but
    // keeps TS strict mode happy without an `as` cast.
    throw new Error('marked returned a Promise — async should be false');
  }
  return out;
}
