import type { AgentState, PlanDecision } from "./types.ts";

export type PlannerOptions = {
  minimumComparables: number;
};

export class ProtocolDesignPlanner {
  private readonly minimumComparables: number;

  constructor(options: Partial<PlannerOptions> = {}) {
    this.minimumComparables = options.minimumComparables ?? 5;
  }

  decide(state: Readonly<AgentState>): PlanDecision {
    if (!state.attemptedSearchModes.includes("focused")) {
      return {
        kind: "use-tool",
        tool: "clinical-trials-search",
        mode: "focused",
        reason: "Start with trials matching the condition, phase and intervention so the precedent set remains specific.",
      };
    }

    if (state.comparables.length < this.minimumComparables && !state.attemptedSearchModes.includes("broadened")) {
      return {
        kind: "use-tool",
        tool: "clinical-trials-search",
        mode: "broadened",
        reason: `Only ${state.comparables.length} focused comparator(s) were found; broaden to condition and phase before judging the design.`,
      };
    }

    if (state.concept.primaryEndpoint && !state.attemptedTools.includes("pubmed-endpoint-search")) {
      return {
        kind: "use-tool",
        tool: "pubmed-endpoint-search",
        reason: "A primary endpoint was proposed; search the literature for indication-specific endpoint evidence before assessing precedent.",
      };
    }

    if (!state.comparables.length) {
      return {
        kind: "finish",
        reason: "No comparable public trials were retrieved after focused and broadened searches; finish with an explicit evidence gap.",
      };
    }

    return {
      kind: "finish",
      reason: "Comparable-trial coverage and applicable endpoint research are sufficient for a bounded design review.",
    };
  }
}
