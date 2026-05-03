/**
 * Register / sync the QStash schedules defined in lib/jobs/registry.ts.
 *
 * Idempotent — safe to re-run any time (after a console wipe, after rotating
 * tokens, or just to confirm the live state matches the registry). Reports
 * orphan schedules (live but not in registry) without deleting them unless
 * --prune is passed.
 *
 *   pnpm tsx scripts/register-qstash-schedules.ts            # apply
 *   pnpm tsx scripts/register-qstash-schedules.ts --dry-run  # show diff only
 *   pnpm tsx scripts/register-qstash-schedules.ts --prune    # also delete orphans
 *
 * Reads from .env.local (load it via the `--env-file` flag in the npm script,
 * or export the vars another way). Required: QSTASH_TOKEN, NEXT_PUBLIC_APP_URL.
 * Optional: APP_SCHEDULE_TZ (defaults to America/New_York).
 */

import { Client } from '@upstash/qstash';
import { REGISTERED_JOBS } from '../lib/jobs/registry';

type DesiredSchedule = {
  /** Stable identifier used to match live schedules. The QStash SDK doesn't
   *  expose a "name" field, so we match on full destination URL. */
  destination: string;
  cron: string;
  timezone: string;
  /** Human label for the summary table. */
  label: string;
};

type LiveSchedule = {
  scheduleId: string;
  destination: string;
  cron: string;
  // QStash sometimes returns the timezone field as `timezone`; older payloads
  // don't include it at all. We normalize on read.
  timezone: string;
};

/**
 * Convert REGISTERED_JOBS into the actual list of schedules we want to exist.
 * Most entries map 1:1, but `nudge` is special: registry stores `0 10,17 * * *`
 * with `?slot=morning|evening` as a placeholder URL. We split into two real
 * schedules — one per slot — so each fires at its own hour.
 */
function buildDesiredSchedules(appUrl: string, defaultTz: string): DesiredSchedule[] {
  const trimmedAppUrl = appUrl.replace(/\/+$/, '');
  const out: DesiredSchedule[] = [];

  for (const job of REGISTERED_JOBS) {
    if (job.jobName === 'nudge') {
      // Placeholder URL in the registry is `/api/jobs/nudge?slot=morning|evening`;
      // expand into one schedule per slot. Cron `0 10,17 * * *` becomes `0 10 *`
      // for morning, `0 17 *` for evening — keeps each schedule's destination
      // unambiguous so re-syncs match cleanly by URL.
      out.push({
        destination: `${trimmedAppUrl}/api/jobs/nudge?slot=morning`,
        cron: '0 10 * * *',
        timezone: job.tz || defaultTz,
        label: `${job.label} (morning)`,
      });
      out.push({
        destination: `${trimmedAppUrl}/api/jobs/nudge?slot=evening`,
        cron: '0 17 * * *',
        timezone: job.tz || defaultTz,
        label: `${job.label} (evening)`,
      });
      continue;
    }

    out.push({
      destination: `${trimmedAppUrl}${job.url}`,
      cron: job.cron,
      timezone: job.tz || defaultTz,
      label: job.label,
    });
  }

  return out;
}

/**
 * The QStash SDK's schedule shape varies by version; this normalizer
 * shields the rest of the script from that.
 */
function normalizeLive(raw: unknown): LiveSchedule | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const r = raw as Record<string, unknown>;
  const scheduleId = typeof r.scheduleId === 'string' ? r.scheduleId : null;
  const destination = typeof r.destination === 'string' ? r.destination : null;
  const cron = typeof r.cron === 'string' ? r.cron : null;
  if (!scheduleId || !destination || !cron) return null;
  const timezone =
    typeof r.timezone === 'string' && r.timezone.length > 0 ? r.timezone : 'UTC';
  return { scheduleId, destination, cron, timezone };
}

