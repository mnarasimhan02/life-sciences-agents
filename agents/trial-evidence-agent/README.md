# Trial Evidence Agent

Agent 01 investigates a ClinicalTrials.gov identifier through a bounded, auditable evidence loop.

This is the first extraction from [WhyDidThisTrialFail](https://github.com/mnarasimhan02/WhyDidThisTrialFail). The original application contains extensive trial and program reasoning. This package first establishes the reusable agent runtime: typed tools, explicit state, dynamic planning, recovery, budgets, abstention, and traces. Deeper evidence-graph and program-analysis logic will move in behind those contracts incrementally.

## What makes this an agent

The runtime does not execute a fixed list of API calls. After every observation, the planner examines the updated state and chooses the next action:

- The current ClinicalTrials.gov record is always resolved first.
- A stopped trial triggers registry-history inspection.
- An active trial skips history and searches for published outcomes.
- An optional-source failure becomes an evidence gap and triggers replanning.
- A missing authoritative registry record stops the run safely.
- Step, tool-call, and wall-clock budgets bound every investigation.

Every decision and tool result is written to a machine-readable trace.

## Run

Requires Node.js 22.13 or newer.

```bash
npm install
npm run investigate -- NCT02569398
```

No API key is required. The current tools use public endpoints from ClinicalTrials.gov and PubMed.

## Test

```bash
npm test
npm run typecheck
```

The tests cover dynamic tool ordering, active-trial handling, recovery from an optional source failure, authoritative-source failure, budget exhaustion, and input validation.

## Current output

The CLI emits JSON containing:

- Normalized trial identity and status
- A deliberately narrow registry-level finding
- Retrieved canonical sources
- Source coverage, including failed and unsearched tools
- Evidence gaps
- Budget usage
- The full plan/action/observation/replan trace

## Current limitations

- Registry history currently records version coverage but does not yet compare material field changes.
- PubMed retrieval uses exact NCT-ID matching only.
- The report does not yet migrate the original application's evidence graph, SEC, FDA, sponsor, related-trial, or program-level reasoning.
- The default planner is deterministic and evidence-policy driven; a model-assisted planner will be added only behind the same budgets and verification gates.

## Next migration steps

1. Material registry-history differencing
2. Trial, asset, sponsor, indication, and program entity graph
3. Related-trial and program-state tools
4. Claim extraction with source spans
5. Contradiction and missing-expected-evidence checks
6. Claim-level citation verifier
7. Human approval for ambiguous entity resolution
8. Public adjudicated evaluation set
