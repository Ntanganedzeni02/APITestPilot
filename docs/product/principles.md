# Product principles

Status: intended product behavior.

Specification expresses intent; runtime observation supplies evidence.
Differences require investigation rather than automatic defect confirmation.
AI proposes interpretations; deterministic validation and policy govern
acceptance and execution. Autonomy remains bounded.

Conclusions follow Requirement -> Risk -> Test Case -> Test Result -> Finding
-> Evidence. Scores explain inputs, coverage and uncertainty. Humans retain
defect confirmation and final release authority.

Model interacting API systems, not isolated endpoints. Inferred relationships
carry provenance, confidence and verification status.

Learning means persistent evidence-backed project knowledge. Human-verified
information outranks unsupported AI inference. Memory categories may include
OBSERVATION, KNOWN_BEHAVIOUR, HISTORICAL_DEFECT, HUMAN_DECISION,
PERFORMANCE_BASELINE, SECURITY_PATTERN, REGRESSION_RULE, FALSE_POSITIVE and
BUSINESS_RULE.

Protect customer data and secrets throughout reasoning, execution and evidence
handling. Never present fixtures as working capabilities.
Binding rules live in [AGENTS.md](../../AGENTS.md).
