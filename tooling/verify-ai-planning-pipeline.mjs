// Disposable loopback PostgreSQL + synthetic provider response. Never hosted or paid.
import { execFileSync } from 'node:child_process';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import process from 'node:process';
import { URL } from 'node:url';
import { Buffer } from 'node:buffer';
const { Request, Response } = globalThis;
import { log } from 'node:console';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { projectSpecifications } from '../packages/ai/tests/multi-project-fixtures.ts';
import { parseApiSpec } from '../packages/api-spec/dist/index.js';
import { buildBehaviourGraph } from '../packages/behaviour-graph/dist/index.js';
import { deriveQa } from '../packages/qa-intelligence/dist/index.js';
import {
  groundedPlanningCatalog,
  validateGroundedPlanning,
} from '../packages/ai/dist/index.js';
import {
  deriveTestPlan,
  constructExecution,
  generateTestPlan,
} from '../packages/test-engine/dist/index.js';
import {
  createTestPlanRepository,
  createExecutionRepository,
  createTenantService,
  createApiKnowledgeRepository,
  createBehaviourGraphRepository,
  createQaRepository,
} from '../packages/database/dist/index.js';
import { registerHooks } from 'node:module';
// Match Next's server-only marker resolution for this server-process test.
registerHooks({
  resolve(specifier, context, next) {
    return next(
      specifier === 'server-only'
        ? new URL(
            '../packages/ai/node_modules/server-only/empty.js',
            import.meta.url,
          ).href
        : specifier,
      context,
    );
  },
});
const { runAiReasoning } = await import('../apps/web/src/lib/ai/reasoning.ts');
const psql = process.argv[2];
if (!psql)
  throw Error('Provide local psql executable; use --conditions=react-server');
const port = process.argv[3] ?? '55433';
if (!/^[0-9]{4,5}$/.test(port)) throw Error('Invalid local test port');
const conn = ['-h', '127.0.0.1', '-p', port, '-U', 'postgres'];
const db = 'tp_ai_pipeline_' + Date.now();
const sql = (s) =>
  execFileSync(
    psql,
    ['-X', '-qAt', ...conn, '-d', db, '-v', 'ON_ERROR_STOP=1'],
    {
      input: s,
      encoding: 'utf8',
      timeout: 120000,
      stdio: ['pipe', 'pipe', 'pipe'],
    },
  ).trim();
execFileSync(
  join(
    dirname(psql),
    process.platform === 'win32' ? 'createdb.exe' : 'createdb',
  ),
  [...conn, db],
);
sql(readFileSync('supabase/tests/postgres-bootstrap.sql', 'utf8'));
sql(
  'create schema extensions; create extension pg_stat_statements with schema extensions;',
);
for (const name of readdirSync('supabase/migrations')
  .filter((n) => n.endsWith('.sql'))
  .sort())
  sql(readFileSync('supabase/migrations/' + name, 'utf8'));
const lit = (v) =>
  v === null
    ? 'null'
    : typeof v === 'number' || typeof v === 'boolean'
      ? String(v)
      : "'" +
        (typeof v === 'object' ? JSON.stringify(v) : String(v)).replaceAll(
          "'",
          "''",
        ) +
        "'";
// Only auth identities are seeded, as in the Supabase-compatible bootstrap.
// All tenant-owned records and approvals below use the normal authenticated RPCs.
let actor;
const authenticated = (query) =>
  sql(
    `begin; set local role authenticated; set local request.jwt.claim.sub=${lit(actor)}; ${query}; commit;`,
  );
