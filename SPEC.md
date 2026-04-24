# Forge — Product & Engineering Specification

> **Working name:** Forge. *(Alternatives: Sparks, Crucible, Anvil, Muse. Rename before first commit if desired.)*
>
> **Audience for this doc:** a coding agent (Claude Code / Cursor / similar) that will implement the system. Humans skim the Purpose and Build Plan sections; everything else is executable detail.
>
> **Spec version:** 1.1 (2026-04-23). Changes vs 1.0 tracked in [SPEC-1.1-CHECKLIST.md](SPEC-1.1-CHECKLIST.md) and in git history.

---

## 1. Purpose

A single-user web app (PWA-installable on iOS) that removes all friction from capturing half-formed problems, startup ideas, observations, and research questions, then actively develops them over time through AI-driven research, daily nudges, and a weekly Socratic review. The goal is not "another note app." The goal is: **ideas that would otherwise die in a Notes app get researched, pressure-tested, and graduated into serious ideas.**

The app is successful if, six months in, the user can point to at least one idea that went from a 10-second voice memo → researched → challenged → developed → marked "serious" — and can say "this wouldn't have happened without Forge."

## 2. User

One user (the owner). Single-tenant. No multi-user features. Auth exists only to protect web access, not to manage many accounts.

Usage profile:
- ~2–3 captures per week
- Captures happen while driving, showering, walking, in class, at a desk
- Weekly review happens Sunday evening
- Daily engagement via notifications (goal: 1 development question answered per day)

## 3. Design Principles (non-negotiables)

1. **Capture latency is sacred.** From thought → saved must be ≤ 2 taps from the iPhone lock screen, or fully hands-free via Siri / Action Button. Any feature that adds capture friction is rejected.
2. **Voice-first, text/photo/draw secondary.** Optimize the voice path; the others should just work.
3. **The weekly review is the product.** Capture without review is what failed in Notes. The pushy Sunday review is the highest-leverage feature and gets the most design attention.
4. **The AI is a skeptical friend, not a cheerleader.** Default stance: pressure-test, surface holes, ask the uncomfortable question.
5. **Everything important is queryable and exportable.** Data never gets trapped. One-click JSON export of all captures, research, conversations.
6. **Prompts are data, not code.** Stored as versioned markdown files in `lib/ai/prompts/`, loaded at runtime. Iterating on prompts should not require understanding the app.
7. **Prefer boring tech.** No novel frameworks, no custom ORMs, no self-hosted infra. The user vibe-codes this; boring = debuggable.
8. **Idempotency everywhere.** Every background job can be re-run safely. Every webhook can be re-delivered. No double-sent emails, no double-charged research.

## 4. Feature Specification

### 4.1 Capture

**Entry points (ordered by frequency):**

| Trigger | Flow | Hands-free |
|---|---|---|
| Action Button (iPhone 15 Pro+) | → iOS Shortcut → shows full-screen record view → user taps Stop → POSTs audio to API | Partial (one tap to start, one tap to stop) |
| "Hey Siri, new Forge idea" | → same Shortcut as above (still requires tap-to-stop) | Partial |
| Control Center custom button | → opens PWA at `/capture` → voice recording | No (one tap) |
| PWA home screen icon | → opens `/capture` | No (one tap) |
| Push notification tap | → opens PWA at specific capture or new capture | No (one tap) |

**Capture modalities:**
- **Voice (primary)**: records audio locally, uploads to API, transcribed via Whisper. Raw audio *not* persisted long-term (transcription only is fine). Transcript is lightly cleaned (ums removed, punctuation added). User can review and edit transcript before committing.
- **Text**: plain textarea, autosaves draft every 2s. Supports manual declaration prefix: `problem:`, `idea:`, `observation:`, `research:` at the start of the text.
- **Photo**: camera or upload. Optional caption. Attached to a capture entry.
- **Draw**: simple HTML canvas (rare use; keep minimal — black pen, eraser, clear button). Exports as PNG.

**Single entry point UI:** `/capture` shows four big buttons: **Voice**, **Text**, **Photo**, **Draw**. Voice is the largest and centered. No bucket/category selection at capture time — that's done by classification.

**Voice UX specifics:**
- Tap Voice → 0.5s countdown → recording starts, large red stop button.
- Recording ends on Stop tap or at a **180-second hard cap** (auto-stop, shows a brief "Max length reached" toast and proceeds to upload). No silence detection in v1 — user-driving / user-walking environments are too noisy for RMS thresholds to be reliable, and the Action Button flow expects a manual Stop anyway.
- Shows waveform during recording for feedback. Elapsed-time counter shown next to the Stop button; turns amber at 150s, red at 170s so the user sees the cap approaching.
- On stop: uploads, shows transcript in ~3s, user can tap "Save" or edit first.
- If user declares type by voice ("problem: my calendar keeps double-booking me"), the server strips the prefix before classification and uses it directly — see §4.2 rule 1. The classifier LLM never sees the prefix.

**Audio upload validation** (enforced server-side before forwarding to Whisper):
- Accepted MIME types (relaxed allowlist to cover iOS Shortcut variants): `audio/webm`, `audio/mp4`, `audio/mpeg`, `audio/mp3`, `audio/m4a`, `audio/x-m4a`, `audio/aac`, `audio/wav`, `audio/x-wav`, `audio/ogg`. Reject anything else with 415 and log the received `Content-Type` to Sentry so the allowlist can be extended if a real device surfaces a new variant.
- Max file size: 25MB (Whisper hard limit). If `Content-Length` is present and exceeds 25MB, reject with 413 before reading the body. If `Content-Length` is missing (Shortcut chunked uploads sometimes omit it), stream the request body with a hard 25MB cap and abort with 413 as soon as the cap is crossed.
- **Client-side format selection.** Feature-detect with `MediaRecorder.isTypeSupported()` and pick the first supported from `['audio/webm;codecs=opus', 'audio/mp4']`. In practice this means **Chromium emits `audio/webm;codecs=opus`** and **Safari emits `audio/mp4`** — as of Safari 18, `MediaRecorder` still has no webm support, so the fallback is load-bearing (not a rare edge case). Whisper accepts both. Do not claim webm is the default on Safari — it is not. No server-side transcoding in v1; FFmpeg / audio conversion is explicitly out of scope (see §19).

**Drafts and resilience:**
- The moment recording stops (or text/photo is submitted), the raw payload is written to IndexedDB with status `pending_upload`. The audio blob is stored as-is; text captures store the raw string.
- Upload is attempted immediately. On failure, retries with exponential backoff (1s → 2s → 4s → max 30s interval). On success, the IndexedDB entry is deleted.
- The dashboard header shows an **"Unsynced (N)"** badge whenever any `pending_upload` entries exist. Tapping it shows a list with "Retry now" per item.
- IndexedDB entries older than **30 days** without a successful upload are surfaced as a warning ("1 capture couldn't be synced — review or discard"). They are never auto-deleted.
- No capture is ever lost due to network failure.

### 4.2 Classification

Every capture is classified into exactly one of four kinds:

| Kind | Meaning |
|---|---|
| `problem` | A frustration or observation of something broken in the world / user's life |
| `idea` | A startup idea or proposed solution |
| `observation` | A cool noticing, not yet a problem or idea |
| `research` | Something the user wants the AI to go research and report back on |

**Classification rules:**
1. **Prefix match (server-side regex, runs before the LLM).** Apply the case-insensitive regex `^\s*(problem|idea|observation|research)\s*[:\-—]\s*` to `content`. If it matches: set `kind` from the captured group, strip the matched prefix from `content` (but keep the raw form in `original_transcript`). Generate `title` via the heuristic fallback in rule 5. The classifier LLM is never called when a prefix matches, which also saves a Haiku call on the most common voice flow.
2. Otherwise, run the `classify_capture` task (Haiku 4.5). It returns **both** the `kind` and a short `title` (4–8 words, Title Case, no trailing punctuation) in one call — see §11.1. This avoids a second round-trip just for titling.
3. The user can override the classification with a tap in the capture detail view. The title is editable inline on the capture detail screen.
4. **Fallbacks:** if Whisper returns empty or unintelligible text (e.g. `''`, `"[inaudible]"`, a single filler token), skip the classifier, persist the capture with `kind = 'observation'`, `state = 'raw'`, and `title = 'Untitled capture'`; surface a "Couldn't transcribe clearly — tap to edit" hint on the detail view so the user can fix the transcript and title manually. If the classifier itself errors or returns an off-schema value, default `kind = 'observation'`, apply the heuristic title fallback in rule 5, and log to Sentry.
5. **Heuristic title fallback** (used by the prefix path and the error path): take the first 60 characters of the cleaned `content`, cut at the nearest word boundary, strip trailing punctuation. No LLM call. Good enough as a stopgap; the user can rename.

**Lifecycle state** (separate from kind):
- `raw` — just captured, not yet developed
- `developed` — the user has had at least one AI conversation about it
- `serious` — user has explicitly promoted it to the "serious ideas" list
- `archived` — user explicitly set it aside

State transitions are always user-initiated in the UI (explicit promotion), except `raw → developed` which happens automatically after the first conversation session.

### 4.3 Automatic Research (on-capture)

When a capture lands and classifier assigns `idea` or `research`, the system enqueues a research job asynchronously. For `problem` and `observation`, research is *not* auto-run (user can trigger it manually from the detail view).

**Research output schema (enforced by Zod):**
```ts
{
  competitors: Array<{ name: string, url?: string, oneLiner: string }>,
  market_context: string,        // ~1 paragraph
  recent_news: Array<{ title: string, url: string, summary: string, date?: string }>,
  angles: Array<{ title: string, reasoning: string }>,  // 3 angles for solution/execution
  confidence: 'low' | 'medium' | 'high',
  sources_count: number,
  generated_at: string
}
```

