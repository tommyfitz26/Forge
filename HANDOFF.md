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
| 2a | Research jobs (Sonnet 4.6 + web_search + QStash) | 🟡 Code merged (PR #6) — **unverified, blocked by middleware bug below** |
| **Hotfix** | **Next.js 16 upgrade — unblock forge.mom production deploy** | **🔴 Active. Branch `upgrade-next-16` not yet created. PR #7 (Edge attempt) open and should be CLOSED, not merged.** |
| 2b | Daily nudges (Web Push + cron) | ⏳ Not started |
| 2c | Weekly Socratic review (Resend) | ⏳ Not started |

---

## Active item — Next.js 16 upgrade to unblock forge.mom

### What happened

forge.mom was attached to the Vercel production deploy after PR #6 merged. First load returned `500 INTERNAL_SERVER_ERROR` with `Code: MIDDLEWARE_INVOCATION_FAILED`. Vercel function logs show:

```
/var/task/middleware.js:1
import { updateSession } from '@/lib/supabase/middleware';
^^^^^^
SyntaxError: Cannot use import statement outside a module
```

**Root cause:** Next.js 15.5.x's `experimental.nodeMiddleware` bundles `middleware.js` as ESM but Vercel's Node runtime loads it as CJS (no `"type": "module"` in package.json). Known issue: https://github.com/vercel/next.js/issues/82122. Bug has been latent in every Preview deploy since Phase 0; the smoke tests were all run against `pnpm dev` so we never exercised a deployed function until forge.mom went live.

### Why we can't just "switch to Edge runtime"

Tried first as PR #7 (`hotfix-edge-middleware`, branch still exists, deploy fails). Vercel rejects the deploy with: *"The Edge Function 'middleware' is referencing unsupported modules: @/lib/supabase/middleware."* `@supabase/ssr` 0.10.x transitively pulls in `@supabase/realtime-js` which references `ws` (Node-only). Vercel's edge module checker correctly flags it.

### The fix: upgrade to Next.js 16

Per the agent guide consulted at 2026-04-27:
- Next.js 16 (latest 16.2.4 as of date of this writing) **dropped `experimental.nodeMiddleware` entirely**.
- Middleware was renamed to `proxy.ts` and runs on Node runtime by default.
- This is the officially supported 2026 pattern with `@supabase/ssr`.
- There's an official codemod for the rename.

We're on Next 15.5.15. Major version bump.

### Plan

Branch: `upgrade-next-16`. Single PR.

1. **Close PR #7** (Edge approach) without merging — keeps history clean.
2. **Run the codemod**: `pnpm dlx @next/codemod@canary upgrade latest`. This bumps Next + handles the `middleware.ts` → `proxy.ts` rename + applies any other 16.x codemods automatically.
3. **Hand-clean `next.config.ts`**:
   - Remove `experimental.nodeMiddleware` entirely.
   - Audit other 16.x deprecations the codemod may have flagged.
   - Keep `experimental.serverActions.bodySizeLimit: '15mb'` (still required for photo uploads).
4. **Verify locally**: `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm build`. Make sure all Phase 2a code (already on main) still works post-upgrade — runner, route handlers, capture detail UI.
5. **Push, PR, watch CI**. CI was passing on PR #6 / PR #7 — should still pass on the upgrade.
6. **After merge**: production deploy should serve forge.mom without crashing. Then resume Phase 2a smoke test (next section).
7. **Search the codebase** for `nodeMiddleware`, `runtime: 'nodejs'`, and `middleware.ts` references in comments / memory and clean up. The auto-memory `feedback_middleware_runtime.md` is now stale — update or delete it as part of the PR.

### Risks to watch for during the upgrade

- **Breaking changes beyond the codemod**: Server Actions, App Router, image config, etc. We use a fairly mainstream feature set, but watch for build/type errors after the bump.
- **`pnpm-lock.yaml` is going to look enormous** in the diff. That's fine — it's mostly the lockfile.
- **`@supabase/ssr` interaction** with Node-runtime middleware in Next 16 is the supported path, but verify after deploy that login / session refresh / OWNER_EMAIL gate all still work.
- **Phase 2a code is unverified end-to-end**. The hotfix is the gate to actually smoke-testing it. Once the upgrade lands, the existing 2a code may need its own debugging round.

---

## Pending — Phase 2a smoke test (resume once forge.mom is back up)

PR #6 (Phase 2a research jobs) is **already merged** to main. The code is in place but has never been exercised end-to-end against the production deploy. Once the Next 16 upgrade ships and forge.mom serves traffic again, this is the next checkpoint.

### Pre-test setup (one time)

1. **Verify Vercel Production env has all QStash vars set:** `QSTASH_TOKEN`, `QSTASH_CURRENT_SIGNING_KEY`, `QSTASH_NEXT_SIGNING_KEY`. (User confirmed these were pasted into `.env.local` + Vercel earlier in the session that built 2a.)
2. **Add the recovery cron schedule in Upstash dashboard:**
   - URL: `https://forge.mom/api/jobs/research-recovery`
   - Cron: `0 * * * *` (hourly, UTC)
   - Method: POST, empty body
3. *(Optional)* Generate `JOB_DEV_BEARER` for local debugging without ngrok:
   ```
   node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
   ```
   Paste into `.env.local` only — leave blank in Vercel since it's a dev-only escape hatch.

### Smoke test on forge.mom (signed in)

**Test A — auto-research path:**
1. `/capture` → text mode → save: `idea: a marketplace for amateur estate-auctioneers in small towns`
2. Detail page should show **research queued** → **researching…** → **research ready** within ~30s. (No live polling — refresh once or twice.)
3. Confirm panel renders: competitors (with names + URLs + one-liners), market_context paragraph, 2–3 angles, recent_news, confidence + source count.

**Test B — manual trigger:**
1. New capture: `problem: my desk is always covered in cables`
2. Detail page shows **no research** badge + **Run research** button.
3. Click → flips to **research queued** → eventually **research ready**.

**Test C — DB sanity in Supabase Studio:**
- `captures.research_status = 'succeeded'` for the test idea capture.
- `research` table has a row with the JSON payload populated.
- `job_runs` has a `status = 'succeeded'` row keyed `idempotency_key = 'research:<captureId>'`.
- `api_costs` has a row with `task = 'research_idea'` and `cost_usd` ≈ $0.05–0.15.

### If Test A times out or stays in `pending`

The most likely culprits, in order:
1. `QSTASH_TOKEN` missing in Vercel **Production** env (Preview-only doesn't help).
2. `NEXT_PUBLIC_APP_URL` still set to `http://localhost:3000` in Production — QStash would call the wrong host. Should be `https://forge.mom`.
3. Vercel function logs for `POST /api/jobs/research` will show the actual error. Search for any `jobs.research.*` log line.
4. Anthropic auth issue (would surface as `task.call` log line with non-2xx response).

### Phase 2a code locations (for the next session to skim)

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

1. **Next.js 16 upgrade hotfix** — see "Active item" above. forge.mom is currently 500'ing.
2. **Resume Phase 2a smoke test** once forge.mom is functional (see "Pending" section above).
3. **Phase 2b — Daily nudges** (`/api/jobs/nudge?slot=morning|evening`). Cron at 10am/5pm America/New_York. Eligibility per §4.4. Web Push needs VAPID keys.
4. **Phase 2c — Weekly review** (`/api/jobs/weekly-review/stage1` → chained `stage2`). Resend account + verified sender domain needed.

The task registry / runner machinery from Phase 1c + 2a is already in place — adding new tasks is mostly: write the prompt MD, register in `lib/ai/tasks.ts`, call `runTask`. Both JSON-text and tool-as-output extraction patterns are supported by the runner.

### Tracked debt

- **Close PR #7** (Edge middleware hotfix) — the approach doesn't work; the Next 16 upgrade replaces it.
- **Rotate keys** that have been pasted in chat history during Phase 1 + 2a setup. Specifically: Supabase service-role JWT, Supabase DB password, Anthropic API key, OpenAI API key, SHORTCUT_API_TOKEN, QSTASH_TOKEN, QSTASH_CURRENT_SIGNING_KEY, QSTASH_NEXT_SIGNING_KEY.
- **Re-add Sentry in Phase 3.** It was removed during Phase 1a. See `~/.claude/projects/-Users-tommyfitz-Forge/memory/project_sentry_deferred.md` for the exact restore steps.
- **Create accounts later** (no immediate blocker until the matching phase): Resend + verified sender domain (Phase 3 / 2c), Sentry (Phase 3).
- **Vercel preview auth.** Magic-link redirects pin to `https://forge.mom`, so login doesn't round-trip on ephemeral preview URLs. Fix in Phase 2/3 if previews-with-auth become valuable: either swap to runtime `VERCEL_URL` for redirect derivation, or wildcard `*.vercel.app/auth/callback` in Supabase Redirect URLs.
- **Update `feedback_middleware_runtime.md` memory** — it currently says "use Node runtime via experimental.nodeMiddleware". After the Next 16 upgrade, that's no longer experimental — proxy.ts runs on Node by default. Either rewrite or delete.

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
2. Tell it: *"Read HANDOFF.md and the memory directory at `~/.claude/projects/-Users-tommyfitz-Forge/memory/`. The active item is the Next.js 16 upgrade hotfix to unblock forge.mom — start there, then we'll resume the Phase 2a smoke test."*
3. The session should report: forge.mom currently 500s on first load; PR #7 (Edge attempt) is open and needs to be CLOSED, not merged; the path forward is a Next.js 16 upgrade per the "Active item" section. Phase 2a code is merged but unverified end-to-end.
4. Branch `upgrade-next-16`, run `pnpm dlx @next/codemod@canary upgrade latest`, hand-clean `next.config.ts`, verify locally, push, PR, merge. Then resume the smoke test in the "Pending" section.
