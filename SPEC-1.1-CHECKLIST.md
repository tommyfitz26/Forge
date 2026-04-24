# SPEC.md v1.1 — locked decisions and edit checklist

Working copy of the plan checklist: apply these edits to [SPEC.md](SPEC.md) so the spec matches v1.1 decisions.

---

## User decisions (confirmed)

1. **Supabase**: Dedicated **free-tier** Supabase project, **`public` schema** — remove all references to a `forge` schema in an *existing* project; align §6, §7, and §20.
2. **Weekly review time**: **Sunday 5:00 PM** everywhere (replace any “6:00 PM” in §4.5 and elsewhere).
3. **Nudges (scheduling)**: Nudges do **not** use per-user DB timezone. **v1 rule**: nudges and their QStash crons are **US Eastern only**; document in §4.4, §4.9, §12, and any “user profile” copy.
4. **Settings / timezone**: **No `users.timezone` in v1** — use a single constant **`America/New_York`** in code and env. Data model: **remove `timezone` from `users` table** in the v1 schema snippet. Export can still include `schedule_timezone: "America/New_York"` (constant string).
5. **Idempotency / crashed jobs** (standardize in §10.4 + §12):
   - **Layer A – Business invariants (source of truth)**: A background job is idempotent if **outcomes** are never duplicated, independent of `job_runs` rows. Examples: `weekly_summaries` unique `(user_id, week_of)` + `status` transitions; Resend idempotency key; `research` one row per `capture_id` + `research_status` + existing recovery; nudge sends gated by `nudges` rows / eligibility rules, not by `job_runs` alone.
   - **Layer B – `job_runs` coordination**: Each run uses `(job_name, idempotency_key)`. On entry, **claim** the run (insert or update with `status = 'running'`, `started_at = now()`). **Stale `running`**: if `started_at` is older than **N minutes** (e.g. 20–30), a **recovery cron** marks the row `interrupted` (prefer `interrupted` + `error: 'stale_lease'`) or `failed` with a fixed convention — **use the same choice everywhere** — so a **redelivery** can start fresh.
   - **Re-entry after crash**: The worker **always** checks Layer A first (e.g. weekly already `sent` → return **200** with `already_sent`). Then claims Layer B. Aligns with principle §3.8 (no duplicate emails, research, or nudges under redelivery, crash, or QStash retry).
   - **Unify**: Do not rely on `ON CONFLICT DO NOTHING` alone for `job_runs` without the above, or workers may “skip forever” on a dead `running` row.
6. **iOS / Shortcut audio (v1 path)**: **No** server-side transcoding / FFmpeg. **Widen** MIME allowlist (incl. iOS-typical: `audio/m4a`, `audio/x-m4a`, etc.); **enforce 25MB** with a **streaming** cap when `Content-Length` is missing; README matrix + log `Content-Type` on 415 to Sentry; **transcoding** = out of scope (v1) or see Out of scope.

---

## iOS path (short answer)

- **v1**: Relaxed allowlist + streaming max body + README; Sentry for unexpected 415. Don’t block v1 on magic-byte detection unless a real device still returns 415 after allowlist updates.

---

## SPEC.md 1.1 — checklist

### Architecture / data

- [ ] **§6, §7, §20**: Only story = dedicated free project + `public` schema; delete `forge` / “existing project” language.
- [ ] **`users` table**: Remove `timezone` column; document single `APP_SCHEDULE_TZ` / `America/New_York` in §7 or env §16; export `user` can include `schedule_timezone: "America/New_York"` (constant string).
- [ ] **§4.4, §4.5, Flow B, §12, §20**: Nudges at **10:00 and 17:00 US Eastern**; weekly at **Sun 5:00 PM US Eastern**; `cron_tz: America/New_York` for nudge/weekly; research-recovery stays hourly UTC.
- [ ] **§4.1 / date-fns** note: all “local” in UI = **Eastern** in v1 (or: timestamps stored UTC, display in Eastern).

### Idempotency / jobs

- [ ] **§10.4 + §12.3 + §4.3 (research) + weekly + nudge**: Replace with **Layer A + Layer B** + stale-`running` / `interrupted` (or `failed` convention) + “check business result first, return 200 if done.”
- [ ] **§4.5 / Flow B / weekly two-stage**: Define idempotent **stage1** (pattern + `composing` row) and **stage2** (if `status=sent`, no-op 200; if `composing` and payload missing, re-fetch or re-run from DB).
- [ ] **`job_runs` schema** (if adding `interrupted`): extend `status` check, or use `failed` with convention — same wording everywhere in the spec.
- [ ] New or extended cron: **`/api/jobs/stale-jobs` or expand research-recovery** to reset **stale `job_runs`** — document under **§12**.

### iOS / capture

- [ ] **§4.1** MIME + **§10** / upload route: allowlist + behavior without `Content-Length` + 25MB stream cap; optional: log `Content-Type` on 415.

### Consistency and hygiene (best judgment)

- [ ] **Prompt paths**: Canonical dir **`lib/ai/prompts/*.md`**; one string everywhere (remove duplicate `prompts/research` path references).
- [ ] **State §4.2 / §4.8**: Explicit promotions/archival user-initiated; **`raw → developed`** automatic after first dev session; no clash with “all transitions explicit” wording.
- [ ] **`MAX_RESEARCH_*` / monthly cap (§4.3 + §11)**: Clarify: monthly pre-call; per-research bounded by tokens + tools; `MAX_RESEARCH_COST_USD` = doc/alert only.
- [ ] **Export (§3 + Appendix C)**: Inclusions: captures, research, nudges, links, weekly summaries, conversations, attachment metadata, optional `push_subscriptions`. **Exclude** from main export: `api_costs`, `job_runs` (operational) — state why. Align “everything important exportable” (§3.5) with Appendix C.
- [ ] **RLS §6.2**: `job_runs` / `api_costs` — no anon/authenticated direct read/write; service role from jobs only, or RLS that denies `authenticated` on those tables.
- [ ] **Pattern detection §4.7**: Add **max captures** (e.g. 40) or max token budget for “last 8 weeks.”
- [ ] **Conversation §4.6**: Short state machine: template index, `Done`, 4-answer rule, edge cases.
- [ ] **Whisper**: Empty or garbage audio → manual edit; classification fallback (e.g. `observation` or `problem`) in one line.
- [ ] **§14 login**: Optional: rate limit + server-side check on magic-link request to `OWNER_EMAIL` to limit spam; document as recommended.
- [ ] **Gaps (short)**: One paragraph: backups / restore from export; `engines` in `package.json`; how the single `users` row is created (first-login trigger or migration seed).

### Appendix

- [ ] **Appendix A (cost)**: If it still mentions `users.timezone` or wrong Supabase cost story, fix for dedicated free project and no per-user tz.

---

## After edits

- Bump spec version in SPEC.md (e.g. 1.0 → **1.1**) in the document header and note the date or pointer to this file.
