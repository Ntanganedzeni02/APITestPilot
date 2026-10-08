import Link from 'next/link';
import { ReleaseOverview } from '../../components/releases/overview';
import { Overview } from '../../components/empty-state/overview';
import { intelligenceContext } from '../../lib/memory-quality/context';
import { QualityPanel } from '../../components/memory-quality/quality-panel';
import { IntelligenceActionForm } from '../../components/memory-quality/action-form';
export default async function Home() {
  const c = await intelligenceContext();
  if (!c) return <Overview createHref="/projects/new" />;
  try {
    const { current, previous } = await c.repo.current(
        c.workspace.id,
        c.project.id,
        c.environment.id,
      ),
      source = await c.repo.latestSource(c.workspace.id, c.project.id);
    return (
      <main className="space-y-5">
        <h1>Overview</h1>
        <p>
          {c.project.name} | {c.environment.type}
        </p>
        <IntelligenceActionForm environment={c.environment.id} mode="QUALITY" />
        <QualityPanel
          current={current}
          previous={previous}
          latestSource={source}
        />
        <p>
          <Link href="/api-map">API Map</Link> ?{' '}
          <Link href="/memory">Evidence Memory</Link> ?{' '}
          <Link href="/quality">Quality details and environments</Link>
        </p>
        <ReleaseOverview />
      </main>
    );
  } catch {
    return (
      <p role="alert">
        Unable to load project intelligence. Check migration availability and
        project access.
      </p>
    );
  }
}
