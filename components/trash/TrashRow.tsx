'use client';

import { useState, useTransition } from 'react';
import { PenLine, AlignLeft, Hammer, ScrollText, RotateCcw, X } from 'lucide-react';
import {
  untrashJournalEntry,
  untrashThread,
  untrashProject,
  untrashCapture,
  purgeJournalEntry,
  purgeThread,
  purgeProject,
  purgeCapture,
} from '@/app/(app)/trash/actions';
import type { TrashItem, TrashKind } from '@/lib/db/trash';

const ICONS: Record<TrashKind, typeof PenLine> = {
  journal_entry: PenLine,
  thread: AlignLeft,
  project: Hammer,
  capture: ScrollText,
};

const KIND_LABEL: Record<TrashKind, string> = {
  journal_entry: 'journal',
  thread: 'thread',
  project: 'project',
  capture: 'capture',
};

export function TrashRow({ item }: { item: TrashItem }) {
  const [confirmingPurge, setConfirmingPurge] = useState(false);
  const [isPending, startTransition] = useTransition();
  const Icon = ICONS[item.kind];

  function onRestore() {
    startTransition(async () => {
      switch (item.kind) {
        case 'journal_entry':
          await untrashJournalEntry(item.id);
          break;
        case 'thread':
          await untrashThread(item.id);
          break;
        case 'project':
          await untrashProject(item.id);
          break;
        case 'capture':
          await untrashCapture(item.id);
          break;
      }
    });
  }

  function onPurge() {
    startTransition(async () => {
      switch (item.kind) {
        case 'journal_entry':
          await purgeJournalEntry(item.id);
          break;
        case 'thread':
          await purgeThread(item.id);
          break;
        case 'project':
          await purgeProject(item.id);
          break;
        case 'capture':
          await purgeCapture(item.id);
          break;
      }
    });
  }

  return (
    <div className="forge-trash-row" data-pending={isPending ? 'true' : 'false'}>
      <div className="forge-trash-row__icon">
        <Icon size={14} />
      </div>
      <div className="forge-trash-row__body">
        <div className="forge-trash-row__title">{item.title}</div>
        {item.preview && (
          <div className="forge-trash-row__preview">{item.preview}</div>
        )}
      </div>
      <div className="forge-trash-row__meta">
        <span className="forge-trash-row__kind">{KIND_LABEL[item.kind]}</span>
        <span className="forge-trash-row__age">
          {item.daysLeft === 0
            ? 'expires soon'
            : item.daysLeft === 1
              ? '1 day left'
              : `${item.daysLeft} days left`}
        </span>
      </div>
      <div className="forge-trash-row__actions">
        {!confirmingPurge ? (
          <>
            <button
              type="button"
              className="forge-btn"
              onClick={onRestore}
              disabled={isPending}
              title="Restore"
            >
              <RotateCcw size={13} />
              Restore
            </button>
            <button
              type="button"
              className="forge-btn forge-btn--ghost"
              onClick={() => setConfirmingPurge(true)}
              disabled={isPending}
              title="Delete forever"
            >
              <X size={13} />
            </button>
          </>
        ) : (
          <>
            <span className="forge-trash-row__confirm">Delete forever?</span>
            <button
              type="button"
              className="forge-btn forge-btn--danger"
              onClick={onPurge}
              disabled={isPending}
            >
              Yes, delete
            </button>
            <button
              type="button"
              className="forge-btn forge-btn--ghost"
              onClick={() => setConfirmingPurge(false)}
              disabled={isPending}
            >
              Cancel
            </button>
          </>
        )}
      </div>
    </div>
  );
}
