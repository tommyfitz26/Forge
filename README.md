# Forge

Single-user PWA for capturing voice/text/photo notes about startup ideas, auto-researching them, and pressure-testing them via a Sunday Socratic review. See `SPEC.md` for the full product + engineering spec, and `HANDOFF.md` for current state and next steps.

## Local development

```sh
pnpm install
cp .env.example .env.local   # fill in real values; see comments inline
pnpm dev                     # http://localhost:3000
pnpm typecheck               # tsc --noEmit
pnpm lint
pnpm test                    # vitest
```

Database migrations are managed via the Supabase CLI (`pnpm db:new` / `pnpm db:push` / `pnpm db:types`). See `HANDOFF.md` → *Tooling cheat sheet* for the full set.

## iOS Shortcut → `POST /api/capture?source=shortcut`

The Shortcut endpoint authenticates with a long-lived Bearer token (`SHORTCUT_API_TOKEN`). One token, embedded once in the Shortcut, then never typed again. SPEC §4.1 / §5 Flow A / §10.2.

### 1. Generate a token

```sh
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

64 hex chars. Treat it like a password — it grants full capture write access.

### 2. Store the token

- **`.env.local`** — `SHORTCUT_API_TOKEN=<value>`
- **Vercel** — Project → Settings → Environment Variables → add `SHORTCUT_API_TOKEN` to **Production**, **Preview**, and **Development**, then redeploy.

`lib/env.ts` validates the token at startup; the app won't boot without it.

### 3. Build the Shortcut on iPhone

In the Shortcuts app:

1. **Record Audio**
   - Audio Quality: *Normal*
   - Start Recording: *On Tap*
   - Stop Recording: *On Tap*
2. **Get Contents of URL**
   - URL: `https://forge.mom/api/capture?source=shortcut` (or your local tunnel for testing)
   - Method: `POST`
   - Headers:
     - `Authorization` = `Bearer <SHORTCUT_API_TOKEN>`
   - Request Body: **Form**
     - `audio` = *Recorded Audio* (the variable from step 1)
3. *(Optional)* **Show Result** → display the response so a 4xx is visible if the token expires.

Bind the Shortcut to the **Action Button** (Settings → Action Button → Shortcut) or invoke it via "Hey Siri, new Forge idea." Both paths fire the same Shortcut.

### 4. Token rotation

Generate a new token, update `.env.local` + Vercel + the Shortcut's Authorization header, redeploy. Old token stops working as soon as the new value is live.

### Failure modes (return codes)

| Status | Meaning |
| --- | --- |
| `401 unauthorized` | Missing / wrong / malformed `Authorization` header. |
| `413 payload_too_large` | Audio body over 25MB (Whisper limit). |
| `415 unsupported_media_type` | Device sent an unrecognized audio MIME — file an issue with the `Content-Type` so the allowlist can extend. |
| `502 transcription_failed` | Whisper rejected the audio or timed out. Capture is **not** persisted on this path (Shortcut has no offline queue). |

## Repo conventions

See `HANDOFF.md` for the locked workflow conventions (branch per phase slice, PR per sub-phase, never push to main directly, etc.) and `SPEC.md` §10 for engineering practices.
