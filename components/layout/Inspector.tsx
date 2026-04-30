'use client';

import type { ReactNode } from 'react';

export function Inspector({
  open,
  children,
}: {
  open: boolean;
  children: ReactNode;
}) {
  return (
    <aside className="forge-inspector" data-open={open ? 'true' : 'false'}>
      {open ? children : null}
    </aside>
  );
}

/* Common inspector primitives — used across pages so the right pane has
 * a consistent shape (label, props, link list, activity, stats).            */

export function InspSection({ children }: { children: ReactNode }) {
  return <section className="forge-insp-section">{children}</section>;
}

export function InspLabel({ children }: { children: ReactNode }) {
  return <div className="forge-insp-label">{children}</div>;
}

export function InspHeading({
  title,
  sub,
}: {
  title: string;
  sub?: string;
}) {
  return (
    <>
      <h4 className="forge-insp-heading">{title}</h4>
      {sub && <div className="forge-insp-sub">{sub}</div>}
    </>
  );
}

export function InspStat({ k, v }: { k: string; v: string }) {
  return (
    <div className="forge-insp-stat">
      <span>{k}</span>
      <span className="forge-insp-stat__v">{v}</span>
    </div>
  );
}

export function InspProp({ k, v }: { k: string; v: ReactNode }) {
  return (
    <div className="forge-insp-prop">
      <span className="forge-insp-prop__k">{k}</span>
      <span className="forge-insp-prop__v">{v}</span>
    </div>
  );
}

export function InspEmpty({ children }: { children: ReactNode }) {
  return <div className="forge-insp-empty">{children}</div>;
}
