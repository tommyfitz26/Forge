// Domain types for project_tasks + project_parts (Phase 5.9).
//
// Locally-typed until `pnpm db:types` is re-run after applying the
// 20260502224740 migration.

export const TASK_STATUSES = ['open', 'done'] as const;
export type TaskStatus = (typeof TASK_STATUSES)[number];

export type ProjectTask = {
  id: string;
  owner_id: string;
  project_id: string;
  body: string;
  status: TaskStatus;
  position: number;
  due_at: string | null;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
};

export const PART_STATUSES = ['planned', 'in_progress', 'done'] as const;
export type PartStatus = (typeof PART_STATUSES)[number];

export type ProjectPart = {
  id: string;
  owner_id: string;
  project_id: string;
  title: string;
  note: string | null;
  status: PartStatus;
  position: number;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
};

export const DEADLINE_STATUSES = ['pending', 'hit', 'missed'] as const;
export type DeadlineStatus = (typeof DEADLINE_STATUSES)[number];

export type ProjectDeadline = {
  id: string;
  owner_id: string;
  project_id: string;
  title: string;
  due_at: string;            // ISO date (YYYY-MM-DD)
  status: DeadlineStatus;
  notes: string | null;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
};
