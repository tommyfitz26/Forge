'use client';

import { useState, useTransition } from 'react';
import { Bell, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { skipNudge } from './actions';

type Props = {
  nudgeId: string;
  question: string;
  alreadyResponded: boolean;
};

// Inline banner shown above the Develop panel when the user lands on the
// capture detail page from a push notification (?nudge=:id). The page already
// marks responded_at server-side; this banner only provides an explicit Skip
// path with optional reason (writes skipped_reason).

export function NudgeBanner({ nudgeId, question, alreadyResponded }: Props) {
  const [hidden, setHidden] = useState(false);
  const [showSkip, setShowSkip] = useState(false);
  const [isPending, startTransition] = useTransition();

  if (hidden) return null;

  return (
    <div className="space-y-2 rounded-md border border-amber-500/40 bg-amber-500/5 p-4">
      <div className="flex items-start gap-3">
        <Bell className="mt-0.5 h-4 w-4 flex-shrink-0 text-amber-600 dark:text-amber-400" />
        <div className="flex-1 space-y-1">
          <div className="text-xs font-semibold uppercase tracking-wide text-amber-700 dark:text-amber-400">
            Today&apos;s nudge
          </div>
          <p className="text-sm text-neutral-800 dark:text-neutral-200">{question}</p>
          {alreadyResponded && (
            <p className="text-xs text-neutral-500">
              You&apos;ve already opened this nudge. The next one will pick a different capture.
            </p>
          )}
        </div>
        <button
          type="button"
          onClick={() => setHidden(true)}
          aria-label="Dismiss nudge banner"
          className="rounded p-1 text-neutral-500 hover:bg-amber-500/10 hover:text-neutral-700 dark:hover:text-neutral-300"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      {!showSkip ? (
        <div className="ml-7 flex flex-wrap items-center gap-2 text-xs">
          <span className="text-neutral-500">
            Use &ldquo;Develop this&rdquo; below to pressure-test in Claude, or
          </span>
          <Button size="sm" variant="ghost" onClick={() => setShowSkip(true)}>
            Skip with reason
          </Button>
        </div>
      ) : (
        <form
          action={(fd) => {
            fd.set('nudgeId', nudgeId);
            startTransition(async () => {
              await skipNudge(fd);
              setShowSkip(false);
              setHidden(true);
            });
          }}
          className="ml-7 space-y-2"
        >
          <Textarea
            name="reason"
            rows={2}
            placeholder="Optional — why is this nudge not useful right now?"
          />
          <div className="flex items-center gap-2">
            <Button type="submit" size="sm" disabled={isPending}>
              {isPending ? 'Skipping…' : 'Confirm skip'}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={() => setShowSkip(false)}
            >
              Cancel
            </Button>
          </div>
        </form>
      )}
    </div>
  );
}
