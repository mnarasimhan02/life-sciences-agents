import { randomUUID } from "node:crypto";

import type { AgentBudget, InvestigationState, ToolName, ToolResult, TraceEvent, TraceEventType } from "./types.ts";

export const DEFAULT_BUDGET: AgentBudget = {
  maxSteps: 8,
  maxToolCalls: 5,
  timeoutMs: 30_000,
};

export function createState(nctId: string, budget: Partial<AgentBudget> = {}): InvestigationState {
  return {
    runId: randomUUID(),
    input: { nctId },
    status: "running",
    startedAt: new Date().toISOString(),
    completedAt: null,
    step: 0,
    toolCalls: 0,
    budget: { ...DEFAULT_BUDGET, ...budget },
    trial: null,
    attemptedTools: [],
    completedTools: [],
    failedTools: [],
    sources: [],
    evidenceGaps: [],
    trace: [],
    stopReason: null,
  };
}

export function addTrace(
  state: InvestigationState,
  type: TraceEventType,
  message: string,
  options: { tool?: ToolName; data?: Record<string, unknown> } = {},
): void {
  const event: TraceEvent = {
    sequence: state.trace.length + 1,
    timestamp: new Date().toISOString(),
    type,
    message,
  };
  if (options.tool) event.tool = options.tool;
  if (options.data) event.data = options.data;
  state.trace.push(event);
}

export function applyToolResult(state: InvestigationState, result: ToolResult): void {
  if (!state.attemptedTools.includes(result.tool)) state.attemptedTools.push(result.tool);

  if (!result.ok) {
    const error = result.error ?? "Unknown tool failure";
    state.failedTools.push({ tool: result.tool, error });
    addTrace(state, "tool-failed", `${result.tool} failed: ${error}`, { tool: result.tool });
    return;
  }

  if (!state.completedTools.includes(result.tool)) state.completedTools.push(result.tool);
  state.sources.push(...result.records.filter((record) => !state.sources.some((current) => current.id === record.id)));
  if (result.trial) state.trial = result.trial;
  addTrace(state, "tool-completed", `${result.tool} returned ${result.records.length} record(s).`, {
    tool: result.tool,
    data: { recordCount: result.records.length },
  });
}

export function addEvidenceGap(state: InvestigationState, gap: string): void {
  if (!state.evidenceGaps.includes(gap)) state.evidenceGaps.push(gap);
}