const tables = [
  'workspace_members',
  'projects',
  'api_imports',
  'behaviour_graphs',
  'behaviour_graph_nodes',
  'behaviour_graph_edges',
  'qa_analyses',
  'qa_items',
  'qa_item_nodes',
  'qa_item_edges',
  'qa_item_requirements',
  'qa_reviews',
  'test_plans',
  'test_items',
  'test_reviews',
  'test_requirement_versions',
];
const rpcs = [
  'create_workspace',
  'create_project',
  'import_api_spec',
  'build_behaviour_graph',
  'create_qa_analysis',
  'review_qa_item',
  'admit_ai_reasoning',
  'complete_ai_reasoning',
  'create_test_plan',
  'review_test_item',
  'configure_execution_environment',
  'request_test_execution',
];
const client = {
  auth: {
    async getUser() {
      return { data: { user: { id: actor } }, error: null };
    },
  },
  async rpc(name, args) {
    assert(rpcs.includes(name));
    const params = Object.entries(args)
      .map(([k, v]) => `${k}=>${lit(v)}`)
      .join(',');
    return {
      data: JSON.parse(
        authenticated(`select to_jsonb(public.${name}(${params}))`),
      ),
      error: null,
    };
  },
  from(table) {
    assert(tables.includes(table));
    const filters = [],
      orders = [];
    let offset = 0,
      limit = 30000,
      single = false;
    const q = {
      select() {
        return q;
      },
      eq(k, v) {
        assert(/^[a-z_]+$/.test(k));
        filters.push(`${k}=${lit(v)}`);
        return q;
      },
      order(k, options) {
        assert(/^[a-z_]+$/.test(k));
        orders.push(`${k} ${options?.ascending === false ? 'desc' : 'asc'}`);
        return q;
      },
      limit(n) {
        limit = n;
        return q;
      },
      range(start, end) {
        offset = start;
        limit = end - start + 1;
        return q;
      },
      maybeSingle() {
        single = true;
        return q;
      },
      then(resolve, reject) {
        try {
          const data = JSON.parse(
            authenticated(
              `select coalesce(jsonb_agg(t),'[]'::jsonb) from (select * from public.${table} where ${filters.join(' and ') || 'true'} ${orders.length ? 'order by ' + orders.join(',') : ''} limit ${limit} offset ${offset}) t`,
            ),
          );
          assert(!single || data.length <= 1);
          resolve({ data: single ? (data[0] ?? null) : data, error: null });
        } catch (e) {
          reject(e);
        }
      },
    };
    return q;
  },
};
let totalIntercepted = 0;
const contexts = [];
for (const [index, fixture] of projectSpecifications.entries()) {
  actor = '17000000-0000-0000-0000-' + String(index + 1).padStart(12, '0');
  sql(`insert into auth.users(id) values(${lit(actor)});`);
  const tenants = createTenantService(client);
  const workspaceId = await tenants.createWorkspace(
    'Local fixture ' + fixture.name,
  );
  const projectId = await tenants.createProject(workspaceId, fixture.name);
  const imports = createApiKnowledgeRepository(client);
  const sourceText = JSON.stringify(fixture.document);
  const parsed = parseApiSpec(sourceText, 'json');
  const sourceId = await imports.save(workspaceId, projectId, {
    format: 'json',
    filename: 'fixture.json',
    sourceBytes: Buffer.byteLength(sourceText),
    sourceHash: createHash('sha256').update(sourceText).digest('hex'),
    sourceDocument: fixture.document,
    knowledge: parsed.knowledge,
  });
  const [s] = await imports.list(workspaceId, projectId, sourceId);
  assert.equal(s.knowledge.operations.length, index === 2 ? 2 : 1);
  const graphs = createBehaviourGraphRepository(client);
  const graphId = await graphs.save(buildBehaviourGraph(s));
  const [g] = await graphs.list(workspaceId, projectId, sourceId, graphId);
  const qa = createQaRepository(client);
  const analysisId = await qa.save(deriveQa({ source: s, snapshot: g }));
  const [draft] = await qa.list(workspaceId, projectId);
  for (const requirement of draft.records.filter(
    (r) => r.kind === 'REQUIREMENT',
  ))
    await qa.review(
      requirement.id,
      null,
      'APPROVE',
      'Local synthetic acceptance review.',
      null,
      null,
    );
  const [a] = await qa.list(workspaceId, projectId);
  assert.equal(a.id, analysisId);
  assert(
    a.records.some(
      (r) =>
        r.kind === 'REQUIREMENT' && r.reviews.at(-1)?.decision === 'APPROVE',
    ),
  );
  const c = { source: s, snapshot: g, analysis: a };
  contexts.push({ context: c, actor });
  if (index === 0) {
    const plans = createTestPlanRepository(client);
    const standardId = await plans.save(deriveTestPlan(c));
    let standard = (await plans.list(s.workspaceId, s.projectId)).find(
      (p) => p.id === standardId,
    );
    const candidate = standard.records.find(
      (i) =>
        i.kind === 'CASE' &&
        i.ruleId === 'TEST_DECLARED_RESPONSE' &&
        i.caseType === 'VALID',
    );
    const parent = standard.records.find(
      (i) => i.logicalKey === candidate.scenarioKey,
    );
    const environmentId = authenticated(
      `select id from public.environments where project_id=${lit(s.projectId)} and type='DEVELOPMENT'`,
    );
    const executions = createExecutionRepository(client);
    const configId = await executions.configure(
      environmentId,
      'https://api.example.test',
      443,
      true,
    );
    await assert.rejects(() => executions.request(candidate.id, environmentId));
    for (const item of [parent, candidate])
      await plans.review(
        item.id,
        null,
        'APPROVE',
        'Local synthetic execution-readiness review.',
        null,
        null,
        null,
      );
    standard = (await plans.list(s.workspaceId, s.projectId)).find(
      (p) => p.id === standardId,
    );
    const current = standard.records.find((i) => i.id === candidate.id);
    const compiled = constructExecution(standard, current, s, {
      id: configId,
      environmentId,
      type: 'DEVELOPMENT',
      baseUrl: 'https://api.example.test',
      port: 443,
      enabled: true,
      timeoutMs: 10000,
      responseLimit: 1048576,
    });
    assert.equal(compiled.failure, null);
    assert.equal(compiled.planningReady, true);
    assert.equal(compiled.request.method, 'GET');
    assert.deepEqual(current.preconditions, []);
    const runId = await executions.request(current.id, environmentId);
    assert.equal(
      authenticated(
        `select status from public.execution_runs where id=${lit(runId)}`,
      ),
      'REQUESTED',
    );
    authenticated(`select public.cancel_test_execution(${lit(runId)})`);
    assert.equal(
      authenticated(
        `select status from public.execution_runs where id=${lit(runId)}`,
      ),
      'CANCELLED',
    );
    assert.equal(
      authenticated('select count(*) from public.execution_results'),
      '0',
    );
    log(
      'PASS: Standard parameterless GET persisted, reviews required, compiled and locally admitted/cancelled; no HTTP or worker.',
    );
  }
  const catalog = groundedPlanningCatalog(c),
    token = catalog.request.data.requirements[0].token,
    operation = catalog.operations[0].token;
  const scenario = {
    key: 'fixture-scenario',
    scenarioRef: null,
    title: 'AI fixture declared contract review',
    objective:
      'Review the declared operation contract against its approved requirement.',
    testType: 'CONTRACT',
    caseType: null,
    requirementRefs: [token],
    riskRefs: [],
    evidenceRefs: [operation],
    reason: 'Approved requirement and operation supply the traceability.',
    expectedBehavior:
      'Compare observations with the declared specification; unresolved behavior needs clarification.',
    preconditions: [],
    requestIntent:
      'Review the declared operation only; no execution is authorized.',
  };
  const output = {
    proposals: [
      scenario,
      {
        ...scenario,
        key: 'fixture-case',
        scenarioRef: scenario.key,
        caseType: 'VALID',
        title: 'AI fixture declared contract case',
      },
    ],
  };
  let intercepted = 0;
  globalThis.fetch = async (url, options) => {
    assert(
      (url instanceof Request ? url.url : String(url)).startsWith(
        'https://api.openai.com/v1/responses',
      ),
    );
    assert.equal(++intercepted, 1);
    totalIntercepted++;
    assert.equal(totalIntercepted, index + 1);
    const sent = JSON.parse(options.body);
    assert(JSON.stringify(sent).includes(catalog.operations[0].route));
    for (const prior of contexts.slice(0, -1))
      for (const op of prior.context.source.knowledge.operations)
        assert(!JSON.stringify(sent).includes(op.path));
    return new Response(
      JSON.stringify({
        id: 'resp_local_fixture',
        object: 'response',
        status: 'completed',
        output: [
          {
            type: 'message',
            id: 'msg_fixture',
            role: 'assistant',
            status: 'completed',
            content: [
              {
                type: 'output_text',
                text: JSON.stringify(output),
                annotations: [],
              },
            ],
          },
        ],
        usage: { input_tokens: 100, output_tokens: 30 },
      }),
      { status: 200, headers: { 'content-type': 'application/json' } },
    );
  };
  process.env.OPENAI_AI_ENABLED = 'true';
  process.env.OPENAI_API_KEY = 'sk-' + 'synthetic_fixture'.repeat(3);
  process.env.OPENAI_MODEL = 'gpt-4.1-mini';
  const planId = await runAiReasoning(
    client,
    {
      projectId: s.projectId,
      sourceId: s.id,
      workflow: 'PLANNING',
      anchorId: a.id,
    },
    catalog.request.data,
    async (provider, signal) => {
      const result = await generateTestPlan(
        c,
        {
          providerId: provider.providerId,
          modelId: provider.modelId,
          async plan() {
            const raw = await provider.plan(catalog.request, signal);
            validateGroundedPlanning(raw, catalog);
            return raw;
          },
        },
        30000,
      );
      assert.equal(
        result.aiStatus,
        'SUCCEEDED',
        'Synthetic SDK response must pass every validation stage before persistence',
      );
      return result;
    },
  );
  const [persisted] = await createTestPlanRepository(client).list(
    s.workspaceId,
    s.projectId,
  );
  assert.equal(persisted.id, planId);
  assert.equal(persisted.analysisId, a.id);
  assert.equal(persisted.aiStatus, 'SUCCEEDED');
  const proposals = persisted.records.filter((i) => i.origin === 'AI_PROPOSED');
  assert.equal(proposals.length, 2);
  assert(proposals.every((i) => !i.executable && i.reviews.length === 0));
  const receipt = JSON.parse(
    authenticated(
      "select jsonb_build_object('state',state,'result_id',result_id,'input_tokens',input_tokens,'output_tokens',output_tokens,'usage_estimated',usage_estimated,'reserved_micro_usd',reserved_micro_usd) from public.ai_reasoning_requests where project_id=" +
        lit(s.projectId),
    ),
  );
  assert.equal(receipt.state, 'COMPLETED');
  assert.equal(receipt.result_id, planId);
  assert.equal(receipt.input_tokens, 100);
  assert.equal(receipt.output_tokens, 30);
  assert.equal(receipt.usage_estimated, false);
  assert.equal(receipt.reserved_micro_usd, 11200);
  assert.equal(
    authenticated('select count(*) from public.execution_results'),
    '0',
  );
  const environmentId = authenticated(
    `select id from public.environments where project_id=${lit(s.projectId)} and type='DEVELOPMENT'`,
  );
  const qualityId = authenticated(
    `select public.assess_project_quality(${lit(s.projectId)},${lit(environmentId)})`,
  );
  const quality = JSON.parse(
    authenticated(
      `select result from public.quality_assessments where id=${lit(qualityId)}`,
    ),
  );
  assert.equal(quality.overall, null);
  assert.equal(quality.status, 'UNKNOWN');
  const releaseId = authenticated(
    `select public.create_release(${lit(s.projectId)},${lit(environmentId)},'Local synthetic readiness review')`,
  );
  const assessmentId = authenticated(
    `select public.assess_release(${lit(releaseId)})`,
  );
  const assessment = JSON.parse(
    authenticated(
      `select result from public.release_assessments where id=${lit(assessmentId)}`,
    ),
  );
  assert.equal(assessment.status, 'INSUFFICIENT_EVIDENCE');
  const reportId = authenticated(
    `select public.generate_release_report(${lit(releaseId)},${lit(assessmentId)})`,
  );
  assert.equal(
    authenticated(
      `select count(*) from public.release_reports where id=${lit(reportId)} and workspace_id=${lit(s.workspaceId)} and project_id=${lit(s.projectId)} and environment_id=${lit(environmentId)} and api_import_id=${lit(s.id)}`,
    ),
    '1',
  );
  assert.equal(
    authenticated('select count(*) from public.release_decisions'),
    '0',
  );
  log(
    fixture.name +
      ': scoped quality UNKNOWN, release INSUFFICIENT_EVIDENCE and report persistence PASS; no release decision.',
  );
  log(
    fixture.name +
      ': authenticated creation/import/graph/analysis/review, grounded AI persistence and accounting PASS.',
  );
}
assert.equal(totalIntercepted, 3);
// Authenticated cross-workspace reads and writes must fail independently of UI scope.
actor = contexts[0].actor;
const first = contexts[0].context;
const sibling = await createTenantService(client).createProject(
  first.source.workspaceId,
  'Same-workspace isolation probe',
);
assert.deepEqual(
  await createTestPlanRepository(client).list(
    first.source.workspaceId,
    sibling,
  ),
  [],
);
assert.deepEqual(
  await createQaRepository(client).list(first.source.workspaceId, sibling),
  [],
);
await assert.rejects(() =>
  client.rpc('admit_ai_reasoning', {
    project_input: sibling,
    source_input: first.source.id,
    workflow_input: 'PLANNING',
    anchor_input: first.analysis.id,
    model_input: 'gpt-4.1-mini',
    hash_input: createHash('sha256')
      .update(JSON.stringify(groundedPlanningCatalog(first).request.data))
      .digest('hex'),
  }),
);
assert.equal(sql('select count(*) from public.ai_reasoning_requests'), '3');
const other = contexts[1].context;
assert.equal(
  authenticated(
    `select count(*) from public.test_plans where project_id=${lit(other.source.projectId)}`,
  ),
  '0',
);
await assert.rejects(() =>
  createQaRepository(client).list(
    other.source.workspaceId,
    other.source.projectId,
  ),
);
await assert.rejects(() =>
  createApiKnowledgeRepository(client).save(
    contexts[0].context.source.workspaceId,
    other.source.projectId,
    {
      format: 'json',
      filename: 'fixture.json',
      sourceBytes: 2,
      sourceHash: 'a'.repeat(64),
      sourceDocument: {},
      knowledge: other.source.knowledge,
    },
  ),
);
assert.throws(() =>
  groundedPlanningCatalog({ ...contexts[0].context, analysis: other.analysis }),
);
assert.equal(
  sql('select count(*) from public.environment_execution_configs'),
  '1',
);
assert.equal(
  sql(
    "select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and has_function_privilege('testpilot_runner',p.oid,'EXECUTE')",
  ),
  '5',
);
log(
  'PASS: three independent projects/actors, RLS read isolation, cross-project substitution rejected, only the synthetic readiness target configured.',
);
log(
  'PASS: synthetic SDK response -> schema -> mapping -> grounding -> full plan -> authenticated local RPC -> SQL persistence -> repository readback.',
);
log(
  'PASS: two pending non-executable proposals, exact analysis, reconciled usage, zero executions.',
);
log(
  'Real OpenAI requests: 0. Hosted changes: 0. Disposable loopback database retained: ' +
    db,
);
