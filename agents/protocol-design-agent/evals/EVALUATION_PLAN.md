# Evaluation plan

This plan defines how the Protocol Design Review Agent will be measured before clinical-facing release. It intentionally contains no performance claims: the starter cases have not yet been expert-adjudicated.

## Evaluation questions

1. Does the agent identify the design issues experts consider material?
2. Does each cited passage actually support the nearby claim?
3. Does the agent avoid claims that exceed the retrieved evidence?
4. Does missing or contradictory evidence produce a visible limitation or replan?
5. Can another reviewer reproduce the search and trace the conclusion to source records?

## Dataset

Create a versioned set of at least 25 historical study-design cases covering multiple therapeutic areas, phases, control designs, endpoints, and evidence conditions. Include adequate, sparse, conflicting, failed-source, and correct-abstention cases.

Each case must record the information available at the historical review date. Later evidence must not be used to grade a time-bounded case.

## Adjudication

Each case requires:

- one primary reviewer qualified for the issue being scored;
- a second reviewer for disputed issues or citation-entailment disagreements;
- the known issue, severity, reviewer role, acceptable supporting passages, and prohibited claims;
- adjudication date, dataset version, and conflict-resolution notes.

The gold set must not contain proprietary or patient-identifiable information unless the repository and evaluation environment are approved for it.

## Metrics

| Metric | Definition | Unit |
| --- | --- | --- |
| Issue recall | Adjudicated material issues detected / adjudicated material issues | Case-level and pooled |
| Issue precision | Supported material findings / agent findings sampled | Case-level and pooled |
| Citation entailment | Claims whose cited passage supports the exact claim / cited claims sampled | Claim-level |
| Citation validity | Citation URLs resolving to the claimed source record / citations checked | Citation-level |
| False assertion rate | Unsupported factual assertions / factual assertions sampled | Claim-level |
| Abstention accuracy | Insufficient-evidence cases with an appropriate limitation / insufficient-evidence cases | Case-level |
| Reproducibility | Runs retaining query, timestamp, source ID, passage, and tool outcome | Run-level |
| Recovery | Injected source failures followed by visible failure handling and appropriate replan or stop | Scenario-level |

Report raw numerators and denominators with every percentage. Do not report a single confidence score for the review.

## Test suites

### Deterministic regression

```bash
npm run typecheck
npm test
```

### Live-source integration

```bash
npm run test:live-tools
```

Check identifier validity, URL traceability, query preservation, and non-empty results for stable public examples. Do not require a fixed record count.

### Model-directed end to end

```bash
OPENAI_API_KEY=... npm run test:e2e:model
```

Record model version, prompt and agent version, tool versions, run date, and cost. Repeat enough times to expose nondeterministic failures.

### Expert benchmark

Freeze the dataset before running the release candidate. Reviewers grade blinded outputs using the rubric below. Changes made after observing benchmark results require a new evaluation version.

## Citation-entailment rubric

- **2 — Direct:** the passage supports the full claim for the correct study, population, endpoint, and context.
- **1 — Partial:** the passage supports a narrower claim or related context; the output must state the limitation.
- **0 — Unsupported:** the passage does not support the claim, refers to a different entity, or requires an unstated inference.

Score 0 claims count as unsupported. Score 1 is acceptable only when the output clearly narrows or qualifies the claim.

## Severity rubric

- **Critical:** could materially mislead a consequential clinical, statistical, ethical, or regulatory decision.
- **Major:** could change design interpretation or require substantial rework.
- **Minor:** useful correction that does not change the main review conclusion.

Release reporting must separate critical and major performance from minor findings.

## Initial release gates

Numeric thresholds must be approved after a pilot adjudication round; they must not be invented in advance. Release cannot proceed unless:

- no known critical unsupported claim remains unresolved;
- all sampled citations resolve and are attributable to the displayed record;
- sparse-evidence and source-failure cases visibly disclose the limitation;
- the search and evidence trail is reproducible;
- clinical, statistical, regulatory, and security owners sign the launch record.

## Reporting template

```text
Evaluation version:
Agent commit SHA:
Model/version:
Run dates:
Cases attempted/completed:
Reviewer roles:

Issue recall: numerator / denominator
Issue precision: numerator / denominator
Citation entailment: direct / partial / unsupported
Citation validity: numerator / denominator
False assertion rate: numerator / denominator
Abstention accuracy: numerator / denominator
Reproducibility: numerator / denominator
Recovery: numerator / denominator

Critical failures:
Major failures:
Known limitations:
Reviewer disagreements and resolution:
Release decision:
```
