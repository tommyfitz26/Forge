'use client';

import { useState, useTransition } from 'react';
import { Bell, X } from 'lucide-react';
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
    <div className="forge-nudge-banner">
      <div className="forge-nudge-banner__row">
        <Bell size={14} className="forge-nudge-banner__icon" />
        <div className="forge-nudge-banner__main">
          <div className="forge-nudge-banner__label">Today&apos;s nudge</div>
          <p className="forge-nudge-banner__q">{question}</p>
          {alreadyResponded && (
            <p className="forge-nudge-banner__hint">
              You&apos;ve already opened this nudge. The next one will pick a
              different capture.
            </p>
          )}
        </div>
        <button
          type="button"
          onClick={() => setHidden(true)}
          aria-label="Dismiss nudge banner"
          className="forge-nudge-banner__close"
        >
          <X size={13} />
        </button>
      </div>

      {!showSkip ? (
        <div className="forge-nudge-banner__cta">
          <span>Use &ldquo;Develop this&rdquo; below to pressure-test in Claude, or</span>
          <button
            type="button"
            className="forge-btn forge-btn--ghost"
            onClick={() => setShowSkip(true)}
          >
            Skip with reason
          </button>
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
          className="forge-nudge-banner__skip"
        >
          <textarea
            name="reason"
            rows={2}
            placeholder="Optional — why is this nudge not useful right now?"
            className="forge-nudge-banner__textarea"
          />
          <div className="forge-nudge-banner__skip-row">
            <button
              type="submit"
              className="forge-btn forge-btn--primary"
              disabled={isPending}
            >
              {isPending ? 'Skipping…' : 'Confirm skip'}
            </button>
            <button
              type="button"
              className="forge-btn forge-btn--ghost"
              onClick={() => setShowSkip(false)}
            >
              Cancel
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
