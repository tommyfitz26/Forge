# Forge — UI Redesign Spec (v2)

**This is Phase 4 of the roadmap in `SPEC.md`** — a complete redesign with additional features and new pages, layered on top of the shipped capture / research / nudge / develop-export / weekly-review pipeline.

**Status:** revised draft after interview with Thomas (15 rounds, ~50 decisions). Nothing implemented yet. Read this end-to-end before approving Phase 1.

**Companion artifacts:**
- `forge-hearth.html` — click-through prototype showing the visual language and 25 page templates.
- `SPEC.md` — the source-of-truth spec for the existing app (capture pipeline, AI tasks, data model, jobs). The redesign **must not break** anything in here.
- `HANDOFF.md` — implementation handoff; "Phase 4 — Redesign (awaiting brief from Tommy)" is exactly what this document is.

---

## 1. Goals

1. Preserve every load-bearing piece of the existing app: capture latency, voice-first flow, Action Button shortcut, classification, research, nudges, develop-prompt export, weekly review.
2. Add a project-anchored workspace layer on top: the capture stream still flows in, but raw captures can graduate into Projects, and projects become the place where Threads (structured expansion canvases), Journal entries, and external collaborators live.
3. Make the workspace feel coherent across pages — same shell, same components, same keyboard shortcuts everywhere.
4. Replace the existing dashboard list with a richer Today / Stream / Workshop axis without disrupting capture habits formed over the soak period.
5. Stay incremental. Every phase ships something usable; Phase 1 is purely visual; data-model changes are deferred until Phase 4 of *this* spec.

## 2. Non-goals

- Replacing the AI pipeline. The five existing prompts (classify_capture, research, nudge_question, pattern_detection, weekly_summary) stay; entity extraction is added by **extending** classify_capture, not replacing it.
- Replacing capture flow components. `TextCapture` / `VoiceCapture` / `PhotoCapture` get a light refactor; logic preserved.
- Adding in-app AI conversation. The Develop flow stays as prompt-export to claude.ai (per `SPEC.md` §4.6 Phase 2d).
- Multi-tenant from day 1. `owner_id` on every new table (forward-compatible), but no sharing UX.
- Onboarding. First-time experience is empty buckets and figure-it-out (deliberate).
- Settings beyond theme / account / sync.

## 3. What's already shipped (don't break)

Per `HANDOFF.md`, Phases 0–3 are live on `forge.mom`:

- Auth + magic-link login + OWNER_EMAIL gating (`proxy.ts`).
- Capture: text / voice / photo + iOS Shortcut endpoint.
- Whisper transcription + Haiku 4.5 classification → 4 kinds (problem/idea/observation/research) + 4–8 word title.
- Sonnet 4.6 + `web_search` auto-research on `idea`/`research` captures.
- Daily nudges (10am / 5pm ET) via Web Push + QStash + Haiku 4.5.
- Develop-prompt export (deterministic templating; no LLM call) → user pastes into claude.ai.
- Sunday 5pm ET weekly review (pattern_detection + weekly_summary + Resend email + push + `/review/[weekId]` digest).
- Hourly research-recovery cron.
- Sentry observability with DSN-gated dynamic imports.
- 4 QStash schedules live; all keys rotated.

The redesign assumes all of this continues working unchanged.

## 4. Concept mapping (mockup → existing model)

After alignment with `SPEC.md`:

