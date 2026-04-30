import { Hash } from 'lucide-react';

type Params = { slug: string };

export default async function TagFilterPage({
  params,
}: {
  params: Promise<Params>;
}) {
  const { slug } = await params;
  return (
    <div className="space-y-6">
      <div className="forge-page-header">
        <h1>
          <span style={{ color: 'var(--ember)' }}>#</span>
          {slug}
        </h1>
        <span className="forge-page-header__meta">filtered by tag</span>
      </div>

      <div
        className="forge-empty rounded-xl border"
        style={{ borderColor: 'var(--line)', background: 'var(--bg-2)' }}
      >
        <div className="forge-empty__glyph">
          <Hash size={32} className="mx-auto" />
        </div>
        <div className="forge-empty__msg">
          Tags table arrives in Phase 4.3. Until then, this is a placeholder route — your existing kinds (
          <code style={{ fontFamily: 'var(--mono)' }}>idea / problem / observation / research</code>) have their own
          views under <code style={{ fontFamily: 'var(--mono)' }}>/kinds/[kind]</code>.
        </div>
      </div>
    </div>
  );
}
