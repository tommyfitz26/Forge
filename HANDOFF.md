# Forge — session handoff

> **Purpose:** Hand this file to a new Claude session so they can resume where the previous one left off without re-reading the entire transcript.

---

## TL;DR — read these first, in order

1. `SPEC.md` (v1.1) — the source of truth for the product. Don't skim — read it all.
2. `SPEC-1.1-CHECKLIST.md` — already applied to SPEC.md, but useful for context on locked decisions.
3. The **memory directory** at `~/.claude/projects/-Users-tommyfitz-Forge/memory/` — load this before doing anything else. It contains hard-won lessons (middleware runtime, HSTS, Sentry status, project basics). MEMORY.md is the index.
4. `git log --oneline` — see what's shipped.
5. The **"Active bug"** section below — the user is mid-diagnosis on voice capture and you should not start new work until that's resolved.

---

## Project identity

**Forge** is a single-user PWA the owner (Tommy, `fitzgibbons.tommy@gmail.com`) is building to capture voice/text/photo notes about startup ideas, auto-research them, nudge daily for development, and run a Sunday-evening Socratic review. Single-tenant. Solo dev. Spec lives at the repo root in `SPEC.md`.

- **Repo:** https://github.com/tommyfitz26/Forge
- **Working dir:** `/Users/tommyfitz/Forge`
- **Production domain:** https://forge.mom (purchased via Vercel; not yet pointed at prod deploy as of this writing)
- **Vercel project:** linked to the repo, env vars configured (Supabase, Anthropic, OpenAI, app URL, scheduling/budget constants).
- **Supabase project:** dedicated free-tier `sruiulyhripllqfdsivq` (separate from any other org project). Schema is `public`.

---

## Workflow conventions (locked decisions)

- **Branch per phase slice → open PR → CI must be green → merge with `gh pr merge --squash --delete-branch`.** The user explicitly authorized auto-merge on CI green.
- **One sub-phase = one PR.** Don't bundle.
- **Test-then-merge for user-facing features.** Even when CI passes, ask the user to do a local smoke test (e.g. record voice, click through capture flow) before merging if the behavior can't be validated by CI alone. Phase 1b is currently in this state.
- **Never push to `main` directly.** Always via PR.
- **Never force-push or rewrite history.** The user will say so explicitly if needed.
- **Never run destructive git commands (`reset --hard`, `branch -D`, etc.) without explicit user approval.**
- **Commit per sub-phase.** Sub-phases within Phase 0 each got their own commit; Phase 1 sub-phases each get their own PR.

---

## Current status (as of this handoff)

