# M1.4 deterministic API Behaviour Graph

## Pipeline and ownership

Persisted API import → normalized knowledge → pure deterministic builder → graph
validation → atomic immutable snapshot → API Map structured inspection.
Domain contracts live in `packages/domain/src/behaviour-graph.ts`; the builder,
rule registry and queries live in `packages/behaviour-graph/src/index.ts`.
The database adapter uses authenticated publishable-key access. Web graph logic
lives in orchestration, not React. No external dependencies were added.

## Taxonomy and provenance

Nodes: API, SERVER, OPERATION, RESOURCE, SCHEMA, PARAMETER, REQUEST_BODY,
RESPONSE, SECURITY_SCHEME, TAG, IDENTIFIER, STATE and ACTOR. Component schemas
and inline input/output schemas are represented; schema reference edges record
local component references, including nested uses. Recursive schema edges are
permitted without traversal cycles. Non-component root-local schema references
are not expanded into resource evidence. An ACTOR is an explicitly declared and
used OAuth2 capability/scope, not an invented user, role or login operation.

Edges (endpoint combinations are enforced in domain and RPC):

- API_HAS_OPERATION, API_HAS_SERVER, OPERATION_HAS_SERVER
- OPERATION_TAGGED_WITH, OPERATION_HAS_PARAMETER, OPERATION_ACCEPTS_REQUEST,
  OPERATION_RETURNS_RESPONSE, OPERATION_REQUIRES_SECURITY
- REQUEST_USES_SCHEMA, RESPONSE_USES_SCHEMA, PARAMETER_USES_SCHEMA,
  SCHEMA_REFERENCES_SCHEMA, RESOURCE_USES_SCHEMA
- OPERATION_READS_RESOURCE, OPERATION_CREATES_RESOURCE,
  OPERATION_UPDATES_RESOURCE, OPERATION_DELETES_RESOURCE
- OPERATION_PRODUCES_IDENTIFIER, OPERATION_CONSUMES_IDENTIFIER,
  IDENTIFIER_BELONGS_TO_RESOURCE, OPERATION_PRECEDES_OPERATION
- STATE_BELONGS_TO_RESOURCE, SECURITY_HAS_ACTOR

Every fact carries import ID, source pointers, stable rule ID, derivation,
confidence category and sorted evidence. Explicit facts use EXPLICIT/EXACT;
corroborated inference uses DETERMINISTIC_INFERENCE/STRONG. SUPPORTED is reserved
in the contract; no fake probability/score exists. Source pointers reference
declared source structure; evidence may also name normalized effective fields.
Security edges retain effective alternative-group evidence: schemes in one group
are conjunctive, groups are alternatives, and an empty group permits anonymous
access. An edge is not a claim that every alternative requires that scheme.

## Rule catalog

`graphRules` is the implementation-owned explanation registry:

| Rule                  | Meaning                                                                                  |
| --------------------- | ---------------------------------------------------------------------------------------- |
| DECLARED_STRUCTURE    | API/operation/schema/input/output/server/tag declarations and references                 |
| SECURITY_REQUIREMENT  | Effective normalized security with alternative-group evidence                            |
| DECLARED_SCOPE        | Declared OAuth2 scope explicitly referenced by an operation                              |
| RESOURCE_PATH_SCHEMA  | Matching canonical collection path and direct successful schema shared by two operations |
| CRUD_CORROBORATED     | Method/path plus matching schema/identifier and successful response structure            |
| IDENTIFIER_EXACT      | Required primitive resource identifier with exact naming/type/format compatibility       |
| IDENTIFIER_DEPENDENCY | Collection create produces the identifier consumed by an item operation                  |
| STATUS_ENUM           | Direct status/state string enum on an inferred resource schema                           |

Resource inference accepts a terminal path equal to the lowercased schema name,
or that name plus `s`, and at least two operations with that schema as their
direct successful response (object or array items). Nested collection prefixes
are preserved: `/users/{userId}/orders` is distinct from `/orders`. Search/action
segments are excluded. Tags and operationId alone never establish a resource.
Complex pluralization, composed/inline resource schemas and ambiguous paths are
intentionally omitted.

Read requires GET plus resource response; create requires POST on the collection
plus resource response; update requires PUT/PATCH on the item, compatible required
path identifier, request body and resource response; delete requires DELETE on
the item, compatible required identifier and an empty successful response.
These express structural intent, not API success or side-effect authorization.

