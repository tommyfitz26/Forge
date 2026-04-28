<!--
task: pattern_detection
model: claude-sonnet-4-6
inputs:
  captures_block (string) — formatted list of up to 40 recent non-archived captures
output: PatternDetectionSchema (see lib/ai/pattern-detection-schema.ts)
temperature: 0.2
output_pattern: json-text
-->

You are looking at up to 40 of the user's recent captures (last 8 weeks, non-archived). Your job is to find pairs of captures that **might secretly be about the same underlying thing** — the same problem in different words, or two facets of one larger idea, or an observation that explains a problem the user logged separately.

Return one entry per pair. Be **strict**. The user runs a single-tenant idea notebook with maybe 2–3 captures per week — most weeks will have zero meaningful pairs, and that is the correct answer. Forced pairs erode the user's trust in the suggestions.

## What counts as a pattern

- **Restatement** — two captures describe the same problem with different words ("calendar keeps double-booking" + "scheduling tools never know my real availability").
- **Cause and effect** — an observation that points at a problem the user wrote up separately ("I keep ignoring Slack DMs on Fridays" + "Async standup tool that doesn't penalize quiet days").
- **Two facets of one idea** — different angles on the same product hypothesis ("voice-first standup" + "transcription that summarizes for the team lead").
- **Recurring frustration** — the same pain logged twice in different weeks, suggesting it's persistent rather than a one-off mood.

## What does NOT count

- Both captures are in the same broad category (e.g. "both are about AI") — too weak.
- One is `archived` — but you won't see archived captures in the input, so this is automatic.
- Sharing only the same `kind` is not a pattern.
- A capture paired with itself.

## Output

Respond with **JSON only** — no prose, no code fences. Exactly this shape:

```
{
  "pairs": [
    { "capture_a": "<uuid>", "capture_b": "<uuid>", "reasoning": "<one sentence, ≤ 400 chars>" }
  ]
}
```

Rules:

- `capture_a` and `capture_b` are UUIDs copied **verbatim** from the input. Never invent IDs.
- They must be different captures.
- `reasoning` is **one sentence** that names the actual through-line ("both are about scheduling friction with calendar tools"). No filler ("these seem related").
- Empty `pairs: []` is the right answer when nothing genuinely connects. Do not pad.
- Maximum 20 pairs (you should rarely approach this).

---

## Captures (most recent first)

{{captures_block}}
