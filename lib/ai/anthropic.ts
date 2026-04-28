import 'server-only';
import Anthropic from '@anthropic-ai/sdk';
import { env } from '@/lib/env';

// Single shared client. SDK retries disabled for the same reason as OpenAI
// (lib/ai/openai.ts): one fast attempt per call, let the queue / runner handle
// retries. 140s timeout accommodates Sonnet + web_search (max_uses 8); fits
// inside the research route's 300s maxDuration on Vercel Fluid Compute.
let _client: Anthropic | null = null;
export function getAnthropic(): Anthropic {
  if (!_client) {
    _client = new Anthropic({
      apiKey: env.ANTHROPIC_API_KEY,
      maxRetries: 0,
      timeout: 140_000,
    });
  }
  return _client;
}