Identifier property must be required, directly primitive string/integer, named
`id` or exact resource name plus `Id` after case normalization. Item path parameter
must be required, have the same accepted name and exact primitive type/format.
Ambiguous multiple candidates fail closed. A producer also needs a direct object
successful response, not only an array. Producer-to-consumer dependencies remain
structural compatibility; they do not prove that a GET must follow a POST.
No fuzzy matching, cross-resource matching, token-endpoint invention or runtime
value correspondence is inferred.

State extraction only accepts direct fields `status` or `state`, type string,
2–30 distinct nonempty string enum values on a resource schema. Currency/country/
category/color/sort enums are not states. No transition, operation-produced state
or required-state edge is emitted without evidence; M1.4 does not infer them.

## Identity, validation and limits

Logical node IDs are canonical JSON tuples of type and semantic key; edge IDs
are canonical tuples of type/from/to. Scope is owned by the enclosing snapshot
and provenance import. IDs do not include random database identifiers or build
time. Code-point ordering matches PostgreSQL C collation, independent of locale
and incidental object order. Rebuilding the same import/builder yields equivalent
facts and IDs but a new snapshot UUID/time/initiator.

Validation checks unique sorted IDs, canonical identities, known taxonomy/rules,
typed endpoints, exactly one API root, provenance, UUID scope, matching import,
and prohibited self relationships. Schema recursion is the only allowed self edge.
Limits: 12,000 nodes, 30,000 edges, 8 MiB serialized graph, 2,000 UTF-8 bytes per
logical ID (PostgreSQL index bound), 4,000 characters per label/evidence/pointer,
100 sorted distinct pointers/evidence entries per fact. Traversal is bounded to
50,000 visits/depth 64 per schema walk; normalized knowledge has its own limits.
Candidate grouping is keyed by path/schema. Resource matching scans bounded
operations per resource; dependencies are bounded by the total edge limit.
Failures surface deterministic validation messages without imported code/SQL.

Queries: incoming/outgoing edges, neighbors, operations touching a resource,
schemas used by an operation, effective security, identifier producers/consumers,
dependent operations, and facts by rule/source pointer. No general graph engine.

## Persistence and UI

`20261006000300_behaviour_graph.sql` adds an import scoped unique candidate key,
`behaviour_graphs`, `behaviour_graph_nodes`, `behaviour_graph_edges`, private
provenance validation and `build_behaviour_graph`. Prior migrations are unchanged.
Scope flows workspace → project → import → snapshot; node/edge composite foreign
keys prevent cross-snapshot/import/project/workspace references independently.
All three tables have membership RLS and authenticated SELECT only. PUBLIC/anon
cannot build; authenticated writes go through a SECURITY DEFINER RPC with empty
search_path, qualified relations, caller/membership/import checks and no service
role assumption. One transaction inserts and validates the entire snapshot;
any failure rolls back all its rows. No UPDATE/upsert replaces history.

The adapter reads the latest snapshot (creation time, UUID descending) and pages
facts in 500-row batches to avoid hosted row-limit truncation. Count/scope/domain
validation rejects partial or malformed provider responses. API Map exposes
unbuilt state, explicit build/rebuild, summary, resource and operation inspection,
and deterministic reasons/source pointers. Existing specification details remain.
Inspection lists load 100 entries at a time, with relationships rendered only
when a node is expanded. A reusable adjacency index avoids repeated graph scans.
No visual graph animation, AI, requirements, risk, test generation, runner,
Curiosity Engine, findings, runtime evidence or scores were introduced.

## Local and hosted verification

On a fresh disposable compatibility database apply only locally, in order:
bootstrap, M1.2, M1.3, M1.4; run tenancy, api-knowledge and behaviour-graph SQL
assertions. The bootstrap emulates Auth claims/roles and must never run on hosted
Supabase. Unit/provider fixtures do not prove hosted RLS or authenticated Next.

M1.2/M1.3/M1.4 deployment is known from supplied authenticated CLI evidence:
local and remote versions match `20261006000100`, `20261006000200` and
`20261006000300`. No migration commands were run during final verification.
Hosted authenticated graph building is deferred due to the documented M1.2 Auth
acceptance dependency. Before M1.5, complete
real authenticated build/rebuild/refresh, selected-import and tenant-isolation
verification. Never weaken confirmation/RLS to complete that check.
