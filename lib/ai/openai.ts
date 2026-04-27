import 'server-only';
import OpenAI from 'openai';
import { env } from '@/lib/env';

// Single shared client. We deliberately disable SDK-level retries: each retry
// can take up to `timeout` ms, and Vercel kills the route at 60s. Better to
// fail one request fast and let the client-side offline queue handle retries
// with backoff (lib/offline/upload.ts).
let _client: OpenAI | null = null;
export function getOpenAI(): OpenAI {
  if (!_client) {
    _client = new OpenAI({
      apiKey: env.OPENAI_API_KEY,
      maxRetries: 0,
      timeout: 50_000,
    });
  }
  return _client;
}
