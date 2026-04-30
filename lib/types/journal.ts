// Journal domain types (Phase 4.3.4).
//
// Locally-typed until `pnpm db:types` is re-run after applying the
// 20260430041912 migration.

export type JournalEntry = {
  id: string;
  owner_id: string;
  written_at: string;       // ISO date 'YYYY-MM-DD'
  body: string;
  tags: string[];
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
};
