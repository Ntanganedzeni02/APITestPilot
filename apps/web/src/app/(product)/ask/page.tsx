import { DetailDrawer } from '../../../components/ui/detail-drawer';
import Link from 'next/link';
import { MessagesSquare, LockKeyhole } from 'lucide-react';
import { getTenantContext } from '../../../lib/tenancy/context';
import { PageHeader, Card, StatusBadge } from '../../../components/ui/product';
export default async function Ask() {
  const { project, workspace } = await getTenantContext();
  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <PageHeader
        title="Ask TestPilot"
        eyebrow={project?.name ?? workspace?.name ?? 'Your workspace'}
        description="A future conversation with your API knowledge and evidence."
        actions={<StatusBadge value="PREVIEW" />}
      />
      <Card className="p-6 sm:p-8">
        <MessagesSquare
          className="mb-5 size-8 text-primary"
          aria-hidden="true"
        />
        <h2 className="text-xl">Clarity starts with a good question</h2>
        <p className="mt-3 max-w-xl text-muted-foreground">
          Conversational AI is not available yet. This is an interface preview:
          nothing you type is submitted, saved or sent to an AI provider.
        </p>
        <div className="mt-6 grid gap-3 sm:grid-cols-2">
          {[
            [
              '/api-map',
              'What does this API expose?',
              'Explore imported specification facts',
            ],
            [
              '/risks',
              'What needs more attention?',
              'Review specification-derived risk signals',
            ],
            [
              '/tests',
              'What should we test next?',
              'Inspect the selected analysis and plans',
            ],
            [
              '/findings',
              'What does the evidence show?',
              'Review persisted findings and human decisions',
            ],
          ].map(([href, title, description]) => (
            <Link
              className="rounded-xl border border-border p-4 hover:bg-muted"
              key={href}
              href={href!}
            >
              <span className="block font-medium">{title}</span>
              <span className="mt-1 block text-xs text-muted-foreground">
                {description}
              </span>
            </Link>
          ))}
        </div>
        <label className="form-label mt-6">
          Ask about your project
          <textarea
            disabled
            rows={3}
            placeholder="Conversational preview ? not activated"
            className="form-input"
            aria-describedby="assistant-availability"
          />
        </label>
        <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
          <p
            id="assistant-availability"
            className="flex items-center gap-2 text-xs text-muted-foreground"
          >
            <LockKeyhole className="size-3.5" aria-hidden="true" />
            No conversation backend is connected.
          </p>
          <button
            disabled
            className="rounded-lg bg-primary px-4 py-2 text-sm text-primary-foreground opacity-50"
          >
            Send unavailable
          </button>
        </div>
      </Card>
      <Card title="Grounding and control">
        <DetailDrawer
          title="Grounding and human control"
          description="Design boundaries for the planned assistant."
          trigger={
            <button type="button" className="button-link">
              How the assistant will work
            </button>
          }
        >
          <ul className="space-y-4 text-sm">
            <li>
              Answers must cite authorized project facts and distinguish
              evidence from hypotheses.
            </li>
            <li>Suggestions must pass validation and human review.</li>
            <li>Execution remains a separate policy-authorized action.</li>
            <li>
              No conversations or AI requests are submitted by this preview.
            </li>
          </ul>
        </DetailDrawer>
        <p className="text-sm text-muted-foreground">
          The intended assistant will cite authorized project knowledge and
          evidence. It will not approve tests, execute requests or decide
          releases. Existing AI-assisted planning is a separate configured
          workflow with admission budgets and human review.
        </p>
        <Link href="/tests" className="button-link mt-4">
          Open Test Studio
        </Link>
      </Card>
    </div>
  );
}
