# Protocol Design Agent evaluation set

This directory is the start of an expert-adjudicated gold set. It deliberately does not label unreviewed examples as gold.

## Target

Build 20–30 historical study-design cases reviewed by at least one qualified clinical, statistical, regulatory, or operational expert. Each case must contain:

- the study concept available at the review date;
- known design issues and the reviewer role that identified each issue;
- acceptable source passages for each issue;
- claims the agent must not make;
- the adjudicator and adjudication date.

## Metrics

1. **Issue recall** — known issues detected / adjudicated known issues.
2. **Citation entailment** — supported claims / sampled cited claims.
3. **False assertion rate** — unsupported factual assertions / factual assertions.
4. **Abstention accuracy** — missing-evidence cases where the agent states the limitation.
5. **Reproducibility** — runs retaining queries, timestamps, source identifiers and evidence passages.

`cases.example.json` is a schema-shaped starter, not a completed or validated benchmark. Do not publish performance numbers until cases are adjudicated.
