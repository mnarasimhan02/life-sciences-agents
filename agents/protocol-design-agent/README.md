# Protocol Design Agent

Protocol Design Agent reviews a structured study concept against public trial and literature evidence. It is a decision-support research agent, not an autonomous protocol author and not a substitute for clinical, statistical, regulatory, operational or patient review.

## Goal

Given a condition, phase and proposed design choices, the agent should determine:

- Which public trials are genuinely useful comparators
- Whether the proposed primary endpoint has visible precedent
- Which alternative endpoints recur in the comparator set
- How proposed enrollment compares with retrieved trials
- Whether eligibility-rule count and visit frequency create operational questions
- What cannot be assessed from the supplied concept and public evidence

## Agent behavior

The execution path adapts to its observations:

1. Start with a focused condition + phase + intervention/mechanism search.
2. If fewer than five unique comparators are found, broaden to condition + phase.
3. If a primary endpoint is proposed, search PubMed for indication-specific endpoint evidence.
4. If a tool fails, record the failure and replan rather than silently treating it as no evidence.
5. Stop when the evidence paths are complete or the configured budget is exhausted.

Every plan, tool call, observation, replan and stop decision appears in the returned trace.

## Run

Requires Node.js 22.13 or newer.

```bash
npm install
npm test
npm run review -- examples/phase2-oncology.json
```

No API key is required. The current tools use ClinicalTrials.gov API v2 and PubMed E-utilities.

## Run the web app

The hosted application uses the OpenAI Agents SDK. The model independently selects tools, calls live ClinicalTrials.gov and PubMed APIs, observes results, replans and decides when to stop.

```bash
cp .env.example .env
# Add OPENAI_API_KEY to .env for Agent mode.
set -a && source .env && set +a
npm start
```

Open `http://localhost:3000`. Paste a synopsis, protocol paragraph or rough study idea. A separate extraction agent returns structured fields with exact supporting source quotes. The interface highlights what it found, asks one question at a time only for missing fields, and carries uncertain answers into the review as evidence gaps.

After clarification, the research agent selects and runs the live evidence tools. The interface streams its decisions, tool calls, observations and replans before presenting the structured review. A follow-up box lets the user add or correct details and reruns extraction and research from the updated description.

The review includes claim-level source buttons, a design-choice check for phase, endpoint, comparator, enrollment and duration, and an evidence library built from specific NCT and PMID records. PubMed abstracts and structured registry fields are preserved as the supporting passages. Only ClinicalTrials.gov and PubMed are currently labelled live; planned source families are not counted as searched.

The interface streams the run as it happens: current status, concise model decision rationale, tool start, API observation, replanning, evidence gaps and stop condition. It does not expose private model chain-of-thought.

## Deploy

The included `Dockerfile` can be deployed to services such as Google Cloud Run, AWS App Runner, Azure Container Apps, Railway or Render. Configure these environment variables on the hosting platform:

```text
OPENAI_API_KEY=...
OPENAI_MODEL=gpt-5.4
PORT=3000
```

The OpenAI key remains server-side and is never sent to the browser. The public application requires the key because every run uses the model-directed agent runtime. The deterministic planner remains available only through the CLI and automated tests.

Health check:

```text
GET /api/health
```

Extract a free-text study description:

```text
POST /api/extract
Content-Type: application/json

{"text":"Planning a phase 2 trial of a PD-1 inhibitor in advanced NSCLC..."}
```

Run an investigation:

```text
POST /api/review
Content-Type: application/json

{"concept":{"condition":"non-small cell lung cancer","phase":"Phase 2"}}
```

Stream a live investigation as newline-delimited JSON:

```text
POST /api/review/stream
Content-Type: application/json

{"concept":{"condition":"non-small cell lung cancer","phase":"Phase 2"}}
```

Stream events include `status`, `trace`, `result` and `error`. The browser renders each event immediately while the agent is still running.

## Agent runtime

Agent mode is built with the OpenAI Agents SDK and registered function tools:

1. `search_comparable_trials` — focused or broadened ClinicalTrials.gov research
2. `search_endpoint_literature` — indication-specific PubMed research
3. `record_evidence_gap` — explicit preservation of unresolved questions

The SDK runs the model → tool → observation loop. Application-level limits still enforce maximum turns, tool calls and elapsed time. The deterministic analyzer creates the final structured review from retrieved evidence so model prose cannot silently alter source records.

## Input

The CLI accepts a JSON study concept. Only `condition` and `phase` are required.

```json
{
  "condition": "non-small cell lung cancer",
  "phase": "Phase 2",
  "intervention": "PD-1 inhibitor",
  "population": "Adults with previously treated advanced NSCLC",
  "primaryEndpoint": "objective response rate",
  "comparator": "single-arm historical control",
  "enrollmentTarget": 120,
  "durationWeeks": 52,
  "plannedVisitCount": 18,
  "inclusionCriteria": ["Measurable disease"],
  "exclusionCriteria": ["Active autoimmune disease"]
}
```

## Output

- Endpoint-precedent assessment
- Observed endpoint alternatives
- Eligibility-complexity observations
- Enrollment and visit-burden observations
- Reviewable design options
- Comparable trials and publications
- Source coverage and evidence gaps
- Budget consumption
- Full execution trace

## Evidence boundaries

- Comparator frequency does not establish endpoint validity, regulatory acceptance or design suitability.
- Registry data are sponsor-submitted and can be incomplete or outdated.
- Eligibility-rule count is only an operational-complexity signal; it is not a recruitment forecast.
- The agent does not calculate sample size, treatment effect or statistical power.
- The output must be reviewed by qualified clinical, statistical, regulatory, operational and patient representatives.

## Next milestones

1. Structured comparator ranking with explicit inclusion and rejection reasons
2. Endpoint ontology and synonym normalization
3. Published result extraction rather than citation metadata only
4. Schedule-of-activities and patient-burden analysis
5. Statistical and regulatory human-approval gates
6. An adjudicated design-review evaluation set
