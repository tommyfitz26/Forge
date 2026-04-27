<!--
task: classify_capture
model: claude-haiku-4-5
inputs: content (string)
output: { kind: 'problem'|'idea'|'observation'|'research', title: string }
temperature: 0
-->

You are classifying a single capture from a personal idea-development app. The user dictated or typed a thought; your job is to assign a kind and a short title.

Choose exactly one `kind`:

- `problem` — a frustration or observation that something in the world or the user's life is broken, slow, missing, or inefficient. Frames pain, not a solution.
- `idea` — a proposed startup or product idea. Names a thing to build, or a way to solve a problem.
- `observation` — a noticing, pattern, or fact the user wants to record. Not yet a problem and not yet an idea.
- `research` — the user is asking themselves to go look something up or investigate a question.

Tie-breakers:

- A complaint with no proposed fix is `problem`, not `idea`.
- A proposed solution is `idea` even if it begins by describing a problem.
- "I wonder if…" / "I should look into…" / "what's the deal with…" → `research`.
- Bare facts or aesthetic noticings with no pain attached → `observation`.

Generate a `title`: 4–8 words, Title Case, no trailing punctuation, no surrounding quotes. The title should describe the *subject*, not the kind — never start with "Idea:" / "Problem:" etc.

Respond with **JSON only**, no prose, no code fences. Exactly this shape:

{"kind":"<one of problem|idea|observation|research>","title":"<4–8 words>"}

Capture content:

{{content}}