| Mockup concept | Existing concept | Net new in Phase 4? |
|---|---|---|
| **Stream** (was "Inbox") | Existing capture list (`/`) | Renamed + restyled, same behavior |
| **Capture composer modal** | `TextCapture` / `VoiceCapture` / `PhotoCapture` | New chrome around existing components (light refactor) |
| **Today** | (new) | New page; aggregates captures + projects + journal + focus |
| **This week** | (new — separate from `/review/[weekId]`) | New page; live agenda from captures + intentions + Google calendar sync |
| **Top of mind** (was "Pinned") | (new pin flag on captures + projects + threads) | New |
| **Workshop** (was "Studio") | (new — projects don't exist today) | New; replaces "Serious" as the graduation bucket |
| **Project detail** | (new) | New |
| **Threads** | The structured-expansion-sections feature deferred in `SPEC.md` §4.10 | Net new, but replaces a planned future feature |
| **Journal** | (new — text captures with daily cadence today) | New view; backed by a new table |
| **Scraps** (was "Sketches") | Captures with `state='raw'` (loosely) | New view, possibly filtering existing data |
| **Tags** (free-form) | (new) | New; lives alongside Kinds |
| **Kinds** (problem/idea/observation/research) | The four classification kinds in `SPEC.md` §4.2 | Just a new sidebar surface for existing data |
| **Archive** | `/archive` (already exists) | Restyle only |
| **Trash** | (new — 30-day soft-delete) | New |
| **Capture detail (Research/Develop panels)** | `/capture/[id]` (already exists) | Restyle only — panels and Develop flow stay |
| **Weekly review** | `/review/[weekId]` (already exists) | Stays separate; restyle only |
| **Library** | `research` table + future web-clip / quote captures | **Deferred to Phase 5** |
| **Atlas** | (new — entity extraction would populate) | **Deferred to Phase 5** |
| **Map** | `links` table (exists; populated by pattern_detection) | **Deferred to Phase 5** |

## 5. Naming — final terminology

Every renaming decision from the interview, in one table.

| Concept | Final name | Notes |
|---|---|---|
| Captures-not-yet-filed bucket | **Stream** | Replaces "Inbox" |
| Saved-references library | **Library** | Replaces "Vault" |
| Project list / hub | **Workshop** | Replaces "Studio" |
| Long-form project notes | **Threads** | Kept |
| Unfinished drafts | **Scraps** | Replaces "Sketches" |
| Daily writing | **Journal** | Kept |
| Knowledge graph view | **Map** | Kept |
| Held / starred items | **Top of mind** | Replaces "Pinned" |
| Kept-but-inactive bucket | **Archive** | Kept |
| Soft-delete (30 days) | **Trash** | Kept |
| People / places / things | **Atlas** | Kept |
| Project's inner list | **Parts** | Generic across project types (was "Tracks") |
| Capture types | **Note / Voice / Photo / Web clip** | Quote merged into Note |
| Library shelves | **Audio / Visual / Text / Process** | Plain nouns |
| Default tag set | **#idea, #problem, #observation, #research** | These are also the four KINDS |
| "Hearth" branding | dropped | Just "Forge" |
| Streak language | **"Day streak"** | Was "Days warm" |
| Daily intention copy | **"Today's focus"** | Was "Tonight's intention" |
| Project-of-the-evening framing | **"On the bench" / "Tonight's bench"** | Kept |
| Lyrical section copy | kept | "How the room talks to itself" voice stays |

## 6. Information architecture — sidebar (Phase 1)

```
Top
  Today                   ⌂
  This week               ◐
  Stream            (n)   ⌖
  Top of mind       (n)   ⚐

Workshop
  All projects      (n)   ◆
  · (project name)        · per active project
  Journal                 ✎
  Threads           (n)   ≡
  Scraps            (n)   ○

Kinds
  # idea            (n)   ◇
  # problem         (n)   ⊘
  # observation     (n)   ◎
  # research        (n)   ⌕

Tags                      (free-form, autocomplete)
  (user-defined, populated as you tag)

Storage
  Archive                 ⌬
  Trash                   ⌫

Practice
  Day streak              (count + grid)
```

**Deferred to Phase 5** (knowledge layer wave): Library, Atlas, Map.

## 7. Design system

### 7.1 Layout shell (3-pane, with collapsible inspector)

```
+-----------------------------------------------------------+
|                        titlebar                           |
+----------+--------------------+-----------------+---------+
|          |                    |                 |  insp   |
| sidebar  |        main        |    inspector    | toggle  |
|  240px   |        1fr         |   ~290px (open) |         |
|          |                    |   collapsed: 0  |         |
+----------+--------------------+-----------------+---------+
|                        statusbar                          |
+-----------------------------------------------------------+
```

- Inspector is **collapsible**; default open. Toggle in titlebar; persists across sessions. **Collapsed state is 0px** (fully gone, full-width main content) — not a thin rail. The titlebar toggle is the only re-open affordance.
- Status bar **kept**: sync state, totals, keyboard shortcut hints, theme indicator.
- Titlebar: traffic lights (cosmetic), Forge mark, breadcrumb (URL-derived), theme picker, ⌘K command palette trigger, ⌘N capture button, inspector toggle.

### 7.2 Color tokens

Two themes shipped in Phase 1: **Graphite (default)** and **Light**.

**Graphite (cool charcoal + warm ember accent):**
```
--bg-0:#0e0f12  --bg-1:#15171c  --bg-2:#1c1f24  --bg-3:#24272d
--ink-0:#e6e8ec --ink-1:#b6bcc6 --ink-2:#7d8593 --ink-3:#5a6170 --ink-4:#3f444c
--ember:#e8a76b --ember-dim:#c47f3e
--gold:#d9b878  --moss:#8eaa66  --plum:#c08aa8  --sky:#8eb1c8  --hot:#e08866
```

**Light (cool paper + deep copper accent):**
```
--bg-0:#f6f7f9  --bg-1:#ffffff  --bg-2:#f1f2f5  --bg-3:#e8eaef
--ink-0:#15181c --ink-1:#3d4148 --ink-2:#6b707a --ink-3:#989da6 --ink-4:#c5c8cd
--ember:#c66a2a --ember-dim:#9c4f1f
--gold:#a07a25  --moss:#5a7a32  --plum:#8a4a72  --sky:#4a7290  --hot:#c46640
```

Theme persists via cookie (SSR-readable to avoid first-paint flash) + localStorage on the client.

### 7.3 Typography

- **Serif** (display, decks, journal, intention): Cormorant Garamond → Iowan Old Style → Hoefler Text → Georgia.
- **Sans** (UI chrome): Inter → system stack.
- **Mono** (IDs, counts, kbd, timestamps): JetBrains Mono → ui-monospace stack.

### 7.4 Iconography

**Mix:** lucide-react for sidebar / buttons / functional UI; typographic glyphs (◐ ⌖ ⚐ ◆ ✎ ≡ ○ ⌕) preserved for decorative accents (the flame brand mark, the lamp glow, ember dots, status bar markers).

### 7.5 Project covers

**Both gradients and photo uploads**, gradient is the default. New projects pick a gradient at creation; users can swap to a photo any time. Schema: `cover_kind enum('gradient'|'photo')`, `cover_gradient_key`, `cover_photo_path`.

Default gradients are tied to the project's `kind_seed` (the kind of the originating capture):
- `idea` → ember/copper (was "album")
- `research` → gold (was "essay")
- `problem` → moss (was "ceramic launch")
- `observation` → plum (was "film")

User can override.

## 8. Lifecycle states & graduation (revised)

`SPEC.md` §4.2 defines `state` as `raw / developed / serious / archived`. The redesign retires `serious` and replaces graduation with project anchoring.

**New `state` enum:** `raw / developed / archived` (drop `serious`).

**New field on captures:** `is_project boolean default false`.

**Graduation flow:**
- Capture is created → `state = 'raw'`, `is_project = false`.
- User runs Develop → marks developed → `state = 'developed'`.
- User right-clicks the capture → "Make this a project" → `is_project = true`, the capture becomes the seed for a new `projects` row that references it.
- Either lifecycle endpoint can lead to `state = 'archived'`.

The old `state = 'serious'` is treated as deprecated. Existing rows (if any) migrate to `state = 'developed'` + `is_project = true` if a project should be inferred, otherwise `state = 'developed'`. Concrete migration TBD when Phase 4 schema lands.

## 9. Pages — Phase 1 ship list

Routes that exist after Phase 1, keyed to your existing app:

| Route | New / existing | Backed by |
|---|---|---|
| `/today` | new (replaces `/`) | Static initially; live data Phase 4 |
| `/this-week` | new | Derived from captures + intentions; calendar sync Phase 4+ |
| `/stream` | renamed from `/` | Existing dashboard list, restyled |
| `/top-of-mind` | new | New `pins` table |
| `/workshop` | new | New `projects` table |
| `/projects/[id]` | new | Project detail with tabbed layout |
| `/projects/[id]/{overview,parts,threads,refs,people,timeline}` | new | Nested layout for tabs |
| `/journal` | new | New `journal_entries` table |
| `/threads` | new | New `threads` table (or capture-canvas view) |
| `/threads/[id]` | new | Thread detail (kind-aware structured sections) |
| `/scraps` | new | Captures with `state='raw'` and not project-anchored |
| `/kinds/[kind]` | new | Filter view: captures + threads + projects of that kind |
| `/tags/[slug]` | new | Free-form tag filter view |
| `/capture/[id]` | existing | Stream item detail; Research + Develop panels stay |
| `/review/[weekId]` | existing | Weekly review; restyle only |
| `/archive` | existing | Restyle |
| `/trash` | new | 30-day soft-delete bucket |

**Deferred (Phase 5 knowledge layer wave):**
- `/library` and `/library/[shelf]`
- `/atlas` and `/atlas/[id]`
- `/map`

## 10. Modals

### 10.1 Command palette (⌘K)
Sections: Quick navigation, Quick actions, People (Phase 5+), Recent. Full-text search across all content. Single search surface — no separate `/search` page.

Triggered from: ⌘K keybind, click search field in titlebar, click `⌘K · summon` in status bar.

### 10.2 Capture composer (⌘N)

Four tabs (Quote merged into Note): **Note / Voice / Photo / Web clip**.

**Three capture surfaces, one capture system.** The redesign adds a third entry point on top of the two that already exist; all three call the same server actions and hit `/api/capture`.

| Surface | Context | Modes | Project picker | Auth |
|---|---|---|---|---|
| **iOS Shortcut / Action Button** *(unchanged)* | Away from screen — driving, walking, mid-conversation | Voice only | None — UI-less recording, latency sacred | Bearer token |
| **Mobile `/capture` page** *(restyled in Phase 4.1; no behavior change)* | Phone in hand, PWA opened intentionally | Note · Voice · Photo · Web clip | Optional, defaults to "Stream / no project" | Session cookie |
| **Desktop composer modal** *(new in Phase 4.2)* | At-desk, mid-flow, ⌘N pops over current page | Note · Voice · Photo · Web clip | Optional in modal footer; defaults to current project if you're on a project page | Session cookie |

The Action Button bypasses every UI — that's the sacred latency path (`SPEC.md` Principle #1). The mobile page and the desktop modal share **the same composer logic**: the existing `TextCapture` / `VoiceCapture` / `PhotoCapture` components (after light refactor). Only chrome differs — mobile is a full page with big buttons; desktop is a modal that closes back to your previous context.

**Web clip tab** is new on the mobile page and the desktop modal; populates `captures.source_url` and `captures.media_kind = 'clip'`. Existing four-kind classification still runs against the clipped content.

**Voice in the modal:** simpler than `/capture/voice` — same recording engine and 180s hard cap, but drop the at-distance safety features (countdown, amber/red elapsed warnings). At-desk capture doesn't need them.

**AI auto-filing:** when classification confidence ≥ **0.95** and a suggested project matches, the capture auto-files. Below threshold: capture lands in Stream with an inline "this looks like Quiet Light, file?" suggestion you can confirm or override.

### 10.3 Keyboard shortcuts (global)
| Combo | Action |
|---|---|
| ⌘K / Ctrl+K | Command palette |
| ⌘N / Ctrl+N | New note (capture composer) |
| ⌘⇧V | New voice capture |
| ⌘M | Open Map (Phase 5+) |
| ⌘I | Edit today's focus |
| Esc | Close any modal |

## 11. Today's focus (the lamplit intention card)

- Header copy: **"Today's focus"** (temporally neutral, replaces "Tonight's intention").
- Behavior: **optional, gently prompted**. A morning push notification asks for the focus if not set by ~9am ET. No modal blocks the day.
- Push notification copy: **"What's the one thing on the bench today?"** (pairs with the "On the bench" framing already in the app).
- Stored in a new `intentions` table: `(id, owner_id, day date, body text)`.

## 12. Streak

Renamed: **"Day streak"** (was "Days warm").

A day counts toward the streak if **any** of the following happen during it:
- A capture (any kind) is created
- Today's focus is set
- A journal entry is written
- A capture is marked `developed` or promoted to project

**Grace period:** none in Phase 4. Missing a day resets the streak to 0. A "streak freeze" power-user feature (e.g., one free pass per month) is intentionally deferred — easier to add later than to take away.

Stored in a daily-cron-populated `streak_days(owner_id, day, sources text[])` table (definition in Section 15).

## 13. Cross-references & linking

When you write a thread / journal entry / note that mentions another capture / thread / project / person:

- **AI suggests links on save.** After save, AI proposes "link this thread to Quiet Light? Maren?" — you accept or skip.
- **Wikilinks (`[[...]]`) and @-mentions are not in scope for Phase 1.** May add in Phase 5 alongside Atlas.

The `links` table (already exists per `SPEC.md` §6.1) gets a new `kind` value: `'inferred'` for AI-suggested links the user hasn't explicitly confirmed. Existing values: `'manual'`, `'ai_suggested'` (pattern_detection only), now also `'inferred'`.

## 14. AI integration touchpoints

**Existing prompts that stay unchanged:** `classify_capture`, `research`, `nudge_question`, `weekly_summary`.

**Extended:** `classify_capture` adds entity-extraction output. The single Haiku call now returns `{ kind, title, entities: [{ name, kind: 'person'|'place'|'thing' }] }`. Phase 5 wires entities into Atlas.

**Cadence changes:**
- Pattern detection currently runs in the weekly review job. **No change** — runs once per week, populates `links` rows for the Map (which ships in Phase 5).

**Project filing AI:**
- After classification, if confidence ≥ **0.95** (conservative — easier to relax than tighten) and the capture matches an existing project's content, AI auto-sets `project_id`. Below threshold, the capture stays in Stream with a "file to project?" suggestion.
- The classification call already runs; project-filing piggybacks on it (extra return field: `suggested_project_id` + `suggested_project_confidence`).

**Develop flow stays exactly as today.** Capture detail page keeps the Research panel (Claude API research output, displayed) and the Develop panel (deterministic prompt generator, no LLM call, user copies into claude.ai).

## 15. Data model — Phase 4 additions

All new tables get `owner_id uuid` (forward-compatible with future multi-tenant), `created_at`, `updated_at`, `deleted_at` (soft-delete with 30-day window).

```sql
-- Projects (capture-anchored, but with explicit "+ New" available)
projects (
  id uuid pk,
  owner_id uuid not null,
  seed_capture_id uuid null references captures(id),  -- null when explicitly created
  slug text,
  title text not null,
  deck text,
  kind_seed text,                -- 'idea' / 'problem' / 'observation' / 'research'
  cover_kind text default 'gradient' check (cover_kind in ('gradient','photo')),
  cover_gradient_key text,
  cover_photo_path text,
  stage text,                    -- 'in_studio' / 'drafting' / 'glazing' / 'pre_production' / 'paused' / 'wrapped'
  status text default 'active' check (status in ('active','archived')),
  parts_kind text default 'parts',  -- generic; per-project label
  opened_at, target_at,
  progress_pct numeric,
  last_activity_at timestamptz,
  metadata jsonb default '{}'
)

-- Captures gain a project anchor + is_project flag + media metadata
alter table captures
  add column project_id uuid references projects(id) on delete set null,
  add column is_project boolean default false,
  add column suggested_project_id uuid references projects(id),
  add column source_url text null,             -- present iff captured as a Web clip
  add column media_kind text default 'note'    -- modality, distinct from cognitive `kind`
    check (media_kind in ('note','voice','photo','clip'));
-- And the state CHECK constraint loses 'serious':
--   check (state in ('raw','developed','archived'))

-- Threads (kind-aware structured-expansion canvases on top of captures)
threads (
  id uuid pk,
  owner_id uuid not null,
  capture_id uuid not null references captures(id) on delete cascade,
  kind text not null,            -- mirrors capture.kind
  sections jsonb not null,       -- seeded from a per-kind template at thread creation
  status text default 'in_progress' check (status in ('in_progress','complete','archived')),
  pinned boolean default false,
  unique (capture_id)            -- one thread per capture
)
-- Section templates (seeded into `sections` on thread creation; user can edit values, not section keys/titles in Phase 1):
--   idea (5):
--     [{key:'customer',     title:'Customer',           body:''},
--      {key:'why_now',      title:'Why now',            body:''},
--      {key:'wedge',        title:'Wedge',              body:''},
--      {key:'counter',      title:'Strongest counter',  body:''},
--      {key:'must_be_true', title:'What must be true',  body:''}]
--   problem (4):
--     [{key:'who_experiences', title:'Who experiences it', body:''},
--      {key:'how_often',       title:'How often',          body:''},
--      {key:'real_cost',       title:'Real cost',          body:''},
--      {key:'prior_attempts',  title:'Prior attempts',     body:''}]
--   observation (3):
--     [{key:'why_captured', title:'Why I captured this',     body:''},
--      {key:'connections',  title:'Connections',             body:''},
--      {key:'hidden_kind',  title:'Hidden problem or idea',  body:''}]
--   research (3):
--     [{key:'the_question',         title:'The question',           body:''},
--      {key:'decision_implications',title:'Decision implications',  body:''},
--      {key:'depth',                title:'Depth (scan or investigation)', body:''}]
-- These mirror the develop-prompt templates in SPEC.md §4.6 — the prompt asks Claude these
-- questions; the thread is where the user records the answers.

-- Journal entries
journal_entries (
  id uuid pk,
  owner_id uuid not null,
  written_at date not null,
  body text not null,
  tags text[] default '{}'
)

-- Tags (free-form labels; the four kinds are NOT in this table — they're capture.kind)
tags (
  id uuid pk,
  owner_id uuid not null,
  slug text not null,
  color text,
  unique (owner_id, slug)
)

-- Pins ("Top of mind")
pins (
  owner_id uuid not null,
  source_kind text not null,     -- 'capture' / 'thread' / 'project' / 'journal'
  source_id uuid not null,
  pinned_at timestamptz default now(),
  primary key (owner_id, source_kind, source_id)
)

-- Today's focus
intentions (
  id uuid pk,
  owner_id uuid not null,
  day date not null,
  body text not null,
  unique (owner_id, day)
)

-- Versioning (history per save)
content_versions (
  id uuid pk,
  source_kind text not null,     -- 'thread' / 'journal_entry'
  source_id uuid not null,
  body_snapshot text not null,
  saved_at timestamptz default now()
)

-- Project members (Phase 5 — Atlas + project linking)
-- DEFERRED: project_members, atlas_entities

-- Streak credit (one row per (owner, day) with which sources counted)
streak_days (
  owner_id uuid not null,
  day date not null,
  sources text[] not null,       -- 'capture' / 'focus' / 'journal' / 'developed' / 'promoted'
  primary key (owner_id, day)
)
```

**No new tables for Library / Atlas / Map** — those wait for Phase 5.

## 16. Phased plan (revised)

### Phase 4.1 — Visual shell + sidebar buckets routed to placeholder pages (~4–5 days)

**Goal:** every sidebar item navigates somewhere. Pages render with sample / hardcoded data (or, for existing routes, their current content lightly restyled).

- Port CSS tokens (Graphite + Light) to `app/globals.css` `@theme` block.
- Build new shell as `app/(app)/layout.tsx`. Sidebar / titlebar / inspector / status bar as components in `components/layout/`.
- Theme picker as a client island; cookie-backed for SSR.
- Replace unicode glyphs in chrome with `lucide-react`.
- Create routes under `app/(app)/` for: `/today`, `/this-week`, `/stream`, `/top-of-mind`, `/workshop`, `/journal`, `/threads`, `/scraps`, `/kinds/[kind]`, `/tags/[slug]`, `/trash`.
- Restyle existing `/`, `/capture/[id]`, `/archive`, `/review/[weekId]` to match.
- Cmd palette opens; navigation works; capture button opens existing `/capture` page (modal comes in 4.2).
- Static / sample data in pages with no DB backing yet.

**Deliverable:** PR that re-skins the entire app and adds empty new pages. Existing capture/research/nudge/develop/weekly-review continue to work unchanged.

### Phase 4.2 — Capture composer modal + project picker UI (~3–4 days)

**Goal:** ⌘N opens a modal with all four capture types; light-refactor existing components into it.

- Build `<CaptureModal>` and `<CmdPalette>` as proper client components.
- Light-refactor existing `TextCapture` / `VoiceCapture` / `PhotoCapture`: strip own chrome, keep all logic. Wire into modal tabs.
- New tab: **Web clip** — URL input + optional note. Maps to a new capture kind (or, more simply, a Note with a `source_url` field — schema choice in 4.3).
- Project picker dropdown in modal footer (placeholder list until 4.3 ships projects).

**Deliverable:** ⌘N anywhere opens the composer; mobile `/capture` page unchanged; Action Button untouched.

### Phase 4.3 — Data model: projects + threads + journal + tags + pins + intentions (~5–8 days)

**Goal:** real data behind the new pages.

Order, smallest blast radius first:
1. `projects` + capture-anchor migration (`captures.project_id`, `captures.is_project`, drop `'serious'` from state CHECK).
2. Right-click capture → "Make this a project" flow + `/workshop` + `/projects/[id]/overview`.
3. `threads` table + `/threads` + `/threads/[id]` (kind-aware section schema in jsonb).
4. `journal_entries` + `/journal`.
5. `tags` + `/tags/[slug]` + autocomplete.
6. `pins` + `/top-of-mind`.
7. `intentions` + Today's focus card + morning push integration.
8. `streak_days` + materialized practice card.
9. `content_versions` table + version recording on every thread / journal save.

Each gets: migration, RLS policies, generated types, server actions, page hookup.

**Deliverable:** Today / Workshop / Threads / Journal all show real data. `serious` state retired.

### Phase 4.4 — AI integration: classify extension + project auto-filing + cross-ref suggestions (~3–5 days)

**Goal:** AI participates in the new structure.

- Extend `classify_capture.md` to also extract entities and suggest a project. Update `ClassifyCaptureSchema` in `lib/ai/`.
- Project auto-filing on capture save: if `confidence >= 0.9` and `suggested_project_id` non-null → set `project_id`. Otherwise present as a suggestion in Stream.
- Cross-reference suggestion: after thread / journal save, run a lightweight Haiku call that reads the body and proposes links. Surfaces as a "suggest links" panel.

**Deliverable:** capturing an idea automatically lands it in the right project. Writing a thread that mentions another thread shows a suggested link.

### Phase 5 — Knowledge layer wave (deferred)

Library + Atlas + Map ship together as a coherent chunk once captures + projects + threads have accumulated meaningful data:
- Library: view over `research` rows + new web-clip / quote captures.
- Atlas: `atlas_entities` table populated by classify-extracted entities + `project_members` linking entities to projects.
- Map: full-screen `/map` with force-directed d3-force layout, edge filters, time decay.

Pre-existing items also parked here per `HANDOFF.md`:
- Manual linking UI (already-deferred).
- `merge_captures` task.
- `/settings/{costs,health,jobs}` dashboards.
- JSON export.
- Real PWA icons.

### Phase 6 — Mobile + offline polish (out of this spec's scope)

Full responsive parity from Phase 4.1 onward (the user wants mobile-aware design from day 1, but polish + touch-target tuning + offline-first conflict resolution land here).

## 17. File mapping (mockup → real codebase)

For Phase 4.1.

| Mockup | Live app destination |
|---|---|
| `:root` CSS vars | `app/globals.css` `@theme { ... }` block |
| `[data-theme="light"]` overrides | `app/globals.css` |
| `.app` grid (titlebar / sidebar / main / inspector / statusbar) | `app/(app)/layout.tsx` (server component shell + client islands) |
| Sidebar | `components/layout/Sidebar.tsx` (server) |
| Titlebar with theme picker + cmd trigger + capture trigger | `components/layout/Titlebar.tsx` (client) |
| Inspector frame (slot pattern) | `components/layout/Inspector.tsx` |
| Status bar | `components/layout/StatusBar.tsx` |
| Theme picker | `components/ui/theme-picker.tsx` (client island; cookie-backed) |
| Cmd palette | `components/cmd-palette.tsx` (client) |
| Capture modal (Phase 4.2) | `components/capture/CaptureModal.tsx` |
| Existing TextCapture/VoiceCapture/PhotoCapture | restyled in place; logic untouched |

Phase 4.2 adds `components/ui/` primitives (NavItem, ListCard, ListRow, Panel, Tabs, ProjHero, FactCard, etc.).

Phase 4.3 adds `lib/db/<entity>.ts` query files and `app/(app)/<route>/actions.ts` mutation files.

## 18. Resolved decisions (from interview rounds)

Quick reference for what we landed on:

- Inbox → **Stream**. Vault → **Library** (deferred). Studio → **Workshop**. Threads kept. Sketches → **Scraps**. Journal kept. Map kept (deferred). Atlas kept (deferred). Pinned → **Top of mind**. Archive + Trash kept.
- Project parts: generic **"Parts"** word.
- Hearth name: dropped.
- Streak: **"Day streak"**.
- Intention copy: **"Today's focus"**.
- "On the bench" / "Tonight's bench" kept.
- Capture types: 4 (Note / Voice / Photo / Web clip — Quote merges into Note).
- Library shelves (when Phase 5 ships): Audio / Visual / Text / Process.
- Default tags = the four KINDS: #idea, #problem, #observation, #research. (Plus user-defined free-form tags.)
- Lyrical copy in section heads: kept.
- Capture flow: file at capture time (composer has project picker).
- AI filing: auto-files high-confidence; suggests below.
- Today's focus: optional + morning nudge.
- Streak credit: capture, focus, journal, develop/promote — all four count.
- Conversations tab: dropped from Atlas (mentions only when Phase 5 ships).
- Atlas entity merging: always prompt.
- Trash: 30 days fixed.
- Search: cmd palette only, full-text.
- Multi-tenant: single-user now, owner_id everywhere for future.
- Versioning: every save = new version.
- Tags: free-form with autocomplete.
- Phase 1 first build: visual shell + sidebar buckets routed to placeholder pages.
- Mobile: full responsive parity from day 1.
- PWA: aggressive offline-first.
- Icons: mix lucide (chrome) + glyphs (accents).
- Project covers: gradients default + photo upload optional.
- Inspector: collapsible, default open.
- Status bar: keep with everything.
- Onboarding: none — empty buckets, figure it out.
- Settings page (Phase 4): theme + account + sync only.
- Defer from Phase 4: Trash + Map + Library + Atlas. (Map, Library, Atlas all in Phase 5 wave; Trash basic version ships in 4.1 with empty state.)
- Capture detail page: stays with Research + Develop panels.
- Develop panel: prompt generator (no LLM call), user pastes into claude.ai.
- Research panel: existing Claude API call output.
- This week: derived from captures + Google Calendar sync (calendar in Phase 4+).
- Map: force-directed d3-force when it ships (Phase 5).
- Default landing: Today.
- Project creation: from capture (right-click) AND explicit "+ New project" button in Workshop.
- Push notifications: keep as-is.
- Cross-references: AI suggests on save, user confirms.
- Pattern detection cadence: weekly (unchanged).
- Entity extraction: extend classify_capture prompt.
- Capture composer integration: light refactor (recommended).
- Existing SPEC.md: read end-to-end; the four kinds are foundational and drive AI behavior; Develop is prompt-export; capture latency is sacred.
- `state` enum loses `serious`; new `is_project` boolean replaces it.
- Sidebar has BOTH Kinds (4 fixed) and Tags (free-form).

**Final round (Section 19 questions, all approved):**
- Project covers: **gradient defaults tied to `kind_seed`** (idea=ember/copper, research=gold, problem=moss, observation=plum). Photo upload optional override.
- Voice tab in modal: simplified at-desk UI (same recording engine + 180s cap, drop the at-distance safety overlays).
- Web clip kind: **add `source_url text null` and `media_kind enum` to captures**, do NOT add a 5th value to the kind enum. Four-kind classification taxonomy stays clean.
- Threads' kind-aware sections: locked. Mirror the develop-prompt templates from `SPEC.md` §4.6 — full mapping in Section 15 schema comment block.
- Tag autocomplete: frequency desc, recency tiebreaker.
- AI auto-file confidence threshold: **0.95** (conservative).
- Calendar sync: **Google only** in Phase 4; iCal not in scope.
- Streak grace period: **reset on miss**; no freezes in v1.
- Inspector collapsed state: **0px** (fully gone); titlebar toggle is the only re-open affordance.
- Morning focus push copy: **"What's the one thing on the bench today?"**

## 19. Open questions (remaining)

None — all resolved. Phase 4.1 is unblocked.

## 20. What's NOT in this spec

- Mobile UI polish (touch targets, swipe gestures, offline conflict resolution).
- Pre-Phase-4 SPEC.md items (Sentry, capture pipeline, weekly review).
- The Library / Atlas / Map knowledge-layer pages — Phase 5.
- Manual linking UI, merge_captures task — Phase 5.
- Settings dashboards beyond theme/account/sync — Phase 5.
- Public sharing / multi-tenant — out of scope indefinitely.
- Email digest changes — weekly review email continues unchanged.

## 21. Review checklist

All approved by Thomas (2026-04-29).

- [x] Naming (Section 5) — final.
- [x] Sidebar layout (Section 6) — final.
- [x] Color tokens (Section 7.2) — final.
- [x] Inspector collapse behavior (Section 7.1) — 0px (fully gone); toggle in titlebar.
- [x] Capture composer modal scope (Section 10.2) — three-surface model documented; modal is desktop-only convenience; mobile and Action Button untouched.
- [x] State enum migration (Section 8 + Section 15) — drop `serious`; add `is_project boolean`; add `source_url` + `media_kind` to captures.
- [x] Phased plan (Section 16) — 4.1 visual shell (~4–5d) → 4.2 composer modal (~3–4d) → 4.3 data model (~5–8d) → 4.4 AI integration (~3–5d).
- [x] All Section 19 open questions — resolved (see Section 18 Final round).

**Phase 4.1 is unblocked.** Standard workflow per `HANDOFF.md`: branch per slice → PR → CI green + smoke test on `forge.mom` → squash-merge.

---

*End of v2. Update as decisions get made; tag versions in git.*
