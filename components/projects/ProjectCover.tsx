import { gradientCssForKey, type CoverGradientKey } from '@/lib/types/projects';

/**
 * Renders the colored cover for a project card or hero. Server component;
 * no client state. The gradient key is resolved by the caller (use
 * `gradientKeyForKind(kind_seed)` for the default).
 */
export function ProjectCover({
  gradientKey,
  stage,
  className = 'forge-proj__cover',
}: {
  gradientKey: CoverGradientKey;
  stage: string | null;
  className?: string;
}) {
  return (
    <div className={className} style={{ background: gradientCssForKey(gradientKey) }}>
      {stage && <span className="forge-proj__stage">{stage}</span>}
    </div>
  );
}
