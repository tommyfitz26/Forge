import Link from 'next/link';
import { getCostsSummary } from '@/lib/db/settings-costs';
import { getHealthSummary } from '@/lib/db/settings-health';
import { getJobsSummary } from '@/lib/db/settings-jobs';
import { CostsTab } from './CostsTab';
import { HealthTab } from './HealthTab';
import { JobsTab } from './JobsTab';

type SearchParams = Promise<{ tab?: string }>;

const TABS = [
  { id: 'costs', label: 'Costs' },
  { id: 'health', label: 'Health' },
  { id: 'jobs', label: 'Jobs' },
] as const;
type TabId = (typeof TABS)[number]['id'];

function isTab(s: string | undefined): s is TabId {
  return TABS.some((t) => t.id === s);
}

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const sp = await searchParams;
  const active: TabId = isTab(sp.tab) ? sp.tab : 'costs';

  const [costs, health, jobs] = await Promise.all([
    active === 'costs' ? getCostsSummary() : null,
    active === 'health' ? getHealthSummary() : null,
    active === 'jobs' ? getJobsSummary() : null,
  ]);

  return (
    <div className="space-y-6">
      <div className="forge-page-header">
        <h1>Settings</h1>
        <span className="forge-page-header__meta">infrastructure + spend</span>
      </div>

      <nav className="forge-proj-tabs">
        {TABS.map((t) => (
          <Link
            key={t.id}
            href={`/settings?tab=${t.id}`}
            className="forge-proj-tab"
            data-active={active === t.id ? 'true' : 'false'}
          >
            {t.label}
          </Link>
        ))}
      </nav>

      {active === 'costs' && costs && <CostsTab data={costs} />}
      {active === 'health' && health && <HealthTab data={health} />}
      {active === 'jobs' && jobs && <JobsTab data={jobs} />}
    </div>
  );
}
