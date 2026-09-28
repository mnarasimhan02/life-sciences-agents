import { EvidencePlanner } from "./planner.ts";
import { buildReport } from "./report.ts";
import { addEvidenceGap, addTrace, applyToolResult, createState } from "./state.ts";
import { ClinicalTrialsCurrentTool, ClinicalTrialsHistoryTool } from "./tools/clinical-trials.ts";
import { PubMedTool } from "./tools/pubmed.ts";
import type { AgentBudget, AgentTool, InvestigationReport, InvestigationState, ToolName } from "./types.ts";

export type TrialEvidenceAgentOptions = {
  budget?: Partial<AgentBudget>;
  tools?: AgentTool[];
  planner?: EvidencePlanner;
  now?: () => Date;
};

export class TrialEvidenceAgent {
  private readonly tools: Map<ToolName, AgentTool>;
  private readonly planner: EvidencePlanner;
  private readonly now: () => Date;
  private readonly budget: Partial<AgentBudget>;

  constructor(options: TrialEvidenceAgentOptions = {}) {
    const configuredTools = options.tools ?? [new ClinicalTrialsCurrentTool(), new ClinicalTrialsHistoryTool(), new PubMedTool()];
    this.tools = new Map(configuredTools.map((tool) => [tool.name, tool]));
    this.planner = options.planner ?? new EvidencePlanner();
    this.now = options.now ?? (() => new Date());
    this.budget = options.budget ?? {};
  }

  async investigate(nctIdInput: string): Promise<InvestigationReport> {
    const nctId = nctIdInput.trim().toUpperCase();
    if (!/^NCT\d{8}$/.test(nctId)) throw new Error("Expected an NCT identifier such as NCT02569398.");

    const state = createState(nctId, this.budget);
    addTrace(state, "run-started", `Investigation started for ${nctId}.`);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(new Error("Agent run timed out.")), state.budget.timeoutMs);

    try {
      while (state.status === "running") {
        if (state.step >= state.budget.maxSteps || state.toolCalls >= state.budget.maxToolCalls) {
          state.status = "complete";
          state.stopReason = "Investigation budget exhausted.";
          addEvidenceGap(state, "The investigation stopped at its configured budget before all evidence paths were completed.");
          addTrace(state, "budget-exhausted", state.stopReason, {
            data: { steps: state.step, toolCalls: state.toolCalls },
          });
          break;
        }

        state.step += 1;
        const decision = this.planner.decide(state);
        addTrace(state, "plan-created", decision.reason, decision.kind === "use-tool" ? { tool: decision.tool } : {});

        if (decision.kind === "finish") {
          state.status = "complete";
          state.stopReason = decision.reason;
          addTrace(state, "run-completed", decision.reason);
          break;
        }
        if (decision.kind === "fail") {
          state.status = "failed";
          state.stopReason = decision.reason;
          addTrace(state, "run-failed", decision.reason);
          break;
        }

        const tool = this.tools.get(decision.tool);
        if (!tool) {
          state.attemptedTools.push(decision.tool);
          state.failedTools.push({ tool: decision.tool, error: "Tool is not configured." });
          addTrace(state, "tool-failed", `${decision.tool} is not configured.`, { tool: decision.tool });
          addTrace(state, "replanned", "The missing tool was recorded and the planner will select the next safe action.");
          continue;
        }

        state.toolCalls += 1;
        addTrace(state, "tool-started", decision.reason, { tool: decision.tool });
        const result = await tool.execute(state, controller.signal);
        applyToolResult(state, result);
        if (!result.ok && decision.tool !== "clinical-trials-current") {
          addEvidenceGap(state, `${decision.tool} could not be completed: ${result.error ?? "unknown error"}`);
        }
        addTrace(state, "replanned", "The planner will choose the next action from the updated evidence state.");
      }
    } catch (error) {
      state.status = "failed";
      state.stopReason = error instanceof Error ? error.message : String(error);
      addTrace(state, "run-failed", state.stopReason);
    } finally {
      clearTimeout(timeout);
      state.completedAt = this.now().toISOString();
    }

    return buildReport(state);
  }
}

export type { InvestigationState };
