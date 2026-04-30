'use client';

import { usePathname } from 'next/navigation';
import { Inspector, InspSection, InspLabel, InspHeading, InspStat, InspProp, InspEmpty } from './Inspector';

/**
 * Inspector context populated server-side in app/(app)/layout.tsx and
 * threaded down through AppShell. Pages without a corresponding panel
 * fall back to the generic empty state.
 */
export type InspectorContext = {
  workshop: {
    active: number;
    wrapped: number;
    paused: number;
    total: number;
  };
  threads: {
    total: number;
    in_progress: number;
    complete: number;
    archived: number;
    byKind: { idea: number; problem: number; observation: number; research: number };
  };
  journal: {
    total: number;
    thisMonth: number;
    dayStreak: number;
  };
  pins: {
    total: number;
    byKind: { capture: number; project: number; thread: number; journal_entry: number };
  };
};

/**
 * Phase 4.3.1: Workshop inspector now shows real counts. Other panels are
 * still pathname-derived placeholders pointing forward to data-model phases.
 */
export function InspectorRouter({ open, ctx }: { open: boolean; ctx: InspectorContext }) {
  const pathname = usePathname();
  return <Inspector open={open}>{panelFor(pathname, ctx)}</Inspector>;
}

function panelFor(pathname: string, ctx: InspectorContext) {
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
      <>
        <InspSection>
          <InspHeading title="Top of mind" sub="What you're holding right now" />
          <InspStat k="Total pinned" v={String(ctx.pins.total)} />
        </InspSection>
        <InspSection>
          <InspLabel>By kind</InspLabel>
          <InspStat k="Captures" v={String(ctx.pins.byKind.capture)} />
          <InspStat k="Projects" v={String(ctx.pins.byKind.project)} />
          <InspStat k="Threads" v={String(ctx.pins.byKind.thread)} />
          <InspStat k="Journal entries" v={String(ctx.pins.byKind.journal_entry)} />
        </InspSection>
      </>
    );
  }

  if (pathname === '/workshop' || pathname.startsWith('/projects/')) {
    return (
      <>
        <InspSection>
          <InspHeading title="Workshop" sub="Your projects" />
          <InspLabel>By status</InspLabel>
          <InspStat k="Active" v={String(ctx.workshop.active)} />
          <InspStat k="Wrapped" v={String(ctx.workshop.wrapped)} />
          <InspStat k="Paused" v={String(ctx.workshop.paused)} />
          <InspStat k="Total" v={String(ctx.workshop.total)} />
        </InspSection>
        <InspSection>
          <InspLabel>Created from</InspLabel>
          <InspStat k="Captures" v="—" />
          <InspStat k="+ New explicit" v={String(ctx.workshop.total)} />
        </InspSection>
      </>
    );
  }

  if (pathname === '/journal') {
    return (
      <>
        <InspSection>
          <InspHeading title="Journal" sub="Where you keep yourself" />
          <InspStat k="Total entries" v={String(ctx.journal.total)} />
          <InspStat k="This month" v={String(ctx.journal.thisMonth)} />
          <InspStat k="Day streak" v={String(ctx.journal.dayStreak)} />
        </InspSection>
      </>
    );
  }

  if (pathname === '/threads' || pathname.startsWith('/threads/')) {
    return (
      <>
        <InspSection>
          <InspHeading title="Threads" sub="Long-form expansion of captures" />
          <InspLabel>By status</InspLabel>
          <InspStat k="In progress" v={String(ctx.threads.in_progress)} />
          <InspStat k="Complete" v={String(ctx.threads.complete)} />
          <InspStat k="Archived" v={String(ctx.threads.archived)} />
          <InspStat k="Total" v={String(ctx.threads.total)} />
        </InspSection>
        <InspSection>
          <InspLabel>By kind</InspLabel>
          <InspStat k="idea" v={String(ctx.threads.byKind.idea)} />
          <InspStat k="problem" v={String(ctx.threads.byKind.problem)} />
          <InspStat k="observation" v={String(ctx.threads.byKind.observation)} />
          <InspStat k="research" v={String(ctx.threads.byKind.research)} />
        </InspSection>
      </>
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
    const t = decodeURIComponent(pathname.split('/')[2] ?? '');
    return (
      <InspSection>
        <InspHeading title={`#${t}`} sub="Filtered by tag" />
        <InspProp k="kind" v="free-form" />
        <InspProp k="scope" v="journal entries" />
        <InspEmpty>
          Capture and thread tagging join this filter in a follow-up micro-slice.
        </InspEmpty>
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