| Phase | What | State |
|---|---|---|
| 0 | Foundations (scaffold, schema, auth, dashboard, CI) | ✅ Merged, all in `main` |
| 1a | Text capture end-to-end | ✅ Merged (PR #1) |
| **1b** | **Voice + Whisper + offline queue** | **🟡 Open PR #2 with active bug under diagnosis** |
| 1c | Classification via Haiku 4.5 | ⏳ Not started |
| 1d | iOS Shortcut endpoint | ⏳ Not started |
| 1e | Photo capture + Supabase Storage | ⏳ Not started |

**Phase 1b is on branch `phase-1b-voice-whisper`, PR #2 open, all CI checks green, but the user reported a UX bug during local test: voice recording → "Transcribing…" → stuck indefinitely.**

---

## Active bug — voice capture stuck on "Transcribing…"

### What happened
User recorded voice on `localhost:3000/capture`, hit Stop. UI showed "Transcribing…" indefinitely (screenshot included in chat). Recorder reset to idle (correctly), but the `<VoiceCapture>` upload promise never resolved.

### Root cause (UX layer, fixed)
`saveAndUpload()` in `lib/offline/upload.ts` was awaiting `uploadWithBackoff()` — the full retry loop. So any retryable failure trapped the user on the "uploading" status for the entire backoff sequence (potentially minutes) with no signal anything was wrong.

### Fix shipped to PR #2 (commit `a9a429c`)
- `saveAndUpload` now returns the **first attempt's** result. Background retries continue if needed, but the UI moves on.
- `VoiceCapture.tsx` shows status-specific error messages (413 / 415 / 502 / network / generic) and after 12s shows a "still working" hint so a slow-but-legitimate Whisper call doesn't look like a hang.
- `lib/ai/openai.ts`: dropped SDK-level retries (`maxRetries: 0`), shortened timeout (`50_000ms`) — SDK retries inside Vercel's 60s route budget = bad; let the client offline queue handle retries.

### Root cause (server side) — STILL UNKNOWN
We don't yet know **why** the first upload failed. It could have been:
- Whisper transcription genuinely slow (>30s) on the user's clip
- A 415 if the device emitted an unexpected MIME
- A 502 from a Whisper API error
- A 500 from somewhere in our route logic
- Something else

### What the next session needs to ask the user
The user needs to pull the fix and re-test. When they do, two things will identify the root cause:
1. **The amber failure message** that appears under the voice recorder (tells us the HTTP status — see `messageForFailure()` in `app/(app)/capture/VoiceCapture.tsx`).
2. **The terminal output of `pnpm dev`** when the request hits — find the `POST /api/capture` line and any stack trace.

Paste both, then debug from there.

### Don't merge PR #2 until the root cause is fixed
Even though all CI checks pass and the UX is now resilient, shipping without understanding why the first upload failed leaves a class of bugs in production. Diagnose first.

---

## TODOs (in priority order)

### Immediate
1. **Resolve PR #2.** Get the failure message + terminal output from the user, identify the server-side root cause, fix, push, merge.
2. **After PR #2 merges** → start **Phase 1c (classification via Haiku 4.5)** on a new branch `phase-1c-classify`.

### Phase 1 remaining
3. **Phase 1c — Classification via Haiku 4.5.** Per SPEC §11. Build:
   - `lib/ai/anthropic.ts` (singleton client, retry wrapper).
   - `lib/ai/tasks.ts` (the task registry per §11.1, even if we only register `classify_capture` for now).
   - `lib/ai/run.ts` (the runner per §11.2 — pre-call budget check via `MAX_MONTHLY_COST_USD`, prompt loading, JSON-text or tool-as-output extraction, Zod validation, cost logging).
   - `lib/ai/prompts/classify_capture.md` with frontmatter comment block.
   - Wire into `lib/capture/persist.ts`: when `parsePrefix()` returns `{ matched: false }`, call the classifier instead of defaulting to `'observation'`.
   - Heuristic title fallback already exists in `lib/capture/parse.ts`; LLM also returns a title, prefer that.
   - Tests for: prompt template substitution, schema parse from a fixture, retry on Zod fail.
4. **Phase 1d — iOS Shortcut endpoint.** `POST /api/capture?source=shortcut` with `Authorization: Bearer SHORTCUT_API_TOKEN`. Generate a token, write to `.env.local` and Vercel, document Shortcut setup in README.
5. **Phase 1e — Photo capture.** File upload only (no live camera per user's call). Supabase Storage bucket needs to be created. `attachments` table row. Render in detail view.

### Tracked debt
- **Rotate keys.** Several were pasted in chat history: Supabase service-role JWT, Supabase DB password, Anthropic API key, OpenAI API key. Schedule rotation **after Phase 1 fully ships** so we don't have to update Vercel + .env.local mid-development.
- **Create accounts later** (no immediate blocker until the matching phase): Upstash QStash (Phase 2), Resend + verified sender domain (Phase 3), Sentry (Phase 3).
- **Re-add Sentry in Phase 3.** It was removed during Phase 1a. See `~/.claude/projects/-Users-tommyfitz-Forge/memory/project_sentry_deferred.md` for the exact restore steps.
- **Vercel preview auth.** Magic-link redirects are pinned to `https://forge.mom`, so login doesn't round-trip on ephemeral preview URLs. Fix in Phase 2/3 if previews-with-auth become valuable: either swap to runtime `VERCEL_URL` for redirect derivation, or wildcard `*.vercel.app/auth/callback` in Supabase Redirect URLs.
- **Production deploy.** `forge.mom` is purchased but not yet pointed at the Vercel production deployment. Do this once Phase 1 is complete and we want a real URL for iOS Shortcut testing.

---

## Lessons baked into memory (don't re-learn these)

These are saved as memories — load them via the memory system:

- **`feedback_middleware_runtime.md`** — Middleware uses **Node runtime** (`experimental.nodeMiddleware: true` + `runtime: 'nodejs'`). DO NOT add `import 'server-only'` to anything in middleware's import graph (currently `lib/supabase/middleware.ts`, `lib/env.ts`, `lib/types/db.ts`). The `default` export of `server-only` throws at edge deploy time.
- **`feedback_hsts_localhost.md`** — `Strict-Transport-Security` and CSP `upgrade-insecure-requests` are **prod-only** in `next.config.ts`. Setting them on `http://localhost` poisons the browser's HSTS cache for the full max-age.
- **`project_sentry_deferred.md`** — `@sentry/nextjs` is uninstalled. `instrumentation.ts` is a no-op stub. Re-wire in Phase 3 with dynamic imports gated on `process.env.SENTRY_DSN`.
- **`project_forge.md`** — Project basics, solo merge policy, single-tenant invariant.

---

## Architecture map (where things live)

```
SPEC.md                          # source of truth
SPEC-1.1-CHECKLIST.md
HANDOFF.md                       # this file
middleware.ts                    # OWNER_EMAIL enforcement, Node runtime
next.config.ts                   # CSP, HSTS (prod-only), nodeMiddleware flag
instrumentation.ts               # no-op stub (Sentry deferred)

app/
├── (auth)/login/                # magic-link form + server action with §14 spam guard
├── auth/callback/route.ts       # exchanges OAuth code → session
├── (app)/                       # signed-in layout
│   ├── layout.tsx               # nav, UnsyncedBadge, sign-out
│   ├── page.tsx                 # dashboard list (recent non-archived captures)
│   ├── archive/page.tsx
│   ├── actions.ts               # signOut
│   └── capture/
│       ├── page.tsx             # 4-mode picker; voice is default
│       ├── TextCapture.tsx
│       ├── VoiceCapture.tsx     # wires recorder → offline queue
│       ├── actions.ts           # createTextCapture (server action)
│       └── [id]/
│           ├── page.tsx         # detail
│           ├── StateControls.tsx
│           └── actions.ts       # promoteToSerious / archive / unarchive / delete
└── api/
    └── capture/route.ts         # POST multipart audio (Phase 1b); session-authed

components/
├── ui/                          # button, input, textarea, badge (shadcn-style, no CLI)
├── capture/VoiceRecorder.tsx    # MediaRecorder, waveform, 180s cap
└── layout/UnsyncedBadge.tsx     # IndexedDB pending count, retry button

lib/
├── env.ts                       # Zod-validated env (no server-only — middleware imports it)
├── logger.ts                    # structured logger (pretty dev / JSON prod)
├── utils.ts                     # cn() helper
├── ai/
│   ├── openai.ts                # singleton client, no retries, 50s timeout
│   └── transcribe.ts            # Whisper call + api_costs logging
├── capture/
│   ├── kinds.ts                 # CaptureKind/State/ResearchStatus types + constants
│   ├── parse.ts                 # parsePrefix + heuristicTitle (SPEC §4.2 rules 1, 5)
│   └── persist.ts               # shared insert path; used by text + voice
├── http/read-body.ts            # 25MB streaming cap (SPEC §4.1)
├── offline/
│   ├── idb.ts                   # IndexedDB wrapper, BroadcastChannel notify
│   └── upload.ts                # saveAndUpload (first-attempt return + bg retry)
├── supabase/
│   ├── server.ts                # SSR server client (server-only OK here — Node runtime)
│   ├── client.ts                # browser client
│   ├── service.ts               # service-role client for jobs
│   └── middleware.ts            # session refresh + email gate (NO server-only here)
└── types/db.ts                  # generated; pnpm db:types to refresh

supabase/
├── config.toml                  # CLI link config (project ref committed; password in OS keychain)
└── migrations/
    └── 20260424153834_initial_schema.sql

tests/
└── unit/
    ├── env.test.ts
    ├── logger.test.ts
    ├── capture-parse.test.ts
    ├── read-body.test.ts
    └── shims/server-only.ts     # vitest alias so server-only doesn't throw in tests

.github/workflows/ci.yml         # lint + typecheck + test on PR
```

---

## Environment & secrets

- **`.env.local`** (gitignored) has all real secrets. The schema is mirrored in `.env.example`. Validated via Zod in `lib/env.ts` at module load.
- Required vars (see `.env.example` for full list): `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `OWNER_EMAIL`, `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `NEXT_PUBLIC_APP_URL`, `APP_SCHEDULE_TZ`, `MAX_MONTHLY_COST_USD`, `MAX_RESEARCH_COST_USD`.
- Optional, deferred to later phases: Sentry, QStash, Resend, VAPID, Shortcut.
- **Vercel** has all the same vars set across Production / Preview / Development environments.
- **Supabase Auth → Redirect URLs:** allowlist includes `http://localhost:3000/**` and `https://forge.mom/**`. Add ephemeral preview URLs only if needed (currently not).
- **Supabase CLI** is linked to the remote project. Password lives in macOS keychain. To run a migration: `pnpm db:new <name>`, edit the generated SQL, `pnpm db:push`. Always re-run `pnpm db:types` after `db:push`.

---

## Tooling cheat sheet

```bash
# Dev loop
pnpm dev                                     # Next dev server
pnpm typecheck                               # tsc --noEmit (strict + noUncheckedIndexedAccess)
pnpm lint                                    # next lint (ESLint flat config)
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
3. **Vercel preview ≠ feature verified.** Vercel preview only confirms the build deploys. iOS PWA features (mic, push) need a real device test. Magic-link auth doesn't work on ephemeral preview URLs by design.
4. **Cost tracking for every LLM call.** Every Anthropic/OpenAI call must write to `api_costs`. Use the service-role client (`lib/supabase/service.ts`) since RLS on `api_costs` is default-deny.
5. **Idempotency keys.** Phase 2's job endpoints must follow the Layer A + Layer B pattern in SPEC §10.4. Don't simplify to `ON CONFLICT DO NOTHING` alone.
6. **Single-user.** No abstractions for "users" plural. RLS guarantees isolation, but UI/UX should never imply sharing or multi-user.

---

## How to use this with a new session

1. Open a fresh Claude Code session in `/Users/tommyfitz/Forge`.
2. Tell it: *"Read HANDOFF.md and the memory directory at `~/.claude/projects/-Users-tommyfitz-Forge/memory/`. Then read SPEC.md. Then check `gh pr view 2` and tell me what you'd do next."*
3. The session should report: PR #2 has a UX fix in flight, root cause unknown, needs the user to re-test and paste failure message + terminal logs.
4. Re-test as instructed in the "Active bug" section above. Once the root cause is identified and fixed, merge PR #2 and start Phase 1c.
