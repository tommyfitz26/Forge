<!--
task: suggest_links
model: claude-sonnet-4-6
inputs:
  source_kind (string)         — capture | thread | journal_entry
  source_title (string)        — title or date label of the just-saved item
  source_body (string)         — the body content the user just saved
  candidates_block (string)    — bulleted list of up to 20 candidate items the
                                 user has already captured, formatted as:
                                 "- [{kind}:{id}] {title} — {short_preview}"
output: { picks: [{ target_kind, target_id, reasoning }] }
temperature: 0.2
-->

You are looking at a piece of content the user just saved and a list of other things they've captured recently. Your job: pick **0 to 3** items from the candidate list that connect to the freshly-saved item in a way the user would find useful.

The user is the kind of person who **wants to see the connection** — they're capturing because they're thinking about it. When two captures clearly orbit the same idea or domain, surface the link. The user can dismiss with one tap if it's not useful, so a few extra surfaced suggestions cost almost nothing. The cost of *missing* an obvious connection is higher.

## What counts as a useful connection

- The two items are **about the same underlying idea, product, problem, or decision** — same domain or topic, even at different levels of specificity. "An estate marketplace" and "a marketplace for amateur estate-auctioneers" should link.
- One **expands or pressure-tests** the other (a problem and the idea that addresses it; a research note that bears on a captured idea).
- They share a **specific entity** — same person, same product, same place — that makes them part of the same story.
- They share a **distinctive keyword or noun phrase** (not generic words like "user" or "app", but specific concepts like "estate auctioneer", "amateur", "small town marketplace").

## What does NOT count

- Vague same-category match where no concrete word, entity, or theme overlaps. ("both involve customers" → skip.)
- Same tag with no other content overlap.
- Same kind alone (two captured ideas existing doesn't mean they connect).
- Linking purely because they happened around the same time.

## Calibration: be useful, not pedantic

When the source is brief (a title-length phrase, a few words), the user is signaling a topic. **Title-level topical overlap with a candidate IS a real connection.** Don't require the source body to be long enough to "prove" the link — the user's choice of words is the proof.

When in doubt between picking and not picking, **pick** and let the user decide. Worst case: they tap Skip in 1 second.

The exception: if NO candidate shares specific words, themes, entities, or domain with the source, return an empty `picks` array. Empty IS the right answer when nothing aligns.

## Reasoning style

For each pick, provide one short sentence (15–30 words) explaining the *specific* link. Reference concrete content from both items.

**Good reasoning examples:**
- "Both center on an estate-auction marketplace — this one frames it as a mobile app, the project frames the seller side and the small-town wedge."
- "The journal entry from Tuesday flags trust as the open question; this capture proposes the verification flow that addresses it directly."
- "Both touch on amateur auctioneers in rural markets — one is a problem statement, the other is a proposed solution."

**Bad reasoning examples:**
- "Could be related." (hedged — be specific or skip)
- "Same kind." (no real connection)
- "Both involve software." (too generic)

## Output format

Return JSON with this exact shape — no prose, no code fences:

```json
{
  "picks": [
    {
      "target_kind": "capture",
      "target_id": "the-uuid-from-the-candidate-list",
      "reasoning": "One short sentence explaining the specific link."
    }
  ]
}
```

If nothing connects, return `{ "picks": [] }`. Empty is the right answer often.

## Inputs

You just saved this **{{source_kind}}**: *{{source_title}}*

Body:
{{source_body}}

## Candidates

{{candidates_block}}
