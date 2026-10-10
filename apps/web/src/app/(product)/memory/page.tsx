import { QueryFilters } from '../../../components/ui/query-filters';
import { TechnicalDetails } from '../../../components/api-map/spec-details';
import { readableStatus, entityName } from '../../../lib/display';
import {
  PageHeader,
  StatusBadge,
  EmptyState,
} from '../../../components/ui/product';
import { LocalTime } from '../../../components/ui/local-time';
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
        <PageHeader
          title="Evidence Memory"
          description="Persistent observations and human decisions, with full provenance."
        />
        <p>
          Verified observations and human decisions, with retained historical
          provenance. Not AI notes or a defect confirmation engine.
        </p>
        <QueryFilters
          key={JSON.stringify(query)}
          query={query}
          environment={{
            id: c.environment.id,
            options: c.environments.map((e) => ({
              value: e.id,
              label: readableStatus(e.type),
            })),
          }}
          fields={[
            {
              name: 'kind',
              label: 'Type',
              value: query['kind'] ?? '',
              options: memoryKinds.map((value) => ({
                value,
                label: readableStatus(value),
              })),
            },
            {
              name: 'currentness',
              label: 'Currentness',
              value: query['currentness'] ?? '',
              options: memoryCurrentness.map((value) => ({
                value,
                label: readableStatus(value),
              })),
            },
            {
              name: 'operation',
              label: 'Operation identity',
              value: query['operation'] ?? '',
            },
          ]}
        />
        <IntelligenceActionForm environment={c.environment.id} mode="MEMORY" />
        {!facts.length && (
          <EmptyState
            title="No matching observations"
            description="Refresh after eligible executions or human reviews. Blocked and cancelled runs do not prove behavior."
            href="/runs"
            action="Inspect execution evidence"
          />
        )}
        <ul className="grid gap-3 md:grid-cols-2">
          {facts.map((f) => (
            <li key={f.id} className="product-card">
              <Link href={'/memory/' + f.id}>{readableStatus(f.kind)}</Link>
              <p>
                {f.operation_id
                  ? entityName('API', 'Operation', f.operation_id)
                  : 'Operation unavailable'}{' '}
                | <StatusBadge value={f.currentness} /> | {f.observation_count}{' '}
                observations
              </p>
              <p>
                First <LocalTime value={f.first_observed_at} /> | Last{' '}
                <LocalTime value={f.last_observed_at} />
              </p>
              <p>Environment {readableStatus(c.environment.type)}</p>
              <TechnicalDetails
                value={{
                  importId: f.api_import_id,
                  operationId: f.operation_id,
                }}
                label="Technical details: memory identity"
              />
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
