import type { InvestigationState, PlanDecision, ToolName } from "./types.ts";

const ACTIVE_STATUSES = new Set([
  "NOT_YET_RECRUITING",
  "RECRUITING",
  "ENROLLING_BY_INVITATION",
  "ACTIVE_NOT_RECRUITING",
]);

const TERMINAL_OR_STOPPED_STATUSES = new Set([
  "TERMINATED",
  "WITHDRAWN",
  "SUSPENDED",
]);

function attempted(state: InvestigationState, tool: ToolName): boolean {
  return state.attemptedTools.includes(tool);
}

export class EvidencePlanner {
  decide(state: Readonly<InvestigationState>): PlanDecision {
    if (!attempted(state, "clinical-trials-current")) {
      return {
        kind: "use-tool",
        tool: "clinical-trials-current",
        reason: "The current registry record is required before any causal or program-level investigation.",
      };
    }

    if (!state.trial) {
      return {
        kind: "fail",
        reason: "The authoritative registry record could not be retrieved, so the trial identity cannot be established.",
      };
    }

    const normalizedStatus = state.trial.status.toUpperCase().replaceAll(" ", "_");
    const shouldInspectHistory = TERMINAL_OR_STOPPED_STATUSES.has(normalizedStatus) || Boolean(state.trial.whyStopped);

    if (shouldInspectHistory && !attempted(state, "clinical-trials-history")) {
      return {
        kind: "use-tool",
        tool: "clinical-trials-history",
        reason: "A stopped or terminated record requires temporal comparison before interpreting the outcome.",
      };
    }

    if (!attempted(state, "pubmed")) {
      return {
        kind: "use-tool",
        tool: "pubmed",
        reason: ACTIVE_STATUSES.has(normalizedStatus)
          ? "The trial is ongoing; search for published results before assuming there is no reported outcome."
          : "Search for trial-specific publications that may confirm, narrow, or contradict the registry record.",
      };
    }

    return {
      kind: "finish",
      reason: "The required registry investigation and applicable publication search have completed.",
    };
  }
}
