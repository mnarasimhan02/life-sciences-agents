import assert from "node:assert/strict";
import test from "node:test";

import { TrialEvidenceAgent } from "../src/agent.ts";
import type { AgentTool, InvestigationState, ToolName, ToolResult, TrialProfile } from "../src/types.ts";

const baseTrial: TrialProfile = {
  nctId: "NCT02569398",
  title: "Example trial",
  officialTitle: null,
  status: "TERMINATED",
  whyStopped: "The benefit-risk assessment no longer supported continuation.",
  sponsor: "Example sponsor",
  interventions: ["Examplemab"],
  conditions: ["Example condition"],
  phase: ["PHASE3"],
  hasResults: false,
  lastUpdate: "2024-01-01",
};

class MockTool implements AgentTool {
  readonly name: ToolName;
  private readonly result: Omit<ToolResult, "tool">;

  constructor(name: ToolName, result: Omit<ToolResult, "tool">) {
    this.name = name;
    this.result = result;
  }

  async execute(_state: Readonly<InvestigationState>, _signal: AbortSignal): Promise<ToolResult> {
    return { tool: this.name, ...this.result };
  }
}

function tools(trial: TrialProfile = baseTrial): AgentTool[] {
  return [
    new MockTool("clinical-trials-current", {
      ok: true,
      records: [{ id: "registry", sourceType: "registry", title: "Registry", url: "https://example.test", date: null, detail: trial.status }],
      trial,
    }),
    new MockTool("clinical-trials-history", {
      ok: true,
      records: [{ id: "history", sourceType: "registry-history", title: "History", url: "https://example.test/history", date: null, detail: "3 versions" }],
    }),
    new MockTool("pubmed", {
      ok: true,
      records: [{ id: "pubmed-1", sourceType: "publication", title: "Results", url: "https://pubmed.test/1", date: "2024", detail: "Journal" }],
    }),
  ];
}

test("a terminated trial triggers registry history before publication search", async () => {
  const report = await new TrialEvidenceAgent({ tools: tools() }).investigate(baseTrial.nctId);
  const starts = report.trace.filter((event) => event.type === "tool-started").map((event) => event.tool);
  assert.deepEqual(starts, ["clinical-trials-current", "clinical-trials-history", "pubmed"]);
  assert.equal(report.finding.classification, "documented-stop");
  assert.equal(report.finding.evidenceStrength, "directly-documented");
  assert.equal(report.status, "complete");
});

test("an active trial skips history and does not call it a failure", async () => {
  const active = { ...baseTrial, status: "RECRUITING", whyStopped: null };
  const report = await new TrialEvidenceAgent({ tools: tools(active) }).investigate(active.nctId);
  const starts = report.trace.filter((event) => event.type === "tool-started").map((event) => event.tool);
  assert.deepEqual(starts, ["clinical-trials-current", "pubmed"]);
  assert.equal(report.finding.classification, "active-or-ongoing");
  assert.match(report.finding.statement, /not evidence of failure/i);
});

test("an optional source failure is recorded and the agent replans", async () => {
  const configured = tools();
  configured[1] = new MockTool("clinical-trials-history", { ok: false, records: [], error: "history unavailable" });
  const report = await new TrialEvidenceAgent({ tools: configured }).investigate(baseTrial.nctId);
  assert.equal(report.status, "complete");
  assert.equal(report.sourceCoverage.find((item) => item.tool === "clinical-trials-history")?.status, "failed");
  assert.ok(report.evidenceGaps.some((gap) => /history unavailable/i.test(gap)));
  assert.ok(report.trace.some((event) => event.type === "replanned"));
});

test("the authoritative registry is a hard dependency", async () => {
  const configured = tools();
  configured[0] = new MockTool("clinical-trials-current", { ok: false, records: [], error: "registry unavailable" });
  const report = await new TrialEvidenceAgent({ tools: configured }).investigate(baseTrial.nctId);
  assert.equal(report.status, "failed");
  assert.match(report.trace.at(-1)?.message ?? "", /identity cannot be established/i);
});

test("the agent stops safely when its tool budget is exhausted", async () => {
  const report = await new TrialEvidenceAgent({ tools: tools(), budget: { maxToolCalls: 1 } }).investigate(baseTrial.nctId);
  assert.equal(report.status, "complete");
  assert.equal(report.budget.toolCallsUsed, 1);
  assert.ok(report.trace.some((event) => event.type === "budget-exhausted"));
  assert.ok(report.evidenceGaps.some((gap) => /configured budget/i.test(gap)));
});

test("invalid identifiers are rejected before any tool call", async () => {
  await assert.rejects(() => new TrialEvidenceAgent({ tools: tools() }).investigate("123"), /Expected an NCT identifier/);
});
