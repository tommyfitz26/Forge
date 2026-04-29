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
| 2b slice 1 | VAPID + push subscriptions + PWA shell | ✅ Merged (PR #11). Smoke-tested on iPhone. |
| 2b slice 2 | `nudge_question` task + prompt + Zod schema | ✅ Merged (PR #12). |
| 2d | Develop-prompt export (replaces in-app conversation per SPEC §4.6 rewrite) | ✅ Merged (PR #13). Smoke-tested — Claude honors audit-then-pressure-test ordering. |
| 2b slice 3 | `/api/jobs/nudge` route + nudge banner + Upstash crons | ✅ Merged (PR #14). Smoke-tested + crons registered (timezone-aware). |
| **Phase 2b** | **Daily nudges fully shipped — cron schedules LIVE in Upstash** | **✅ Shipped 2026-04-28** |
| 2c slice 1 | `weekly_summary` + `pattern_detection` Sonnet 4.6 tasks (no UI) | ✅ Merged (PR #16, commit `d48912e`). |
| 2c slice 2 | `lib/email/{resend,send}.ts` Resend wrapper with `Idempotency-Key: weekly:{week_of}` | ✅ Merged (PR #17, commit `3285283`). |
| 2c slice 3 | Chained QStash job (stage1 + stage2) + `/review/[weekId]` digest screen | ⏳ Open as PR #18 (commit `319b355`). CI green. **Awaiting end-to-end smoke test** — see Active item below. |
| 2c cron | Register Sunday weekly-review schedule in Upstash | ⏳ Pending slice 3 smoke test |
| Spec sync | Comprehensive SPEC.md alignment with shipped state through Phase 2c | ✅ Merged (PR #19, commit `04a9236` on 2026-04-28). |
| **2c** | **Weekly review** | **⏳ Smoke-test pending — code green, env wired (`forge@biddrop.app`)** |

---

## Active item — Phase 2c slice 3 smoke test

**Code is open as PR #18, CI green, awaiting an end-to-end smoke test on the Vercel preview (or prod after merge).** This is the chained QStash job that runs Sunday 5pm:

- Stage 1 (`/api/jobs/weekly-review/stage1`) runs `pattern_detection` + `weekly_summary` Sonnet tasks, writes the `weekly_summaries` row, chains Stage 2.
- Stage 2 (`/api/jobs/weekly-review/stage2`) sends Resend email (`Idempotency-Key: weekly:{week_of}`), fans push out, flips `status='sent'`.
- `/review/[weekId]/page.tsx` renders the digest with "Open in Forge → Develop" links.

### Pre-reqs (all done)

- ✅ Resend account exists; `biddrop.app` is verified (free tier; can't add a second domain).
- ✅ `RESEND_API_KEY` + `RESEND_FROM_ADDRESS=forge@biddrop.app` set in Vercel env (Prod + Preview + Dev) and `.env.local`. See memory `project_resend_sender.md`.
- ✅ The `marked` (markdown→HTML) dep is installed by slice 3.

### Smoke-test playbook

1. **Find the Stage 1 URL.** Use the Vercel preview deploy URL from PR #18 (or prod after merge: `https://forge.mom/api/jobs/weekly-review/stage1`).

2. **Fire Stage 1 manually** with the dev bearer (don't wait until Sunday):
   ```bash
   curl -X POST https://<preview-or-prod>/api/jobs/weekly-review/stage1 \
     -H "Authorization: Bearer $JOB_DEV_BEARER" \
     -H "Content-Type: application/json" \
     -d '{}'
   ```
   Expect `{"status":"stage2_publishing", "weekOf":"<YYYY-MM-DD>", "captureCount":..., "patternCount":..., "readyCount":...}` after ~30–90s. (Or `"status":"no_captures"` if no captures from this week — make a test capture first if so.)

3. **Verify the row** in Supabase SQL editor:
   ```sql
   select id, week_of, status, captures_included,
          jsonb_array_length(patterns_detected) as patterns,
          length(email_content_md) as md_len
   from weekly_summaries order by generated_at desc limit 5;
   ```
   Status should be `composing`, `email_content_md` populated.

4. **Wait ~5–15s** then check again — Stage 2 chains automatically via `publishJob('/api/jobs/weekly-review/stage2', { week_of, captureCount, patternCount, readyCount }, { delaySeconds: 0 })`. Status flips to `sent`, `sent_at` populates, `email_message_id` is set.

5. **Inbox check.** Resend email lands at `fitzgibbons.tommy@gmail.com` with subject `This week in Forge — <YYYY-MM-DD>`. Push fires on iPhone PWA simultaneously.

6. **Tap push** → opens `/review/[weekId]` → digest renders with per-capture summaries and "Open in Forge → Develop" links.

7. **If everything's clean**: merge PR #18, then register the Sunday cron in Upstash:
   ```
   https://forge.mom/api/jobs/weekly-review/stage1
   cron: 0 17 * * 0
   timezone: America/New_York
   body: {}
   ```

### Failure modes to know about

- **Email not configured** — slice 3 logs `email.not_configured` and continues (push still tries, row stays `composing`). If you see this in logs, double-check `RESEND_API_KEY` + `RESEND_FROM_ADDRESS` in the env.
- **Stage 2 not chaining** — look for `jobs.weekly_review.stage1.completed` in Vercel logs (means Stage 1 succeeded), then check Upstash QStash → Messages tab for the queued `/api/jobs/weekly-review/stage2` publish.
- **Layer A short-circuit** — if you re-fire Stage 1 after a successful run, expect `{"status":"already_sent"}`. To rerun, manually flip the row's status: `update weekly_summaries set status='composing', sent_at=null, email_message_id=null where id='...'` and `delete from job_runs where idempotency_key like 'weekly:%';`. The Resend `Idempotency-Key` header still prevents a duplicate send within Resend's ~24h cache window — bump the URL's `week_of` to test re-sends.
- **CI pass ≠ runtime pass.** The Node ICU h23 fix (memory `feedback_intl_h23_node_icu.md`) was caught only by GitHub Actions, not local. New `Intl.DateTimeFormat` code should always set `hourCycle: 'h23'`.

### Architecture pointers (where things live)

- Cron entry: `app/api/jobs/weekly-review/stage1/route.ts`, chained `stage2/route.ts`.
- LLM tasks: `lib/ai/tasks.ts` registers `weekly_summary` (3/15 pricing, temp 0.3) + `pattern_detection` (3/15 pricing, temp 0.2, strict-by-design).
- Email composition: `lib/email/compose.ts` (subject + markdown + HTML + push body), `lib/email/markdown.ts` (`marked` wrapper), `lib/email/send.ts` (`sendWeeklyReviewEmail` with idempotency key), `lib/email/resend.ts` (client).
- Week-of computation: `lib/weekly-review/week-of.ts` (Monday in ET, DST-safe).
- Captures-block formatters: `lib/weekly-review/captures-block.ts`.
- Layer B claim helpers (extracted in slice 3, used by stage1 + stage2): `lib/jobs/job-runs.ts`. Research + nudge routes still inline their own copies — out-of-scope cleanup.
- Review screen: `app/(app)/review/[weekId]/page.tsx`.

---

## Phase 2c — slices 1 + 2 merged, slice 3 pending smoke (2026-04-28)

### Slice 1 — `weekly_summary` + `pattern_detection` tasks (PR #16, commit `d48912e`)

- `lib/ai/weekly-summary-schema.ts` — `{ captures: [{id, summary, research_distilled}], patterns_summary, ready_to_develop_ids }`. Note: counts are NOT in the LLM output (Stage 1 derives them from parsed payload + DB row count to avoid LLM miscount drift). HANDOFF originally listed `counts` in the spec; runtime-derive is cleaner.
- `lib/ai/pattern-detection-schema.ts` — `{ pairs: [{capture_a, capture_b, reasoning}] }` (max 20). Strict refinement: `capture_a !== capture_b`. Empty pairs is the steady-state answer at 2–3 captures/week.
- `lib/ai/prompts/{weekly_summary,pattern_detection}.md` — both Sonnet 4.6, JSON-text. Pattern detection runs at temperature 0.2 (over-eager merge suggestions erode trust faster than missed ones). Weekly summary 0.3, max_tokens 4000.
- 22 new tests across schemas + prompt substitution.

### Slice 2 — Resend wrapper (PR #17, commit `3285283`)

- `lib/email/resend.ts` — `getResend()` / `getFromAddress()` / `isResendConfigured()` + `ResendNotConfiguredError`. Mirrors VAPID config pattern; env vars are `optional()` so dev boots without them, the resolver throws on use.
- `lib/email/send.ts` — `sendWeeklyReviewEmail({ weekOf, subject, html, text? })`. Uses Resend SDK's second-arg `idempotencyKey` option (serializes to `Idempotency-Key` HTTP header per SPEC §4.5).
- **Failure posture:** never throws. Returns `{ ok: false, error }` and logs in four branches: env not configured, Resend returns error, SDK throws, Resend 200 with no `data.id`. Lets Stage 2 decide whether to fail the job (QStash retry under same idempotency key) or swallow.
- New dep: `resend@^6.12.2`.
- 11 new tests (5 config + 6 send paths) — full mock of the Resend SDK.

### Slice 3 — Chained job + review screen (PR #18, commit `319b355`) — **awaiting smoke test**

See "Active item" above for the complete file inventory + smoke-test playbook. Headlines:

- New schema column **NOT** required: Stage 2 receives counts in the QStash chain body, so no migration.
- Layer B claim helpers extracted to `lib/jobs/job-runs.ts` (research + nudge routes still inline their own copies — out-of-scope cleanup tracked in TODOs).
- DST-safe `weekOfFor` / `weekStartInstant` in `lib/weekly-review/week-of.ts`. Caught a Node ICU quirk in CI: `hour12: false` returns `'24'` for midnight on Linux Node 22+, so we use `hourCycle: 'h23'` instead. Saved as memory `feedback_intl_h23_node_icu.md`.
- 31 new tests across week-of computation, captures-block formatters, email composer.
- New dep: `marked@^18.0.2` for markdown→HTML in the email + `/review/[weekId]` screen.

### Phase 2c associated SPEC sync (PR #19, commit `04a9236`)

After slice 3 was opened, a comprehensive SPEC.md sync pass aligned the doc with shipped reality:

- §4.7 — pattern detection input changed from "40 most recent in last 8 weeks" to **"40 most recent, all-time"** (per the user's call: long-running patterns are exactly what's worth surfacing in a weekly review).
- §8.3 — Fluid Compute / per-route `maxDuration` envelope (research + weekly stage1 are 300s, others 60s).
- §9 — replaced phantom file paths with the real tree.
- §10.2, §16 — fixed `NEXT_PUBLIC_` prefixes; added `QSTASH_URL`, `JOB_DEV_BEARER`, `RESEND_FROM_ADDRESS`, VAPID trio with correct phase tagging.
- §10.8, §15 — flagged Sentry deferred to Phase 3.
- §11.1, §11.2 — dropped `conversation_turn` (Phase 2d killed it), flagged `merge_captures` as Phase 4, fixed temperatures and model id strings, added `terminalToolName` field.
- §12.1 — schedule status table (LIVE / pending / unscheduled).
- §17 — restructured phases to match what shipped (single Phase 2 with 2a/b/c/d).
- §18 item 4, §20 q7, Appendix A — develop-export aligned, sender domain answered (`forge@biddrop.app`).

---

## Phase 2b + 2d — completed (history, 2026-04-27 → 2026-04-28)

Phase 2b shipped across three slices, with Phase 2d (the SPEC §4.6 rewrite) inserted between slices 2 and 3. End-to-end verified on forge.mom with iPhone PWA, real push delivery, and live Upstash schedules.

### Slice 1 — VAPID + push + PWA shell (PR #11, commit `e17b933`)

- HANDOFF before this slice claimed `/sw.js` was already generated by `@serwist/next`; it wasn't. Slice 1 actually stood up the PWA shell from scratch: `app/manifest.webmanifest`, `app/sw.ts` (Serwist precache + push + notificationclick handlers compiled to `public/sw.js`), placeholder 192/512/180 PNG icons in `public/icons/`, apple-touch-icon link tags via Next 16 metadata API.
- New deps: `@serwist/next`, `serwist`, `web-push`, `@types/web-push`.
- `lib/push/vapid.ts` — env-validated VAPID config singleton (throws `VapidNotConfiguredError` on use if any of the three is missing; routes catch and 503).
- `lib/push/send.ts` — `web-push.sendNotification` wrapper that deletes the subscription row on 404/410 and bumps `last_used_at` on success.
- `lib/push/encoding.ts` — `urlBase64ToUint8Array` for the browser-side `applicationServerKey`.
- `app/api/push/subscribe/route.ts` — POST upserts on endpoint, DELETE removes by endpoint. Cookie-auth (proxy already gates on OWNER_EMAIL).
- `app/api/push/test/route.ts` — owner-only fan-out test push, used for the smoke test.
- `components/push/EnableNudges.tsx` — client component on `(app)/layout.tsx`. Hides itself when VAPID env is unset, when notifications are unsupported, or when already subscribed (post-subscribe shows a "Send test" button).
- **Build switched from Turbopack to webpack** (`next dev --webpack` / `next build --webpack`) because `@serwist/next` doesn't yet support Turbopack. Saved as memory `feedback_serwist_turbopack.md`.
- Smoke test: VAPID keys generated via `npx web-push generate-vapid-keys`, set in Vercel, deployed, installed PWA to iPhone Home Screen, granted notification permission, "Send test" landed a push successfully.

### Slice 2 — `nudge_question` task + prompt + schema (PR #12, commit `5949504`)

- `lib/ai/prompts/nudge_question.md` — Haiku 4.5 prompt that picks one Socratic question per slot, kind-aware (problem / idea / observation / research). References research summary and conversation state via `{{vars}}`. Enforces 8–22 word push-friendly length.
- `lib/ai/nudge-schema.ts` — Zod schema for `{ question, reasoning }`. Loose 6–30-word guard so Haiku boundary-landings don't trigger retries.
- `lib/ai/tasks.ts` — registered `nudge_question` task: `claude-haiku-4-5`, `max_tokens: 200`, `temperature: 0.4`. Costs ~$0.0002/call × ~60/month = ~$0.01/month.

### Phase 2d — Develop-prompt export (PR #13, commit `80204ac`)

This is a meaningful product-direction change worth flagging in any future review. SPEC §4.6 was rewritten end-to-end:

- v1 does **not** ship an in-app conversation runner. The "Develop this" button on `/capture/[id]` generates a deterministic prompt (no LLM call) the user copies into a fresh claude.ai chat, where the actual development happens.
- When research exists, the prompt has **Part 1 (audit + expand)** + **Part 2 (pressure-test)**. Part 1 instructs Claude to verify named competitors, surface what was missed, refresh news, refine market context with liberal web search before moving on to the §4.6 questions.
- When research is absent (problem/observation captures, or failed research), Part 1 is dropped; the prompt goes straight to pressure-test.
- State `raw → developed` becomes a manual **Mark developed** action, idempotent, writes `capture_events` with `payload.via = 'develop_prompt_export'`.
- Files: `lib/develop/prompt.ts` (pure `buildDevelopPrompt`), `app/(app)/capture/[id]/DevelopPanel.tsx`, `markDeveloped` action in `app/(app)/capture/[id]/actions.ts`.
- SPEC §4.10 was added: "Future enhancements (planned, not in v1)" — captures the user-flagged "structured expansion sections per capture" idea as a deferred item with UX explicitly TBD. Don't design until v1 has run for a few weeks.
- Smoke test on forge.mom confirmed Claude follows the audit-then-pressure-test ordering when given the generated prompt.

### Slice 3 — `/api/jobs/nudge` + nudge banner + Upstash crons (PR #14, commit `19dcc91`)

- `app/api/jobs/nudge/route.ts` — POST `?slot=morning|evening`. QStash signature verify → Layer B `job_runs` claim keyed `nudge:{slot}:{YYYY-MM-DD}` (local YMD in `APP_SCHEDULE_TZ`) → Layer A eligibility query → `selectCapture()` weighted pick → `runTask('nudge_question')` → `nudges` row insert → push fanout → set `sent_at` if at least one delivery succeeded. Skips silently (200) on no-eligible-captures or missing VAPID.
- `lib/nudge/select-capture.ts` — pure tiered comparator: `raw_with_research > raw_idea > raw_other > developed`, oldest-first, id tie-break.
- `lib/nudge/research-summary.ts` — compact formatter (cap 5 competitors, 1 news item, 280-char market_context).
- Capture detail page reads `?nudge=:id`, validates UUID, marks `responded_at` server-side if not already (this is what gates the 48h debounce — opening the notification counts as "responded").
- `app/(app)/capture/[id]/NudgeBanner.tsx` — shows the question above the Develop panel; "Skip with reason" writes `skipped_reason`.

### Cron schedules — LIVE in production

Two Upstash QStash schedules registered with timezone-aware crons (Option A from this slice's PR body):

| Slot    | Cron          | Timezone           | URL                                                |
|---------|---------------|--------------------|----------------------------------------------------|
| Morning | `0 10 * * *`  | `America/New_York` | `https://forge.mom/api/jobs/nudge?slot=morning`   |
| Evening | `0 17 * * *`  | `America/New_York` | `https://forge.mom/api/jobs/nudge?slot=evening`   |

DST-safe — Upstash converts to the right UTC instant each fire. To verify health, watch `jobs.nudge.completed` log lines or query `select * from job_runs where job_name='nudge' order by started_at desc limit 10;`.

### What I'd watch for in the first week

- **Repetitive questions on the same capture.** `selectCapture` has a small candidate pool by design (single user, 2–3 captures/week). If the same capture wins picks for several days in a row, that's expected at this volume — temperature 0.4 should keep questions varied, but if they feel samey we can revisit.
- **Push delivery reliability.** Apple's APNs occasionally drops messages. If `jobs.nudge.completed` logs `sent: 0` more than once a week, investigate.
- **Budget creep.** `select sum(cost_usd) from api_costs where created_at >= date_trunc('month', now());` — should stay well under $25/month with daily nudges + occasional research.

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

1. **Phase 2c slice 3 smoke test.** PR #18 is open, CI green. Run the playbook in the Active Item section above. After it passes: merge, then register the Sunday cron in Upstash.
2. **Detail-page polling** (small UX polish — see end-of-file "Enhancements" section).
3. **Real PWA icons.** `public/icons/{icon-192, icon-512, apple-touch-icon}.png` are programmatically-generated dark-square placeholders from a Node PNG encoder. Replace with real branding before showing the app to anyone.

The task registry / runner machinery from Phase 1c + 2a + 2b + 2c is already in place — adding new tasks is mostly: write the prompt MD, register in `lib/ai/tasks.ts`, call `runTask`. Both JSON-text and tool-as-output extraction patterns are supported by the runner.

### Tracked debt

- **Add `QSTASH_URL` to `lib/env.ts` Zod schema and `.env.example`.** It's set in Vercel and works at runtime (the `@upstash/qstash` SDK reads it directly from `process.env`), but our Zod schema doesn't validate it, so a missing/typo'd value would not throw at startup. See memory `feedback_qstash_regional_url.md`. Small follow-up PR.
- **Rotate keys** that have been pasted in chat history during Phase 1 + 2a setup. Specifically: Supabase service-role JWT, Supabase DB password, Anthropic API key, OpenAI API key, SHORTCUT_API_TOKEN, QSTASH_TOKEN, QSTASH_CURRENT_SIGNING_KEY, QSTASH_NEXT_SIGNING_KEY, QSTASH_URL (the URL itself isn't secret but rotating the token invalidates the URL pairing). Also: `RESEND_API_KEY` if it was ever pasted.
- **Re-add Sentry in Phase 3.** It was removed during Phase 1a. See `~/.claude/projects/-Users-tommyfitz-Forge/memory/project_sentry_deferred.md` for the exact restore steps.
- **Migrate research + nudge routes to `lib/jobs/job-runs.ts`.** Slice 3 extracted the Layer B claim/mark helpers into a shared module; the older two routes still inline their own copies. Out-of-scope cleanup, ~50 lines of dedup each.
- **Register `research-recovery` QStash schedule.** Route exists at `app/api/jobs/research-recovery/route.ts` but isn't yet on a cron. SPEC §12.1 says hourly UTC. Low priority — it's a recovery sweep, only matters if a `running` row goes stale, which is rare at v1 volumes.
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
- **`feedback_serwist_turbopack.md`** — `@serwist/next` doesn't run under Turbopack (Next 16's default). Both `dev` and `build` scripts in `package.json` must pass `--webpack`. Generated SW outputs (`public/sw.js`, `public/swe-worker-*.js`) are gitignored AND added to `eslint.config.mjs` `ignores`.
- **`feedback_intl_h23_node_icu.md`** — `Intl.DateTimeFormat` with `hour12: false` emits `'24'` for midnight on some Node ICU builds (Node 22+ Linux, GitHub Actions). Always use `hourCycle: 'h23'` — it's the only spec-defined way to get 0–23 reporting consistently. Caught only by CI; local macOS Node 20 returns `'00'`.
- **`project_vercel_fluid_compute.md`** — Forge's Vercel project has Fluid Compute enabled (`resourceConfig.fluid: true`). This lifts the legacy 60s Hobby function cap so background jobs can declare `maxDuration` up to ~300s. Important context for sizing route timeouts.
- **`project_sentry_deferred.md`** — `@sentry/nextjs` is uninstalled. `instrumentation.ts` is a no-op stub. Re-wire in Phase 3 with dynamic imports gated on `process.env.SENTRY_DSN`.
- **`project_resend_sender.md`** — Forge weekly emails send from `forge@biddrop.app`, not `forge.mom`. Free Resend tier only allows one verified domain; `biddrop.app` is already verified for an unrelated project, so weekly review reuses it. The local-part doesn't need to match the domain side. Don't suggest verifying `forge.mom` until the Resend plan upgrades.
- **`project_forge.md`** — Project basics, solo merge policy, single-tenant invariant.

### Lessons from Phase 1 not yet promoted to memory (worth knowing)

- **Whisper sniffs format from the filename extension, not Content-Type.** Building filenames like `<id>.webm;codecs=opus` (raw `MediaRecorder` MIME) gets rejected as "Invalid file format" even though `audio/webm` is in Whisper's supported list. Fixed in `lib/offline/upload.ts:extensionFromMime` — strip codec params and `x-` prefix.
- **`captures.audio_duration_seconds` is `int`** per SPEC §6.1. Whisper and the client timer return floats. Always `Math.round()` before insert (`lib/capture/persist.ts`, `app/api/capture/route.ts`).
- **Prompt caching has a minimum prefix threshold.** Haiku 4.5 = 4096 tokens, Sonnet 4.6 = 2048 tokens. Below that, `cache_control: ephemeral` silently doesn't fire — `cache_creation_input_tokens` stays 0. `classify_capture` is ~500 tokens so caching was deliberately skipped; revisit when Sonnet research/weekly prompts ship.
- **`crypto.timingSafeEqual` throws on length mismatch.** Always length-check first (`lib/auth/shortcut.ts:verifyBearer`). Tokens have fixed length so the early return doesn't leak useful info.
- **HEIC photos.** User has switched their iPhone to "Most Compatible" so all uploads are JPEG. Don't add HEIC transcoding — it was a deliberate non-goal (SPEC §19).

---

## Architecture map (where things live, current as of 2026-04-28)

```
SPEC.md                          # source of truth (v1.1 + §4.6 rewrite + §4.10 + 2026-04-28 spec sync)
SPEC-1.1-CHECKLIST.md
HANDOFF.md                       # this file
README.md                        # quickstart + iOS Shortcut setup
proxy.ts                         # OWNER_EMAIL enforcement, Node runtime (was middleware.ts pre-Next 16)
next.config.ts                   # CSP, HSTS (prod-only), serverActions bodySizeLimit (15MB), Serwist withSerwist wrapper
instrumentation.ts               # no-op stub (Sentry deferred)
package.json                     # `dev` + `build` scripts pass --webpack (Serwist + Turbopack incompat)

app/
├── manifest.webmanifest         # PWA manifest (2b slice 1)
├── sw.ts                        # Service worker source — push + notificationclick + Serwist precache (2b slice 1)
├── layout.tsx                   # root layout — manifest link, apple-touch-icon, viewport
├── globals.css
├── (auth)/login/                # magic-link form + server action with §14 spam guard
├── auth/callback/route.ts       # exchanges OAuth code → session
├── (app)/
│   ├── layout.tsx               # nav, UnsyncedBadge, EnableNudges banner, sign-out
│   ├── page.tsx                 # dashboard list
│   ├── archive/page.tsx
│   ├── actions.ts               # signOut
│   ├── capture/
│   │   ├── page.tsx             # 4-mode picker; voice default
│   │   ├── TextCapture.tsx
│   │   ├── VoiceCapture.tsx
│   │   ├── PhotoCapture.tsx
│   │   ├── actions.ts           # createTextCapture + createPhotoCapture
│   │   └── [id]/
│   │       ├── page.tsx         # detail; reads ?nudge=, marks responded_at, renders banners
│   │       ├── StateControls.tsx
│   │       ├── ResearchPanel.tsx
│   │       ├── RetryResearchButton.tsx
│   │       ├── DevelopPanel.tsx       # 2d — collapsible "Develop this" + Mark developed
│   │       ├── NudgeBanner.tsx        # 2b slice 3 — banner shown via ?nudge=:id
│   │       └── actions.ts       # promoteToSerious / archive / unarchive / delete / markDeveloped / skipNudge
│   └── review/
│       └── [weekId]/page.tsx    # 2c slice 3 — server-rendered weekly digest (PR #18)
└── api/
    ├── capture/route.ts         # multipart audio; web (cookie) + Shortcut (Bearer)
    ├── push/
    │   ├── subscribe/route.ts   # 2b slice 1 — POST upsert / DELETE by endpoint
    │   └── test/route.ts        # 2b slice 1 — owner-only test push fanout
    └── jobs/
        ├── research/route.ts                       # Phase 2a
        ├── research-recovery/route.ts              # Phase 2a (cron registration TBD)
        ├── nudge/route.ts                          # 2b slice 3 — twice-daily cron (LIVE in Upstash)
        └── weekly-review/                          # 2c slice 3 (PR #18)
            ├── stage1/route.ts                     # Sonnet pattern_detection + weekly_summary; chains stage2
            └── stage2/route.ts                     # Resend send + push fanout; flips status='sent'

components/
├── ui/                          # button, input, textarea, badge
├── capture/VoiceRecorder.tsx
├── layout/UnsyncedBadge.tsx
└── push/
    └── EnableNudges.tsx         # 2b slice 1 — SW register + permission + subscribe + test push

lib/
├── env.ts                       # Zod-validated env (no server-only)
├── logger.ts                    # structured logger
├── utils.ts
├── qstash.ts                    # Phase 2a — publish client + verifyJobRequest (signature OR dev-bearer)
├── ai/
│   ├── anthropic.ts             # singleton client (140s timeout for Sonnet+web_search)
│   ├── openai.ts                # Whisper client
│   ├── transcribe.ts            # Whisper call + cost log
│   ├── prompts.ts               # loadPrompt + {{var}} substitution
│   ├── tasks.ts                 # task registry: classify_capture, research_idea, nudge_question, weekly_summary, pattern_detection
│   ├── run.ts                   # runTask: budget check, JSON-text retry, cost log
│   ├── extract-tool-output.ts   # tool-as-output extraction (research_idea)
│   ├── research-schema.ts       # ResearchSchema + JSON-schema mirror for submit_research tool
│   ├── nudge-schema.ts          # 2b slice 2 — NudgeQuestionSchema
│   ├── weekly-summary-schema.ts # 2c slice 1 — WeeklySummarySchema
│   ├── pattern-detection-schema.ts # 2c slice 1 — PatternDetectionSchema
│   └── prompts/
│       ├── classify_capture.md
│       ├── research.md
│       ├── nudge_question.md            # 2b slice 2
│       ├── weekly_summary.md            # 2c slice 1
│       └── pattern_detection.md         # 2c slice 1
├── auth/shortcut.ts             # Bearer extraction + constant-time compare
├── capture/                     # kinds, parse, persist, photo
├── develop/
│   └── prompt.ts                # 2d — buildDevelopPrompt({ capture, research })
├── email/                       # 2c slices 2 + 3
│   ├── resend.ts                # client + ResendNotConfiguredError + getFromAddress
│   ├── send.ts                  # sendWeeklyReviewEmail (Idempotency-Key: weekly:{week_of})
│   ├── compose.ts               # composeWeeklyReviewEmail / composePushBody (slice 3)
│   └── markdown.ts              # marked wrapper, gfm + breaks, sync mode (slice 3)
├── http/read-body.ts            # 25MB streaming cap
├── jobs/                        # 2c slice 3
│   └── job-runs.ts              # Layer B claim + markSucceeded/markFailed (used by stage1+2)
├── nudge/                       # 2b slice 3
│   ├── select-capture.ts        # weighted-pick comparator (SPEC §4.4 step 2)
│   └── research-summary.ts      # compact formatter for prompt input
├── offline/                     # idb, upload (extensionFromMime)
├── push/                        # 2b slice 1
│   ├── vapid.ts                 # env validation + cached config
│   ├── send.ts                  # web-push wrapper + 410 cleanup + last_used_at touch
│   └── encoding.ts              # urlBase64ToUint8Array (browser side)
├── research/enqueue.ts          # Phase 2a — fire-and-forget QStash publish
├── weekly-review/               # 2c slice 3
│   ├── week-of.ts               # Monday-in-ET, DST-safe (uses hourCycle:'h23')
│   └── captures-block.ts        # prompt input formatters for both Sonnet tasks
├── supabase/                    # server, client, service, middleware
└── types/db.ts                  # generated; pnpm db:types to refresh

public/
├── manifest is at app/manifest.webmanifest (Next.js convention)
├── icons/                       # 2b slice 1 — placeholder PNGs (192/512/180), replace with real branding
├── robots.txt
├── sw.js                        # GENERATED by @serwist/next on build (gitignored)
└── swe-worker-*.js              # GENERATED chunked SW workers (gitignored)

supabase/
├── config.toml
└── migrations/
    ├── 20260424153834_initial_schema.sql
    └── 20260427142755_attachments_storage.sql

tests/unit/
├── env.test.ts                  · logger.test.ts                · capture-parse.test.ts
├── read-body.test.ts            · upload-extension.test.ts      · prompts.test.ts
├── classify-schema.test.ts      · shortcut-auth.test.ts         · photo-mime.test.ts
├── research-prompt.test.ts      · research-schema.test.ts       · run-tool-extract.test.ts
├── push-encoding.test.ts (1)    · push-vapid.test.ts (1)        · push-send.test.ts (1)
├── nudge-schema.test.ts (2)     · nudge-prompt.test.ts (2)
├── develop-prompt.test.ts (2d)
├── nudge-select-capture.test.ts (3)  · nudge-research-summary.test.ts (3)
└── shims/server-only.ts         # vitest alias for `server-only`

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
- **Phase-2 vars currently set in production** (still `optional()` in `lib/env.ts`):
  - QStash quartet: `QSTASH_URL`, `QSTASH_TOKEN`, `QSTASH_CURRENT_SIGNING_KEY`, `QSTASH_NEXT_SIGNING_KEY` (Phase 2a). All four are required for the daily-nudge cron to verify and publish.
  - VAPID trio: `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` (Phase 2b slice 1). Generated via `npx web-push generate-vapid-keys`. Required for `/api/push/*` and `/api/jobs/nudge` to function; routes 503 / log-and-skip without them.
- **Optional, deferred to later phases**: Sentry (Phase 3), Resend (Phase 2c — `RESEND_API_KEY`, `RESEND_FROM_ADDRESS`).
- **Vercel** mirrors all required vars across Production / Preview / Development.
- **Supabase Auth → Redirect URLs:** allowlist includes `http://localhost:3000/**` and `https://forge.mom/**`. Add ephemeral preview URLs only if needed (currently not).
- **Supabase CLI** is linked to the remote project. Password lives in macOS keychain. To run a migration: `pnpm db:new <name>`, edit the generated SQL, `pnpm db:push`. Always re-run `pnpm db:types` after `db:push`.

---

## Tooling cheat sheet

```bash
# Dev loop  (NOTE: `dev` and `build` pass --webpack — Serwist incompat with Turbopack)
pnpm dev                                     # Next dev server (webpack)
pnpm typecheck                               # tsc --noEmit (strict + noUncheckedIndexedAccess)
pnpm lint                                    # eslint . (Next 16 dropped `next lint`)
pnpm test                                    # vitest run
pnpm build                                   # production build (webpack)

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
8. **Self-auth API routes need precise middleware allowlist.** `/api/capture` is on the exact-match set in `lib/supabase/middleware.ts`; new routes that use `?source=` or Bearer auth should be added to either `SELF_AUTH_API_PREFIXES` (with a trailing slash to avoid `-batch`-style collisions) or `SELF_AUTH_API_EXACT`. `/api/jobs/*` and `/api/push/*` are already self-auth (signature / cookie respectively).
9. **`responded_at` is the 48h debounce gate.** Capture detail page sets it server-side when loaded with `?nudge=:id`. If you change how nudge taps are routed (e.g. add a query parameter, change the URL shape, intercept in a client component), make sure `responded_at` still gets written on the same code path — otherwise the same capture will get re-picked next slot.
10. **Cron schedules are LIVE in Upstash.** `/api/jobs/nudge` fires twice daily at 10am + 5pm `America/New_York`. Don't change the route's request/response shape without auditing how Upstash retries handle it (Layer-B `job_runs` makes most retries safe, but a route that throws before the claim is dangerous — the QStash redelivery would retry, claim, then complete, leaving the original retry stuck).
11. **PWA service worker updates.** When `app/sw.ts` changes meaningfully, iOS users may need to force-quit + reopen the installed PWA to pick up the new SW. Serwist's `skipWaiting + clientsClaim` handles most cases automatically, but the first load after deploy can serve the old shell.

---

## How to use this with a new session

1. Open a fresh Claude Code session in `/Users/tommyfitz/Forge`.
2. Tell it: *"Read HANDOFF.md and the memory directory at `~/.claude/projects/-Users-tommyfitz-Forge/memory/`. The active item is the Phase 2c slice 3 smoke test — PR #18 is open and CI green. Run the playbook in HANDOFF's Active Item section against the Vercel preview, then merge and register the cron."*
3. The session should report: Phase 1 + Phase 2a (research) + Phase 2b (daily nudges, crons LIVE) + Phase 2d (develop-prompt export per rewritten §4.6) + Phase 2c slices 1+2 (Sonnet tasks + Resend wrapper) all merged. Phase 2c slice 3 is open as PR #18; the chained QStash job + `/review/[weekId]` page exist and CI passed; awaiting end-to-end smoke test on the preview deploy. Resend is wired (`forge@biddrop.app`).

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
