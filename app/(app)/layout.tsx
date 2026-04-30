import { Suspense } from 'react';
import { createClient } from '@/lib/supabase/server';
import { readTheme } from '@/lib/theme';
import { env } from '@/lib/env';
import { EnableNudges } from '@/components/push/EnableNudges';
import { Sidebar, type SidebarProject } from '@/components/layout/Sidebar';
import { StatusBar } from '@/components/layout/StatusBar';
import { AppShell } from '@/components/layout/AppShell';
import { listProjects, projectCounts } from '@/lib/db/projects';

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
  const [activeProjects, counts] = await Promise.all([
    listProjects({ status: 'active', limit: 8 }),
    projectCounts(),
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
      }}
    >
      <Sidebar projects={projectsForSidebar} />
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
