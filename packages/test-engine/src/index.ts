import {
  assertQaContext,
  assertTestPlan,
  requirementVersions,
  reviewState,
  graphLogicalId,
  ValidationError,
  type PlanningContext,
  type PlanningItem,
  type TestPlanInput,
  type Json,
} from '@testpilot/domain';
import {
  planningAiCatalog,
  validatePlanningAi,
  type TestPlanningProvider,
} from '@testpilot/ai';
export const PLANNING_ENGINE_VERSION = '1.0.0';
export const planningRules = [
  'TEST_REQUIRED_PARAMETER',
  'TEST_REQUIRED_BODY',
  'TEST_REQUIRED_PROPERTY',
  'TEST_SCHEMA_TYPE',
  'TEST_SCHEMA_FORMAT',
  'TEST_SCHEMA_ENUM',
  'TEST_SCHEMA_BOUNDARY',
  'TEST_STATE_VALUE',
  'TEST_SECURITY',
  'TEST_DECLARED_RESPONSE',
  'TEST_IDENTIFIER_DEPENDENCY',
  'TEST_RISK_INVESTIGATION',
  'TEST_REVIEW_OBJECTIVE',
] as const;
const object = (v: unknown): Record<string, Json> =>
  v && typeof v === 'object' && !Array.isArray(v)
    ? (v as Record<string, Json>)
    : {};
