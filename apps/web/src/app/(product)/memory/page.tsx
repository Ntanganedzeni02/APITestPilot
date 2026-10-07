import Link from 'next/link';
import { memoryKinds, memoryCurrentness } from '@testpilot/domain';
import { intelligenceContext } from '../../../lib/memory-quality/context';
import { IntelligenceActionForm } from '../../../components/memory-quality/action-form';
export default async function Memory({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const query = await searchParams;
  const c = await intelligenceContext(query['environment']);
  if (!c) return <p>Select a project to inspect evidence memory.</p>;
  try {
    const page = Number(query['page'] ?? 0),
      facts = await c.repo.listFacts(
        c.workspace.id,
        c.project.id,
        c.environment.id,
        {
          page,
          ...(query['kind'] ? { kind: query['kind'] } : {}),
          ...(query['currentness']
            ? { currentness: query['currentness'] }
            : {}),
          ...(query['operation'] ? { operation: query['operation'] } : {}),
        },
      );
    const link = (p: number) =>
      '/memory?' +
      new URLSearchParams({
        ...Object.fromEntries(
          Object.entries(query).filter(
            (e): e is [string, string] => typeof e[1] === 'string',
          ),
        ),
        environment: c.environment.id,
        page: String(p),
      }).toString();
    return (
      <main className="space-y-6">
        <h1>Evidence Memory</h1>
        <p>
          Verified observations and human decisions, with retained historical
          provenance. Not AI notes or a defect confirmation engine.
        </p>
        <form className="flex flex-wrap gap-3">
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
          <label>
            Type{' '}
            <select name="kind" defaultValue={query['kind'] ?? ''}>
              <option value="">All</option>
              {memoryKinds.map((k) => (
                <option key={k}>{k}</option>
              ))}
            </select>
          </label>
          <label>
            Currentness{' '}
            <select
              name="currentness"
              defaultValue={query['currentness'] ?? ''}
            >
              <option value="">All</option>
              {memoryCurrentness.map((k) => (
                <option key={k}>{k}</option>
              ))}
            </select>
          </label>
          <label>
            Operation identity{' '}
            <input
              name="operation"
              defaultValue={query['operation'] ?? ''}
              maxLength={2000}
            />
          </label>
          <button>Filter</button>
        </form>
        <IntelligenceActionForm environment={c.environment.id} mode="MEMORY" />
        {!facts.length && (
          <p>
            No matching observations. Refresh after eligible executions or human
            reviews; blocked and cancelled runs do not prove behavior.
          </p>
        )}
        <ul>
          {facts.map((f) => (
            <li key={f.id} className="my-4 rounded border p-4">
              <Link href={'/memory/' + f.id}>{f.kind}</Link>
              <p>
                {f.operation_id ?? 'Operation unavailable'} | {f.currentness} |{' '}
                {f.observation_count} observations
              </p>
              <p>
                First {f.first_observed_at} | Last {f.last_observed_at}
              </p>
              <p>
                Source {f.api_import_id} | Environment {c.environment.type}
              </p>
            </li>
          ))}
        </ul>
        <nav aria-label="Memory pagination">
          {page > 0 && <Link href={link(page - 1)}>Previous </Link>}
          {facts.length === 25 && <Link href={link(page + 1)}>Next</Link>}
        </nav>
      </main>
    );
  } catch {
    return (
      <p role="alert">
        Unable to load memory. Check filters, project permissions and migration
        availability.
      </p>
    );
  }
}
