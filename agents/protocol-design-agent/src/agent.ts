import { buildReview } from "./analyzer.ts";
import { ProtocolDesignPlanner } from "./planner.ts";
import { applyResult, createState, gap, trace } from "./state.ts";
import { ClinicalTrialsSearchTool } from "./tools/clinical-trials.ts";
import { PubMedEndpointTool } from "./tools/pubmed.ts";
import type { AgentBudget, AgentTool, DesignReview, StudyConcept, ToolName } from "./types.ts";

export type AgentOptions = {
  budget?: Partial<AgentBudget>;
  tools?: AgentTool[];
  planner?: ProtocolDesignPlanner;
};

function validateConcept(concept: StudyConcept): void {
  if (!concept.condition?.trim()) throw new Error("A condition is required.");
  if (!concept.phase?.trim()) throw new Error("A phase is required.");
  if (concept.enrollmentTarget != null && concept.enrollmentTarget <= 0) throw new Error("Enrollment target must be positive.");
  if (concept.durationWeeks != null && concept.durationWeeks <= 0) throw new Error("Duration must be positive.");
  if (concept.plannedVisitCount != null && concept.plannedVisitCount <= 0) throw new Error("Visit count must be positive.");
}

export class ProtocolDesignAgent {
  private readonly budget: Partial<AgentBudget>;
  private readonly planner: ProtocolDesignPlanner;
  private readonly tools: Map<ToolName, AgentTool>;

  constructor(options: AgentOptions = {}) {
    this.budget = options.budget ?? {};
    this.planner = options.planner ?? new ProtocolDesignPlanner();
    const tools = options.tools ?? [new ClinicalTrialsSearchTool(), new PubMedEndpointTool()];
    this.tools = new Map(tools.map((tool) => [tool.name, tool]));
  }

  async review(concept: StudyConcept): Promise<DesignReview> {
    validateConcept(concept);
    const normalized: StudyConcept = { ...concept, condition: concept.condition.trim(), phase: concept.phase.trim() };
    const state = createState(normalized, this.budget);
    trace(state, "run-started", `Protocol design review started for ${normalized.condition}, ${normalized.phase}.`);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(new Error("Agent run timed out.")), state.budget.timeoutMs);

    try {
      while (state.status === "running") {
        if (state.step >= state.budget.maxSteps || state.toolCalls >= state.budget.maxToolCalls) {
          state.status = "complete";
          state.stopReason = "Investigation budget exhausted.";
          gap(state, "The review reached its configured budget before every evidence path completed.");
          trace(state, "budget-exhausted", state.stopReason, { data: { steps: state.step, toolCalls: state.toolCalls } });
          break;
        }

        state.step += 1;
        const decision = this.planner.decide(state);
        trace(state, "plan-created", decision.reason, decision.kind === "use-tool" ? { tool: decision.tool } : {});
        if (decision.kind === "finish") {
          state.status = "complete";
          state.stopReason = decision.reason;
          trace(state, "run-completed", decision.reason);
          break;
        }
        if (decision.kind === "fail") {
          state.status = "failed";
          state.stopReason = decision.reason;
          trace(state, "run-failed", decision.reason);
          break;
        }

        const tool = this.tools.get(decision.tool);
        if (!tool) {
          if (!state.attemptedTools.includes(decision.tool)) state.attemptedTools.push(decision.tool);
          if (decision.tool === "clinical-trials-search" && !state.attemptedSearchModes.includes(decision.mode)) state.attemptedSearchModes.push(decision.mode);
          state.failures.push({ tool: decision.tool, error: "Tool is not configured." });
          gap(state, `${decision.tool} is not configured.`);
          trace(state, "tool-failed", `${decision.tool} is not configured.`, { tool: decision.tool });
          trace(state, "replanned", "The missing tool was recorded; the planner will select the next safe action.");
          continue;
        }

        state.toolCalls += 1;
        trace(state, "tool-started", decision.reason, { tool: decision.tool });
        const result = await tool.execute(state, decision, controller.signal);
        applyResult(state, result);
        if (!result.ok) gap(state, `${decision.tool} could not be completed: ${result.error ?? "unknown error"}`);
        trace(state, "replanned", "The planner will choose the next action from the updated evidence state.");
      }
    } catch (error) {
      state.status = "failed";
      state.stopReason = error instanceof Error ? error.message : String(error);
      trace(state, "run-failed", state.stopReason);
    } finally {
      clearTimeout(timeout);
    }

    return buildReview(state);
  }
}
