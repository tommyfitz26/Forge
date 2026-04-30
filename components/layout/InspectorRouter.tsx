'use client';

import { usePathname } from 'next/navigation';
import { Inspector, InspSection, InspLabel, InspHeading, InspStat, InspProp, InspEmpty } from './Inspector';

/**
 * Phase 4.1 inspector content is derived from the pathname. Pages don't
 * yet have data behind them, so the inspector shows a generic panel
 * appropriate to the current route. Phase 4.3 will replace this with
 * page-specific inspector content fed from the database.
 */
export function InspectorRouter({ open }: { open: boolean }) {
  const pathname = usePathname();
  return <Inspector open={open}>{panelFor(pathname)}</Inspector>;
}

function panelFor(pathname: string) {
  if (pathname === '/today') {
    return (
      <>
        <InspSection>
          <InspHeading title="Today" sub={"What's on the bench"} />
          <InspLabel>At a glance</InspLabel>
          <InspStat k="Captures today" v="—" />
          <InspStat k="Focus set" v="—" />
          <InspStat k="Day streak" v="0" />
        </InspSection>
        <InspSection>
          <InspLabel>Tonight&apos;s bench</InspLabel>
          <InspEmpty>Pinned items appear here once you mark them top-of-mind.</InspEmpty>
        </InspSection>
      </>
    );
  }

  if (pathname === '/this-week') {
    return (
      <>
        <InspSection>
          <InspHeading title="This week" sub="The shape of the week" />
          <InspStat k="Captures" v="—" />
          <InspStat k="Sessions" v="—" />
          <InspStat k="Tasks done" v="—" />
        </InspSection>
        <InspSection>
          <InspLabel>Calendar</InspLabel>
          <InspEmpty>Connect Google Calendar in Phase 4.3 to see scheduled sessions here.</InspEmpty>
        </InspSection>
      </>
    );
  }

  if (pathname === '/stream') {
    return (
      <>
        <InspSection>
          <InspHeading title="Stream" sub="Captures, ordered by recency" />
          <InspLabel>By kind</InspLabel>
          <InspStat k="idea" v="—" />
          <InspStat k="problem" v="—" />
          <InspStat k="observation" v="—" />
          <InspStat k="research" v="—" />
        </InspSection>
        <InspSection>
          <InspLabel>Lifecycle</InspLabel>
          <InspStat k="raw" v="—" />
          <InspStat k="developed" v="—" />
        </InspSection>
      </>
    );
  }

  if (pathname === '/top-of-mind') {
    return (
      <InspSection>
        <InspHeading title="Top of mind" sub="What you're holding right now" />
        <InspEmpty>
          Pinned captures, threads, and projects show here. Pin from any list with the bookmark icon.
        </InspEmpty>
      </InspSection>
    );
  }

  if (pathname === '/workshop') {
    return (
      <>
        <InspSection>
          <InspHeading title="Workshop" sub="Your projects" />
          <InspLabel>By stage</InspLabel>
          <InspStat k="Active" v="—" />
          <InspStat k="Drafting" v="—" />
          <InspStat k="Wrapped" v="—" />
        </InspSection>
        <InspSection>
          <InspLabel>Created from</InspLabel>
          <InspStat k="Captures" v="—" />
          <InspStat k="Explicit + New" v="—" />
        </InspSection>
      </>
    );
  }

  if (pathname === '/journal') {
    return (
      <>
        <InspSection>
          <InspHeading title="Journal" sub="Where you keep yourself" />
          <InspStat k="Total entries" v="—" />
          <InspStat k="This month" v="—" />
          <InspStat k="Day streak" v="0" />
        </InspSection>
      </>
    );
  }

  if (pathname === '/threads') {
    return (
      <InspSection>
        <InspHeading title="Threads" sub="Long-form expansion of captures" />
        <InspLabel>By kind</InspLabel>
        <InspStat k="idea threads" v="—" />
        <InspStat k="problem threads" v="—" />
        <InspStat k="observation threads" v="—" />
        <InspStat k="research threads" v="—" />
      </InspSection>
    );
  }

  if (pathname === '/scraps') {
    return (
      <InspSection>
        <InspHeading title="Scraps" sub="Drafts, fragments, seeds" />
        <InspEmpty>Captures still in `raw` state and not yet anchored to a project show here.</InspEmpty>
      </InspSection>
    );
  }

  if (pathname === '/archive') {
    return (
      <InspSection>
        <InspHeading title="Archive" sub="Inactive but kept" />
        <InspStat k="Total" v="—" />
      </InspSection>
    );
  }

  if (pathname === '/trash') {
    return (
      <InspSection>
        <InspHeading title="Trash" sub="Auto-deletes after 30 days" />
        <InspStat k="Items" v="—" />
        <InspStat k="Oldest" v="—" />
      </InspSection>
    );
  }

  if (pathname.startsWith('/kinds/')) {
    const k = pathname.split('/')[2] ?? '';
    return (
      <InspSection>
        <InspHeading title={`#${k}`} sub={`All ${k} captures`} />
        <InspProp k="kind" v={k} />
        <InspProp k="lifecycle" v="raw + developed" />
      </InspSection>
    );
  }

  if (pathname.startsWith('/tags/')) {
    const t = pathname.split('/')[2] ?? '';
    return (
      <InspSection>
        <InspHeading title={`#${t}`} sub="Filtered by tag" />
        <InspEmpty>Tag-filtered counts arrive in Phase 4.3 when the tags table lands.</InspEmpty>
      </InspSection>
    );
  }

  if (pathname.startsWith('/capture')) {
    return (
      <InspSection>
        <InspHeading title="Capture" sub="Stream item" />
        <InspEmpty>Per-capture properties, connections, and activity show here when a capture is open.</InspEmpty>
      </InspSection>
    );
  }

  if (pathname.startsWith('/review/')) {
    return (
      <InspSection>
        <InspHeading title="Weekly review" sub="The Sunday pass" />
        <InspEmpty>Inspector content for the weekly review shows here in Phase 4.3.</InspEmpty>
      </InspSection>
    );
  }

  return (
    <InspSection>
      <InspHeading title="Forge" />
      <InspEmpty>Pick a page to see context here.</InspEmpty>
    </InspSection>
  );
}
