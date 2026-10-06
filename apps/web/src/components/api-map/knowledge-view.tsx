import type { ApiKnowledge, Json } from '@testpilot/domain';

function JsonDetail({ label, value }: { label: string; value: Json }) {
  return (
    <details className="mt-3 min-w-0">
      <summary className="cursor-pointer font-medium">{label}</summary>
      <pre className="mt-2 max-h-80 overflow-auto whitespace-pre-wrap break-all rounded-md bg-surface p-3 text-xs">
        {JSON.stringify(value, null, 2)}
      </pre>
    </details>
  );
}
export function KnowledgeView({ knowledge: k }: { knowledge: ApiKnowledge }) {
  const groups = new Map<string, typeof k.operations>();
  for (const operation of k.operations) {
    const group = operation.tags[0] ?? 'Untagged';
    groups.set(group, [...(groups.get(group) ?? []), operation]);
  }
  return (
    <section className="mt-8 min-w-0 space-y-6">
      <div className="break-words">
        <h2 className="text-xl font-semibold">{k.title}</h2>
        <p className="mt-2 text-sm">
          API version {k.version} · OpenAPI {k.openapiVersion}
        </p>
        {k.description && (
          <p className="mt-3 whitespace-pre-wrap text-sm text-muted-foreground">
            {k.description}
          </p>
        )}
      </div>
      <div className="flex flex-wrap gap-4 text-sm">
        <span>{k.operations.length} operations</span>
        <span>{k.schemaCount} schemas</span>
        <span>{k.componentCount} components</span>
        <span>
          {Object.keys(k.securitySchemes ?? {}).length} security schemes
        </span>
      </div>
      <JsonDetail label="Servers / base URLs" value={k.servers} />
      <JsonDetail label="Declared tags" value={k.tags} />
      <JsonDetail
        label="Global security requirements"
        value={k.globalSecurity}
      />
      <JsonDetail label="Security schemes" value={k.securitySchemes} />
      <JsonDetail label="Components / schemas" value={k.components} />
      <p className="text-sm text-muted-foreground">
        Imported specification knowledge only. No API calls, tests, health
        scores or risk assessments have been performed.
      </p>
      {[...groups].map(([tag, operations]) => (
        <section key={tag} className="min-w-0">
          <h3 className="mb-3 break-words font-semibold">{tag}</h3>
          <div className="space-y-3">
            {operations.map((op) => (
              <details
                key={op.key}
                className="min-w-0 rounded-lg border border-border p-4"
              >
                <summary className="cursor-pointer break-all">
                  <span className="font-mono font-semibold">
                    {op.method} {op.path}
                  </span>
                  {op.summary && (
                    <span className="ml-3 text-sm">{op.summary}</span>
                  )}
                  {op.deprecated && (
                    <span className="ml-2 text-xs">Deprecated</span>
                  )}
                </summary>
                <div className="mt-4 min-w-0 text-sm">
                  <p className="break-words">
                    Operation ID: {op.operationId ?? 'Not declared'}
                  </p>
                  <p className="mt-2 break-all font-mono text-xs">
                    Source: {op.sourcePointer}
                  </p>
                  {op.description && (
                    <p className="mt-3 whitespace-pre-wrap break-words">
                      {op.description}
                    </p>
                  )}
                  <p className="mt-3 break-words">
                    Tags: {op.tags.join(', ') || 'None'}
                  </p>
                  <JsonDetail
                    label="Parameters"
                    value={op.parameters as unknown as Json}
                  />
                  <JsonDetail
                    label="Request body / media types"
                    value={op.requestBody as unknown as Json}
                  />
                  <JsonDetail
                    label="Responses / media types"
                    value={op.responses as unknown as Json}
                  />
                  <JsonDetail
                    label="Effective security requirements"
                    value={op.security}
                  />
                  <JsonDetail label="Effective servers" value={op.servers} />
                </div>
              </details>
            ))}
          </div>
        </section>
      ))}
      {!k.operations.length && (
        <p>No operations are declared in this specification.</p>
      )}
    </section>
  );
}
