import 'server-only';
import OpenAI from 'openai';
import { env } from '@/lib/env';

// Single shared client. OpenAI SDK handles retries on transient 5xx/429 by
// default with modest backoff; we set an explicit max to keep Whisper calls
// bounded under Vercel's 60s route timeout.
let _client: OpenAI | null = null;
export function getOpenAI(): OpenAI {
  if (!_client) {
    _client = new OpenAI({
      apiKey: env.OPENAI_API_KEY,
      maxRetries: 2,
      timeout: 45_000,
    });
  }
  return _client;
}
