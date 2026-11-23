import assert from "node:assert/strict";
import test from "node:test";

import { ProtocolDesignAgent } from "../src/agent.ts";
import { ProtocolDesignPlanner } from "../src/planner.ts";
import { phaseMatches } from "../src/tools/clinical-trials.ts";
import type { AgentState, AgentTool, ComparableTrial, PlanDecision, StudyConcept, ToolName, ToolResult } from "../src/types.ts";

const concept: StudyConcept = {
  condition: "non-small cell lung cancer",
  phase: "Phase 2",
  intervention: "PD-1 inhibitor",
  primaryEndpoint: "objective response rate",
  comparator: "single-arm historical control",
  enrollmentTarget: 120,
  durationWeeks: 52,
  plannedVisitCount: 18,
  inclusionCriteria: ["Measurable disease", "ECOG 0 or 1"],
  exclusionCriteria: ["Active autoimmune disease"],
};

function trial(id: number, endpoint = "Objective Response Rate"): ComparableTrial {
  return {
    nctId: `NCT${String(id).padStart(8, "0")}`,
    title: `Comparator ${id}`,
    status: "COMPLETED",
    phase: ["PHASE2"],
    conditions: [concept.condition],
    interventions: ["Example therapy"],
    primaryOutcomes: [{ measure: endpoint, timeFrame: "24 weeks" }],
    enrollment: 50 + id,
    allocation: "NA",
    masking: "NONE",
    eligibilityCriteria: null,
    url: `https://clinicaltrials.gov/study/NCT${String(id).padStart(8, "0")}`,
  };
}

class MockTool implements AgentTool {
  readonly name: ToolName;
  private readonly handler: (decision: Extract<PlanDecision, { kind: "use-tool" }>) => ToolResult;

  constructor(name: ToolName, handler: (decision: Extract<PlanDecision, { kind: "use-tool" }>) => ToolResult) {
    this.name = name;
    this.handler = handler;
  }

  async execute(_state: Readonly<AgentState>, decision: Extract<PlanDecision, { kind: "use-tool" }>, _signal: AbortSignal): Promise<ToolResult> {
    return this.handler(decision);
  }
}

function literatureTool(): AgentTool {
  return new MockTool("pubmed-endpoint-search", () => ({
    tool: "pubmed-endpoint-search",
    ok: true,
    query: "NSCLC AND objective response rate",
    literature: [{ pmid: "1", title: "Endpoint paper", journal: "Journal", publicationDate: "2024", abstract: "An endpoint abstract.", url: "https://pubmed.ncbi.nlm.nih.gov/1/" }],
  }));
}

test("sufficient focused comparators skip the broadened search", async () => {
  const search = new MockTool("clinical-trials-search", (decision) => ({
    tool: "clinical-trials-search",
    ok: true,
    mode: decision.tool === "clinical-trials-search" ? decision.mode : "focused",
    query: "focused",
    trials: [1, 2, 3, 4, 5].map((id) => trial(id)),
  }));
  const report = await new ProtocolDesignAgent({ tools: [search, literatureTool()] }).review(concept);
  const searches = report.trace.filter((event) => event.type === "tool-started" && event.tool === "clinical-trials-search");
  assert.equal(searches.length, 1);
  assert.equal(report.comparableTrials.length, 5);
  assert.equal(report.endpointAssessment.precedentStrength, "repeated");
});

test("sparse evidence causes the agent to broaden its search", async () => {
  const search = new MockTool("clinical-trials-search", (decision) => {
    const mode = decision.tool === "clinical-trials-search" ? decision.mode : "focused";
    return { tool: "clinical-trials-search", ok: true, mode, query: mode, trials: mode === "focused" ? [trial(1)] : [trial(1), trial(2), trial(3), trial(4), trial(5)] };
  });
  const report = await new ProtocolDesignAgent({ tools: [search, literatureTool()] }).review(concept);
  const modes = report.trace.filter((event) => event.type === "tool-completed" && event.tool === "clinical-trials-search").map((event) => event.data?.mode);
  assert.deepEqual(modes, ["focused", "broadened"]);
  assert.equal(report.comparableTrials.length, 5);
});

test("a proposed endpoint triggers a literature search", async () => {
  const search = new MockTool("clinical-trials-search", () => ({ tool: "clinical-trials-search", ok: true, mode: "focused", query: "focused", trials: [1, 2, 3, 4, 5].map((id) => trial(id)) }));
  const report = await new ProtocolDesignAgent({ tools: [search, literatureTool()] }).review(concept);
  assert.equal(report.sourceCoverage.find((item) => item.source === "pubmed-endpoint-search")?.status, "completed");
  assert.equal(report.literature.length, 1);
});

test("no proposed endpoint skips PubMed and records a decision gap", async () => {
  const search = new MockTool("clinical-trials-search", () => ({ tool: "clinical-trials-search", ok: true, mode: "focused", query: "focused", trials: [1, 2, 3, 4, 5].map((id) => trial(id)) }));
  const { primaryEndpoint: _removed, ...withoutEndpoint } = concept;
  const report = await new ProtocolDesignAgent({ tools: [search, literatureTool()] }).review(withoutEndpoint);
  assert.equal(report.sourceCoverage.find((item) => item.source === "pubmed-endpoint-search")?.status, "not-run");
  assert.ok(report.evidenceGaps.some((item) => /No proposed primary endpoint/i.test(item)));
});

test("focused search failure is recorded and followed by a broadened search", async () => {
  const search = new MockTool("clinical-trials-search", (decision) => {
    const mode = decision.tool === "clinical-trials-search" ? decision.mode : "focused";
    return mode === "focused"
      ? { tool: "clinical-trials-search", ok: false, mode, query: mode, error: "temporary failure" }
      : { tool: "clinical-trials-search", ok: true, mode, query: mode, trials: [1, 2, 3, 4, 5].map((id) => trial(id)) };
  });
  const report = await new ProtocolDesignAgent({ tools: [search, literatureTool()] }).review(concept);
  assert.equal(report.status, "complete");
  assert.ok(report.trace.some((event) => event.type === "tool-failed"));
  assert.ok(report.trace.some((event) => event.type === "replanned"));
  assert.equal(report.comparableTrials.length, 5);
});

test("budget exhaustion stops the agent safely", async () => {
  const search = new MockTool("clinical-trials-search", () => ({ tool: "clinical-trials-search", ok: true, mode: "focused", query: "focused", trials: [trial(1)] }));
  const report = await new ProtocolDesignAgent({ tools: [search, literatureTool()], budget: { maxToolCalls: 1 } }).review(concept);
  assert.ok(report.trace.some((event) => event.type === "budget-exhausted"));
  assert.equal(report.budget.toolCallsUsed, 1);
});

test("invalid concepts fail before tool use", async () => {
  const agent = new ProtocolDesignAgent({ tools: [], planner: new ProtocolDesignPlanner() });
  await assert.rejects(() => agent.review({ condition: "", phase: "Phase 2" }), /condition is required/i);
  await assert.rejects(() => agent.review({ condition: "NSCLC", phase: "" }), /phase is required/i);
});

test("phase matching rejects adjacent phases returned by free-text search", () => {
  assert.equal(phaseMatches("Phase 2", ["PHASE2"]), true);
  assert.equal(phaseMatches("Phase 2", ["EARLY_PHASE1", "PHASE1"]), false);
  assert.equal(phaseMatches("Phase 2", ["PHASE3"]), false);
  assert.equal(phaseMatches("Phase 2/Phase 3", ["PHASE3"]), true);
});
