import Link from 'next/link';
import { intelligenceContext } from '../../../lib/memory-quality/context';
import { QualityPanel } from '../../../components/memory-quality/quality-panel';
import { IntelligenceActionForm } from '../../../components/memory-quality/action-form';
export default async function Quality({
  searchParams,
}: {
  searchParams: Promise<{ environment?: string; page?: string }>;
}) {
  const query = await searchParams,
    c = await intelligenceContext(query.environment);
  if (!c) return <p>Select a project first.</p>;
  try {
    const page = Number(query.page ?? 0),
      { current, previous } = await c.repo.current(
        c.workspace.id,
        c.project.id,
        c.environment.id,
      ),
      history = await c.repo.history(
        c.workspace.id,
        c.project.id,
        c.environment.id,
        page,
      ),
      source = await c.repo.latestSource(c.workspace.id, c.project.id);
    return (
      <main className="space-y-5">
        <h1>API Quality Intelligence</h1>
        <form>
          <label>
            Environment{' '}
            <select name="environment" defaultValue={c.environment.id}>
              {c.environments.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.type}
                </option>
              ))}
            </select>
          </label>
          <button>Inspect</button>
        </form>
        <IntelligenceActionForm environment={c.environment.id} mode="QUALITY" />
        <QualityPanel
          current={current}
          previous={previous}
          latestSource={source}
        />
        {current && (
          <>
            <h2>Unverified contributors</h2>
            <p>
              Requirement gaps: {current.result.inputs.gaps.requirements.length}
              . Risk gaps: {current.result.inputs.gaps.risks.length}. Operation
              gaps: {current.result.inputs.gaps.operations.length}.
            </p>
            <ul>
              {current.result.inputs.gaps.requirements.map((id) => (
                <li key={id}>
                  <Link href="/requirements">Requirement {id}</Link>
                </li>
              ))}
              {current.result.inputs.gaps.risks.map((id) => (
                <li key={id}>
                  <Link href="/risks">Risk {id}</Link>
                </li>
              ))}
              {current.result.inputs.gaps.operations.map((id) => (
                <li key={id}>Unverified/stale operation fingerprint {id}</li>
              ))}
            </ul>
            <h2>Authoritative assessment provenance</h2>
            <ul>
              {current.result.inputs.provenance.runIds.map((id) => (
                <li key={id}>
                  <Link href={'/runs#run-' + id}>Execution {id}</Link>
                </li>
              ))}
              {current.result.inputs.provenance.findingIds.map((id) => (
                <li key={id}>
                  <Link href={'/findings/' + id}>Finding {id}</Link>
                </li>
              ))}
            </ul>
            <p>
              Evidence packages:{' '}
              {current.result.inputs.provenance.packageIds.join(', ') || 'None'}
            </p>
            <p>
              Requirement/risk reviews:{' '}
              {current.result.inputs.provenance.reviewIds.join(', ') || 'None'}
            </p>
          </>
        )}
        <h2>Immutable assessment history</h2>
        <ul>
          {history.map((a) => (
            <li key={a.id}>
              <p>
                {a.assessed_at} | {a.result.overall ?? 'Unknown'} |{' '}
                {a.result.confidence} confidence | Source{' '}
                {a.api_import_id ?? 'None'}
              </p>
              <details>
                <summary>Snapshot explanation {a.id}</summary>
                <QualityPanel
                  current={a}
                  previous={null}
                  latestSource={source}
                />
              </details>
            </li>
          ))}
        </ul>
        <nav aria-label="Assessment history pagination">
          {page > 0 && (
            <Link
              href={'?environment=' + c.environment.id + '&page=' + (page - 1)}
            >
              Previous{' '}
            </Link>
          )}
          {history.length === 25 && (
            <Link
              href={'?environment=' + c.environment.id + '&page=' + (page + 1)}
            >
              Next
            </Link>
          )}
        </nav>
      </main>
    );
  } catch {
    return (
      <p role="alert">
        Unable to load quality intelligence. Check project permissions and
        migration availability.
      </p>
    );
  }
}
