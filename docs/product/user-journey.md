# Intended user journey

Status: planned; no screens or workflows exist.

1. **Import:** Supply OpenAPI/Swagger and supporting documentation. Deterministic
   parsing retains versions; source content remains untrusted.
2. **Understand and model:** Inspect proposed actors, resources, states,
   dependencies and workflows; review provenance and correct inferences.
3. **Plan:** Requirements and risks inform test suites and structured cases.
4. **Review:** Review test intent, environment, identities and side effects.
   Approval never bypasses deterministic policy.
5. **Execute:** The separate runner executes authorized plans and captures
   sanitized exchanges and deterministic assertion results.
6. **Investigate:** Unexpected observations prompt hypotheses and follow-up
   tests within policy, approvals and budgets.
7. **Prove and score:** Evidence supports classified findings and explainable
   quality scores. Failure alone does not establish a defect.
8. **Decide:** Release changes and regression impact inform recommendations;
   humans confirm defects and decide release readiness.
9. **Remember:** Preserve evidence-backed knowledge and human decisions with
   provenance for later runs.

See [execution](../architecture/execution-engine.md).
