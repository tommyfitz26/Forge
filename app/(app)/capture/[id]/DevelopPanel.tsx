'use client';

import { useState, useTransition } from 'react';
import { Check, Copy, ExternalLink, Sparkles } from 'lucide-react';
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

  // Once developed/archived, the panel is hidden — re-developing makes no
  // sense as a UX (state machine is one-way for raw → developed).
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
    <section className="forge-develop">
      <header className="forge-develop__head">
        <Sparkles size={14} className="forge-develop__icon" />
        <h2>Develop this</h2>
        <span className="forge-develop__sub">
          Pressure-test with Claude in a separate chat.
        </span>
        <div className="forge-develop__actions">
          {!open && (
            <button
              type="button"
              className="forge-btn"
              onClick={() => setOpen(true)}
            >
              Generate prompt
            </button>
          )}
          <button
            type="button"
            className="forge-btn"
            disabled={isPending}
            onClick={() => startTransition(() => markDeveloped(captureId))}
          >
            {isPending ? 'Saving…' : 'Mark developed'}
          </button>
        </div>
      </header>

      {open && (
        <div className="forge-develop__body">
          <div className="forge-develop__bar">
            <button
              type="button"
              className="forge-btn forge-btn--primary"
              onClick={copy}
            >
              {copied ? (
                <>
                  <Check size={13} />
                  Copied
                </>
              ) : (
                <>
                  <Copy size={13} />
                  Copy prompt
                </>
              )}
            </button>
            <a
              href="https://claude.ai/new"
              target="_blank"
              rel="noopener noreferrer"
              className="forge-develop__ext"
            >
              <ExternalLink size={12} />
              Open Claude in a new tab
            </a>
            <button
              type="button"
              className="forge-btn forge-btn--ghost"
              onClick={() => setOpen(false)}
            >
              Hide
            </button>
          </div>
          <pre className="forge-develop__pre">{prompt}</pre>
        </div>
      )}
    </section>
  );
}
