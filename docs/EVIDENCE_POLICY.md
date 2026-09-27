# Evidence Policy

This document defines the minimum evidence behavior for every agent in this repository.

## Claim types

Every material statement must be represented as one of:

- **Observation:** Directly stated or deterministically derived from a cited source.
- **Association:** A documented relationship without a causal assertion.
- **Hypothesis:** A testable explanation supported by incomplete evidence.
- **Unknown:** A question the completed searches did not resolve.

## Source hierarchy

Source priority depends on the question, but agents should generally prefer:

1. Authoritative registries, regulators, and original records
2. Sponsor primary disclosures and regulatory filings
3. Peer-reviewed primary research
4. Systematic reviews and high-quality secondary research
5. Reputable reporting that links to original material

Derivative reports repeating one announcement count as one canonical evidence family.

## Required provenance

A supported claim records:

- Canonical source identifier and URL
- Source type and authority
- Publication or effective date
- Retrieved date
- Exact supporting passage or structured field
- Entity and scope to which the evidence applies
- Agent action that retrieved the evidence

## Contradictions

Agents must retain material contradictory evidence. A contradiction may reduce claim strength, narrow its scope, trigger another search, or cause the agent to abstain. It must never be silently discarded because it conflicts with the leading hypothesis.

## Missing evidence

“Not found” means only that the recorded search did not locate the evidence. It must not be rewritten as “did not happen.” When useful, agents should identify what evidence could resolve the gap and where it would likely be found.

## Causal language

Causal claims require direct, entity-specific support. Timing, correlation, class behavior, and plausible mechanism do not independently establish why a particular trial, program, or regulatory decision occurred.

## Verification gate

Before a final result, the verifier checks:

- Citation entailment
- Entity and scope alignment
- Temporal validity
- Independence of corroborating sources
- Material contradictions
- Missing expected evidence
- Unsupported causal, counterfactual, or class-wide language

Critical failures suppress the affected conclusion rather than merely lowering a numeric score.

