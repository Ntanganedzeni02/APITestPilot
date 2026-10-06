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
All ten boundaries extend the base, use src as rootDir and emit JavaScript and
declarations to dist. They are private ESM packages whose exports reference built
files; compile before importing them at runtime. Each provides build, typecheck
and lint scripts. Root typecheck checks tooling then recursively checks every
workspace without silently skipping missing scripts. NodeNext is the initial module/resolution mode; a future
bundler app may override those modes/add DOM libraries without weakening strictness.
ESLint restricts domain imports to relative modules; domain declares no dependencies,
including development/optional/peer dependencies. Tooling tests enforce this current
contract and detect workspace cycles. Adding a domain dependency requires a reviewed
architectural decision and an intentional update to these checks. Relative cross-layer
imports still require review; other future layer boundaries are not fully enforced.
Avoid speculative package links and runtime libraries. Shared contains technical
primitives only; domain concepts belong in domain.

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
GitHub Actions verifies pull requests and master pushes with pinned actions,
read-only contents permissions, frozen installation and all root checks/build.
Update action hashes intentionally after reviewing upstream releases.
Branch policy and application module placement remain future decisions.
M0.3 completes engineering scaffolding only. No product code or functioning
runner exists, and apps/web remains uninitialized until M1.1.
