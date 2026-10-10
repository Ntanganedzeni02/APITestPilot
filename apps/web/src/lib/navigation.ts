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
      'A project brings your API specification, test plans and evidence into one place. Create a project to begin.',
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
      'Import a specification to create a connected, deterministic behaviour map.',
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
      'Create a plan from an analysis to connect requirements and risks to reviewable test cases.',
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
      'Approved tests will run within explicit environment policies. Execution requires an approved case, an explicit target and an independent safety decision.',
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
      'Create an evidence-scoped release, inspect deterministic assessments and record an explicit human decision.',
  },
  {
    href: '/reports',
    title: 'Reports',
    group: 'Release',
    icon: 'reports',
    description: 'Share the evidence behind API quality and release decisions.',
    emptyTitle: 'No reports generated.',
    emptyDescription:
      'Generate an immutable report from a release assessment and its recorded human decision.',
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
      'Workspace context, appearance and links to existing execution controls.',
    emptyTitle: 'Settings are not configured.',
    emptyDescription:
      'Workspace and project selection, appearance and execution controls are available. Provider credential management is not exposed here.',
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
  return (
    productRoutes.find((route) => route.href === normalized) ??
    productRoutes.find(
      (route) => route.href !== '/' && normalized.startsWith(route.href + '/'),
    )
  );
}

export function isRouteActive(pathname: string, href: string) {
  const normalized =
    pathname.length > 1 ? pathname.replace(/\/+$/, '') : pathname;
  return (
    normalized === href || (href !== '/' && normalized.startsWith(`${href}/`))
  );
}
