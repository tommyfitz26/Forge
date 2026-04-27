# Forge — session handoff

> **Purpose:** Hand this file to a new Claude session so they can resume where the previous one left off without re-reading the entire transcript.

---

## TL;DR — read these first, in order

1. `SPEC.md` (v1.1) — the source of truth for the product. Don't skim — read it all.
2. `SPEC-1.1-CHECKLIST.md` — already applied to SPEC.md, but useful for context on locked decisions.
3. The **memory directory** at `~/.claude/projects/-Users-tommyfitz-Forge/memory/`. It contains hard-won lessons (middleware runtime, HSTS, Sentry status, project basics). MEMORY.md is the index.
4. `README.md` — local-dev quickstart and the iOS Shortcut setup.
5. `git log --oneline` — see what's shipped.
6. The **"Active item"** section below — there's an open PR awaiting a local smoke test.

---

## Project identity

**Forge** is a single-user PWA the owner (Tommy, `fitzgibbons.tommy@gmail.com`) is building to capture voice/text/photo notes about startup ideas, auto-research them, nudge daily for development, and run a Sunday-evening Socratic review. Single-tenant. Solo dev. Spec lives at the repo root in `SPEC.md`.

- **Repo:** https://github.com/tommyfitz26/Forge
- **Working dir:** `/Users/tommyfitz/Forge`
- **Production domain:** https://forge.mom (purchased via Vercel; not yet pointed at prod deploy as of this writing)
- **Vercel project:** linked to the repo, env vars configured (Supabase, Anthropic, OpenAI, Shortcut, app URL, scheduling/budget constants).
- **Supabase project:** dedicated free-tier `sruiulyhripllqfdsivq` (separate from any other org project). Schema is `public`.

---

## Workflow conventions (locked decisions)

- **Branch per phase slice → open PR → CI must be green → merge with `gh pr merge --squash --delete-branch`.** The user explicitly authorized auto-merge on CI green.
- **One sub-phase = one PR.** Don't bundle.
- **Test-then-merge for user-facing features.** Even when CI passes, ask the user to do a local smoke test before merging if the behavior can't be validated by CI alone.
- **Never push to `main` directly.** Always via PR. (`HANDOFF.md` itself was committed direct to main once with the user's explicit instruction; that's the only exception in repo history.)
- **Never force-push or rewrite history.** The user will say so explicitly if needed.
- **Never run destructive git commands (`reset --hard`, `branch -D`, etc.) without explicit user approval.**
- **Commit per sub-phase.** Each Phase 1 sub-phase has its own PR + squash commit on `main`.

---

## Current status (as of this handoff)

