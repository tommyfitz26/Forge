import { Suspense } from 'react';
import { createClient } from '@/lib/supabase/server';
import { readTheme } from '@/lib/theme';
import { env } from '@/lib/env';
import { EnableNudges } from '@/components/push/EnableNudges';
import { Sidebar, type SidebarProject } from '@/components/layout/Sidebar';
import { StatusBar } from '@/components/layout/StatusBar';
import { AppShell } from '@/components/layout/AppShell';
import { listProjects, projectCounts } from '@/lib/db/projects';
import { threadCounts } from '@/lib/db/threads';
import { topTags } from '@/lib/db/tags';
import { journalCounts } from '@/lib/db/journal';
import { pinCounts } from '@/lib/db/pins';
import { computeStreakSummary } from '@/lib/db/streak';
import { getTodaysIntention } from '@/lib/db/intentions';
import { thisWeekAggregates } from '@/lib/db/this-week';
import { scrapsCount } from '@/lib/db/scraps';
import { trashCount } from '@/lib/db/trash';

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const email = user?.email ?? '';
  const vapidPublicKey = env.VAPID_PUBLIC_KEY ?? null;
  const theme = await readTheme();

  // Phase 4.3.1: Sidebar shows the user's active projects under Workshop.
  // Limited to 8 to keep the rail tidy; "All projects" link expands.
  // Phase 4.3.3: Threads counts feed the inspector.
  // Phase 4.3.4: Sidebar tags + journal/pin counts.
  // Phase 4.3.5: Streak summary + today's intention feed the practice card
  // and Today inspector.
  const [
    activeProjects,
    counts,
    threads,
    tags,
    journal,
    pins,
    streak,
    todaysIntention,
    weekAgg,
    scrapsTotal,
    trash,
  ] = await Promise.all([
    listProjects({ status: 'active', limit: 8 }),
    projectCounts(),
    threadCounts(),
    topTags(8),
    journalCounts(),
    pinCounts(),
    computeStreakSummary(),
    getTodaysIntention(),
    thisWeekAggregates(),
    scrapsCount(),
    trashCount(),
  ]);
  const projectsForSidebar: SidebarProject[] = activeProjects.map((p) => ({
    id: p.id,
    title: p.title,
    kind_seed: p.kind_seed,
    cover_gradient_key: p.cover_gradient_key,
  }));

  return (
    <AppShell
      email={email}
      theme={theme}
      inspectorCtx={{
        workshop: {
          active: counts.active,
          wrapped: counts.wrapped,
          paused: counts.paused,
          total: counts.total,
        },
        threads: {
          total: threads.total,
          in_progress: threads.in_progress,
          complete: threads.complete,
          archived: threads.archived,
          byKind: threads.byKind,
        },
        journal: {
          total: journal.total,
          thisMonth: journal.thisMonth,
          dayStreak: journal.dayStreak,
        },
        pins: {
          total: pins.total,
          byKind: pins.byKind,
        },
        today: {
          focusSet: Boolean(todaysIntention),
          dayStreak: streak.current,
          bestStreak: streak.best,
        },
        thisWeek: {
          captureTotal: weekAgg.captureTotal,
          focusSetDays: weekAgg.focusSetDays,
          journalDays: weekAgg.journalDays,
          byKind: weekAgg.byKind,
        },
        scraps: {
          total: scrapsTotal,
        },
        trash: {
          total: trash.total,
          byKind: trash.byKind,
          oldestDays: trash.oldestDays,
        },
      }}
    >
      <Sidebar projects={projectsForSidebar} tags={tags} streak={streak} />
      <main className="forge-main">
        <Suspense fallback={null}>
          <EnableNudges vapidPublicKey={vapidPublicKey} />
        </Suspense>
        {children}
      </main>
      <StatusBar />
    </AppShell>
  );
}
