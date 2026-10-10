import { describe, expect, it } from 'vitest';
import {
  findProductRoute,
  isRouteActive,
  navigationGroups,
  productRoutes,
} from './navigation';

describe('product navigation', () => {
  it('represents the approved routes once, without customer records', () => {
    expect(productRoutes.map(({ href, title }) => [href, title])).toEqual([
      ['/', 'Overview'],
      ['/api-map', 'API Map'],
      ['/requirements', 'Requirements'],
      ['/risks', 'Risks'],
      ['/tests', 'Test Studio'],
      ['/runs', 'Runs'],
      ['/investigations', 'Investigations'],
      ['/findings', 'Findings'],
      ['/releases', 'Release Center'],
      ['/reports', 'Reports'],
      ['/ask', 'Ask TestPilot'],
      ['/memory', 'Memory'],
      ['/settings', 'Settings'],
    ]);
    expect(new Set(productRoutes.map(({ href }) => href)).size).toBe(13);
    for (const route of productRoutes) {
      expect(Object.keys(route).sort()).toEqual([
        'description',
        'emptyDescription',
        'emptyTitle',
        'group',
        'href',
        'icon',
        'title',
      ]);
    }
  });

  it('preserves the approved navigation group membership', () => {
    expect(navigationGroups).toEqual([
      'Project',
      'Testing',
      'Release',
      'Intelligence',
    ]);
    expect(
      navigationGroups.map((group) =>
        productRoutes
          .filter((route) => route.group === group)
          .map((route) => route.href),
      ),
    ).toEqual([
      ['/api-map', '/requirements', '/risks'],
      ['/tests', '/runs', '/investigations', '/findings'],
      ['/releases', '/reports'],
      ['/ask', '/memory'],
    ]);
  });

  it('matches exact routes and nested segments without prefix collisions', () => {
    expect(isRouteActive('/', '/')).toBe(true);
    expect(isRouteActive('/runs', '/')).toBe(false);
    expect(isRouteActive('/tests/', '/tests')).toBe(true);
    expect(isRouteActive('/tests/review', '/tests')).toBe(true);
    expect(isRouteActive('/tests-other', '/tests')).toBe(false);
    expect(findProductRoute('/runs/')?.title).toBe('Runs');
    expect(findProductRoute('/not-a-product-route')).toBeUndefined();
  });
});
