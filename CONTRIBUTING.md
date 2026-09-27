# Contributing

Thank you for helping build trustworthy life-sciences agents.

## Before proposing an agent

Open a design discussion describing:

- The user and decision being supported
- Why a normal search, workflow, or retrieval application is insufficient
- The authoritative tools and sources the agent will use
- The decisions the agent may make autonomously
- Actions that require human approval
- Stopping conditions and investigation budgets
- Expected failure modes
- A minimum five-case evaluation plan

## Agent acceptance gates

An agent must:

1. Use typed tool interfaces.
2. Maintain explicit execution state.
3. Demonstrate at least one observe-and-replan path.
4. Implement step and cost limits.
5. Cite claims at the narrowest defensible scope.
6. Distinguish observations, inferences, hypotheses, and unknowns.
7. Include tests for missing and contradictory evidence.
8. Require human review for ambiguous entity resolution or consequential action.
9. Expose a machine-readable trace.
10. Pass its documented evaluation threshold.

## Pull requests

- Keep changes scoped and explain the user-visible behavior.
- Add or update tests for every behavior change.
- Include a reproducible example when adding a tool or data source.
- Never commit credentials, private clinical data, protected health information, or proprietary documents.
- Use synthetic or publicly available data in examples and tests.

## Definition of done

An agent is not considered stable until its README contains setup instructions, supported inputs, tool inventory, evidence policy, known limitations, example traces, evaluation results, and responsible-use boundaries.

