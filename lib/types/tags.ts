// Tags domain types (Phase 4.3.4).

export type Tag = {
  id: string;
  owner_id: string;
  slug: string;
  color: string | null;
  created_at: string;
};

/** Compact shape for the sidebar list — slug + usage count. */
export type TagSummary = {
  slug: string;
  count: number;
  color: string | null;
};