| Phase | What | State |
|---|---|---|
| 0 | Foundations (scaffold, schema, auth, dashboard, CI) | ✅ Merged |
| 1a | Text capture end-to-end | ✅ Merged (PR #1) |
| 1b | Voice + Whisper + offline queue | ✅ Merged (PR #2) |
| 1c | Classification via Haiku 4.5 | ✅ Merged (PR #3) |
| 1d | iOS Shortcut endpoint (Bearer auth) | ✅ Merged (PR #4) |
| 1e | Photo capture (file upload + caption) | ✅ Merged (PR #5) |
| **Phase 1** | **All capture surfaces (text/voice/photo/Shortcut + classify)** | **✅ Shipped** |
| **2a** | **Research jobs (Sonnet 4.6 + web_search + QStash)** | **⏳ Up next — pre-work blocked on user (Upstash + domain)** |
| 2b | Daily nudges (Web Push + cron) | ⏳ Not started |
| 2c | Weekly Socratic review (Resend) | ⏳ Not started |

---

## Active item — Phase 2a kickoff (research jobs)

Phase 1 is shipped. Next branch will be `phase-2a-research`.

### Pre-work the user must finish before coding starts

**Blocking — needed for QStash signing & a public job URL.**

1. **Create an Upstash account + enable QStash.** https://console.upstash.com → QStash. Free tier (500 msgs/day) is plenty for single-user.
2. **Copy three values** from the QStash dashboard:
   - `QSTASH_TOKEN` (publish token)
   - `QSTASH_CURRENT_SIGNING_KEY`
   - `QSTASH_NEXT_SIGNING_KEY`
3. **Add all three to `.env.local` AND to Vercel** (Production / Preview / Development). Update `.env.example` too.
4. **Point `forge.mom` at the production Vercel deployment.** QStash needs a public, stable URL to call `/api/jobs/research`. (Listed as tracked debt previously; now blocking.) Alternative: use the Vercel-issued production URL directly (`forge-<slug>.vercel.app`) and skip the custom-domain setup until Phase 3 — but the iOS Shortcut would then need a URL change later.
5. **Decide the local dev story for jobs.** Options:
    - (a) Test against the deployed Preview/Prod URL (no local QStash testing).
    - (b) Run an `ngrok` tunnel and point a one-off QStash schedule at it.
    - (c) Add an `NODE_ENV !== 'production'` escape hatch that accepts a Bearer dev token in place of the QStash signature (mirrors the Shortcut pattern from 1d). Recommend (c) — it keeps the dev loop tight and the gate is impossible to misconfigure in prod.

**Optional but worth doing now** (recommended after pre-work above):
- **Rotate the keys that were pasted in chat history** (Supabase service-role JWT, Supabase DB password, Anthropic API key, OpenAI API key, SHORTCUT_API_TOKEN). Easier to do once before Phase 2 than mid-build.

### Phase 2a build plan (what Claude will do once pre-work is in)

Branch: `phase-2a-research`. Single PR. Per SPEC §4.3 / §10.4 / §11 / §12.

1. **Schema + task definition.**
   - Add `ResearchSchema` (Zod) per SPEC §4.3 in `lib/ai/research-schema.ts`.
   - Extend `TaskDef` in `lib/ai/tasks.ts` with optional `tools` field and a "terminal tool name" marker.
   - Register `research_idea` task: model `claude-sonnet-4-6`, `max_tokens: 4000`, temperature `0.3`, tools `[web_search (server tool, current dated identifier from Anthropic docs at the time), submit_research]`. Pricing per Appendix A.
   - **Look up the current `web_search_YYYYMMDD` identifier from Anthropic's docs at implementation time** — SPEC §11.1 explicitly says do not hard-code from the spec.
2. **Runner extension (`lib/ai/run.ts`).**
   - Branch on `def.tools` containing a terminal tool: pass tools to Anthropic, then extract output by finding the last `tool_use` block whose `name` matches the terminal tool, and treating its `input` as the parsed result (skip `tryParseJson` entirely on this path).
   - JSON-text path stays unchanged. Retry logic stays — on missing terminal tool call, retry once with "call <tool> as your final action" instruction.
   - Update `task.call` log so terminal-tool runs are distinguishable (e.g. `outputMode: 'tool'`).
3. **Prompt: `lib/ai/prompts/research.md`.**
   - Frontmatter comment with model + schema reference.
   - Instructs the model to use `web_search` up to 8 times, then call `submit_research` exactly once as its final action with all required fields populated. `confidence` should be honest about source coverage.
4. **QStash plumbing: `lib/qstash.ts`.**
   - Singleton `@upstash/qstash` `Client` for publishing.
   - `verifyQStashSignature(req)` helper that uses `Receiver` from `@upstash/qstash` with both signing keys; on prod, returns 401 if invalid. With option (c) above: also accept a dev bearer when `NODE_ENV !== 'production'`.
5. **Job route: `app/api/jobs/research/route.ts`.** Per SPEC §12.3:
   - Verify QStash signature (or dev bearer in dev). Reject 401 if invalid.
   - Parse body with Zod: `{ captureId: string }`.
   - **Layer A:** if a `research` row already exists for `capture_id`, return `200 { status: 'already_sent' }`.
   - **Layer B:** claim a `job_runs` row with `idempotency_key = research:{capture_id}`, `job_name = 'research'`, `status = 'running'`. On conflict with `failed` / `stale_lease`, update back to `running`. On `running` (live lease) or `succeeded`, return `200 already_running` / `already_succeeded`.
   - Set `captures.research_status = 'running'`.
   - In-job retries: 2× exponential backoff around `runTask('research_idea', ...)`. After both fail, enqueue **one** delayed QStash retry with `delay: 3600s`; if that also fails, set `research_status = 'failed'` + record error. Surface a "Retry research" UI control (capture detail).
   - On success: insert the `research` row, set `research_status = 'completed'`, mark `job_runs` succeeded.
6. **Recovery cron: `app/api/jobs/research-recovery/route.ts`.** Hourly QStash schedule (SPEC §12.1). Two passes:
   - Captures with `research_status = 'running'` and `updated_at < now() - 5m` → reset to `pending` and re-enqueue research.
   - `job_runs` with `status = 'running'` and `started_at < now() - 20m` → mark `failed` + `error = 'stale_lease'`.
7. **Capture-side enqueue.**
   - In `lib/capture/persist.ts`, after the row insert: if final `kind` is `idea` or `research`, fire-and-forget enqueue of `/api/jobs/research` via QStash (no `await` blocking the user response). Set `research_status = 'pending'`.
   - Same enqueue helper called from a "Retry research" server action on the detail page (Layer A's idempotency makes manual retries safe).
8. **Capture detail UI.**
   - Render `research_status` badge: pending / running / completed / failed.
   - When `completed`, render the structured result (competitors list, market context paragraph, recent news, angles, sources count, confidence).
   - "Retry research" button visible when `status === 'failed'`.
9. **Middleware allowlist.** Add `/api/jobs/` to `SELF_AUTH_API_PREFIXES` (or each job route to the exact set) — see `lib/supabase/middleware.ts`. Mirrors the 1d pattern.
10. **Tests.**
    - Unit: `ResearchSchema` parse against a fixture; runner tool-extraction (mocked Anthropic response with `tool_use` block); prompt template substitution; signature-verify happy path + dev-bearer escape hatch; Layer A short-circuit; recovery cron logic.
    - Smoke: deployed Preview run a real capture → research lands within ~30s, full structured payload, `api_costs` row written.
11. **One-time setup actions** (the user will do these from the Upstash dashboard or via the Upstash SDK):
    - Create the schedule: `POST /api/jobs/research-recovery`, cron `0 * * * *`.
    - On-demand publishes for `/api/jobs/research` are fired by our code — no schedule needed.
12. **Schema verification before coding** — `research`, `job_runs`, and `api_costs` tables already exist from Phase 0. Confirm the columns match (especially `job_runs.idempotency_key` unique on `(job_name, idempotency_key)`); add a migration only if a column is missing.

### What 2a does *not* include (deferred to 2b/2c)

- VAPID keys, push subscription endpoints, nudge generation.
- Resend / weekly-summary email.
- Manual on-demand research from the detail page UI for `problem`/`observation` captures (auto-research only fires on `idea`/`research` per SPEC §4.3 — manual trigger UI can land in 2a if cheap, otherwise 2c).

---

## TODOs (in priority order)

### Immediate

1. **Phase 2a — Research jobs.** Plan + pre-work in the "Active item" section above.
2. **Phase 2b — Daily nudges** (`/api/jobs/nudge?slot=morning|evening`). Cron at 10am/5pm America/New_York. Eligibility per §4.4. Web Push needs VAPID keys.
3. **Phase 2c — Weekly review** (`/api/jobs/weekly-review/stage1` → chained `stage2`). Resend account + verified sender domain needed.

The task registry / runner machinery from Phase 1c is already in place — adding new tasks is mostly: write the prompt MD, register in `lib/ai/tasks.ts`, call `runTask`. Tool-as-output extraction is the one runner extension that 2a needs.

### Tracked debt

- **Rotate keys** before Phase 2a starts (see "Active item" above).
- **Re-add Sentry in Phase 3.** It was removed during Phase 1a. See `~/.claude/projects/-Users-tommyfitz-Forge/memory/project_sentry_deferred.md` for the exact restore steps.
- **Create accounts later** (no immediate blocker until the matching phase): Resend + verified sender domain (Phase 3 / 2c), Sentry (Phase 3).
- **Vercel preview auth.** Magic-link redirects pin to `https://forge.mom`, so login doesn't round-trip on ephemeral preview URLs. Fix in Phase 2/3 if previews-with-auth become valuable: either swap to runtime `VERCEL_URL` for redirect derivation, or wildcard `*.vercel.app/auth/callback` in Supabase Redirect URLs.

---

## Lessons baked into memory (don't re-learn these)

These are saved as memories — load them via the memory system:

- **`feedback_middleware_runtime.md`** — Middleware uses **Node runtime** (`experimental.nodeMiddleware: true` + `runtime: 'nodejs'`). DO NOT add `import 'server-only'` to anything in middleware's import graph (currently `lib/supabase/middleware.ts`, `lib/env.ts`, `lib/types/db.ts`). The `default` export of `server-only` throws at edge deploy time.
- **`feedback_hsts_localhost.md`** — `Strict-Transport-Security` and CSP `upgrade-insecure-requests` are **prod-only** in `next.config.ts`. Setting them on `http://localhost` poisons the browser's HSTS cache for the full max-age.
- **`feedback_server_action_body_limit.md`** — Next.js Server Actions cap request bodies at 1MB by default. Any action accepting `File`/`Blob` FormData needs `experimental.serverActions.bodySizeLimit` raised to match. App-level pre-validation runs too late — the 413 fires first.
- **`project_sentry_deferred.md`** — `@sentry/nextjs` is uninstalled. `instrumentation.ts` is a no-op stub. Re-wire in Phase 3 with dynamic imports gated on `process.env.SENTRY_DSN`.
- **`project_forge.md`** — Project basics, solo merge policy, single-tenant invariant.

### Lessons from Phase 1 not yet promoted to memory (worth knowing)

- **Whisper sniffs format from the filename extension, not Content-Type.** Building filenames like `<id>.webm;codecs=opus` (raw `MediaRecorder` MIME) gets rejected as "Invalid file format" even though `audio/webm` is in Whisper's supported list. Fixed in `lib/offline/upload.ts:extensionFromMime` — strip codec params and `x-` prefix.
- **`captures.audio_duration_seconds` is `int`** per SPEC §6.1. Whisper and the client timer return floats. Always `Math.round()` before insert (`lib/capture/persist.ts`, `app/api/capture/route.ts`).
- **Prompt caching has a minimum prefix threshold.** Haiku 4.5 = 4096 tokens, Sonnet 4.6 = 2048 tokens. Below that, `cache_control: ephemeral` silently doesn't fire — `cache_creation_input_tokens` stays 0. `classify_capture` is ~500 tokens so caching was deliberately skipped; revisit when Sonnet research/weekly prompts ship.
- **`crypto.timingSafeEqual` throws on length mismatch.** Always length-check first (`lib/auth/shortcut.ts:verifyBearer`). Tokens have fixed length so the early return doesn't leak useful info.
- **HEIC photos.** User has switched their iPhone to "Most Compatible" so all uploads are JPEG. Don't add HEIC transcoding — it was a deliberate non-goal (SPEC §19).

---

## Architecture map (where things live)

```
SPEC.md                          # source of truth
SPEC-1.1-CHECKLIST.md
HANDOFF.md                       # this file
README.md                        # quickstart + iOS Shortcut setup
middleware.ts                    # OWNER_EMAIL enforcement, Node runtime
next.config.ts                   # CSP, HSTS (prod-only), nodeMiddleware flag, serverActions bodySizeLimit (15MB)
instrumentation.ts               # no-op stub (Sentry deferred)

app/
├── (auth)/login/                # magic-link form + server action with §14 spam guard
├── auth/callback/route.ts       # exchanges OAuth code → session
├── (app)/                       # signed-in layout
│   ├── layout.tsx               # nav, UnsyncedBadge, sign-out
│   ├── page.tsx                 # dashboard list
│   ├── archive/page.tsx
│   ├── actions.ts               # signOut
│   └── capture/
│       ├── page.tsx             # 4-mode picker; voice default
│       ├── TextCapture.tsx
│       ├── VoiceCapture.tsx
│       ├── PhotoCapture.tsx     # 1e — file picker + caption + preview
│       ├── actions.ts           # createTextCapture + createPhotoCapture
│       └── [id]/
│           ├── page.tsx         # detail; renders attachments via signed URLs
│           ├── StateControls.tsx
│           └── actions.ts       # promoteToSerious / archive / unarchive / delete
└── api/
    └── capture/route.ts         # multipart audio; web (cookie) + Shortcut (Bearer)

components/
├── ui/                          # button, input, textarea, badge
├── capture/VoiceRecorder.tsx
└── layout/UnsyncedBadge.tsx

lib/
├── env.ts                       # Zod-validated env (no server-only)
├── logger.ts                    # structured logger
├── utils.ts
├── ai/
│   ├── anthropic.ts             # singleton client
│   ├── openai.ts                # Whisper client
│   ├── transcribe.ts            # Whisper call + cost log
│   ├── prompts.ts               # loadPrompt + {{var}} substitution
│   ├── tasks.ts                 # task registry (classify_capture today)
│   ├── run.ts                   # runTask: budget check, JSON-text retry, cost log
│   └── prompts/
│       └── classify_capture.md
├── auth/
│   └── shortcut.ts              # Bearer extraction + constant-time compare
├── capture/
│   ├── kinds.ts                 # CAPTURE_KINDS / STATES / RESEARCH_STATUSES
│   ├── parse.ts                 # parsePrefix + heuristicTitle
│   ├── persist.ts               # shared insert path (text + voice + photo)
│   └── photo.ts                 # MIME allowlist, MIME→ext, MAX_PHOTO_BYTES
├── http/read-body.ts            # 25MB streaming cap
├── offline/
│   ├── idb.ts                   # IndexedDB wrapper
│   └── upload.ts                # saveAndUpload + extensionFromMime
├── supabase/
│   ├── server.ts                # SSR server client
│   ├── client.ts                # browser client
│   ├── service.ts               # service-role client
│   └── middleware.ts            # session refresh + email gate (NO server-only)
└── types/db.ts                  # generated; pnpm db:types to refresh

supabase/
├── config.toml
└── migrations/
    ├── 20260424153834_initial_schema.sql
    └── 20260427142755_attachments_storage.sql   # 1e: bucket + RLS

tests/
└── unit/
    ├── env.test.ts
    ├── logger.test.ts
    ├── capture-parse.test.ts
    ├── read-body.test.ts
    ├── upload-extension.test.ts
    ├── prompts.test.ts
    ├── classify-schema.test.ts
    ├── shortcut-auth.test.ts
    ├── photo-mime.test.ts
    └── shims/server-only.ts     # vitest alias

.github/workflows/ci.yml         # lint + typecheck + test on PR
```

---

## Environment & secrets

- **`.env.local`** (gitignored) has all real secrets. The schema is mirrored in `.env.example`. Validated via Zod in `lib/env.ts` at module load — app throws at startup if any required var is missing.
- **Required vars** (full list in `.env.example`):
  - `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`
  - `OWNER_EMAIL`
  - `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`
  - `SHORTCUT_API_TOKEN` ← became required in 1d. Generate with `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`
  - `NEXT_PUBLIC_APP_URL`
  - `APP_SCHEDULE_TZ` (defaults to `America/New_York`)
  - `MAX_MONTHLY_COST_USD` (default 25), `MAX_RESEARCH_COST_USD` (default 0.25)
- **Optional, deferred to later phases**: Sentry, QStash, Resend, VAPID.
- **Vercel** mirrors all required vars across Production / Preview / Development.
- **Supabase Auth → Redirect URLs:** allowlist includes `http://localhost:3000/**` and `https://forge.mom/**`. Add ephemeral preview URLs only if needed (currently not).
- **Supabase CLI** is linked to the remote project. Password lives in macOS keychain. To run a migration: `pnpm db:new <name>`, edit the generated SQL, `pnpm db:push`. Always re-run `pnpm db:types` after `db:push`.

---

## Tooling cheat sheet

```bash
# Dev loop
pnpm dev                                     # Next dev server
pnpm typecheck                               # tsc --noEmit (strict + noUncheckedIndexedAccess)
pnpm lint                                    # next lint
pnpm test                                    # vitest run
pnpm build                                   # production build

# Database
pnpm db:new <name>                           # creates timestamped migration .sql
pnpm db:push                                 # applies pending migrations to remote
pnpm db:types                                # regenerate lib/types/db.ts (run after db:push)

# Git / PR flow
git switch -c phase-Nx-<short-name>          # branch off main
# ...do work, commit per logical step...
git push -u origin <branch>
gh pr create --title "..." --body "..."      # body should include test plan checklist
gh pr checks <#> --watch                     # blocks until all checks settle
gh pr merge <#> --squash --delete-branch     # only after CI green AND user-confirmed for UI changes
git switch main && git pull
```

---

## Things to be careful about

1. **`server-only` in middleware path.** Re-read `feedback_middleware_runtime.md` before adding any new file imported by `middleware.ts` or its transitive deps. Keep `server-only` in `lib/supabase/server.ts` and `service.ts` (Node runtime, fine), out of `lib/env.ts` and `lib/supabase/middleware.ts`.
2. **HSTS / `upgrade-insecure-requests`.** Always wrapped in `isDev ? [] : [...]` in `next.config.ts`. Easy to forget when adding new headers.
3. **Vercel preview ≠ feature verified.** Vercel preview only confirms the build deploys. iOS PWA features (mic, push, file picker) need a real device test. Magic-link auth doesn't work on ephemeral preview URLs by design.
4. **Cost tracking for every LLM call.** Every Anthropic/OpenAI call must write to `api_costs`. The `runTask` runner does this automatically; new tasks just register in `lib/ai/tasks.ts`. Use the service-role client (`lib/supabase/service.ts`) since RLS on `api_costs` is default-deny.
5. **Idempotency keys (Phase 2).** Job endpoints must follow the Layer A + Layer B pattern in SPEC §10.4. Don't simplify to `ON CONFLICT DO NOTHING` alone.
6. **Single-user.** No abstractions for "users" plural. RLS guarantees isolation, but UI/UX should never imply sharing or multi-user.
7. **HEIC photos.** User has switched their iPhone to "Most Compatible" so all uploads are JPEG. Don't add HEIC transcoding — it was a deliberate non-goal (SPEC §19).
8. **Self-auth API routes need precise middleware allowlist.** `/api/capture` is on the exact-match set in `lib/supabase/middleware.ts`; new routes that use `?source=` or Bearer auth should be added to either `SELF_AUTH_API_PREFIXES` (with a trailing slash to avoid `-batch`-style collisions) or `SELF_AUTH_API_EXACT`.

---

## How to use this with a new session

1. Open a fresh Claude Code session in `/Users/tommyfitz/Forge`.
2. Tell it: *"Read HANDOFF.md and the memory directory at `~/.claude/projects/-Users-tommyfitz-Forge/memory/`. Then read SPEC.md §4.3, §10.4, §11, §12. Then tell me where Phase 2a stands and what blockers are on me."*
3. The session should report: Phase 1 fully shipped; Phase 2a (research jobs) is the active item; pre-work blockers are Upstash QStash account + signing keys + a public URL for the job endpoint (forge.mom or `forge-<slug>.vercel.app`).
4. Once pre-work is done, branch `phase-2a-research` and follow the build plan in the "Active item" section above.
