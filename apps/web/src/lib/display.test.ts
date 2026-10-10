import { expect, it } from 'vitest';
import {
  entityName,
  readableDate,
  readableStatus,
  readableProposalTitle,
} from './display';
it('dates are readable and consistently UTC', () => {
  expect(readableDate('2026-10-08T13:00:00+02:00')).toBe(
    readableDate('2026-10-08T11:00:00Z'),
  );
  expect(readableDate('bad')).toBe('Date unavailable');
});
it('same-name entities have stable distinct labels independent of ordering', () => {
  expect(entityName('Catalog API', 'Analysis', 'a')).not.toBe(
    entityName('Catalog API', 'Analysis', 'b'),
  );
  expect(entityName('Catalog API', 'Analysis', 'a')).toContain(
    'Catalog API - Analysis',
  );
  expect(entityName(undefined, 'Plan', 'a')).toContain('API - Plan');
});
it('status display does not change underlying values', () => {
  expect(readableStatus('REVIEW_REQUIRED')).toBe('Review required');
});

it('technical rule titles become readable without changing stored values', () => {
  expect(readableProposalTitle('TEST_BOUNDARY_MIN: catalog')).toBe(
    'Boundary min: catalog',
  );
});

it('operation display decodes declared paths without inventing an endpoint for unknown provenance', async () => {
  const { operationDisplay } = await import('./display');
  expect(operationDisplay('GET', '#/paths/~1items~1{id}/get')).toBe(
    'GET /items/{id}',
  );
  expect(operationDisplay('POST', 'unknown-identity')).toBe('POST operation');
});
