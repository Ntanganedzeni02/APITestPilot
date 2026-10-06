# Development conventions

Documentation conventions apply now; code/tooling conventions remain intentions.

Use concise Markdown, relative links and explicit planned/implemented labels.
Keep binding rules in AGENTS.md and cross-reference related documents.
Never invent implementation facts, benchmarks or setup commands.
Number significant ADRs and include Status, Context, Decision, Alternatives
considered and Consequences.

Future TypeScript should use clear domain names and explicit validated contracts.
Maintain presentation -> application -> domain dependency direction; isolate
framework/provider integration in adapters. Shared utilities need concrete uses.

Preserve tenant scope and provenance through boundaries. Use structured test
representations, deterministic assertions and explicit error categories.
Label mocks/fixtures as development/test data.
Leave no unexplained TODOs; report existing failures.

Keep work scoped to the milestone. Update docs and report applicable validation.
Package manager, formatting, CI, branching and module layout require future
decisions; none is configured here.