**Implementation:**
- Runs via QStash delayed job (fire-and-forget from capture endpoint).
- Uses Anthropic Sonnet 4.6 with two tools: `web_search` (`max_uses: 8`) and `submit_research` (the output tool).
- The `submit_research` tool's input schema mirrors the `ResearchSchema` exactly. The prompt instructs the model to use `web_search` to gather info, then call `submit_research` once as its final action.
- Because output arrives as a tool-call argument (not freeform text), JSON is always structurally valid. Validate the args with Zod `.safeParse` for semantic correctness only.
- Single prompt: **`lib/ai/prompts/research.md`** (canonical path; see §10.5 and §11). Instructs the model to end with `submit_research`.
- On completion, writes to `research` table linked by `capture_id`.
- On failure, retries 2× with exponential backoff within the job (handles transient Anthropic errors). After those fail, enqueues one additional QStash delayed retry with `delay: 3600s`. If that also fails, marks `research_status = 'failed'` and records error. User sees a "Retry research" button in the capture detail view for manual recovery beyond that point.
- **Idempotency (see §10.4):** All research invocations for a given capture — initial, the hour-delayed auto-retry, and any manual "Retry research" click — share the **same** Layer B idempotency key `research:{capture_id}`. This works because the prior `job_runs` row is left in `status = 'failed'` after the previous attempt (or is swept to `failed` + `error='stale_lease'` by the 20-minute sweep), and a re-claim from `failed → running` is allowed per §10.4. Re-entry first checks Layer A: if a `research` row already exists for this `capture_id` (unique index), return 200 `already_sent` and do nothing.
- **Stuck-job recovery:** A dedicated cron runs every hour (`/api/jobs/research-recovery`). It does two things: (1) finds captures where `research_status = 'running'` and `updated_at < now() - interval '5 minutes'`, resets them to `research_status = 'pending'`, and re-enqueues a research job for each; (2) finds `job_runs` rows with `status = 'running'` and `started_at < now() - interval '20 minutes'` and marks them `status = 'failed'`, `error = 'stale_lease'` so a redelivery can claim a fresh row. This handles Vercel timeouts and unhandled crashes without manual intervention.
- Cost: ~$0.05–0.15 per run. Per-call cost is bounded deterministically by `max_tokens: 4000` + `max_uses: 8` on `web_search`. `MAX_RESEARCH_COST_USD` is a **documentation / alerting budget only**; it is not a runtime check. The real runtime ceiling is `MAX_MONTHLY_COST_USD`, which is checked pre-call by the task runner (§11.2). Per-research bounding comes from `max_tokens` + `max_uses`, not from summing token costs mid-call.

### 4.4 Daily Nudges

**Schedule:** 10:00 AM and 5:00 PM **US Eastern** (`America/New_York`). v1 is single-user and hard-codes `APP_SCHEDULE_TZ = 'America/New_York'`; there is no per-user timezone in the database. QStash schedules use `cron_tz: America/New_York` (see §12.1). If the owner ever travels, nudges still fire on Eastern time — that's the explicit v1 trade-off.

**Algorithm:**
1. Find eligible captures: `state IN ('raw', 'developed')` AND no nudge `sent_at` in the last 20 hours for that capture (prevents morning + evening nudge for the same item on the same day) AND no nudge `responded_at` in the last 48 hours (prevents repeat questions on a capture the user just answered).
2. Pick one using a weighted strategy: prefer oldest undeveloped, then ideas with fresh research, then problems without recent engagement.
3. Generate one specific question using `lib/ai/prompts/nudge_question.md` (Haiku 4.5). The question is tailored to the capture's kind, current conversation state, and development template (see §4.6).
4. Store the question in the `nudges` table with `scheduled_for = now()`, `sent_at` when push delivers.
5. Send push notification with preview text: `"Re: {short_title} — {question}"`.

**User interaction:**
- Tap notification → opens PWA at `/capture/:id?nudge=:nudge_id`.
- Capture detail screen shows the question prominently with three action buttons: **Answer by voice**, **Answer by text**, **Skip** (with optional "tell it why" follow-up).
- Answer gets appended to the conversation history and may trigger a follow-up question in-flow.

**Escalation:** if the user ignores nudges for 3+ days, tone remains steady (user request). No guilt-trip copy.

**Concurrency guard.** Two simultaneous QStash deliveries of the same slot (signature retry, network blip, stale-lease reset during an in-flight run) would both pass the Layer A eligibility check — `sent_at` is null at check time for both. The thing that prevents a duplicate nudge is the **Layer B claim on `job_runs`** (§10.4) keyed `nudge:{YYYY-MM-DDTHH}` with the unique index on `(job_name, idempotency_key)`. First worker inserts `status='running'`; the second hits the unique-index conflict and exits without generating a question or sending a push. Do not add a separate unique index on `nudges(capture_id, ...)` or a per-capture advisory lock — the `job_runs` row is the single source of truth for "this slot is being handled," and adding a second guard creates two places to reason about race-safety.

### 4.5 Weekly Review

**When:** Sunday 5:00 PM US Eastern (`America/New_York`; same `APP_SCHEDULE_TZ` as nudges).

**Three simultaneous deliverables:**

1. **Email** (via Resend): long-form digest.
2. **Push notification**: `"Your weekly review is ready — 4 new ideas, 2 patterns spotted"`.
3. **In-app screen** at `/review/:week_id`: the pushy conversational version.

**Email format (the "summary" mode):**
```
# This week in Forge

**3 captures. 1 pattern. 2 ideas ready to develop.**

## New captures
### [Problem] My calendar keeps double-booking me (captured Tues)
Research pulled 4 competitors (Calendly, Reclaim, Motion, Cal.com). 
Market context: [paragraph].
3 angles worth exploring: [bullets].

### [Idea] Voice-first standup bot for remote teams (captured Thu)
...

## Patterns I noticed
You logged calendar friction twice this week (Tues, Sat). Worth considering as a 
single idea?

## Ready to develop
Two ideas are ripe for a conversation. Open Forge to spar.
[Big button: Open Forge]
```

**In-app review screen (the "conversation" mode):**
- Walks through each week's capture one at a time.
- Structured Q&A per capture: AI asks 2–4 questions from the development template (§4.6).
- User answers by voice or text.
- Skip or "skip + tell it why" buttons always visible.
- After all captures, shows the **Patterns** section (if any). For each pattern, offers "Merge into new idea" or "Dismiss."
- Completion confirms with a summary: "You developed 2 ideas, promoted 1 to Serious, archived 1. See you next Sunday."

**Zero-capture week:** If there are no captures created in the last 7 days (and no `developed` or `serious` captures with recent activity), Stage 1 exits early with `return 200 "no captures this week, skipping"`. No email, no push, no `weekly_summaries` row written. The next Sunday the job runs normally.

**Idempotency (see §10.4 for the general Layer A + Layer B pattern):**

- **Layer A — business invariants.** On entry to either stage, look up `weekly_summaries` by `(user_id, week_of)`.
  - If the row exists with `status = 'sent'`, return 200 `already_sent` and do nothing — no re-send even on QStash redelivery.
  - If the row exists with `status = 'composing'` and Stage 2 is running, re-use the payload already written to that row. If the payload is missing (crash between stage1 write and stage2 read), Stage 2 re-runs pattern detection and per-capture summaries from the DB rather than bailing.
  - If the row is missing, Stage 1 inserts it with `status = 'composing'`.
- **Layer B — `job_runs` coordination.** Both stages use the same `job_name = 'weekly_review'` with idempotency keys `weekly:{week_of}:stage1` and `weekly:{week_of}:stage2`. Stage entry claims the run with `status = 'running'`, `started_at = now()`; the research-recovery cron marks stale `running` rows `failed` + `error = 'stale_lease'` after 20 minutes so a redelivery can start fresh (see §12.1).
- **Email send.** Resend call uses `Idempotency-Key: weekly:{week_of}` so a redelivered Stage 2 never sends a duplicate email even if the DB write that records `sent_at` was lost.
- The unique index on `weekly_summaries (user_id, week_of)` remains the final guard.

### 4.6 In-App Conversation (Development)

**Conversation turn output schema (enforced by Zod):**
```ts
{
  message: string,                   // AI's response text shown to user
  intent: 'template_next'            // advancing the template
         | 'adaptive_followup'       // the user's answer opened something worth digging into
         | 'off_script_response',    // user deviated; AI responds then returns to template
  template_question_index: number,   // 0-based index of next template question (or current)
  session_complete: boolean          // AI signals the session should close (4+ answers given)
}
```

**Core loop:** structured Q&A where the user can always go off-script.

**Development templates (per kind):**

*Problem template:*
1. Who experiences this problem — you, a specific group, a broad market?
2. How often does it happen? What does the current workaround look like?
3. If no one solved this, what's the real cost (time, money, frustration)?
4. Who has tried to solve it already? Why haven't they won?

*Idea template:*
1. Who is the specific customer? Name someone you know who fits.
2. Why now? What changed in the last 1–3 years that makes this possible or needed?
3. What's the wedge — the smallest possible v1 that a real person would pay for or use weekly?
4. What's the strongest argument against this idea? Steelman it.
5. What would you have to believe for this to be a big company?

*Observation template:*
1. What made this stick out to you?
2. Does this connect to anything else you've noticed?
3. Is there a problem or idea hiding in here?

*Research template:*
1. What specifically do you want to know?
2. What would you do differently if the answer is X vs Y?
3. How deep — a quick scan or real investigation?

**Conversation UX:**
- Linear: AI asks one question at a time.
- User answers (voice or text).
- AI generates follow-up: either next question from the template OR an adaptive follow-up if the user's answer opened something interesting (pressure-test mode).
- User can type at any time; AI receives `[USER ASKED]: ...` and responds, then returns to the template.
- Each conversation session writes to `conversations` table as a single JSON blob of messages.
- Session completion rule is defined in one place only: the **Conversation state machine** below. The capture's state flips `raw → developed` at the end of the first *completed* session (either path to completion counts).

**Tone guidelines (baked into system prompt):**
- Skeptical friend. Pushes back on every idea.
- Avoids motivational filler. No "great idea!" or "I love this."
- References the capture's research when relevant ("based on the research, Calendly already owns this space — what's your angle?").
- Keeps each message short (≤ 3 sentences).

