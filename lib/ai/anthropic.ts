import 'server-only';
import Anthropic from '@anthropic-ai/sdk';
import { env } from '@/lib/env';

// Single shared client. SDK retries disabled for the same reason as OpenAI
// (lib/ai/openai.ts): one fast attempt per call, let the queue / runner handle
// retries. 50s timeout fits inside Vercel's 60s route budget.
let _client: Anthropic | null = null;
export function getAnthropic(): Anthropic {
  if (!_client) {
    _client = new Anthropic({
      apiKey: env.ANTHROPIC_API_KEY,
      maxRetries: 0,
      timeout: 50_000,
    });
  }
  return _client;
}