export function deriveTestPlan(context: PlanningContext): TestPlanInput {
  assertQaContext(context);
  const { analysis, source, snapshot } = context;
  if (
    analysis.workspaceId !== source.workspaceId ||
    analysis.projectId !== source.projectId ||
    analysis.importId !== source.id ||
    analysis.graphId !== snapshot.id
  )
    throw new ValidationError('Planning source mismatch.');
  const requirements = requirementVersions(analysis),
    versions = new Map(requirements.map((r) => [r.id, r]));
  const items = new Map<string, PlanningItem>();
  const requirementByKey = new Map(
    analysis.records
      .filter((r) => r.kind === 'REQUIREMENT')
      .map((r) => [r.logicalKey, r]),
  );
  const risksByReq = new Map<string, typeof analysis.records>();
  for (const r of analysis.records.filter(
    (r) => r.kind === 'RISK' && reviewState(r).status !== 'REJECTED',
  ))
    for (const q of r.requirementRefs) {
      const requirement = requirementByKey.get(q);
      if (requirement) {
        const list = risksByReq.get(requirement.id) ?? [];
        list.push(r);
        risksByReq.set(requirement.id, list);
      }
    }
  const nodes = new Map(snapshot.graph.nodes.map((n) => [n.id, n]));
  const operations = new Map(
    source.knowledge.operations.map((o) => [o.sourcePointer, o]),
  );
  function resolve(pointer: string): Record<string, Json> {
    const parts = pointer
      .slice(2)
      .split('/')
      .map((p) => p.replaceAll('~1', '/').replaceAll('~0', '~'));
    let current: unknown = { components: source.knowledge.components };
    for (const part of parts) current = object(current)[part];
    return object(current);
  }
  const statesByPointer = new Map<string, string[]>();
  for (const node of snapshot.graph.nodes.filter((n) => n.type === 'STATE'))
    for (const pointer of node.provenance.sourcePointers) {
      const list = statesByPointer.get(pointer) ?? [];
      list.push(node.id);
      statesByPointer.set(pointer, list);
    }
  for (const req of analysis.records.filter((r) => r.kind === 'REQUIREMENT')) {
    const version = versions.get(req.id)!;
    if (version.status === 'REJECTED') continue;
    const linked = risksByReq.get(req.id) ?? [];
    const priority = linked.some((r) => r.severity === 'CRITICAL')
      ? 'URGENT'
      : linked.some((r) => r.severity === 'HIGH')
        ? 'HIGH'
        : 'ROUTINE';
    const origin =
      req.sourceKind === 'AI_PROPOSED'
        ? 'AI_PROPOSED'
        : req.sourceKind === 'HUMAN_AUTHORED'
          ? 'HUMAN_AUTHORED'
          : 'DETERMINISTIC';
    const key = graphLogicalId('SCENARIO', req.logicalKey);
    const op = req.nodeRefs
      .map((id) => nodes.get(id))
      .filter((n) => n?.type === 'OPERATION')
      .map((n) => operations.get(n!.provenance.sourcePointers[0]!))
      .find(Boolean);
    const schemaPointer = req.sourcePointers
      .find((p) => p.startsWith('#/components/schemas/'))
      ?.replace(new RegExp('/(type|enum|required)$'), '');
    const schema = schemaPointer ? resolve(schemaPointer) : {};
    const evidence = req.nodeRefs.filter((id) => nodes.has(id));
    if (!evidence.length) continue;
    const scenario: PlanningItem = {
      logicalKey: key,
      kind: 'SCENARIO',
      scenarioKey: null,
      title: ('Verify ' + version.title).slice(0, 160),
      objective: version.statement,
      testType:
        req.category === 'SECURITY'
          ? 'AUTHENTICATION'
          : req.category === 'DEPENDENCY'
            ? 'DEPENDENCY'
            : req.category === 'VALIDATION'
              ? 'VALIDATION'
              : 'CONTRACT',
      caseType: null,
      priority,
      priorityReason: linked.length
        ? 'Highest linked risk severity determines priority; no numeric score.'
        : 'No elevated linked risk; routine coverage.',
      origin,
      derivationType:
        origin === 'DETERMINISTIC'
          ? 'DETERMINISTIC_INFERENCE'
          : origin === 'AI_PROPOSED'
            ? 'AI_INFERENCE'
            : 'HUMAN_SOURCE',
      confidence: origin === 'DETERMINISTIC' ? req.confidence : 'SUPPORTED',
      ruleId: 'TEST_REVIEW_OBJECTIVE',
      reason:
        'Derived from exact requirement and its pinned review version; runtime behavior unverified.',
      requirementRefs: [req.id],
      riskRefs: linked
        .map((r) => r.id)
        .sort()
        .slice(0, 30),
      nodeRefs: evidence,
      edgeRefs: req.edgeRefs,
      sourcePointers: req.sourcePointers,
      preconditions: [],
      input: {
        strategy: 'DECLARED_CONTRACT',
        pointer: schemaPointer ?? null,
        value: null,
      },
      expectedBehavior: version.statement,
      executable: false,
    };
    items.set(key, scenario);
    const add = (
      type: NonNullable<PlanningItem['caseType']>,
      expected: string,
      strategy: string,
      value: PlanningItem['input']['value'] = null,
      rule = 'TEST_REVIEW_OBJECTIVE',
      executable = true,
      preconditions: PlanningItem['preconditions'] = [],
    ) => {
      const logicalKey = graphLogicalId(
        'CASE',
        key,
        type,
        strategy,
        value === null ? '' : String(value),
      );
      if (!items.has(logicalKey))
        items.set(logicalKey, {
          ...scenario,
          logicalKey,
          kind: 'CASE',
          scenarioKey: key,
          title: (type + ' - ' + version.title).slice(0, 160),
          caseType: type,
          ruleId: rule,
          expectedBehavior: expected,
          input: {
            strategy,
            pointer: schemaPointer ?? req.sourcePointers[0] ?? null,
            value,
          },
          executable:
            executable &&
            origin === 'DETERMINISTIC' &&
            version.status === 'APPROVED' &&
            req.reviews.every((r) => r.decision !== 'EDIT'),
          preconditions,
        });
    };
    if (
      origin !== 'DETERMINISTIC' ||
      req.reviews.some((r) => r.decision === 'EDIT')
    ) {
      add(
        'CUSTOM',
        version.statement,
        'HUMAN_REVIEW_CONCEPT',
        null,
        'TEST_REVIEW_OBJECTIVE',
        false,
      );
      continue;
    }
    if (
      [
        'REQ_REQUIRED_PARAMETER',
        'REQ_REQUIRED_BODY',
        'REQ_REQUIRED_PROPERTY',
      ].includes(req.ruleId)
    ) {
      const rule = req.ruleId.replace('REQ_', 'TEST_');
      scenario.ruleId = rule;
      add(
        'VALID',
        'Required input is present and satisfies its declared contract.',
        'REQUIRED_PRESENT',
        null,
        rule,
      );
      add(
        'MISSING_REQUIRED',
        'Omitted required input does not satisfy the declared contract; no response status is inferred.',
        'OMIT_REQUIRED',
        null,
        rule,
      );
    } else if (req.ruleId === 'REQ_SCHEMA_TYPE') {
      scenario.ruleId = 'TEST_SCHEMA_TYPE';
      add(
        'VALID',
        'Value satisfies the declared type; no runtime outcome is asserted.',
        'DECLARED_TYPE',
        null,
        'TEST_SCHEMA_TYPE',
      );
      add(
        'INVALID_TYPE',
        'An incompatible input must not be accepted as satisfying the declared type contract; coercion behavior is unverified.',
        'INCOMPATIBLE_TYPE',
        null,
        'TEST_SCHEMA_TYPE',
      );
    } else if (
      req.ruleId === 'REQ_SCHEMA_ENUM' &&
      Array.isArray(schema['enum'])
    ) {
      scenario.ruleId = 'TEST_SCHEMA_ENUM';
      schema['enum']
        .slice(0, 30)
        .forEach((_, index) =>
          add(
            'ENUM_VALID',
            'Selected declared enum member satisfies the allowed-value contract.',
            'ENUM_INDEX',
            index,
            'TEST_SCHEMA_ENUM',
          ),
        );
      add(
        'ENUM_INVALID',
        'An undeclared value does not satisfy the allowed-value contract.',
        'OUTSIDE_ENUM',
        null,
        'TEST_SCHEMA_ENUM',
      );
    } else if (req.ruleId === 'REQ_SECURITY' && op) {
      const alternatives = Array.isArray(op.security) ? op.security : [];
      scenario.ruleId = 'TEST_SECURITY';
      add(
        'VALID',
        'Use a declared security alternative including all its required schemes/scopes; credential validity is a setup requirement.',
        'DECLARED_SECURITY',
        null,
        'TEST_SECURITY',
        true,
        [{ kind: 'AUTH_REQUIRED', reference: null }],
      );
      const scopes = alternatives
        .flatMap((a) => Object.values(object(a)))
        .flatMap((v) => (Array.isArray(v) ? v : []))
        .filter((v) => typeof v === 'string');
      if (scopes.length) {
        scenario.testType = 'AUTHORIZATION';
        scopes
          .slice(0, 30)
          .forEach((_, index) =>
            add(
              'VALID',
              'Verify explicitly declared OAuth scope requirements; no roles are inferred.',
              'DECLARED_SCOPE_INDEX',
              index,
              'TEST_SECURITY',
              true,
              [{ kind: 'AUTH_REQUIRED', reference: null }],
            ),
          );
      }
      if (!alternatives.some((s) => Object.keys(object(s)).length === 0))
        add(
          'UNAUTHORIZED',
          'Missing credentials do not satisfy the declared security requirement; no status code or role is inferred.',
          'OMIT_AUTH',
          null,
          'TEST_SECURITY',
        );
    } else if (req.ruleId === 'REQ_IDENTIFIER_DEPENDENCY') {
      scenario.ruleId = 'TEST_IDENTIFIER_DEPENDENCY';
      add(
        'DEPENDENCY_SETUP',
        'Obtain a compatible identifier from the declared dependency before verification.',
        'DEPENDENCY_OUTPUT',
        null,
        'TEST_IDENTIFIER_DEPENDENCY',
        true,
        [
          {
            kind: 'IDENTIFIER_FROM_OPERATION',
            reference: req.edgeRefs[0] ?? null,
          },
        ],
      );
    } else if (req.ruleId === 'REQ_RESPONSE_SCHEMA') {
      scenario.ruleId = 'TEST_DECLARED_RESPONSE';
      add(
        'VALID',
        'Response conforms to the linked declared schema; generating a request is a separate setup requirement.',
        'DECLARED_RESPONSE_SCHEMA',
        null,
        'TEST_DECLARED_RESPONSE',
        true,
        [{ kind: 'APPROVED_TEST_DATA', reference: null }],
      );
    } else
      add(
        'INVESTIGATION',
        version.statement,
        'REVIEW_CONTRACT',
        null,
        'TEST_REVIEW_OBJECTIVE',
        false,
      );
    if (schemaPointer) {
      const format = schema['format'];
      if (
        typeof format === 'string' &&
        ['email', 'uuid', 'date', 'date-time', 'uri'].includes(format)
      ) {
        add(
          'VALID_FORMAT',
          'Value follows the declared ' +
            format +
            ' format; format assertion behavior requires review.',
          'VALID_FORMAT',
          null,
          'TEST_SCHEMA_FORMAT',
          false,
        );
        add(
          'INVALID_FORMAT',
          'Investigate handling of a malformed ' +
            format +
            ' value; no rejection status is inferred.',
          'INVALID_FORMAT',
          null,
          'TEST_SCHEMA_FORMAT',
          false,
        );
      }
      const stateNodes = statesByPointer.get(schemaPointer + '/enum') ?? [];
      if (
        req.ruleId === 'REQ_SCHEMA_ENUM' &&
        stateNodes.length &&
        Array.isArray(schema['enum'])
      )
        schema['enum']
          .slice(0, 30)
          .forEach((_, index) =>
            add(
              'STATE_VALUE',
              'Cover the declared state value only; no transition is established.',
              'STATE_ENUM_INDEX',
              index,
              'TEST_STATE_VALUE',
            ),
          );
      for (const [field, base, kind, strategy] of [
        ['exclusiveMinimum', 'minimum', 'BELOW_MIN', 'EXCLUSIVE_MIN'],
        ['exclusiveMaximum', 'maximum', 'ABOVE_MAX', 'EXCLUSIVE_MAX'],
      ] as const) {
        const exclusive = schema[field];
        const bound =
          typeof exclusive === 'number'
            ? exclusive
            : exclusive === true && typeof schema[base] === 'number'
              ? schema[base]
              : null;
        if (typeof bound === 'number')
          add(
            kind,
            'A value at the exclusive bound does not satisfy the explicitly declared constraint; no response status is inferred.',
            strategy,
            bound,
            'TEST_SCHEMA_BOUNDARY',
          );
      }
      for (const [min, max, unit] of [
        ['minimum', 'maximum', 'NUMBER'],
        ['minLength', 'maxLength', 'LENGTH'],
        ['minItems', 'maxItems', 'ITEMS'],
      ] as const) {
        if (
          typeof schema[min] === 'number' &&
          !(min === 'minimum' && schema['exclusiveMinimum'] === true)
        ) {
          const bound = schema[min] as number;
          add(
            'BOUNDARY_MIN',
            'Value meets the explicitly declared ' + min + ' constraint.',
            unit + '_MIN',
            bound,
            'TEST_SCHEMA_BOUNDARY',
          );
          if (unit === 'NUMBER' || bound > 0)
            add(
              'BELOW_MIN',
              'Value violates the explicitly declared ' +
                min +
                ' constraint; no status is inferred.',
              unit + '_BELOW',
              bound - 1,
              'TEST_SCHEMA_BOUNDARY',
            );
        }
        if (
          typeof schema[max] === 'number' &&
          !(max === 'maximum' && schema['exclusiveMaximum'] === true)
        ) {
          const bound = schema[max] as number;
          add(
            'BOUNDARY_MAX',
            'Value meets the explicitly declared ' + max + ' constraint.',
            unit + '_MAX',
            bound,
            'TEST_SCHEMA_BOUNDARY',
          );
          add(
            'ABOVE_MAX',
            'Value violates the explicitly declared ' +
              max +
              ' constraint; no status is inferred.',
            unit + '_ABOVE',
            bound + 1,
            'TEST_SCHEMA_BOUNDARY',
          );
        }
      }
    }
    if (op)
      for (const response of op.responses.filter((r) =>
        /^4[0-9]{2}$/.test(r.status),
      ))
        add(
          'DECLARED_ERROR_RESPONSE',
          'Investigate the declared HTTP ' +
            response.status +
            ' response contract; triggering conditions must be reviewed.',
          'DECLARED_STATUS',
          Number(response.status),
          'TEST_DECLARED_RESPONSE',
          false,
        );
    for (const risk of linked.filter(
      (r) =>
        r.ruleId === 'RISK_ERROR_GAP' ||
        r.ruleId === 'RISK_DESTRUCTIVE' ||
        r.ruleId === 'RISK_STATE_SET',
    ))
      add(
        'INVESTIGATION',
        'Review linked ' +
          risk.category +
          ' coverage; no undeclared status, transition, repeated-delete or recovery semantics are inferred.',
        'RISK_' + risk.ruleId,
        null,
        'TEST_RISK_INVESTIGATION',
        false,
      );
  }
  const result: TestPlanInput = {
    workspaceId: source.workspaceId,
    projectId: source.projectId,
    importId: source.id,
    graphId: snapshot.id,
    analysisId: analysis.id,
    engineVersion: PLANNING_ENGINE_VERSION,
    status: 'DRAFT',
    aiStatus: 'NOT_CONFIGURED',
    aiMetadata: null,
    aiFailure: null,
    requirements,
    items: [...items.values()].sort((a, b) =>
      a.logicalKey < b.logicalKey ? -1 : a.logicalKey > b.logicalKey ? 1 : 0,
    ),
  };
  assertTestPlan(result);
  return result;
}
export async function generateTestPlan(
  context: PlanningContext,
  provider?: TestPlanningProvider,
  timeoutMs = 3000,
) {
  const result = deriveTestPlan(context);
  if (!provider) return result;
  const catalog = planningAiCatalog(context),
    controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const raw = await Promise.race([
      provider.plan(catalog.request, controller.signal),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
          controller.abort();
          reject(new Error('timeout'));
        }, timeoutMs);
      }),
    ]);
    const proposed = validatePlanningAi(raw, catalog);
    const semantic = new Set(
      result.items.map((i) =>
        JSON.stringify([
          i.kind,
          i.title.trim().toLowerCase(),
          i.objective.trim().toLowerCase(),
          [...i.requirementRefs].sort(),
          i.caseType,
        ]),
      ),
    );
    const excluded = new Set<string>();
    for (const item of proposed) {
      const key = JSON.stringify([
        item.kind,
        item.title.trim().toLowerCase(),
        item.objective.trim().toLowerCase(),
        [...item.requirementRefs].sort(),
        item.caseType,
      ]);
      if (
        semantic.has(key) ||
        (item.scenarioKey && excluded.has(item.scenarioKey))
      ) {
        excluded.add(item.logicalKey);
        continue;
      }
      semantic.add(key);
      result.items.push(item);
    }
    result.aiStatus = 'SUCCEEDED';
    result.aiMetadata = {
      provider: provider.providerId,
      model: provider.modelId,
      promptVersion: 'test-planning-1',
    };
    assertTestPlan(result);
  } catch {
    result.aiStatus = 'FAILED';
    result.aiFailure =
      'AI planning unavailable or invalid; deterministic planning is preserved.';
    result.aiMetadata = null;
    result.items = result.items.filter(
      (i) => i.origin !== 'AI_PROPOSED' || !i.logicalKey.startsWith('AI:'),
    );
  } finally {
    if (timer) clearTimeout(timer);
  }
  return result;
}
