'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { PenLine, Mic, Camera, Link as LinkIcon } from 'lucide-react';
import { TextCapture } from '@/app/(app)/capture/TextCapture';
import { VoiceCapture } from '@/app/(app)/capture/VoiceCapture';
import { PhotoCapture } from '@/app/(app)/capture/PhotoCapture';
import { WebClipCapture } from './WebClipCapture';

export type CaptureTab = 'note' | 'voice' | 'photo' | 'clip';

const TABS: { id: CaptureTab; label: string; icon: typeof PenLine }[] = [
  { id: 'note', label: 'Note', icon: PenLine },
  { id: 'voice', label: 'Voice', icon: Mic },
  { id: 'photo', label: 'Photo', icon: Camera },
  { id: 'clip', label: 'Web clip', icon: LinkIcon },
];

export function CaptureModal({
  open,
  initialTab,
  onClose,
}: {
  open: boolean;
  initialTab: CaptureTab | undefined;
  onClose: () => void;
}) {
  const [tab, setTab] = useState<CaptureTab>(initialTab ?? 'note');

  useEffect(() => {
    // Re-sync the active tab when the modal opens with a specific initialTab.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (open && initialTab) setTab(initialTab);
  }, [open, initialTab]);

  // Esc closes the modal.
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="forge-modal-bg" onClick={onClose}>
      <div
        className="forge-modal forge-modal--capture forge-capture-host"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label="Quick capture"
      >
        {/* Tabs */}
        <div className="forge-cap-tabs" role="tablist">
          {TABS.map((t) => {
            const Icon = t.icon;
            return (
              <button
                key={t.id}
                type="button"
                className="forge-cap-tab"
                data-active={tab === t.id ? 'true' : 'false'}
                onClick={() => setTab(t.id)}
                role="tab"
                aria-selected={tab === t.id}
              >
                <Icon size={14} />
                {t.label}
              </button>
            );
          })}
        </div>

        {/* Body */}
        <BodyForTab tab={tab} />

        {/* Footer — project picker placeholder for Phase 4.2; wires up in 4.3 */}
        <div className="forge-cap-actions">
          <span className="forge-cap-field">
            project: <span className="forge-cap-field__val">Stream / no project ▾</span>
          </span>
          <span className="forge-cap-field">
            tags: <span className="forge-cap-field__val">+ add</span>
          </span>
          <span className="forge-cap-actions__hint">
            project picker wires up in Phase 4.3 · esc to close
          </span>
        </div>
      </div>
    </div>
  );
}

function BodyForTab({ tab }: { tab: CaptureTab }): ReactNode {
  if (tab === 'note') {
    return (
      <div className="forge-cap-body">
        <TextCapture />
        <div className="forge-cap-body__hint">
          Tip: start with <code>idea:</code>, <code>problem:</code>, <code>observation:</code>, or <code>research:</code>{' '}
          to skip classification.
        </div>
      </div>
    );
  }
  if (tab === 'voice') {
    return (
      <div className="forge-cap-body">
        <VoiceCapture />
      </div>
    );
  }
  if (tab === 'photo') {
    return (
      <div className="forge-cap-body">
        <PhotoCapture />
      </div>
    );
  }
  if (tab === 'clip') {
    return (
      <div className="forge-cap-body">
        <WebClipCapture />
      </div>
    );
  }
  return null;
}
