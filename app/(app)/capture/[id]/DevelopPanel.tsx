'use client';

import { useState, useTransition } from 'react';
import { Check, Copy, ExternalLink, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { CaptureState } from '@/lib/capture/kinds';
import { markDeveloped } from './actions';

type Props = {
  captureId: string;
  state: CaptureState;
  prompt: string;
};

// SPEC §4.6 (post-revision): the "Develop this" entry point. Expands inline to
// reveal the generated prompt + a Copy button + a convenience link to claude.ai.
// User pastes the prompt into a fresh Claude conversation, develops the idea
// there, then comes back and taps "Mark developed."
export function DevelopPanel({ captureId, state, prompt }: Props) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [isPending, startTransition] = useTransition();

  // Once developed/serious/archived, the panel is hidden — re-developing makes
  // no sense as a UX (state machine is one-way for raw → developed).
  if (state !== 'raw') return null;

  async function copy() {
    try {
      await navigator.clipboard.writeText(prompt);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard API rejects on insecure contexts; fall back to selecting.
      const ta = document.createElement('textarea');
      ta.value = prompt;
      document.body.appendChild(ta);
      ta.select();
      try {
        document.execCommand('copy');
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      } finally {
        document.body.removeChild(ta);
      }
    }
  }

  return (
    <div className="space-y-3 rounded-md border border-neutral-200 p-4 dark:border-neutral-800">
      <div className="flex flex-wrap items-center gap-2">
        <Sparkles className="h-4 w-4 text-neutral-500" />
        <h2 className="text-sm font-semibold">Develop this</h2>
        <span className="text-xs text-neutral-500">
          Pressure-test with Claude in a separate chat.
        </span>
        <div className="ml-auto flex items-center gap-2">
          {!open && (
            <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
              Generate prompt
            </Button>
          )}
          <Button
            variant="outline"
            size="sm"
            disabled={isPending}
            onClick={() => startTransition(() => markDeveloped(captureId))}
          >
            {isPending ? 'Saving…' : 'Mark developed'}
          </Button>
        </div>
      </div>

      {open && (
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <Button size="sm" onClick={copy}>
              {copied ? (
                <>
                  <Check className="h-3.5 w-3.5" />
                  Copied
                </>
              ) : (
                <>
                  <Copy className="h-3.5 w-3.5" />
                  Copy prompt
                </>
              )}
            </Button>
            <a
              href="https://claude.ai/new"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-xs text-neutral-500 hover:text-neutral-700 dark:hover:text-neutral-300"
            >
              <ExternalLink className="h-3 w-3" />
              Open Claude in a new tab
            </a>
            <Button size="sm" variant="ghost" onClick={() => setOpen(false)}>
              Hide
            </Button>
          </div>
          <pre className="max-h-96 overflow-auto whitespace-pre-wrap rounded-md border border-neutral-200 bg-neutral-50 p-3 text-xs leading-relaxed dark:border-neutral-800 dark:bg-neutral-950">
            {prompt}
          </pre>
        </div>
      )}
    </div>
  );
}
