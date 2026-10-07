// Presentation metadata only. No customer records or domain behavior.
export const productRoutes = [
  {
    href: '/',
    title: 'Overview',
    group: null,
    icon: 'overview',
    description:
      'An evidence-backed view of API quality and release readiness.',
    emptyTitle: 'Start with your first project.',
    emptyDescription:
      'A project brings your API specification, test plans and evidence into one place. Project setup is coming soon.',
  },
  {
    href: '/api-map',
    title: 'API Map',
    group: 'Project',
    icon: 'map',
    description:
      'Understand your API as a system of resources, actors and workflows.',
    emptyTitle: 'No API model yet.',
    emptyDescription:
      'When API import is available, your specification will form the starting point for a connected behaviour map.',
  },
  {
    href: '/requirements',
    title: 'Requirements',
    group: 'Project',
    icon: 'requirements',
    description:
      'Connect intended behaviour to the tests and evidence that support it.',
    emptyTitle: 'No requirements have been discovered.',
    emptyDescription:
      'Requirements will be grounded in your API specification, supporting documentation and human review.',
  },
  {
    href: '/risks',
    title: 'Risks',
    group: 'Project',
    icon: 'risks',
    description: 'Focus coverage on the behaviours that matter most.',
    emptyTitle: 'No risks have been assessed.',
    emptyDescription:
      'Risk assessment will begin with project knowledge. Inferred risks will include their source and uncertainty.',
  },
  {
    href: '/tests',
    title: 'Test Studio',
    group: 'Testing',
    icon: 'tests',
    description: 'Shape a structured test plan before anything is executed.',
    emptyTitle: 'No tests have been generated.',
    emptyDescription:
      'Future test plans will connect requirements and risks to reviewable, structured test cases.',
  },
  {
    href: '/runs',
    title: 'Runs',
    group: 'Testing',
    icon: 'runs',
    description:
      'Inspect execution results alongside the evidence they produced.',
    emptyTitle: 'No test runs yet.',
    emptyDescription:
      'Approved tests will run within explicit environment policies. API execution is not available yet.',
  },
  {
    href: '/investigations',
    title: 'Investigations',
    group: 'Testing',
    icon: 'investigations',
    description:
      'Follow unexpected behaviour with focused, policy-bounded investigation.',
    emptyTitle: 'No investigations yet.',
    emptyDescription:
      'Runtime observations will guide hypotheses and suggested follow-up tests, within safety policies and budgets.',
  },
  {
    href: '/findings',
    title: 'Findings',
    group: 'Testing',
    icon: 'findings',
    description:
      'Review observations and potential defects with their supporting evidence.',
    emptyTitle: 'No findings.',
    emptyDescription:
      'No evidence-backed findings have been derived yet. This empty view does not mean an API is defect-free.',
  },
  {
    href: '/releases',
    title: 'Release Center',
    group: 'Release',
    icon: 'releases',
    description:
      'Make informed release decisions with traceable quality signals.',
    emptyTitle: 'No release has been created.',
    emptyDescription:
      'Release comparisons and recommendations will appear when project and execution evidence is available. Humans make the final decision.',
  },
  {
    href: '/reports',
    title: 'Reports',
    group: 'Release',
    icon: 'reports',
    description: 'Share the evidence behind API quality and release decisions.',
    emptyTitle: 'No reports generated.',
    emptyDescription:
      'Future reports will summarize verified results, coverage and findings without hiding uncertainty.',
  },
  {
    href: '/ask',
    title: 'Ask TestPilot',
    group: 'Intelligence',
    icon: 'ask',
    description: 'Explore your API with answers grounded in project knowledge.',
    emptyTitle: 'Project knowledge comes first.',
    emptyDescription:
      'Project-specific answers require imported specifications and verified evidence. Questions and AI answers are not available yet.',
  },
  {
    href: '/memory',
    title: 'Memory',
    group: 'Intelligence',
    icon: 'memory',
    description: 'Preserve evidence-backed learning and human decisions.',
    emptyTitle: 'No verified project memory yet.',
    emptyDescription:
      'Memory will retain observations, known behaviour and human decisions with provenance. Nothing has been recorded yet.',
  },
  {
    href: '/settings',
    title: 'Settings',
    group: null,
    icon: 'settings',
    description:
      'A home for future workspace, project and environment controls.',
    emptyTitle: 'Settings are not configured.',
    emptyDescription:
      'Account access, workspaces and environment configuration will arrive in future setup flows. There is no saved configuration yet.',
  },
] as const;

export type ProductRoute = (typeof productRoutes)[number];
export type NavigationIcon = ProductRoute['icon'];
export const navigationGroups = [
  'Project',
  'Testing',
  'Release',
  'Intelligence',
] as const;

export function findProductRoute(pathname: string) {
  const normalized =
    pathname.length > 1 ? pathname.replace(/\/+$/, '') : pathname;
  return productRoutes.find((route) => route.href === normalized);
}

export function isRouteActive(pathname: string, href: string) {
  const normalized =
    pathname.length > 1 ? pathname.replace(/\/+$/, '') : pathname;
  return (
    normalized === href || (href !== '/' && normalized.startsWith(`${href}/`))
  );
}
