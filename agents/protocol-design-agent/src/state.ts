import { randomUUID } from "node:crypto";

import type { AgentBudget, AgentState, StudyConcept, ToolResult, TraceType } from "./types.ts";

export const DEFAULT_BUDGET: AgentBudget = {
  maxSteps: 8,
  maxToolCalls: 4,
  timeoutMs: 30_000,
};

export function createState(concept: StudyConcept, budget: Partial<AgentBudget> = {}): AgentState {
  return {
    runId: randomUUID(),
    concept,
    status: "running",
    step: 0,
    toolCalls: 0,
    budget: { ...DEFAULT_BUDGET, ...budget },
    attemptedSearchModes: [],
    attemptedTools: [],
    completedTools: [],
    failures: [],
    comparables: [],
    literature: [],
    evidenceGaps: [],
    trace: [],
    stopReason: null,
  };
}

export function trace(
  state: AgentState,
  type: TraceType,
  message: string,
  details: { tool?: ToolResult["tool"]; data?: Record<string, unknown> } = {},
): void {
  const event = {
    sequence: state.trace.length + 1,
    timestamp: new Date().toISOString(),
    type,
    message,
  } as AgentState["trace"][number];
  if (details.tool) event.tool = details.tool;
  if (details.data) event.data = details.data;
  state.trace.push(event);
}

export function gap(state: AgentState, message: string): void {
  if (!state.evidenceGaps.includes(message)) state.evidenceGaps.push(message);
}

export function applyResult(state: AgentState, result: ToolResult): void {
  if (!state.attemptedTools.includes(result.tool)) state.attemptedTools.push(result.tool);
  if (result.mode && !state.attemptedSearchModes.includes(result.mode)) state.attemptedSearchModes.push(result.mode);

  if (!result.ok) {
    const error = result.error ?? "Unknown tool failure";
    state.failures.push({ tool: result.tool, error });
    trace(state, "tool-failed", `${result.tool} failed: ${error}`, { tool: result.tool });
    return;
  }

  if (!state.completedTools.includes(result.tool)) state.completedTools.push(result.tool);
  for (const trial of result.trials ?? []) {
    const existing = state.comparables.findIndex((item) => item.nctId === trial.nctId);
    if (existing < 0) state.comparables.push(trial);
  }
  for (const record of result.literature ?? []) {
    if (!state.literature.some((item) => item.pmid === record.pmid)) state.literature.push(record);
  }
  trace(state, "tool-completed", `${result.tool} completed.`, {
    tool: result.tool,
    data: {
      mode: result.mode,
      trialCount: result.trials?.length ?? 0,
      literatureCount: result.literature?.length ?? 0,
      query: result.query,
    },
  });
}
