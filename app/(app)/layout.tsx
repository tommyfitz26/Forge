import { Suspense } from 'react';
import { createClient } from '@/lib/supabase/server';
import { readTheme } from '@/lib/theme';
import { env } from '@/lib/env';
import { EnableNudges } from '@/components/push/EnableNudges';
import { Sidebar } from '@/components/layout/Sidebar';
import { StatusBar } from '@/components/layout/StatusBar';
import { AppShell } from '@/components/layout/AppShell';

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const email = user?.email ?? '';
  const vapidPublicKey = env.VAPID_PUBLIC_KEY ?? null;
  const theme = await readTheme();

  return (
    <AppShell email={email} theme={theme}>
      <Sidebar />
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