**Conversation state machine (per session):**
- State: `{ template_question_index: int, answered_count: int, done: bool }`, derived from the messages array in `conversations`.
- On `intent = 'template_next'`: advance `template_question_index`, increment `answered_count`.
- On `intent = 'adaptive_followup'`: leave `template_question_index` unchanged, increment `answered_count` (the user answered *something*, even if off-script).
- On `intent = 'off_script_response'`: the user asked a question mid-flow; respond and leave both counters unchanged.
- Session completes when **any** of:
  - (a) the user taps **Done**;
  - (b) `answered_count >= min(4, template_length)` AND the model returns `session_complete: true`. `template_length` is the number of questions in the capture's kind template (problem=4, idea=5, observation=3, research=3), so observation/research sessions can complete at 3 answers.
  - (c) `answered_count >= 6` regardless of model signal (hard cap so the model can't loop forever).
- On completion, flip the capture `raw → developed` if it isn't already (see §4.2).
- **Edge cases:** if the model returns `template_question_index >= template_length`, treat it as `adaptive_followup` for that turn instead of erroring. If Zod validation of the turn output fails twice in a row, show the user a "Something went wrong — your last answer was saved. Continue?" prompt that resumes from the DB state on tap.

### 4.7 Pattern Detection & Linking

**Automatic (AI-suggested):**
- Runs as part of the weekly job before the summary is composed.
- Uses Sonnet 4.6 with up to the most recent **40 captures from the last 8 weeks** (state ≠ archived), ordered by `created_at desc`. The 40-capture cap bounds both prompt tokens and cost; at the expected 2–3 captures/week, 8 weeks will never approach the cap, but it prevents a future burst from blowing the token budget.
- Prompt: **`lib/ai/prompts/pattern_detection.md`** asks: "Which of these captures might secretly be about the same underlying thing? Return pairs with a short reasoning."
- Results stored in `links` table with `kind = 'ai_suggested'`. Use `INSERT ... ON CONFLICT (capture_a, capture_b) DO UPDATE SET last_suggested_at = now()` so re-suggested pairs freshen their timestamp rather than throwing a unique-constraint error.
- Surfaced in the Sunday review.

**Manual:**
- From any capture detail view, user taps "Link to..." → searches other captures → confirms.
- Stored in `links` table with `kind = 'manual'`.

**Merging:**

Merges create a **new, third `captures` row** synthesizing two source captures via LLM. Originals are never touched — they keep their current `state`, research, conversations, and nudge history, and remain fully available for further work (including further merges). Archiving on merge is explicitly *not* done.

- **Inputs:** exactly two source captures in v1. Three-way merges are deferred. Any state is eligible — `raw`, `developed`, `serious`, **and** `archived`. An archived capture can still be pulled into a merge (the archived original is untouched; the new merged capture starts `raw`).
- **No auto-merges.** All merges are user-initiated with a preview step before anything is written.

**Merge types** — three, distinguished by what the LLM is asked to produce. The dialog defaults from the pair of kinds; the user can override:

| Pair of kinds | Default type | What the LLM produces |
|---|---|---|
| `problem` + `idea` (either order) | **Apply** | A new `idea`: 1–2 sentence problem summary at top, the idea re-expressed as a tailored solution below. |
| Same kind on both sides | **Unify** | A new capture of that kind: one unified framing that captures what's shared across both, with the variants called out. |
| `observation` or `research` on one side, `problem` or `idea` on the other | **Enrich** | A new capture inheriting the host's kind (the non-observation / non-research side): host's framing kept, the observation or research woven in as supporting context. |
| Mixed pairs that don't fit cleanly (e.g. `observation` + `research`) | User picks from the three in the dialog | — |

**Resulting `kind`:**
- Apply → `idea`
- Unify → same kind as inputs
- Enrich → kind of the host (the non-observation/non-research side; for observation+research pairs the user picks)

The user can override the `kind` in the preview before saving — same mechanic as overriding classification on any capture (§4.2 rule 3).

**Entry points** (user-initiated; Sonnet 4.6 runs inline with a spinner, 15–30s):
1. **Capture detail view** — "Merge with…" button → capture search → pick the other capture → merge-type dialog (default from the kind pair) → LLM runs → preview.
2. **Sunday review walkthrough** — on an AI-suggested pair from pattern detection (§4.7 Automatic), tap "Merge into new idea" → same dialog → LLM runs → preview. Pattern detection itself never creates merged captures; it only writes `links` rows that surface as suggestions.

**Preview screen (non-negotiable before save):**
- Generated `title` and `content` shown in a full editor — user can edit both inline (react-hook-form + Zod resolver, same boundary pattern as elsewhere).
- User can also change `kind` from the preview.
- **Regenerate** — re-run the same merge type; swap in the new output, discarding the previous draft.
- **Change type** — switch Apply/Unify/Enrich and re-run.
- **Save** — commit the new `captures` row (state `raw`), write lineage (below), and enqueue auto-research if the resolved kind is `idea` or `research` per §4.3.
- **Discard** — no row written. The LLM calls that happened during preview are still logged to `api_costs`.

**Lineage tracking (no new table, no `links` row).** Uses the existing `capture_events` audit log:
- One event per source capture: `event_type = 'merged_into_target'`, payload `{ target_id, merge_type }`.
- One event on the new target capture: `event_type = 'merged_from_sources'`, payload `{ source_ids: [a, b], merge_type }`.

These power the UI — "this capture has been used in N merges" on each source's detail view, and "merged from X and Y" on the target's detail view. They are included in the JSON export (filtered view of `capture_events`; see Appendix C).

**Research handling:**
- The merge LLM is given each source's `research` as compact context — competitors (names only) plus the `market_context` paragraph — not the full blob. Keeps tokens bounded.
- The new capture runs its *own* fresh auto-research per §4.3 when saved. Expected duplication; the point of the merge is a new framing, which warrants a fresh pass.

**Cost:** ~$0.02–0.05 per merge call (Sonnet, no web search tool). Captured in `api_costs` like any other task. Regenerates count as additional calls.

### 4.8 Lifecycle State Management

- States: `raw`, `developed`, `serious`, `archived`. (Discussed in §4.2.)
- UI provides a "Serious Ideas" tab (filter: `state = 'serious'`).
- Transitions always user-explicit (except `raw → developed` on first conversation).
- State history is logged in `capture_events` table (audit log).

**Permanent delete:**
- Available only from the Archive view (captures must be archived before they can be deleted — two-step protection against accidental loss).
- UI: "Delete forever" button with a confirmation dialog ("This will permanently delete this capture, its research, conversations, and attachments. This cannot be undone.").
- Server: `DELETE /api/capture/:id` cascades to all child rows via `ON DELETE CASCADE` foreign keys already in the schema. Also deletes any Supabase Storage objects for attached photos/drawings.
- No soft-delete or recovery path after hard delete.

### 4.9 Notifications & Nudging (master rules)

- Twice-daily nudges at 10am / 5pm US Eastern (`APP_SCHEDULE_TZ = 'America/New_York'`; no per-user DB timezone in v1).
- Sunday 5pm US Eastern weekly review.
- No other push notifications by default.
- Settings page lets user disable nudges or weekly review.
- If user has 0 eligible captures at nudge time, skip silently (no push).
- Web Push via VAPID, stored subscriptions in `push_subscriptions` table.

## 5. Key User Flows (end-to-end)

### Flow A: Hands-free idea while driving
1. User presses Action Button. iOS Shortcut opens a full-screen "Recording…" view with a large Stop button and plays a confirmation tone.
2. User speaks: "Idea: a voice-first note app that actually makes you think about your ideas instead of losing them." (30 seconds)
3. User taps the Stop button in the Shortcut UI. Shortcut POSTs audio as multipart to `POST /api/capture` with a `source=shortcut` header.
4. Server: authenticates via long-lived token (stored in Shortcut), transcribes with Whisper, classifies as `idea`, writes capture row, enqueues research job, returns 201.
5. Background: research runs (~15s), writes to `research` table.
6. Next nudge at 10am picks up this capture and asks: *"Who is the specific customer you had in mind — people like you, or a broader group?"*

### Flow B: Sunday weekly review
1. 5pm Sunday US Eastern, QStash fires `POST /api/jobs/weekly-review/stage1`.
2. Stage 1: (a) runs pattern detection across last 8 weeks, (b) generates per-capture research summaries → enqueues Stage 2 via QStash (0s delay) with a JSON payload containing the results. Stage 1 writes a partial `weekly_summaries` row with `status='composing'`.
3. Stage 2 (`/api/jobs/weekly-review/stage2`): (c) composes full email markdown, (d) sends via Resend, (e) sends push notification, (f) updates `weekly_summaries` row to `status='sent'`.
4. Each stage stays well under Vercel's 60s serverless timeout. Both stages are idempotent via the same `weekly:{week_of}` idempotency key.
5. User taps push notification → opens `/review/:id`.
6. Guided through 3 captures, answers questions by voice.
7. Promotes one idea to `serious`. Archives one. Leaves one as `developed`.

### Flow C: Manual photo capture of a problem
1. User sees a clunky ATM interface. Opens Forge from home screen. Taps Photo → Camera.
2. Takes picture. Adds caption: "Problem: ATMs still feel like 1998."
3. Save. Classifier assigns `problem`. No auto-research.
4. Two days later, a nudge asks: *"How often do you actually use an ATM? Is this a real pain or an aesthetic gripe?"*

## 6. Data Model

Schema: `public` within a **dedicated free-tier Supabase project** (separate from biddrop.app's project). This gives full RLS isolation, separate Auth, separate Storage, and clean type generation without schema-flag boilerplate on every query. Supabase allows multiple free projects under one org even while other projects are on paid plans.

### 6.1 Tables

```sql
-- users (single row for this app; structure kept for future-proofing)
-- v1 has no per-user timezone — schedules use the APP_SCHEDULE_TZ constant ('America/New_York').
-- See §4.4 / §12.1. The row is created by a first-login trigger (see §6.3).
-- CRITICAL: public.users.id MUST equal auth.users.id so RLS policies that filter on
-- auth.uid() match. Do not default to gen_random_uuid() — inherit the auth id.
create table public.users (
  id uuid primary key references auth.users(id) on delete cascade,
  email text unique not null,
  created_at timestamptz not null default now(),
  settings jsonb not null default '{}'::jsonb -- nudge_enabled, weekly_enabled, etc.
);

-- the main entity
create table public.captures (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  kind text not null check (kind in ('problem','idea','observation','research')),
  state text not null default 'raw' check (state in ('raw','developed','serious','archived')),
  title text not null,             -- auto-generated short title from content
  content text not null,           -- the transcript / typed text (cleaned)
  original_transcript text,         -- pre-cleaning, for debugging
  source text not null default 'web' check (source in ('web','shortcut','siri','widget')),
  audio_duration_seconds int,
  research_status text default 'pending' check (research_status in ('pending','running','succeeded','failed','skipped')),
  -- IMPORTANT: every research_status transition must also set updated_at = now() so the
  -- hourly research-recovery cron can detect stuck 'running' rows by updated_at age.
  archive_reason text              -- set only when state='archived'. Free-form text; merge flow does NOT set this (see §4.7).
);

create index captures_user_state_idx on public.captures (user_id, state);
create index captures_user_created_idx on public.captures (user_id, created_at desc); -- dashboard list query

-- images/drawings attached to a capture
create table public.attachments (
  id uuid primary key default gen_random_uuid(),
  capture_id uuid not null references public.captures(id) on delete cascade,
  kind text not null check (kind in ('photo','drawing')),
  storage_path text not null,       -- Supabase Storage path
  created_at timestamptz not null default now()
);

-- research results
create table public.research (
  id uuid primary key default gen_random_uuid(),
  capture_id uuid not null references public.captures(id) on delete cascade,
  generated_at timestamptz not null default now(),
  model text not null,
  competitors jsonb not null default '[]'::jsonb,
  market_context text,
  recent_news jsonb not null default '[]'::jsonb,
  angles jsonb not null default '[]'::jsonb,
  confidence text check (confidence in ('low','medium','high')),
  sources_count int default 0,
  cost_usd numeric(10,4),
  raw_response jsonb          -- for debugging
);

create unique index research_one_per_capture on public.research (capture_id);

-- conversations (development Q&A sessions)
create table public.conversations (
  id uuid primary key default gen_random_uuid(),
  capture_id uuid not null references public.captures(id) on delete cascade,
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  messages jsonb not null default '[]'::jsonb,
  -- schema per message: {
  --   role: 'ai' | 'user',
  --   content: string,
  --   ts: iso-8601 string,
  --   // present on AI messages only; mirrors the conversation_turn output schema (§4.6):
  --   intent?: 'template_next' | 'adaptive_followup' | 'off_script_response',
  --   template_question_index?: number,  // 0-based
  --   session_complete?: boolean
  -- }
  turn_count int not null default 0
);

create index conversations_capture_idx on public.conversations (capture_id, started_at desc);

-- nudges
create table public.nudges (
  id uuid primary key default gen_random_uuid(),
  capture_id uuid not null references public.captures(id) on delete cascade,
  scheduled_for timestamptz not null,
  sent_at timestamptz,
  question text not null,
  responded_at timestamptz,
  response_summary text,           -- the user's answer, summarized
  skipped_reason text
);

create index nudges_capture_idx on public.nudges (capture_id);
create index nudges_scheduled_idx on public.nudges (scheduled_for);
create index nudges_sent_responded_idx on public.nudges (capture_id, sent_at, responded_at); -- eligibility query

-- links between captures (manual or AI-suggested)
-- IMPORTANT: always insert with capture_a = LEAST(id1, id2), capture_b = GREATEST(id1, id2)
create table public.links (
  id uuid primary key default gen_random_uuid(),
  capture_a uuid not null references public.captures(id) on delete cascade,
  capture_b uuid not null references public.captures(id) on delete cascade,
  kind text not null check (kind in ('manual','ai_suggested')),
  reason text,
  created_at timestamptz not null default now(),
  last_suggested_at timestamptz,   -- refreshed when AI re-suggests an existing pair
  confirmed_at timestamptz,        -- set when user confirms an AI suggestion
  check (capture_a < capture_b)    -- DB-enforced ordering; app must sort UUIDs before insert
);

-- simple unique index now that ordering is enforced by CHECK constraint
create unique index links_unique on public.links (capture_a, capture_b);

-- weekly reviews (one per week)
create table public.weekly_summaries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  week_of date not null,           -- Monday of the week covered
  generated_at timestamptz not null default now(),
  email_content_md text,           -- composed in Stage 2; null while status = 'composing'
  captures_included uuid[] not null default '{}',
  patterns_detected jsonb not null default '[]'::jsonb,
  status text not null default 'composing' check (status in ('composing','sent','failed')),
  email_message_id text,           -- Resend id for idempotency
  sent_at timestamptz,
  -- email_content_md must be populated before a row can be marked 'sent'
  constraint weekly_sent_requires_email check (status <> 'sent' or email_content_md is not null)
);

create unique index weekly_unique_per_user_week on public.weekly_summaries (user_id, week_of);

-- push subscriptions (PWA web push)
create table public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  endpoint text not null,
  p256dh_key text not null,
  auth_key text not null,
  user_agent text,
  created_at timestamptz not null default now(),
  last_used_at timestamptz
);

create unique index push_sub_unique on public.push_subscriptions (endpoint);

-- audit/event log for capture lifecycle
create table public.capture_events (
  id uuid primary key default gen_random_uuid(),
  capture_id uuid not null references public.captures(id) on delete cascade,
  event_type text not null,        -- state_change, kind_change, merged, researched, etc.
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

-- job runs (idempotency for background jobs)
create table public.job_runs (
  id uuid primary key default gen_random_uuid(),
  job_name text not null,
  idempotency_key text not null,   -- e.g. 'weekly_review:2026-04-20' or 'nudge:2026-04-23T14:00Z'
  status text not null check (status in ('running','succeeded','failed')),
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  error text,
  result jsonb
);

create unique index job_runs_idempotency on public.job_runs (job_name, idempotency_key);

-- API cost tracking
create table public.api_costs (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  provider text not null,         -- anthropic, openai, resend
  task text not null,              -- classify, research, nudge_question, transcribe, etc.
  capture_id uuid references public.captures(id) on delete set null,
  input_tokens int,
  output_tokens int,
  cost_usd numeric(10,6) not null
);

create index api_costs_created_idx on public.api_costs (created_at desc);
create index api_costs_capture_idx on public.api_costs (capture_id) where capture_id is not null; -- cost-per-capture queries
```

### 6.2 Row Level Security

Enable RLS on every table. The service-role client (used in `/api/jobs/*` and the operational-page queries, §10.9) bypasses RLS by design — these policies target the `authenticated` role that user-facing Server Components and Server Actions use.

**Direct-ownership tables.** `users`, `captures`, `weekly_summaries`, `push_subscriptions` have `id` or `user_id` that equals `auth.uid()` (§6.3). Policy per table:

```sql
alter table public.captures enable row level security;
create policy captures_owner on public.captures
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());
-- same shape for weekly_summaries (user_id), push_subscriptions (user_id).
-- users table uses (id = auth.uid()) for both USING and WITH CHECK.
```

**Child tables that reference a capture.** `attachments`, `research`, `conversations`, `nudges`, `capture_events` carry `capture_id` but no `user_id`. A `security definer` helper inlines the ownership check into every policy:

```sql
create or replace function public.capture_belongs_to_me(cap_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.captures c
    where c.id = cap_id and c.user_id = auth.uid()
  );
$$;

-- Lock the function down: no anon/public execute; only authenticated can call it.
revoke all on function public.capture_belongs_to_me(uuid) from public, anon;
grant execute on function public.capture_belongs_to_me(uuid) to authenticated;
```

Policy per child table:

```sql
alter table public.research enable row level security;
create policy research_via_capture on public.research
  for all to authenticated
  using (capture_belongs_to_me(capture_id))
  with check (capture_belongs_to_me(capture_id));
-- same shape for attachments, conversations, nudges, capture_events.
```

**`links`** references two captures. Both must belong to the user:

```sql
alter table public.links enable row level security;
create policy links_via_both_captures on public.links
  for all to authenticated
  using (capture_belongs_to_me(capture_a) and capture_belongs_to_me(capture_b))
  with check (capture_belongs_to_me(capture_a) and capture_belongs_to_me(capture_b));
```

**Why `security definer`.** The helper runs with the function owner's rights, so it can read `captures` even when the calling policy is evaluating a row in a table the user doesn't have broad SELECT on. `stable` lets the planner cache the result within a query. `set search_path = public` guards against schema-path hijacking. The function is `grant`ed only to `authenticated` so `anon` can't probe ownership.

**Operational tables (`job_runs`, `api_costs`):** RLS enabled, no policies granted to `authenticated` or `anon` — the default-deny kicks in. These are written and read exclusively by the service-role client used in `/api/jobs/*` and the internal `/settings/jobs`, `/settings/costs` pages (§10.9), which bypass RLS.

### 6.3 Seeding the single `users` row

On first successful magic-link login, a Supabase Auth trigger inserts one row into `public.users` using `auth.users.id` as the PK (so `public.users.id = auth.uid()` and RLS works). The trigger is part of the initial migration — verbatim:

```sql
-- runs after Supabase Auth inserts a new row into auth.users
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.users (id, email)
  values (new.id, new.email)
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
```

No manual seed script is required; reinstalling the app from scratch produces the same row on first login. Because enforcement of `email === OWNER_EMAIL` happens in the login server action and middleware (§14), this trigger is safe even if Supabase Auth ever receives a row for another email — the stranger's session is destroyed before they can read or write anything, and the orphaned `users` row is harmless.

## 7. Technology Stack

| Layer | Technology | Notes |
|---|---|---|
| Frontend framework | Next.js 15 (App Router) | React Server Components + Client Components |
| Language | TypeScript, `strict: true` | No `any`, no untyped JSON |
| Styling | Tailwind CSS v4 | + a few shadcn/ui primitives (Button, Dialog, Input, Textarea) |
| State | Server components + React hooks | No Redux / Zustand needed at this scale |
| Forms | react-hook-form + Zod resolvers | |
| Validation | Zod | Every API boundary, every LLM JSON output |
| Database | Supabase Postgres | `public` schema within a **dedicated free-tier** Supabase project (separate from biddrop.app); see §6 |
| Auth | Supabase Auth (magic link) | Single user, magic link to user's email |
| Storage | Supabase Storage | Photos, drawings |
| Hosting | Vercel | Free Hobby tier sufficient for v1 |
| Scheduled jobs | Upstash QStash | Free tier (500 msgs/day); schedules survive deploys |
| LLM (cheap tasks) | Anthropic Haiku 4.5 (`claude-haiku-4-5-20251001`) | Classification, nudge question gen |
| LLM (complex tasks) | Anthropic Sonnet 4.6 (`claude-sonnet-4-6`) | Research, weekly summary, pattern detection, conversations |
| Web search tool | Anthropic `web_search` tool | Built into Claude API |
| Transcription | OpenAI Whisper (`whisper-1`) | ~$0.006/min |
| Email | Resend | Free tier: 100/day; we need ~4/month |
| Error tracking | Sentry (free tier) | Catches silent cron failures |
| Push notifications | Web Push Protocol + VAPID | Via `web-push` npm library |
| Runtime validation | Zod | |
| Package manager | pnpm | Faster, deterministic |
| Linting / format | ESLint + Prettier | Strict config |

### 7.1 npm packages (non-exhaustive, key ones)

```
next, react, react-dom
@supabase/supabase-js, @supabase/ssr
@anthropic-ai/sdk
openai  (for Whisper only)
resend
@upstash/qstash
web-push
@serwist/next  (service worker + PWA; replaces abandoned next-pwa)
zod
react-hook-form, @hookform/resolvers
tailwindcss, @tailwindcss/postcss
class-variance-authority, clsx
date-fns, date-fns-tz
@sentry/nextjs
```

## 8. Architecture Overview

### 8.1 High-level diagram (prose)

```
iPhone (Action Button / Home Screen PWA)
   ↓ HTTPS
Next.js on Vercel
   ├── /app/* route handlers (UI)
   ├── /app/api/* route handlers (API endpoints)
   ├── /app/api/jobs/* (cron/webhook targets)
   └── /lib/services/* (AI, transcription, email, etc.)
        ↓                    ↓                        ↓
   Supabase              Anthropic API             OpenAI Whisper
   (Postgres, Auth,      (Sonnet + Haiku +         (transcription)
    Storage)              web_search)

   QStash (Upstash)
   ├── cron: 10am/5pm daily → POST /api/jobs/nudge
   ├── cron: Sunday 5pm → POST /api/jobs/weekly-review/stage1 → chains to stage2
   └── delayed jobs on capture → POST /api/jobs/research

   Resend → user's email inbox
   Web Push (VAPID) → user's devices
   Sentry → error capture
```

### 8.2 Request paths

- **UI pages**: Server Components fetch data directly via Supabase server client (SSR, signed-in cookies).
- **Mutations**: Server Actions for form submissions; REST route handlers for Shortcut / external callers.
- **Background jobs**: POST endpoints under `/app/api/jobs/*`, secured by QStash signature verification (see §10.2).

### 8.3 Runtime declarations

Routes that handle file uploads or stream large bodies must opt out of the Edge runtime:

```ts
// Required on /api/capture/route.ts and /api/capture/[id]/route.ts
export const runtime = 'nodejs'
export const maxDuration = 60  // seconds; Vercel Hobby limit
```

All `/api/jobs/*` routes also use `runtime = 'nodejs'` (Sonnet calls can take 20–30s; Edge has a 30s hard wall that cannot be raised).

## 9. Project Structure

```
forge/
├── app/
│   ├── (auth)/
│   │   └── login/
│   │       └── page.tsx            # magic link form
│   ├── auth/
│   │   └── callback/
│   │       └── route.ts            # supabase auth callback — URL is /auth/callback (outside the (auth) route group so the path isn't stripped)
│   ├── (app)/
│   │   ├── layout.tsx               # signed-in layout (nav, toasts)
│   │   ├── page.tsx                 # dashboard: recent captures, serious ideas
│   │   ├── capture/
│   │   │   ├── page.tsx             # new capture (voice/text/photo/draw)
│   │   │   └── [id]/
│   │   │       └── page.tsx         # capture detail, research, conversation
│   │   ├── review/
│   │   │   └── [weekId]/
│   │   │       └── page.tsx         # in-app weekly review walkthrough
│   │   ├── serious/
│   │   │   └── page.tsx             # serious ideas list
│   │   ├── archive/
│   │   │   └── page.tsx
│   │   ├── settings/
│   │   │   └── page.tsx             # nudges on/off, weekly on/off, export (no timezone — constant in v1)
│   │   └── export/
│   │       └── route.ts             # JSON dump of everything
│   ├── api/
│   │   ├── capture/
│   │   │   ├── route.ts             # POST new capture (from Shortcut or web)
│   │   │   └── [id]/
│   │   │       ├── route.ts         # GET/PATCH/DELETE
│   │   │       ├── classify/route.ts
│   │   │       ├── research/route.ts
│   │   │       └── state/route.ts
│   │   ├── conversation/
│   │   │   └── [captureId]/route.ts # POST turn
│   │   ├── nudges/
│   │   │   └── [id]/respond/route.ts
│   │   ├── push/
│   │   │   └── subscribe/route.ts   # register push subscription
│   │   └── jobs/
│   │       ├── nudge/route.ts       # called by QStash at 10am/5pm
│   │       ├── weekly-review/
│   │       │   ├── stage1/route.ts  # QStash Sunday 5pm: pattern detection + summaries
│   │       │   └── stage2/route.ts  # QStash-chained: email composition + send
│   │       ├── research/route.ts    # called by QStash after capture
│   │       └── research-recovery/route.ts  # hourly: resets stuck 'running' research jobs
│   ├── layout.tsx                    # root layout, metadata, manifest link
│   ├── manifest.webmanifest
│   ├── icon.png
│   └── sw.ts                         # serwist source: push + notificationclick handlers, precache manifest injection point
├── components/
│   ├── ui/                           # shadcn primitives (Button, Dialog, Input, etc.)
│   ├── capture/
│   │   ├── VoiceRecorder.tsx
│   │   ├── TextCapture.tsx
│   │   ├── PhotoCapture.tsx
│   │   └── DrawingCanvas.tsx
│   ├── conversation/
│   │   ├── QuestionCard.tsx
│   │   └── MessageList.tsx
│   ├── nudge/NudgeBanner.tsx
│   └── review/ReviewWalkthrough.tsx
├── lib/
│   ├── supabase/
│   │   ├── server.ts                 # server client (SSR)
│   │   ├── client.ts                 # browser client
│   │   └── service.ts                # service-role client for jobs
│   ├── ai/
│   │   ├── anthropic.ts              # client factory, retry wrapper, cost tracking
│   │   ├── openai.ts                 # Whisper client
│   │   ├── classify.ts               # classify_capture task
│   │   ├── research.ts               # research_idea task (uses web_search tool)
│   │   ├── nudge.ts                  # generate_nudge_question task
│   │   ├── conversation.ts           # conversation turn logic
│   │   ├── patterns.ts               # pattern_detection task
│   │   ├── merge.ts                  # merge_captures task (§4.7)
│   │   ├── weekly.ts                 # weekly_summary composition
│   │   └── prompts/                  # loaded at runtime (see §11)
│   │       ├── classify_capture.md
│   │       ├── research.md
│   │       ├── nudge_question.md
│   │       ├── conversation_system.md
│   │       ├── pattern_detection.md
│   │       ├── merge_captures.md
│   │       └── weekly_summary.md
│   ├── push/
│   │   ├── vapid.ts
│   │   └── send.ts
│   ├── email/
│   │   └── resend.ts
│   ├── jobs/
│   │   ├── qstash.ts                 # QStash client + signature verify
│   │   └── idempotency.ts            # job_runs helpers
│   ├── env.ts                        # Zod-validated env at startup
│   ├── logger.ts                     # structured logger
│   └── types/
│       └── db.ts                     # generated from Supabase
├── db/
│   └── migrations/                   # Supabase CLI-managed .sql files
├── scripts/
│   └── generate-db-types.ts          # runs `supabase gen types typescript` → lib/types/db.ts
├── tests/
│   ├── unit/
│   │   ├── classify.test.ts
│   │   ├── research-schema.test.ts
│   │   └── idempotency.test.ts
│   └── integration/
│       └── capture-flow.test.ts
├── public/
│   ├── icons/                        # PWA icons
│   ├── robots.txt                    # Disallow: / (keep forge.mom out of search results)
│   └── sw.js                         # GENERATED by @serwist/next during `next build` from app/sw.ts — gitignored, do NOT hand-edit
├── middleware.ts                        # session check + OWNER_EMAIL enforcement on every request
├── .env.example
├── .env.local                         # gitignored
├── next.config.ts
├── package.json
├── pnpm-lock.yaml
├── tsconfig.json
├── tailwind.config.ts
├── serwist.config.ts                   # service worker caching rules
├── vercel.json
├── README.md
└── SPEC.md                             # this document, lives with the code
```

## 10. Engineering Practices (the "professional" section)

### 10.1 Type safety

- `tsconfig.json`: `"strict": true`, `"noUncheckedIndexedAccess": true`, `"exactOptionalPropertyTypes": true`.
- Generate Supabase DB types via `supabase gen types typescript` and commit to `lib/types/db.ts`. Regenerate on every migration.
- Every external boundary (API request/response, LLM output, form input) has a Zod schema. Use `.safeParse` and handle errors — never trust.
- No `any`. Use `unknown` + narrow, or `zod.infer`.

### 10.2 Secrets & environment

- `lib/env.ts` uses Zod to validate `process.env` at module load. App throws at startup if any required var is missing.
- `.env.example` enumerates every var with a comment. Required before first commit.
- Secrets: `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `RESEND_API_KEY`, `QSTASH_TOKEN`, `QSTASH_CURRENT_SIGNING_KEY`, `QSTASH_NEXT_SIGNING_KEY`, `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `SHORTCUT_API_TOKEN` (for iOS Shortcut auth), `SENTRY_DSN`.
- Every cron/job endpoint verifies QStash signature (`@upstash/qstash/nextjs` helper). If signature invalid → 401.
- The Shortcut endpoint (`POST /api/capture?source=shortcut`) verifies `Authorization: Bearer <SHORTCUT_API_TOKEN>`.

### 10.3 Error handling

- Never swallow. Every catch block either re-throws, logs to Sentry with context, or handles a known case explicitly.
- External API calls (Anthropic, OpenAI, Resend) wrapped in `withRetry(fn, { retries: 2, backoff: 'exponential' })` helper.
- Known failure modes have explicit UI: "Research failed — retry" button, "Transcription failed — edit manually" fallback.
- All errors logged with a correlation ID that ties UI → server → LLM call.

### 10.4 Idempotency

Idempotency has two layers. Workers must use both — relying on `job_runs` alone creates a "skip forever on a dead `running` row" hazard that `ON CONFLICT DO NOTHING` does not solve by itself.

**Layer A — business invariants (source of truth).**
A background job is idempotent if its **outcomes** are never duplicated, independent of `job_runs` rows. Examples:

- `weekly_summaries`: unique `(user_id, week_of)` + `status` transitions (`composing → sent`). If `status = 'sent'` on re-entry, return 200 `already_sent`.
- Research: one `research` row per `capture_id` (unique index). If it exists, return 200 `already_sent`.
- Nudges: eligibility gated by existing `nudges` rows (`sent_at` within 20h, `responded_at` within 48h per §4.4), not by `job_runs` alone.
- Email sends: Resend idempotency key (e.g. `weekly:{week_of}`, `nudge:{nudge_id}`).

The worker **always checks Layer A first** and returns 200 early if the business outcome already exists. Only if Layer A says "not done yet" does it proceed to Layer B.

**Layer B — `job_runs` coordination.**
Each run uses an `idempotency_key` (e.g. `nudge:{YYYY-MM-DDTHH}`, `weekly:{YYYY-MM-DD}:stage1`, `research:{capture_id}`). On entry the worker **claims** the run by inserting a `job_runs` row with `status = 'running'`, `started_at = now()`; if a row already exists with `status = 'failed'`, the worker updates it back to `running` and bumps `started_at = now()` to re-claim (allows redelivery after a prior failure or a stale-lease sweep). If the row is already `running` (live lease) or `succeeded`, exit.

**Stale `running` rows.** If `started_at` is older than **20 minutes**, the `research-recovery` cron (§4.3, §12.1) marks the row `status = 'failed'`, `error = 'stale_lease'`. This convention — `failed` + `stale_lease` — is used **everywhere** in the spec (no separate `interrupted` status, to keep the CHECK constraint tight). A redelivery can then re-claim.

**Re-entry after crash.** The worker always runs Layer A first (e.g. weekly already `sent` → return 200 with `already_sent`, no Resend call). Then claims Layer B. This satisfies Principle §3.8 — no duplicate emails, research, or nudges under redelivery, crash, or QStash retry.

**Do not** rely on `ON CONFLICT DO NOTHING` on `job_runs` without Layer A + the stale-lease recovery, or workers will skip forever on a dead `running` row.

### 10.5 Prompts as data

- Stored in `lib/ai/prompts/*.md` as plain text with `{{variable}}` placeholders.
- Loaded at runtime via `loadPrompt('classify_capture', { content: ... })` that reads the file, substitutes vars, returns the string.
- Each prompt file starts with a comment block:
  ```
  <!--
  task: classify_capture
  model: haiku-4-5
  inputs: content (string)
  output: { kind: 'problem'|'idea'|'observation'|'research' }
  temperature: 0
  -->
  ```
- Changing a prompt is a PR that only touches a markdown file. No code change required.

### 10.6 Testing strategy (minimal but real)

- **Unit tests** (Vitest):
  - Zod schemas parse expected LLM outputs (with fixtures of real responses).
  - Idempotency helper correctly short-circuits duplicate runs.
  - Prompt template substitution works.
- **Integration test** (one):
  - Full capture → transcribe (mocked) → classify (mocked) → persist → research enqueued. Verifies the happy path.
- No UI tests for v1. Not worth it for solo project.
- `pnpm test` runs locally and in CI (GitHub Actions on PR).

### 10.7 Database migrations

- Supabase CLI: `supabase migration new <name>` creates a timestamped SQL file.
- Never edit the DB through the Supabase dashboard. Schema lives in migrations.
- `supabase db push` applies migrations. Production deploys run this automatically (or manually, per deployment step — see §10.10).
- Rollback strategy: write down migration down-queries in a comment in each file.

### 10.8 Observability

- **Sentry** for uncaught errors. Every server-side error captured with user + capture context.
- **Structured logging** via `lib/logger.ts`: JSON logs in prod, pretty in dev. Key events: capture created, classification result, research start/end, nudge sent, push sent, weekly review sent.
- **API cost tracking**: every Anthropic / OpenAI call writes a row to `api_costs`. Dashboard page at `/settings/costs` shows monthly burn.
- **Job status UI**: `/settings/jobs` lists recent `job_runs` with status. Helps diagnose silent failures.

### 10.9 Security

- Supabase RLS enabled on every table. Service-role key only used in `/api/jobs/*` endpoints (server-only, QStash-signed).
- CSP header set in `next.config.ts`.
- `X-Robots-Tag: noindex` header added globally in `next.config.ts` headers config. `public/robots.txt` contains `Disallow: /`. Prevents forge.mom from appearing in search results.
- No secrets ever sent to client. Service role key fenced to server code.
- Rate limiting on public endpoints via Upstash Ratelimit (stretch; not critical for single-user).
- Magic-link login only (no passwords).

### 10.10 CI/CD

- GitHub + Vercel integration: push to `main` auto-deploys to production; PR branches deploy to preview URLs.
- GitHub Actions on PR: `pnpm lint`, `pnpm typecheck`, `pnpm test`. Must pass to merge.
- Database migrations: run via Supabase CLI in a GitHub Action step on deploy to `main`, gated by a required manual approval on the Vercel deployment.
- `.env` vars mirrored between Vercel and `.env.local`.

### 10.11 Documentation

- **README.md** at root: setup, env vars, how to run locally, how to deploy, where logs live. Also: iOS Shortcut setup (Appendix B), the audio-MIME compatibility matrix per device (§4.1), and restore-from-export notes (Appendix C).
- **SPEC.md** (this file): kept in sync with the code. When a feature ships, update the spec.
- Code comments explain *why*, not *what*. The *what* should be obvious from the code.
- **`package.json` engines pin:** `"engines": { "node": ">=20.11.0", "pnpm": ">=9" }` so Vercel and local dev agree on the Node version. Vercel reads `engines.node` to select the runtime.

## 11. AI Prompt Architecture

### 11.1 Task registry

Every LLM call corresponds to a named task. Tasks are defined in `lib/ai/tasks.ts`:

```ts
export const TASKS = {
  classify_capture: {
    model: 'claude-haiku-4-5-20251001',
    promptFile: 'classify_capture.md',
    // ClassifyCaptureSchema = z.object({
    //   kind: z.enum(['problem','idea','observation','research']),
    //   title: z.string().min(1).max(80),  // 4–8 words, Title Case, no trailing punctuation
    // })
    outputSchema: ClassifyCaptureSchema,
    maxTokens: 200,
    temperature: 0,
  },
  research_idea: {
    model: 'claude-sonnet-4-6',
    promptFile: 'research.md',
    outputSchema: ResearchSchema,
    maxTokens: 4000,
    temperature: 0.3,
    tools: [
      // web_search is Anthropic's server tool. The `type` field must match the CURRENT
      // dated identifier from Anthropic's docs at implementation time — e.g. `web_search_YYYYMMDD`.
      // Do NOT hard-code a version string from this spec; look it up when wiring the tool.
      // The SDK will reject an unknown or stale identifier. max_uses caps web search calls per run.
      { type: '<current-web-search-tool-version>', name: 'web_search', max_uses: 8 },
      { name: 'submit_research', description: 'Submit final structured research result', inputSchema: ResearchSchema },
    ],
  },
  nudge_question: {
    model: 'claude-haiku-4-5-20251001',
    promptFile: 'nudge_question.md',
    outputSchema: NudgeQuestionSchema,
    maxTokens: 300,
    temperature: 0.7,
  },
  conversation_turn: {
    model: 'claude-sonnet-4-6',
    promptFile: 'conversation_system.md',
    outputSchema: ConversationTurnSchema, // { message, intent, template_question_index, session_complete }
    maxTokens: 500,
    temperature: 0.6,
    // Output via 'submit_turn' tool (same tool-as-output pattern as research)
  },
  pattern_detection: {
    model: 'claude-sonnet-4-6',
    promptFile: 'pattern_detection.md',
    outputSchema: PatternsSchema,
    maxTokens: 2000,
    temperature: 0.2,
  },
  weekly_summary: {
    model: 'claude-sonnet-4-6',
    promptFile: 'weekly_summary.md',
    outputSchema: WeeklySummarySchema,
    maxTokens: 4000,
    temperature: 0.5,
  },
  merge_captures: {
    model: 'claude-sonnet-4-6',
    promptFile: 'merge_captures.md',
    // MergeCapturesSchema = z.object({
    //   title: z.string().min(1).max(80),
    //   content: z.string().min(1),
    //   kind: z.enum(['problem','idea','observation','research']),
    // })
    // One prompt file; branches internally on the {{merge_type}} variable
    // ('apply' | 'unify' | 'enrich'). Inputs: both sources' title/content/kind
    // plus a compact research summary (competitor names + market_context
    // paragraph only, not the full research blob). See §4.7.
    outputSchema: MergeCapturesSchema,
    maxTokens: 2000,
    temperature: 0.5,
    tools: [
      { name: 'submit_merge', description: 'Submit the synthesized merged capture', inputSchema: MergeCapturesSchema },
    ],
    // Output via tool-as-output pattern (§11.2).
  },
} as const;
```

### 11.2 Runner

```ts
async function runTask<T extends keyof typeof TASKS>(
  task: T,
  vars: Record<string, string>,
  context?: { captureId?: string }
): Promise<z.infer<typeof TASKS[T]['outputSchema']>>
```

The runner:
1. **Pre-call budget check**: queries `SUM(api_costs.cost_usd)` for the current calendar month (UTC; the cutover instant doesn't matter for a monthly budget). If > `MAX_MONTHLY_COST_USD`, throws `BudgetExceededError` (logged to Sentry, surfaced in UI, no LLM call made).
2. Loads prompt, substitutes vars.
3. Calls Anthropic with the right model, tools, params.
4. **Extracts the structured output.** Two patterns, chosen per task:
   - **Tool-as-output** (`research_idea`, `conversation_turn`): the task defines a terminal tool (`submit_research`, `submit_turn`) whose `input_schema` mirrors `outputSchema`. The runner finds the last `tool_use` block in the response with `name === <terminal_tool>` and takes its `input` as the raw result. If no terminal tool call is present, that's an error (retry once with an instruction to "call <tool> as your final action").
   - **JSON-text** (`classify_capture`, `nudge_question`, `pattern_detection`, `weekly_summary`): the prompt instructs the model to emit JSON only; the runner parses the text content block. Retry once with stricter JSON instructions on parse failure.
5. Validates the raw result with Zod `.safeParse`. Retry once with stricter instructions on failure.
6. Logs to `api_costs`.
7. Returns typed result.

Task definitions in §11.1 should mark which output pattern they use (via presence of a terminal tool in `tools[]`); the runner branches on that.

### 11.3 System prompt baseline (applied to all tasks)

All tasks include a short system prompt that sets tone:

> You are Forge, a thinking partner for a single user developing startup ideas and thinking through problems. Your stance is "skeptical friend": you pressure-test ideas, surface holes, and ask the uncomfortable question before offering support. You avoid motivational filler. You are brief. You always respond in the exact JSON shape specified below.

### 11.4 Prompt iteration workflow

- User edits `lib/ai/prompts/<task>.md` and pushes a PR.
- PR preview deployment lets user run a test capture end-to-end.
- Merge → live.
- Version history is in git.

## 12. Background Jobs & Scheduling

### 12.1 QStash schedules

Three QStash schedules (configured via dashboard or code):

```
daily-nudge-morning    → https://forge.mom/api/jobs/nudge?slot=morning          cron: 0 10 * * *   (TZ: America/New_York)
daily-nudge-evening    → https://forge.mom/api/jobs/nudge?slot=evening          cron: 0 17 * * *   (TZ: America/New_York)
weekly-review          → https://forge.mom/api/jobs/weekly-review/stage1        cron: 0 17 * * 0   (TZ: America/New_York)
research-recovery      → https://forge.mom/api/jobs/research-recovery           cron: 0 * * * *    (UTC; timezone irrelevant)
```

The nudge and weekly schedules use `cron_tz: America/New_York` (the `APP_SCHEDULE_TZ` constant — see §4.4 and §16). The `research-recovery` cron runs hourly in UTC; timezone is irrelevant because it scans absolute timestamps. QStash schedule config is one-time manual setup via the Upstash dashboard or `@upstash/qstash` SDK on first deploy.

The `research-recovery` cron does **two** things (see §4.3 and §10.4):
1. Resets captures with `research_status = 'running'` and `updated_at < now() - 5 minutes` to `pending` and re-enqueues a research job.
2. Sweeps `job_runs` rows with `status = 'running'` and `started_at < now() - 20 minutes` across all job names, marking them `status = 'failed'`, `error = 'stale_lease'` so the next QStash redelivery can re-claim them.

### 12.2 On-demand jobs (triggered from capture endpoint)

```
research-capture  → POST /api/jobs/research  body: { captureId }  delay: 0s
```

Enqueued right after a capture is saved.

### 12.3 Job endpoint contract

Each `/api/jobs/*` endpoint, following the two-layer pattern in §10.4:
1. Verifies QStash signature. Reject 401 if invalid.
2. Parses body with Zod.
3. **Layer A check** — queries the business-state table (e.g. `research` by `capture_id`, `weekly_summaries` by `week_of`, `nudges` eligibility). If the outcome already exists, return 200 `already_sent` / `already_handled` **without** touching `job_runs`.
4. **Layer B claim** — inserts a `job_runs` row with `status = 'running'`; on conflict, updates a `failed` / `stale_lease` row to `running` to re-claim, or returns 200 if the existing row is `running` (live lease) or `succeeded`.
5. Does work inside try/catch. On failure: update `job_runs` to `failed` with error message, log to Sentry, re-throw 500 so QStash retries.
6. On success: update `job_runs` to `succeeded`, return 200 with result summary.

Stale `running` rows are swept by the `research-recovery` cron (§12.1) and reset to `failed` + `stale_lease` after 20 minutes.

## 13. Push Notifications & iOS Integration

### 13.1 PWA setup

- `app/manifest.webmanifest` with `display: "standalone"`, icons, `start_url: "/"`, name, theme_color.
- Service worker is managed via **`@serwist/next`** (the actively-maintained fork of next-pwa; `next-pwa` is abandoned and breaks on Next.js 15). Wire it in `next.config.ts`:
  ```ts
  import withSerwistInit from '@serwist/next';
  const withSerwist = withSerwistInit({
    swSrc: 'app/sw.ts',            // hand-written source (push + notificationclick handlers, Serwist precache init)
    swDest: 'public/sw.js',        // compiled output — add to .gitignore
    cacheOnNavigation: true,
    disable: process.env.NODE_ENV === 'development',
  });
  export default withSerwist(nextConfig);
  ```
- `app/sw.ts` is the **source** (edit this). `public/sw.js` is **build output** (do not hand-edit, do not commit — `.gitignore`). The browser registers `/sw.js`; serwist produces it fresh on every `next build`.
- Caching strategy (defined inside `app/sw.ts` via Serwist's runtime caching API, or in a small `serwist.config.ts` that `app/sw.ts` imports):
  - `/_next/static/*`, icons, fonts: **CacheFirst**, long TTL.
  - HTML pages: **NetworkFirst**, 3s timeout, cached shell fallback.
  - `/api/*`: **NetworkOnly** — never cache API responses.
  - `/capture` page: **NetworkOnly** — offline captures go to IndexedDB, not SW cache.
- User must install the app to their Home Screen for iOS push to work (this is an Apple requirement, not a choice).

### 13.2 VAPID keys

- Generated once via `npx web-push generate-vapid-keys`, stored in env.
- Public key delivered to client for subscription.
- Private key used by server to sign pushes.

### 13.3 Subscription flow

1. User opens installed PWA.
2. On first open, a soft UI prompt: "Turn on nudges?" → if yes, request `Notification.permission`.
3. Register service worker, subscribe via `registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey })`. Both flags are required: `userVisibleOnly: true` is a hard requirement on Chromium (throws `NotSupportedError` otherwise) and on iOS Safari 16.4+; `applicationServerKey` is the VAPID public key.
4. POST subscription (endpoint + keys) to `/api/push/subscribe`.
5. Server stores in `push_subscriptions` table.

### 13.4 Push send

- `lib/push/send.ts` takes a subscription + payload, uses `web-push` library to deliver.
- On `410 Gone` from the push service, delete the subscription row.
- Payload is small JSON: `{ title, body, url }`. Service worker displays it.

### 13.5 iOS Shortcut setup (user-side, documented in README)

The user creates an iOS Shortcut with these actions:
1. **Record Audio** (until stop tapped).
2. **Get Contents of URL** → `POST https://forge.mom/api/capture` → `Authorization: Bearer <SHORTCUT_API_TOKEN>` → form field `audio` = recorded file.
3. **Show Notification**: "Captured ✓" (brief confirmation).

Assigned to the Action Button via iOS Settings → Action Button → Shortcut. Also added to Control Center via iOS Settings → Control Center. Also triggerable by "Hey Siri, run Forge capture."

## 14. Security & Auth

- Magic link auth (Supabase Auth) to a hardcoded single allowed email (`OWNER_EMAIL` env var).
- **Whitelist enforcement via Next.js middleware** (`middleware.ts` at root): runs before every request. If a valid session exists but `session.user.email !== OWNER_EMAIL`, the middleware destroys the session cookie and redirects to `/login?error=unauthorized`. This is the enforcement point — no separate callback check needed.
- The `/auth/callback` route exchanges the code for a session and then immediately redirects to `/`; middleware handles the email check on that redirect.
- Note: Supabase will still send a magic-link email to any address entered on the login form (it doesn't know to block it). For a personal app this is acceptable — a stranger who enters a random email gets a link that lands them on the unauthorized redirect.
- **Login-form spam guard (recommended):** the `/login` server action performs a server-side comparison `email === OWNER_EMAIL` before calling `supabase.auth.signInWithOtp`, so Supabase only sends magic-link emails for the owner's address. Pair with a lightweight IP rate limit (Upstash Ratelimit, 5 requests / 10 min per IP) so an attacker who guesses the email can't trigger a flood of emails. This is the only public write endpoint that isn't already auth'd, so hardening it is cheap.
- All UI routes under `(app)/` protected by the same middleware session check.
- All `/api/*` endpoints (except `/api/jobs/*` which use signature auth) check session.
- `/api/capture?source=shortcut` uses bearer token auth (Shortcut token is in env + embedded in the Shortcut).

## 15. Observability & Error Handling

- **Sentry** initialized via `@sentry/nextjs` with env-gated DSN.
- Server errors tagged with `capture_id`, `task`, `job_name`.
- Client errors (mostly capture flow) captured with user context.
- `/settings/health` internal page shows: last 10 job runs, last 10 LLM calls (task + tokens + cost + duration), unsent nudges, stuck `research_status='running'` captures older than 5 minutes.

## 16. Environment & Secrets

See `.env.example`:

```
# Supabase
SUPABASE_URL=
SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=

# Owner
OWNER_EMAIL=you@example.com

# Anthropic
ANTHROPIC_API_KEY=

# OpenAI (Whisper only)
OPENAI_API_KEY=

# Resend
RESEND_API_KEY=
RESEND_FROM_ADDRESS=forge@you.com

# QStash
QSTASH_TOKEN=
QSTASH_CURRENT_SIGNING_KEY=
QSTASH_NEXT_SIGNING_KEY=

# Web Push
VAPID_PUBLIC_KEY=
VAPID_PRIVATE_KEY=
VAPID_SUBJECT=mailto:you@example.com

# Shortcut auth
SHORTCUT_API_TOKEN=  # long random string

# App
NEXT_PUBLIC_APP_URL=https://forge.mom
SENTRY_DSN=

# Scheduling
APP_SCHEDULE_TZ=America/New_York   # single constant; no per-user timezone in v1 (see §4.4)

# Budgets
# MAX_MONTHLY_COST_USD is a hard pre-call check in the task runner (§11.2) — calls abort if exceeded.
# MAX_RESEARCH_COST_USD is documentation/alerting only; per-research cost is bounded by max_tokens + max_uses (§4.3).
MAX_RESEARCH_COST_USD=0.25
MAX_MONTHLY_COST_USD=25
```

## 17. Build Plan (phased)

Each phase ships a working, deployed app. Don't merge a phase until it's usable end-to-end.

### Phase 0: Foundations (1–2 sessions)
- Next.js + TS + Tailwind + shadcn/ui scaffold.
- Supabase project schema + RLS + migrations.
- Magic link auth working end-to-end (single allowed email).
- Empty dashboard page requires auth.
- Env validation via Zod.
- Sentry installed.
- CI: lint + typecheck + test runs on PR.
- **Exit criteria:** deploy to Vercel, log in via email, see empty dashboard.

### Phase 1: Capture (2–3 sessions)
- `/capture` page with four modes (voice, text, photo, draw).
- Voice recorder component + Whisper transcription API route.
- Capture entity persists to DB.
- Classification via Haiku 4.5 runs on save; assigns kind.
- Capture detail view shows transcript, kind, state.
- Manual state transitions (raw/developed/serious/archived).
- iOS Shortcut endpoint (`POST /api/capture?source=shortcut`) works.
- README has Shortcut setup guide.
- **Exit criteria:** can capture a voice memo from Action Button and see it classified and stored.

### Phase 2: Research & Development Conversation (2–3 sessions)
- QStash configured; `/api/jobs/research` endpoint works.
- Auto-research triggers on `idea` and `research` captures.
- Capture detail view shows research section with competitors, market context, angles, news.
- In-app conversation UI: structured Q&A per template.
- Conversation persistence in `conversations` table.
- Skip / Skip+reason buttons.
- `raw → developed` state transition on first conversation turn completed.
- **Exit criteria:** capture an idea, see research, have a conversation that reaches completion per §4.6, state flips to `developed`.

### Phase 3: Nudges + Weekly Review (2–3 sessions)
- PWA manifest + service worker + VAPID push registration.
- `/api/push/subscribe` endpoint.
- QStash schedules for 10am/5pm/Sunday.
- Nudge job: select capture, generate question, send push.
- Nudge response flow (tap notification → app → answer).
- Weekly review job: composes summary, runs pattern detection, sends email + push.
- `/review/:weekId` walkthrough screen.
- Resend email template.
- **Exit criteria:** receive a real push at 10am, answer it; receive a Sunday email.

### Phase 4: Polish (1–2 sessions)
- Manual linking UI.
- Merge captures flow.
- `/settings/costs`, `/settings/health`, `/settings/jobs`.
- Export to JSON (`/export`).
- Dashboard quality-of-life (serious ideas filter, search).
- **Exit criteria:** ready for daily use for 6 months without edits.

## 18. Acceptance Criteria (v1)

A working v1 satisfies **all** of:

1. User can hit Action Button, speak an idea, release button; within 30 seconds, the capture appears on the dashboard, transcribed, classified, and (if `idea`) with research attached or in progress.
2. User receives push notifications at 10am and 5pm on days with eligible captures.
3. User receives a Sunday 5pm email and push with the week's captures, research summaries, and any AI-detected patterns.
4. User can have a structured conversation in the app about any capture, via voice or text, reach the completion rule in §4.6, and see the capture auto-promoted to `developed`.
5. User can explicitly promote a capture to `serious` or `archive` it.
6. User can export all data to JSON.
7. No data is lost if the user captures offline then reconnects.
8. No duplicate emails, duplicate nudges, or duplicate research runs under any conditions.
9. All code passes `pnpm lint && pnpm typecheck && pnpm test` in CI.
10. Deployed on Vercel + a **dedicated free-tier Supabase project** with monthly incremental cost verified < $10. Supabase is $0 for this project (free tier, separate from biddrop.app's paid project under the same org).

## 19. Out of Scope (v1)

The following are deferred explicitly:
- Multi-user / sharing ideas.
- Native iOS app (PWA only; revisit if push limitations hurt).
- Real-time collaborative conversation.
- Voice reply *from* the notification (requires native app).
- Desktop-specific UI (web responsive is sufficient).
- Full-text search (dashboard filter + kind filter only).
- Tagging / custom buckets beyond the four kinds.
- Calendar integration.
- Rich text editor for captures.
- Audio playback (audio is transient; we keep transcript only).
- Export formats other than JSON.
- Automated backups / restore tooling beyond the JSON export (see Appendix C for the v1 posture — export is the backup; Supabase's daily free-tier backups are the second line).
- Server-side audio transcoding / FFmpeg (the v1 allowlist covers iOS formats Whisper accepts directly; see §4.1).

## 20. Open Questions for the User

Confirm or override before implementation:

1. **App name.** Forge, Sparks, Crucible, Anvil, Muse, or something else?
2. **Domain.** ✅ `forge.mom` (purchased via Vercel). Add `X-Robots-Tag: noindex` to all responses and `robots.txt Disallow: /` to prevent Google surfacing this under biddrop.app searches.
3. **Owner email.** The single allowed login email — confirm.
4. **Timezone.** ✅ `America/New_York`, hard-coded as `APP_SCHEDULE_TZ` for v1. No per-user timezone column on `users` table.
5. **Weekly review day/time.** ✅ Sunday 5:00 PM US Eastern.
6. **Nudge quiet hours.** Should nudges be suppressed on certain days (e.g., weekends), or always fire at 10am/5pm?
7. **Email "from" address.** Requires a verified domain in Resend — confirm you'll set this up, or use Resend's default sender for v1.
8. **Research retry policy.** When research fails, auto-retry once at next nudge window, or only on user tap?
9. **Supabase schema isolation.** ✅ New free-tier Supabase project (separate from biddrop.app). Uses `public` schema. Zero incremental cost; free projects can coexist with paid ones under the same org.
10. **PWA install UX.** Show an "install this app" banner on first visit in Safari, or leave it to the user to find Add-to-Home-Screen?

## Appendix A: Cost Projection

Assuming 3 captures/week, 60% classified as `idea`/`research` (auto-research runs), daily nudges every day, Sunday review:

| Item | Monthly |
|---|---|
| Whisper transcription (3 × 30s × 4 weeks) | ~$0.05 |
| Classification (12 captures × Haiku) | ~$0.02 |
| Research (~7 captures × Sonnet + web search) | ~$0.80 |
| Nudge questions (60 × Haiku) | ~$0.10 |
| Conversation turns (~30 × Sonnet) | ~$0.45 |
| Pattern detection (4 × Sonnet) | ~$0.20 |
| Weekly summary (4 × Sonnet) | ~$0.30 |
| **Anthropic + OpenAI total** | **~$2** |
| Resend | Free |
| Sentry | Free |
| QStash | Free |
| Vercel | Free (Hobby) |
| Supabase | $0 (dedicated free-tier project, separate from biddrop.app) |
| **Total incremental cost** | **~$2–5/month** |

## Appendix B: Shortcut iOS setup (user documentation stub)

Included in `README.md` with screenshots: create Shortcut with Record Audio → POST to API → return "Captured ✓". Bind to Action Button. Add to Control Center.

## Appendix C: Data export format

`GET /export` (authenticated) returns a single JSON file. The contract is "everything important is exportable" (§3.5); operational tables are deliberately excluded.

**Included:** `captures` (with nested `research`, `conversations`, `nudges`, `attachments` metadata), `weekly_summaries`, `links`, a filtered view of `capture_events` (merge lineage only — rows where `event_type IN ('merged_into_target','merged_from_sources')`, see §4.7), and optionally `push_subscriptions` (small, user-visible).

**Excluded from the main export** (operational / not user data): `api_costs`, `job_runs`, and the rest of `capture_events` beyond merge lineage. These are available via `/settings/costs` and `/settings/jobs` for the owner, but they are implementation detail — not something the user would want to pipe into a backup or a future successor app.

```json
{
  "version": "1.1",
  "exported_at": "ISO-8601",
  "user": { "email": "...", "schedule_timezone": "America/New_York" },
  "captures": [ { ...full row, with nested research, conversations, nudges, attachments metadata } ],
  "weekly_summaries": [ ... ],
  "links": [ ... ],
  "merge_events": [ { capture_id, event_type, payload, created_at } ],
  "push_subscriptions": [ ... ]
}
```

`user.schedule_timezone` is the constant `"America/New_York"` — there is no `timezone` column on `users` in v1 (§4.4, §6.1). Emitting it in the export keeps the JSON shape forward-compatible with a future per-user-TZ feature.

**Backup / restore posture for v1:** the export is the backup. There is no scheduled backup job and no restore tooling; if Supabase loses the project, the owner re-runs migrations and re-imports the most recent export manually (a script for this is not in v1 scope — see §19). Supabase's own daily free-tier backups are the second line of defense.

## Appendix D: Non-obvious implementation notes

- **iOS PWA push requires the PWA to be installed to Home Screen.** The README must tell the user to do this as step one after first login, otherwise nothing will nudge them.
- **Service worker caching.** Do NOT aggressively cache HTML — stale versions of the capture page have caused duplicate submissions in other PWAs. Cache only static assets; HTML and API responses are network-first.
- **Recording audio in browser.** Use `MediaRecorder` with feature detection via `isTypeSupported()`. Chromium picks `audio/webm;codecs=opus`; Safari falls through to `audio/mp4` (Safari has no webm support in `MediaRecorder`). Whisper accepts both. See §4.1 for the full allowlist.
- **Timezone handling.** Store all timestamps in UTC in Postgres. "Local" anywhere in the UI or docs means `APP_SCHEDULE_TZ` = `America/New_York` in v1 (no per-user timezone — §4.4). Convert UTC → Eastern at display time with `date-fns-tz`. QStash cron spec uses `cron_tz: America/New_York` for nudge and weekly schedules; the hourly research-recovery cron runs in UTC.
- **Anthropic web_search tool version.** `web_search` is a server tool whose `type` field uses a dated identifier (`web_search_YYYYMMDD`). Look up the current version in Anthropic's docs at implementation time — do **not** hard-code whatever string happens to appear elsewhere in this spec; it will rot. Pick the latest variant supported by Sonnet 4.6 at the time you wire it.
- **Rate limits.** Anthropic rate limits are per-key per-minute. For a single user this never matters, but wrap calls in exponential backoff anyway for resilience against transient 529s.
- **Clock skew on cron.** QStash cron runs can drift by ~30 seconds. Don't compare `sent_at` to `scheduled_for` strictly in tests.

---

*End of spec. Feed this file to Claude Code or Cursor as the primary source of truth. Keep it updated as the product evolves.*
