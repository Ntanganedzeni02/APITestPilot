import { expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  requirementCounts,
  filterRequirements,
  requirementEntities,
} from './requirement-presentation';
import { RequirementsView } from './requirements-view';
import {
  analysis,
  snapshot,
  requirement,
  time,
} from './requirements.test-fixture';
vi.mock('./action-form', () => ({ QaActionForm: () => null }));
it('counts current statuses accurately and returns edited approvals to review without rewriting originals', () => {
  const a = structuredClone(analysis),
    items = a.records.filter((i) => i.kind === 'REQUIREMENT');
  for (const [index, decision] of ['APPROVE', 'REJECT', 'APPROVE'].entries())
    items[index]!.reviews.push({
      id: String(index),
      itemId: items[index]!.id,
      actorId: a.createdBy,
      createdAt: time,
      decision: decision as 'APPROVE' | 'REJECT',
      rationale: 'Fixture',
      title: null,
      statement: null,
    });
  items[2]!.reviews.push({
    id: 'edit',
    itemId: items[2]!.id,
    actorId: a.createdBy,
    createdAt: time,
    decision: 'EDIT',
    rationale: 'Revision fixture',
    title: 'Revised requirement',
    statement: 'Revised statement',
  });
  expect(requirementCounts(a)).toEqual({
    total: items.length,
    approved: 1,
    rejected: 1,
    awaiting: items.length - 2,
  });
  expect(items[2]!.title).not.toBe('Revised requirement');
});
it('searches actual titles, statements and entities while retaining all filters', () => {
  const base = {
    search: '',
    status: 'ALL',
    category: 'ALL',
    source: 'ALL',
    entity: 'ALL',
  };
  expect(
    filterRequirements(analysis, snapshot, {
      ...base,
      search: requirement.title,
    }),
  ).toContain(requirement);
  expect(
    filterRequirements(analysis, snapshot, {
      ...base,
      entity: requirement.nodeRefs[0]!,
    }),
  ).toContain(requirement);
  expect(
    filterRequirements(analysis, snapshot, {
      ...base,
      search: requirementEntities(requirement, snapshot)[0]!,
    }),
  ).toContain(requirement);
  expect(
    filterRequirements(analysis, snapshot, {
      ...base,
      category: requirement.category,
      source: requirement.sourceKind,
    }),
  ).toContain(requirement);
  expect(
    filterRequirements(analysis, snapshot, { ...base, status: 'APPROVED' }),
  ).toEqual([]);
  expect(
    filterRequirements(analysis, snapshot, {
      ...base,
      search: 'not-a-fixture-match',
    }),
  ).toEqual([]);
});
it('renders compact cards and readable sources with unchanged titles, safe text and default collapsed requirements', () => {
  const a = structuredClone(analysis);
  a.records.find((i) => i.kind === 'REQUIREMENT')!.title =
    '<script>untrusted requirement</script>';
  const html = renderToStaticMarkup(
    <RequirementsView analysis={a} graph={snapshot} role="OWNER" />,
  );
  for (const text of [
    'Awaiting review',
    'Approved',
    'Rejected',
    'Source breakdown',
    'Search requirements',
    'Specification',
    'Requirement 1',
  ])
    expect(html).toContain(text);
  expect(html).toContain('&lt;script&gt;');
  expect(html).not.toContain('<script>');
  expect(html).not.toContain('Review requirement');
  expect(html.replace(/<[^>]*>/g, '')).not.toContain(a.id);
  expect(html).toContain('Summary counts cover this entire analysis');
});
it('historical missing entity metadata never uses UUIDs as visible labels', () => {
  expect(requirementEntities(requirement, null)).toEqual([]);
  const html = renderToStaticMarkup(
    <RequirementsView analysis={analysis} graph={null} role="MEMBER" />,
  );
  expect(html).toContain('Historical entity details unavailable');
  expect(html.replace(/<[^>]*>/g, '')).not.toContain(requirement.nodeRefs[0]!);
});
