'use client';
import { useState } from 'react';
import type { ApiKnowledge, Json } from '@testpilot/domain';
import { object, schemaType, constraints } from './presentation';

export function TechnicalDetails({
  value,
  label = 'Technical details',
}: {
  value: unknown;
  label?: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <details
      onToggle={(e) => setOpen(e.currentTarget.open)}
      className="mt-3 min-w-0 rounded-md border border-border p-3"
    >
      <summary className="cursor-pointer text-xs font-medium focus-visible:outline-2 focus-visible:outline-ring">
        {label}
      </summary>
      <pre className="mt-3 max-h-72 overflow-auto whitespace-pre-wrap break-all rounded bg-muted p-3 text-xs">
        {open ? JSON.stringify(value, null, 2) : null}
      </pre>
    </details>
  );
}
export function DataTable({
  headers,
  rows,
}: {
  headers: string[];
  rows: React.ReactNode[][];
}) {
  return (
    <div className="min-w-0 overflow-x-auto">
      <table className="w-full text-left text-sm">
        <thead>
          <tr>
            {headers.map((h) => (
              <th
                scope="col"
                key={h}
                className="border-b border-border px-3 py-2 text-xs font-medium text-muted-foreground"
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i}>
              {row.map((cell, j) => (
                <td
                  key={j}
                  className="max-w-sm border-b border-border px-3 py-2 align-top whitespace-pre-wrap break-words [overflow-wrap:anywhere]"
                >
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
export function SchemaReference({
  schema,
  knowledge,
}: {
  schema: Json | undefined;
  knowledge: ApiKnowledge;
}) {
  const ref = object(schema)['$ref'];
  let exists = false;
  if (typeof ref === 'string' && ref.startsWith('#/components/')) {
    let current: Json | undefined = knowledge.components;
    for (const key of ref.slice('#/components/'.length).split('/'))
      current = object(current)[key.replace(/~1/g, '/').replace(/~0/g, '~')];
    exists = current !== undefined;
  }
  return (
    <span>
      {schemaType(schema)}
      {object(schema)['type'] === 'array' &&
        object(schema)['items'] !== undefined && (
          <span className="block text-xs">
            Items:{' '}
            <SchemaReference
              schema={object(schema)['items']}
              knowledge={knowledge}
            />
          </span>
        )}

      {typeof ref === 'string' && (
        <span className="block text-xs text-muted-foreground">
          {exists
            ? 'Local reference declared; definition available in Schemas & Security.'
            : 'Reference not resolved in this view; inspect source details.'}
        </span>
      )}
    </span>
  );
}
export function ContentTable({
  content,
  knowledge,
}: {
  content: Json;
  knowledge: ApiKnowledge;
}) {
  const entries = Object.entries(object(content));
  return entries.length ? (
    <DataTable
      headers={['Content type', 'Schema', 'Constraints']}
      rows={entries.map(([type, v]) => [
        type,
        <SchemaReference
          key={type}
          schema={object(v)['schema']}
          knowledge={knowledge}
        />,
        constraints(object(v)['schema']),
      ])}
    />
  ) : (
    <p className="text-sm text-muted-foreground">
      No content or media type declared.
    </p>
  );
}
export function SecurityRequirements({ value }: { value: Json }) {
  if (!Array.isArray(value)) return <p>Security declaration unavailable.</p>;
  if (!value.length)
    return (
      <p className="text-sm">
        No security requirement declared. This does not prove the live API is
        public.
      </p>
    );
  return (
    <div className="space-y-2 text-sm">
      <p className="text-muted-foreground">
        Any one alternative may satisfy this declaration. All schemes within an
        alternative are required together.
      </p>
      {value.map((v, i) => {
        const schemes = Object.entries(object(v));
        return (
          <div key={i} className="rounded border border-border p-3">
            <p className="mb-1 text-xs text-muted-foreground">
              Alternative {i + 1}
            </p>
            {schemes.length ? (
              schemes.map(([name, scopes], j) => (
                <p key={name}>
                  {j > 0 ? 'AND ' : ''}
                  {name}{' '}
                  {Array.isArray(scopes) && scopes.length
                    ? `(scopes: ${scopes.join(', ')})`
                    : '(no scopes required)'}
                </p>
              ))
            ) : (
              <p>No authentication required for this alternative.</p>
            )}
          </div>
        );
      })}
    </div>
  );
}
export function ServerDeclarations({ value }: { value: Json }) {
  return (
    <div className="space-y-2 text-sm">
      <p className="text-muted-foreground">
        Specification declarations only. These URLs have not been verified and
        are not authorized execution targets.
      </p>
      {Array.isArray(value) && value.length ? (
        value.map((s, i) => (
          <div className="break-words rounded border border-border p-2" key={i}>
            <p className="font-mono text-xs [overflow-wrap:anywhere]">
              {typeof object(s)['url'] === 'string'
                ? String(object(s)['url'])
                : 'URL not declared'}
            </p>
            {typeof object(s)['description'] === 'string' && (
              <p>{String(object(s)['description'])}</p>
            )}
            {Object.keys(object(object(s)['variables'])).length > 0 && (
              <p className="text-xs">
                URL variables declared. Full definitions are available in
                technical details.
              </p>
            )}
          </div>
        ))
      ) : (
        <p>No server URL declared.</p>
      )}
    </div>
  );
}
export function SchemasView({ knowledge: k }: { knowledge: ApiKnowledge }) {
  const schemas = Object.entries(object(object(k.components)['schemas']));
  return (
    <section className="space-y-5" aria-label="Schemas and security">
      <div>
        <h2 className="text-lg font-semibold">Imported schemas</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          {k.schemaCount} component schemas imported. Graph schema nodes are a
          separate metric.
        </p>
      </div>
      {!schemas.length && <p>No component schemas declared.</p>}
      {schemas.map(([name, value]) => {
        const s = object(value),
          properties = Object.entries(object(s['properties'])),
          required = Array.isArray(s['required']) ? s['required'] : [];
        return (
          <details
            key={name}
            className="min-w-0 rounded-lg border border-border p-4"
          >
            <summary className="cursor-pointer break-words font-medium focus-visible:outline-2 focus-visible:outline-ring">
              {name}{' '}
              <span className="text-xs font-normal text-muted-foreground">
                {schemaType(value)}
              </span>
            </summary>
            <div className="mt-3 space-y-3">
              <p className="text-sm">{constraints(value)}</p>
              <SchemaReference schema={value} knowledge={k} />
              {typeof s['description'] === 'string' && (
                <p className="text-sm">{s['description']}</p>
              )}
              {properties.length ? (
                <DataTable
                  headers={['Field', 'Type', 'Required', 'Constraints']}
                  rows={properties.map(([field, v]) => [
                    field,
                    <SchemaReference key={field} schema={v} knowledge={k} />,
                    required.includes(field) ? 'Yes' : 'No',
                    constraints(v),
                  ])}
                />
              ) : (
                <p className="text-sm text-muted-foreground">
                  No direct fields declared. Composition and reference
                  constraints are preserved in technical details.
                </p>
              )}
              {['oneOf', 'anyOf', 'allOf', 'not', 'if', 'then', 'else']
                .filter((key) => s[key] !== undefined)
                .map((key) => (
                  <p className="text-sm" key={key}>
                    {key}: declared; inspect the complete schema below. Fields
                    above are direct declarations only.
                  </p>
                ))}
              <TechnicalDetails value={value} />
            </div>
          </details>
        );
      })}
      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Security schemes</h2>
        {Object.keys(object(k.securitySchemes)).length ? (
          Object.entries(object(k.securitySchemes)).map(([name, v]) => {
            const s = object(v);
            return (
              <article
                key={name}
                className="rounded-lg border border-border p-4"
              >
                <h3 className="font-medium break-words">{name}</h3>
                <DataTable
                  headers={['Type', 'Scheme / location', 'Description']}
                  rows={[
                    [
                      String(s['type'] ?? 'Not declared'),
                      [s['scheme'], s['in'], s['name']]
                        .filter((x) => typeof x === 'string')
                        .join(' / ') || 'Not declared',
                      String(s['description'] ?? 'Not declared'),
                    ],
                  ]}
                />
                {s['flows'] && (
                  <p className="mt-2 text-sm">
                    OAuth flows and scopes are declared; inspect full
                    definitions below.
                  </p>
                )}
                <TechnicalDetails value={v} />
              </article>
            );
          })
        ) : (
          <p>No security schemes declared.</p>
        )}
        <h3 className="font-medium">Global security requirements</h3>
        <SecurityRequirements value={k.globalSecurity} />
      </section>
      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Declared servers</h2>
        <ServerDeclarations value={k.servers} />
      </section>
      <TechnicalDetails
        value={{
          components: k.components,
          tags: k.tags,
          servers: k.servers,
          security: k.globalSecurity,
          references: k.references,
        }}
        label="Technical details: components and source references"
      />
    </section>
  );
}
