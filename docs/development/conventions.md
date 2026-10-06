# Development conventions

## Configured tooling
Use pnpm and preserve its lockfile. Root scripts are engineering entry points.
ESLint flat config applies recommended JavaScript/TypeScript correctness rules
with zero warnings permitted. Prettier owns formatting independently; no
React/Next.js rules or formatting plugins are installed. EditorConfig specifies
UTF-8, LF, two spaces and final newlines.

The shared TypeScript base enforces strictness, unchecked-index protection,
exact optional properties, override checks and unused-code checks. It excludes
ambient types and DOM globals; tooling explicitly adds Node types.
Future packages extend the base, set source include paths and provide working
typecheck scripts. Root typecheck checks tooling then recursively runs available
package typechecks. NodeNext is the initial module/resolution mode; a future
bundler app may override those modes/add DOM libraries without weakening strictness.
Architectural import boundaries are documented but not automatically enforced yet.

## Documentation and scope
Use concise Markdown, relative links and explicit planned/implemented labels.
Keep binding rules in AGENTS.md; cross-reference related docs. Never invent
implementation facts, benchmarks or setup commands. Number ADRs with Status,
Context, Decision, Alternatives considered and Consequences.

Maintain presentation -> application -> domain; isolate framework/provider
integration in adapters. Preserve tenant scope and provenance. Shared utilities
need concrete uses. Label mocks/fixtures as development/test data.
Leave no unexplained TODOs or silently ignored failures.

Generated outputs, local runtime bootstrap and local environment files are
ignored; real secrets must never be committed. No environment contract exists.
Only pnpm's lockfile belongs here; do not add other package-manager lockfiles.
CI, branching and application module placement remain future decisions.
M0.2 adds tooling only; stop at the authorized milestone.
