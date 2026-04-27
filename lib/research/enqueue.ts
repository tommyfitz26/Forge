import 'server-only';
import { publishJob } from '@/lib/qstash';
import { createServiceClient } from '@/lib/supabase/service';
import { logger } from '@/lib/logger';

/**
 * Fire-and-forget enqueue of a research job for a capture. Awaits the QStash
 * publish (otherwise it can race serverless shutdown), but on any failure we
 * log and mark the capture's research_status as 'failed' so the user gets a
 * "Retry research" button instead of a row stuck in 'pending' forever.
 */
export async function enqueueResearch(captureId: string): Promise<void> {
  try {
    await publishJob('/api/jobs/research', { captureId });
    logger.info('research.enqueued', { captureId });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.warn('research.enqueue_failed', { captureId, err: message });
    const service = createServiceClient();
    await service
      .from('captures')
      .update({ research_status: 'failed', updated_at: new Date().toISOString() })
      .eq('id', captureId);
  }
}