async function main() {
  const args = new Set(process.argv.slice(2));
  const dryRun = args.has('--dry-run');
  const prune = args.has('--prune');

  const token = process.env.QSTASH_TOKEN;
  const appUrl = process.env.NEXT_PUBLIC_APP_URL;
  const tz = process.env.APP_SCHEDULE_TZ ?? 'America/New_York';

  if (!token) {
    console.error('Missing QSTASH_TOKEN. Add it to .env.local and re-run.');
    process.exit(1);
  }
  if (!appUrl) {
    console.error('Missing NEXT_PUBLIC_APP_URL. Add it to .env.local and re-run.');
    process.exit(1);
  }

  const client = new Client({ token });
  const desired = buildDesiredSchedules(appUrl, tz);

  console.log(`\nQStash schedule sync — target: ${appUrl}`);
  console.log(`Default timezone: ${tz}`);
  console.log(`Desired schedules: ${desired.length}`);
  if (dryRun) console.log('(dry-run — nothing will be created or deleted)\n');
  if (prune && !dryRun) console.log('--prune flag set — orphan schedules will be deleted.\n');

  const liveRaw = await client.schedules.list();
  const live = (liveRaw as unknown[])
    .map(normalizeLive)
    .filter((s): s is LiveSchedule => s !== null);

  console.log(`Live schedules currently in QStash: ${live.length}\n`);

  // Match by destination URL — that's the natural identity of "this schedule".
  const liveByDestination = new Map<string, LiveSchedule>(
    live.map((s) => [s.destination, s]),
  );

  const desiredDestinations = new Set(desired.map((d) => d.destination));

  const toCreate: DesiredSchedule[] = [];
  const toUpdate: { existing: LiveSchedule; want: DesiredSchedule }[] = [];
  const orphans: LiveSchedule[] = [];
  const unchanged: DesiredSchedule[] = [];

  for (const want of desired) {
    const existing = liveByDestination.get(want.destination);
    if (!existing) {
      toCreate.push(want);
      continue;
    }
    const cronMatches = existing.cron.trim() === want.cron.trim();
    const tzMatches = existing.timezone === want.timezone;
    if (cronMatches && tzMatches) {
      unchanged.push(want);
    } else {
      toUpdate.push({ existing, want });
    }
  }

  for (const l of live) {
    if (!desiredDestinations.has(l.destination)) orphans.push(l);
  }

  function row(label: string, cron: string, tz: string, dest: string) {
    return `  ${label.padEnd(28)}  ${cron.padEnd(14)}  ${tz.padEnd(20)}  ${dest}`;
  }

  if (unchanged.length > 0) {
    console.log(`Already correct (${unchanged.length}):`);
    for (const s of unchanged) console.log(row('  ✓ ' + s.label, s.cron, s.timezone, s.destination));
    console.log('');
  }

  if (toCreate.length > 0) {
    console.log(`Will CREATE (${toCreate.length}):`);
    for (const s of toCreate) console.log(row('  + ' + s.label, s.cron, s.timezone, s.destination));
    console.log('');
  }

  if (toUpdate.length > 0) {
    console.log(`Will UPDATE (${toUpdate.length}) — existing schedule has wrong cron or tz:`);
    for (const { existing, want } of toUpdate) {
      console.log(`  ~ ${want.label}`);
      console.log(`      existing  ${existing.cron}  ${existing.timezone}`);
      console.log(`      desired   ${want.cron}  ${want.timezone}`);
    }
    console.log('');
  }

  if (orphans.length > 0) {
    console.log(`Orphan schedules (live but not in registry) — ${orphans.length}:`);
    for (const o of orphans) console.log(row('  ? ' + o.scheduleId, o.cron, o.timezone, o.destination));
    if (prune) {
      console.log('  → will DELETE these because --prune is set.');
    } else {
      console.log('  (use --prune to delete them; otherwise they will be left alone)');
    }
    console.log('');
  }

  if (dryRun) {
    console.log('Dry run complete. Re-run without --dry-run to apply.');
    return;
  }

  // Apply changes. Order: delete orphans first (only with --prune), then
  // delete-and-recreate updates, then creates. Doing updates as delete+create
  // is simpler than the SDK's update path and avoids edge cases where the
  // schedule type can't be edited in place.
  let created = 0;
  let updated = 0;
  let deleted = 0;

  if (prune) {
    for (const o of orphans) {
      await client.schedules.delete(o.scheduleId);
      console.log(`Deleted orphan ${o.scheduleId} → ${o.destination}`);
      deleted += 1;
    }
  }

  for (const { existing, want } of toUpdate) {
    await client.schedules.delete(existing.scheduleId);
    const result = await client.schedules.create({
      destination: want.destination,
      cron: want.cron,
      // The SDK accepts a top-level `timezone` field; falls back to UTC if omitted.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ...({ timezone: want.timezone } as any),
    });
    console.log(`Updated ${want.label} → ${result.scheduleId}`);
    updated += 1;
  }

  for (const want of toCreate) {
    const result = await client.schedules.create({
      destination: want.destination,
      cron: want.cron,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ...({ timezone: want.timezone } as any),
    });
    console.log(`Created ${want.label} → ${result.scheduleId}`);
    created += 1;
  }

  console.log(
    `\nDone. created=${created}, updated=${updated}, deleted=${deleted}, unchanged=${unchanged.length}.`,
  );
}

main().catch((err) => {
  console.error('Schedule sync failed:', err);
  process.exit(1);
});
