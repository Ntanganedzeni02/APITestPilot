import { it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { assessQuality, type QualityAssessment } from '@testpilot/domain';
import { QualityPanel } from './quality-panel';
const assessment: QualityAssessment = {
  id: 'labeled-fixture',
  workspace_id: 'w',
  project_id: 'p',
  environment_id: 'e',
  api_import_id: 'source',
  fingerprint: 'fixture',
  scoring_version: 'api-quality-v1',
  assessed_at: '2026-10-07',
  created_by: 'a',
  result: assessQuality({
    sourceId: 'source',
    analysisId: null,
    knownOperations: 100,
    testedOperations: 1,
    activeRequirements: 0,
    coveredRequirements: 0,
    riskWeight: 0,
    coveredRiskWeight: 0,
    executionPoints: 100,
    findingPenalty: 0,
    freshnessPoints: 100,
    gaps: { requirements: [], risks: [], operations: ['hash'] },
    provenance: {
      runIds: [],
      packageIds: [],
      findingIds: [],
      reviewIds: [],
      stateHash: 'fixture',
    },
  }),
};
it('empty assessment is explicitly unknown', () => {
  const html = renderToStaticMarkup(
    <QualityPanel current={null} previous={null} />,
  );
  expect(html).toContain('Unknown');
  expect(html).toContain('Missing evidence never means passing');
});
it('shows all explainable dimensions and low confidence for sparse evidence', () => {
  const html = renderToStaticMarkup(
    <QualityPanel current={assessment} previous={null} latestSource="source" />,
  );
  for (const text of [
    'requirements',
    'risks',
    'execution',
    'findings',
    'freshness',
    'LOW confidence',
    '100',
    'Recently asserted',
    'Not comparable',
    'Human release authority',
  ])
    expect(html).toContain(text);
});
it('new source cannot inherit score as current', () =>
  expect(
    renderToStaticMarkup(
      <QualityPanel
        current={assessment}
        previous={null}
        latestSource="new-source"
      />,
    ),
  ).toContain('Historical source assessment'));
it('unknown score is never rendered as perfect', () => {
  const result = assessQuality({
    ...assessment.result.inputs,
    testedOperations: 0,
  });
  const html = renderToStaticMarkup(
    <QualityPanel
      current={{ ...assessment, result }}
      previous={null}
      latestSource="source"
    />,
  );
  expect(html).toContain('API Quality Score: Unknown');
  expect(html).toContain('UNKNOWN');
});
it('same source avoids false historical warning', () =>
  expect(
    renderToStaticMarkup(
      <QualityPanel
        current={assessment}
        previous={null}
        latestSource="source"
      />,
    ),
  ).not.toContain('Historical source assessment'));
