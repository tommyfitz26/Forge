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
| Hotfix | Next.js 16 upgrade — unblock forge.mom (PR #8) | ✅ Merged. PR #7 (Edge attempt) closed without merging. |
| 2a | Research jobs (Sonnet 4.6 + web_search + QStash) | ✅ Smoke-tested end-to-end (PR #6 + PR #9 timeout fix). |
| **Phase 2a** | **Auto-research + manual-trigger + delayed retry verified on forge.mom** | **✅ Shipped** |
| 2b slice 1 | VAPID + push subscriptions + PWA shell | ✅ Merged (PR #11). Smoke-tested on iPhone — banner shown, test push lands. |
| 2b slice 2 | `nudge_question` task + prompt + Zod schema | ✅ Merged (PR #12). No UI yet; exercised in slice 3. |
| 2d | Develop-prompt export (replaces in-app conversation per SPEC §4.6 rewrite) | ✅ Merged (PR #13). Smoke-tested — Claude follows the audit-then-pressure-test ordering. |
| **2b slice 3** | **`/api/jobs/nudge` route + nudge banner + Upstash crons** | **⏳ Active — this PR** |
| 2c | Weekly Socratic review (Resend) | ⏳ Not started |

---

## Active item — Phase 2b slice 3: nudge job routes

**In flight (this PR: `phase-2b-nudge-job-routes`).** Cron-driven nudge generation + send + tap-handling.

### What's in the slice

- `/api/jobs/nudge?slot=morning|evening` (Node runtime, maxDuration 60s). Order: QStash signature verify → Layer B `job_runs` claim keyed `nudge:{slot}:{YYYY-MM-DD}` (local YMD in `APP_SCHEDULE_TZ` so DST splits don't fork the key) → Layer A eligibility query → `selectCapture()` weighted pick → `runTask('nudge_question')` → `nudges` row insert with `scheduled_for=now()` → push fanout → set `sent_at` if at least one delivery succeeded.
- `lib/nudge/select-capture.ts` — pure tiered comparator: `raw_with_research > raw_idea > raw_other > developed`, oldest-first within tier, id tie-break for determinism.
- `lib/nudge/research-summary.ts` — compact formatter for the prompt's `research_summary` var (cap 5 competitors, 1 news item, 280-char market_context).
- Capture detail page reads `?nudge=:id`, marks `responded_at` server-side if not already, renders `NudgeBanner` above `DevelopPanel`.
- `skipNudge` server action — explicit Skip with optional reason, writes `responded_at` + `skipped_reason`.

### Cron registration (after merge + production deploy)

Forge uses Upstash QStash schedules (already configured for the research-recovery cron). Nudge needs two daily schedules. Two ways to handle DST:

**Option A — Upstash schedules with timezone (recommended).** Upstash supports `cron_tz` on schedules. Register through the Upstash console (or `qstash schedules create` via API):
- Morning: cron `0 10 * * *`, timezone `America/New_York`, destination `https://forge.mom/api/jobs/nudge?slot=morning`.
- Evening: cron `0 17 * * *`, timezone `America/New_York`, destination `https://forge.mom/api/jobs/nudge?slot=evening`.

This survives DST automatically.

**Option B — UTC crons (fallback if `cron_tz` isn't available).** During EDT (Mar–Nov):
- `0 14 * * *` UTC = 10:00 EDT
- `0 21 * * *` UTC = 17:00 EDT

During EST (Nov–Mar):
- `0 15 * * *` UTC = 10:00 EST
- `0 22 * * *` UTC = 17:00 EST

If we go with Option B, calendar a reminder for the next two DST boundaries (March 8 2027, November 1 2026) to re-cron — or just live with the 1-hour drift for a couple weeks.

After registering: trigger one schedule manually from the Upstash console to confirm end-to-end on `forge.mom` before relying on the cron. Watch logs for `jobs.nudge.completed` (success), `jobs.nudge.no_eligible_captures` (skipped silently — expected when nothing's pending), or `jobs.nudge.task_failed` (LLM call broke).

### Up next after this slice merges

1. **Phase 2c — weekly review** (Resend email + push + `/review/:weekId`). Needs Resend account + verified sender domain.

---

## Phase 2a — completed (history)

Phase 2a code shipped in PR #6 (research jobs) but the smoke test ran into three sequential problems that took most of the 2026-04-27 session to work through:

1. **Next 15.5 nodeMiddleware ESM/CJS bug** crashed every request to forge.mom on first prod load (`MIDDLEWARE_INVOCATION_FAILED`). Resolved by upgrading to Next 16 in PR #8 — `middleware.ts` → `proxy.ts`, dropped `experimental.nodeMiddleware` (no longer needed; Next 16 runs the proxy on Node by default). Side fixes during that PR: switched `package.json` lint script from `next lint` (removed in 16) to `eslint .`, migrated to native flat config (dropped `@eslint/eslintrc` shim), picked up Next 16's mandatory `tsconfig` changes (`jsx: preserve` → `react-jsx`).
2. **Vercel framework auto-detect silently failed** on the new Next 16 build — Project Settings had Framework Preset set to auto-detect (`framework: null`) which worked for Next 15 but emitted zero λ functions for Next 16. Every dynamic route 404'd while `public/` static files served fine. Fixed by setting Framework Preset → Next.js explicitly in the dashboard, then redeploying. Saved as memory: `feedback_vercel_framework_preset.md`.
3. **QStash `QSTASH_URL` env var was missing** — only `QSTASH_TOKEN` + signing keys had been copied from the Upstash console. The `@upstash/qstash` SDK fell back to its default global endpoint, which routed to a region the Upstash user account wasn't in (`user (...) not found in this region (eu-central-1)`). Fixed by adding `QSTASH_URL` to Vercel env. Saved as memory: `feedback_qstash_regional_url.md`.
4. **Anthropic SDK 50s timeout was too short** for Sonnet + `web_search` (max_uses 8). The `/api/jobs/research` route hit "Request timed out" 3 times in a row, total 2m35s, then queued the 1h delayed retry. Fixed in PR #9: SDK timeout 50s → 140s, route declares `maxDuration = 300`, in-job retries reduced from 3 attempts to 2. Saved as memories: `feedback_anthropic_websearch_timeout.md` + `project_vercel_fluid_compute.md` (the project has Fluid Compute on, which lifts the legacy 60s Hobby cap and is what made the longer SDK timeout possible).

Final smoke test passed end-to-end: idea capture → auto-enqueue → Sonnet+web_search runs ~90s → research panel renders with competitors / market_context / angles / news / confidence + sources. DB rows verified in `captures.research_status='succeeded'`, `research`, `job_runs.status='succeeded'`, and `api_costs` (~$0.05–0.15 per run as expected).

### Phase 2a code locations (for future reference)

- `lib/ai/research-schema.ts` — Zod schema + JSON-schema mirror for `submit_research` tool input.
- `lib/ai/tasks.ts` — `research_idea` task. **`web_search` identifier: `web_search_20260209`** — confirm against [Anthropic docs](https://platform.claude.com/docs/en/agents-and-tools/tool-use/tool-reference) before any future reruns of the registry.
- `lib/ai/run.ts` + `lib/ai/extract-tool-output.ts` — runner with tool-as-output extraction.
- `lib/ai/prompts/research.md` — the Sonnet prompt.
- `lib/qstash.ts` — publish client + `verifyJobRequest` (signature OR dev-bearer in non-prod).
- `lib/research/enqueue.ts` — fire-and-forget publisher used by capture-side enqueue + retry action.
- `app/api/jobs/research/route.ts` — main job route per SPEC §12.3.
- `app/api/jobs/research-recovery/route.ts` — hourly cron.
- `app/(app)/capture/[id]/ResearchPanel.tsx` + `RetryResearchButton.tsx` — UI.

---

## TODOs (in priority order)

### Immediate

1. **Phase 2b — Daily nudges** (`/api/jobs/nudge?slot=morning|evening`). Cron at 10am/5pm `APP_SCHEDULE_TZ` (default `America/New_York`). Eligibility per SPEC §4.4. Web Push needs VAPID keys generated. See "Active item" above for branching plan.
2. **Phase 2c — Weekly review** (`/api/jobs/weekly-review/stage1` → chained `stage2`). Resend account + verified sender domain needed.
3. **Detail-page polling** (small UX polish — see end-of-file "Enhancements" section).

The task registry / runner machinery from Phase 1c + 2a is already in place — adding new tasks is mostly: write the prompt MD, register in `lib/ai/tasks.ts`, call `runTask`. Both JSON-text and tool-as-output extraction patterns are supported by the runner.

### Tracked debt

- **Add `QSTASH_URL` to `lib/env.ts` Zod schema and `.env.example`.** It's set in Vercel and works at runtime (the `@upstash/qstash` SDK reads it directly from `process.env`), but our Zod schema doesn't validate it, so a missing/typo'd value would not throw at startup. See memory `feedback_qstash_regional_url.md`. Small follow-up PR.
- **Rotate keys** that have been pasted in chat history during Phase 1 + 2a setup. Specifically: Supabase service-role JWT, Supabase DB password, Anthropic API key, OpenAI API key, SHORTCUT_API_TOKEN, QSTASH_TOKEN, QSTASH_CURRENT_SIGNING_KEY, QSTASH_NEXT_SIGNING_KEY, QSTASH_URL (the URL itself isn't secret but rotating the token invalidates the URL pairing).
- **Re-add Sentry in Phase 3.** It was removed during Phase 1a. See `~/.claude/projects/-Users-tommyfitz-Forge/memory/project_sentry_deferred.md` for the exact restore steps.
- **Create accounts later** (no immediate blocker until the matching phase): Resend + verified sender domain (Phase 3 / 2c), Sentry (Phase 3).
- **Vercel preview auth.** Magic-link redirects pin to `https://forge.mom`, so login doesn't round-trip on ephemeral preview URLs. Fix in Phase 2/3 if previews-with-auth become valuable: either swap to runtime `VERCEL_URL` for redirect derivation, or wildcard `*.vercel.app/auth/callback` in Supabase Redirect URLs.
- **`JOB_DEV_BEARER` is currently scoped to "All Environments" in Vercel** (per the dashboard inspection during Phase 2a debugging). It only takes effect when `NODE_ENV !== 'production'` per `lib/qstash.ts:50`, so it's harmless in prod, but on principle it should be Preview+Development only. Low priority cleanup.

---

## Lessons baked into memory (don't re-learn these)

These are saved as memories — load them via the memory system:

- **`feedback_middleware_runtime.md`** — Keep `server-only` out of `proxy.ts`'s import graph. Next.js resolves the proxy outside the `react-server` export condition, so `server-only`'s default export throws at module load. Currently affects: `lib/supabase/middleware.ts`, `lib/env.ts`, `lib/types/db.ts`. (Updated for Next 16 — pre-upgrade memory referenced `experimental.nodeMiddleware`, which is gone.)
- **`feedback_hsts_localhost.md`** — `Strict-Transport-Security` and CSP `upgrade-insecure-requests` are **prod-only** in `next.config.ts`. Setting them on `http://localhost` poisons the browser's HSTS cache for the full max-age.
- **`feedback_server_action_body_limit.md`** — Next.js Server Actions cap request bodies at 1MB by default. Any action accepting `File`/`Blob` FormData needs `experimental.serverActions.bodySizeLimit` raised to match. App-level pre-validation runs too late — the 413 fires first.
- **`feedback_vercel_framework_preset.md`** — Vercel project Framework Preset must be set to **Next.js** explicitly (not auto-detect / `null`). Auto-detect silently misroutes Next 16 builds, every dynamic route 404s while `public/` static still serves. Verify via `curl /robots.txt → 200` + `curl /login → 404` + `vercel inspect` showing zero `λ` entries.
- **`feedback_qstash_regional_url.md`** — Upstash QStash needs the `QSTASH_URL` env var alongside `QSTASH_TOKEN` + signing keys. The `@upstash/qstash` SDK's default global endpoint can route to a region your account isn't in, surfacing as `"user (...) not found in this region (eu-central-1)"`. Copy ALL FOUR vars when grabbing creds.
- **`feedback_anthropic_websearch_timeout.md`** — Anthropic SDK `timeout` must be ≥140s when using the `web_search` server tool with `max_uses ≥ 5`. The legacy 50s timeout (sized to fit Vercel's 60s function cap pre-Fluid) cuts calls off before Sonnet+web_search can finish. Pair with route `export const maxDuration = 300` and keep `attempts × timeout + sum(backoffs) ≤ maxDuration`.
- **`project_vercel_fluid_compute.md`** — Forge's Vercel project has Fluid Compute enabled (`resourceConfig.fluid: true`). This lifts the legacy 60s Hobby function cap so background jobs can declare `maxDuration` up to ~300s. Important context for sizing route timeouts.
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
2. Tell it: *"Read HANDOFF.md and the memory directory at `~/.claude/projects/-Users-tommyfitz-Forge/memory/`. The active item is Phase 2b daily nudges — start there."*
3. The session should report: Phase 1 + Phase 2a (research) shipped and smoke-tested on forge.mom; next item is Phase 2b daily nudges per SPEC §4.4 + §12.x; first PR slice should be VAPID setup + service-worker push registration.

---

## Enhancements (small, non-blocking — pick up when convenient)

### Detail-page polling for research status

**Why:** Currently `/capture/[id]` is plain server-rendered RSC — to see `research_status` flip from `pending` → `running` → `succeeded`, the user has to manually refresh. For a 60–120s research run that's a minor UX paper-cut.

**Approach (~20–30 LOC):**

1. Convert the research-status portion of the detail page into a small client component that takes `initialStatus` as a prop.
2. While `status` is `pending` or `running`, `setInterval` every 5s to fetch a tiny endpoint (e.g. `/api/capture/<id>/research-status` returning `{ status, hasResearch }`) — or call `router.refresh()` to re-run the RSC.
3. Stop polling when `status` becomes `succeeded`, `failed`, or `skipped`. Also stop when the component unmounts.
4. Add a visual cue: skeleton or pulse animation while polling.

**Trade-offs:**
- `router.refresh()` is the simplest path (no new API route) but re-fetches the entire page tree; fine for a single-user app.
- A dedicated tiny endpoint is leaner per-poll but adds a route to maintain.
- Don't add Supabase Realtime / WebSocket for this — overkill for one user and one capture at a time.

**Don't do this until** Phase 2b is in flight or shipped — it's pure UX polish, not blocking, and the manual-refresh model is consistent with SPEC's "no live polling in v1" stance. Worth a quick PR after 2b.
