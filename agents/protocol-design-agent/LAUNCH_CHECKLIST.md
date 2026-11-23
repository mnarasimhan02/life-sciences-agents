# Launch checklist

Use this checklist before exposing the Protocol Design Review Agent to users. A checked item must be supported by a test result, configuration record, or named owner—not assumption.

## Product scope and clinical boundaries

- [ ] The landing page states that the agent reviews an existing design and does not author or approve a protocol.
- [ ] The intended users and prohibited uses are documented.
- [ ] Clinical, statistical, regulatory, operational, ethics, and patient-review responsibilities are assigned.
- [ ] The disclaimer is visible in the app and PDF export.
- [ ] Planned sources are visually distinct from live sources.
- [ ] No benchmark, accuracy, confidence, or time-saving claim is shown without a cited evaluation result.

## Evidence and citations

- [ ] Every factual review claim has at least one source identifier or is explicitly labelled an inference or gap.
- [ ] Citation links resolve to the referenced NCT, PMID, or authoritative record.
- [ ] Retrieved passages support the nearby claim under the citation-entailment rubric.
- [ ] Search queries, timestamps, source status, and record counts are retained for the run.
- [ ] Failed or unavailable sources remain visible rather than being reported as zero results.
- [ ] Registry freshness and sponsor-submitted-data limitations are disclosed.

## Model and agent controls

- [ ] The production model is pinned through configuration and recorded in run metadata.
- [ ] Maximum turns, tool calls, elapsed time, and request size are enforced.
- [ ] Tool inputs are validated and outbound domains are allowlisted.
- [ ] Sparse results and tool failures trigger tested replanning behavior.
- [ ] The agent can finish with insufficient evidence instead of fabricating a conclusion.
- [ ] Private chain-of-thought is not displayed or logged; concise decisions and tool events are sufficient for audit.

## Security and privacy

- [ ] `OPENAI_API_KEY` is stored in the hosting platform's secret manager and never exposed to the client.
- [ ] Authentication and authorization are enabled before accepting non-public protocol content.
- [ ] The UI warns users not to submit PHI, PII, confidential sponsor data, or unpublished protocol content unless the deployment is approved for it.
- [ ] Request, response, trace, and exported-file retention periods are documented.
- [ ] Logs redact secrets and sensitive study text.
- [ ] Dependency, container, and secret scanning run in CI.
- [ ] Abuse protection, request-size limits, rate limits, and per-user quotas are configured.

## Reliability and operations

- [ ] `/api/health` is monitored and does not reveal secrets.
- [ ] Timeouts, retries, and backoff are configured for ClinicalTrials.gov, PubMed, and the model provider.
- [ ] User-visible errors distinguish model, source, validation, budget, and server failures.
- [ ] Structured logs include run ID, model, tool, duration, and outcome without sensitive content.
- [ ] Alerts exist for elevated error rate, latency, cost, and source unavailability.
- [ ] A rollback procedure and last-known-good container image are documented.
- [ ] PDF export is tested for multi-page output, citation IDs, source URLs, and long text.

## Testing and evaluation

- [ ] `npm run typecheck` passes.
- [ ] `npm test` passes.
- [ ] `npm run test:live-tools` passes from the release environment.
- [ ] `npm run test:e2e:model` passes with the pinned production model.
- [ ] Normal, sparse-evidence, contradictory, adversarial, and source-failure cases are represented.
- [ ] The adjudicated evaluation set meets the minimum case and reviewer requirements in `evals/EVALUATION_PLAN.md`.
- [ ] Issue recall, citation entailment, false assertion rate, abstention behavior, and reproducibility are reported with sample sizes.
- [ ] Release thresholds are approved by the named clinical, statistical, and regulatory reviewers.

## Release record

Complete this block for every public release:

```text
Release/version:
Commit SHA:
Deployment URL:
Model and version:
Evaluation dataset version:
Evaluation report:
Clinical reviewer:
Statistical reviewer:
Regulatory reviewer:
Security reviewer:
Release owner:
Approval date:
Rollback image/commit:
Known limitations:
```
