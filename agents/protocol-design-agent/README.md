# Protocol Design Review Agent

An evidence-grounded agent that reviews an existing clinical study concept against public trial and literature evidence.

The agent does **not** write a new protocol, choose a design for the study team, provide regulatory approval, or replace clinical, statistical, regulatory, operational, ethics, or patient review.

## What it does

Given a study concept, synopsis, or protocol excerpt, the application:

1. extracts the stated population, phase, intervention, endpoint, comparator, enrollment, and duration;
2. asks focused questions only when a material review field is missing;
3. lets the model select and call live evidence tools;
4. replans after sparse results or tool failure;
5. returns cited findings, comparable trials, evidence gaps, exact search records, and reviewer questions; and
6. exports the review summary and cited sources as a PDF.

Current live sources are ClinicalTrials.gov API v2 and PubMed E-utilities. EU CTIS, FDA, EMA, and ICH integrations are identified as planned and are not counted as searched.

## Why this is a true agent

This is not retrieval followed by a fixed summary. The OpenAI Agents SDK runs a bounded model → tool → observation loop:

- the model decides which available tool to call from the unresolved design questions;
- focused results can cause the agent to broaden its search;
- sparse evidence and tool failure change the next action;
- run state retains the study concept, evidence, gaps, tool outcomes, and budgets;
- completion occurs when evidence paths are resolved or a limit is reached; and
- the final review is assembled from traceable source records and passages.

Registered tools:

- `search_comparable_trials` — focused or broadened ClinicalTrials.gov research
- `search_endpoint_literature` — indication-specific PubMed research
- `record_evidence_gap` — preserves unresolved questions instead of inventing an answer

Application limits constrain turns, tool calls, elapsed time, and request size. Tool failures remain visible in the trace. The UI exposes concise decisions and tool events, not private model chain-of-thought.

## Why not just ask Claude or ChatGPT?

A direct chat can give a useful preliminary opinion, but a one-off conversation does not by itself guarantee this product's controls:

| Direct chat | This application |
| --- | --- |
| The model may search or answer differently between sessions | The runtime exposes a defined set of typed evidence tools |
| Source coverage and stopping behavior are conversational | Tool budgets, time limits, and stop conditions are enforced in code |
| Citations may be links in generated prose | Claims point to retained NCT/PMID records and evidence passages |
| Failures or empty sources may be easy to miss | Source failures and evidence gaps remain explicit in the run trace |
| Reproduction depends on the conversation | Queries, timestamps, source IDs, passages, and tool outcomes are retained |
| Quality is judged informally | Regression, live-source, model E2E, and expert-adjudicated evaluations are defined |
| Output is a chat response | The review is a deployable workflow with structured UI and cited PDF export |

Claude, Claude Agent SDK, or another capable model platform **could implement the same architecture**. The differentiation is not that Claude is incapable; it is the domain-specific evidence tools, controlled runtime, source-preserving review pipeline, tests, evaluations, and release discipline implemented in this repository. A fair comparison is therefore this application versus an unstructured chat request—not OpenAI versus Anthropic.

## Quick start

Requirements:

- Node.js 22.13 or newer
- an OpenAI API key for the web application

```bash
git clone https://github.com/mnarasimhan02/life-sciences-agents.git
cd life-sciences-agents/agents/protocol-design-agent
npm ci
cp .env.example .env
```

Set your server-side key in `.env`:

```text
OPENAI_API_KEY=your_key
OPENAI_MODEL=gpt-5.4
PORT=3000
```

Start the app:

```bash
set -a && source .env && set +a
npm start
```

Open [http://localhost:3000](http://localhost:3000). The API key stays on the server and is never sent to the browser.

## Try it

Paste an existing study concept such as:

> A randomized phase 2 study of a PD-1 inhibitor versus docetaxel in adults with previously treated advanced non-small cell lung cancer. The primary endpoint is progression-free survival. Planned enrollment is 180 participants with 52 weeks of follow-up.

The review workspace separates the user-facing deliverable from the auditable agent activity. Citations open the supporting evidence record. The final PDF contains the summary, design findings, evidence gaps, and cited passages and URLs.

## CLI without a model key

The deterministic planner remains available for local development and regression testing:

```bash
npm run review -- examples/phase2-oncology.json
```

It uses the same public ClinicalTrials.gov and PubMed tools but is not the hosted model-directed runtime.

## Verification

```bash
npm run typecheck
npm test
```

Optional live integration checks:

```bash
npm run test:live-tools
```

Optional model-directed end-to-end test, which incurs API usage:

```bash
OPENAI_API_KEY=... npm run test:e2e:model
```

Test coverage includes adaptive search, sparse evidence, tool failure and replanning, budget exhaustion, invalid concepts, phase filtering, production data-integrity guards, and source traceability.

Passing automated checks are not evidence of clinical validity. See [evals/README.md](evals/README.md) and [evals/EVALUATION_PLAN.md](evals/EVALUATION_PLAN.md).

## API

Health check:

```text
GET /api/health
```

Extract a free-text study description:

```http
POST /api/extract
Content-Type: application/json

{"text":"Planning a phase 2 trial of a PD-1 inhibitor in advanced NSCLC..."}
```

Stream a model-directed review as newline-delimited JSON:

```http
POST /api/review/stream
Content-Type: application/json

{"concept":{"condition":"non-small cell lung cancer","phase":"Phase 2"}}
```

Stream events include `status`, `trace`, `result`, and `error`.

## Deployment

The included `Dockerfile` can run on Cloud Run, AWS App Runner, Azure Container Apps, Railway, Render, or another Node-compatible container host.

```bash
docker build -t protocol-design-review-agent .
docker run --rm -p 3000:3000 --env-file .env protocol-design-review-agent
```

Before making the service public, complete [LAUNCH_CHECKLIST.md](LAUNCH_CHECKLIST.md). In particular, configure secrets, authentication, rate limits, logs, retention rules, monitoring, and an explicit clinical-use disclaimer.

## Evidence boundaries

- Comparator frequency does not establish endpoint validity, regulatory acceptance, or design suitability.
- Registry data are sponsor-submitted and can be incomplete or outdated.
- PubMed abstracts are not a substitute for full-text critical appraisal.
- Absence of retrieved public evidence is not evidence of absence.
- The exploratory sample-size utility is not a validated statistical analysis.
- The current system does not calculate a final treatment effect, power analysis, or regulatory strategy.
- Every consequential conclusion requires qualified human review.

## Repository map

```text
protocol-design-agent/
├── public/                 # Single-screen app and cited review workspace
├── src/                    # Agent, planner, analyzer, server, and live tools
├── tests/                  # Unit, production-integrity, live, and model E2E tests
├── evals/                  # Evaluation plan and adjudication starter set
├── examples/               # Reproducible study concepts
├── LAUNCH_CHECKLIST.md     # Pre-public-release controls
├── Dockerfile
└── README.md
```

## Status

This project is in active development. No clinical-performance, citation-entailment, or issue-recall score is claimed yet. Those results will be published only after the evaluation cases are expert-adjudicated.
