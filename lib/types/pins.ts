// Pin domain types (Phase 4.3.4).

export const PIN_SOURCE_KINDS = [
  'capture',
  'project',
  'thread',
  'journal_entry',
] as const;
export type PinSourceKind = (typeof PIN_SOURCE_KINDS)[number];

export type Pin = {
  owner_id: string;
  source_kind: PinSourceKind;
  source_id: string;
  pinned_at: string;
};
