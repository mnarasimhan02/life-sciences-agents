import type { InvestigationReport, InvestigationState, ToolName } from "./types.ts";

const TOOLS: ToolName[] = ["clinical-trials-current", "clinical-trials-history", "pubmed"];

export function buildReport(state: Readonly<InvestigationState>): InvestigationReport {
  const trial = state.trial;
  const normalizedStatus = trial?.status.toUpperCase().replaceAll(" ", "_") ?? "UNKNOWN";
  let classification: InvestigationReport["finding"]["classification"] = "unclear";
  let statement = "The public evidence retrieved in this run is insufficient to characterize the trial outcome.";
  let evidenceStrength: InvestigationReport["finding"]["evidenceStrength"] = "insufficient";

  if (trial?.whyStopped) {
    classification = "documented-stop";
    statement = `ClinicalTrials.gov documents the stopping reason as: ${trial.whyStopped}`;
    evidenceStrength = "directly-documented";
  } else if (["RECRUITING", "NOT_YET_RECRUITING", "ENROLLING_BY_INVITATION", "ACTIVE_NOT_RECRUITING"].includes(normalizedStatus)) {
    classification = "active-or-ongoing";
    statement = `The current registry status is ${trial.status}; this status alone is not evidence of failure.`;
    evidenceStrength = "registry-only";
  } else if (normalizedStatus === "COMPLETED") {
    classification = "completed";
    statement = "The registry marks the trial completed; completion alone is not evidence of failure.";
    evidenceStrength = "registry-only";
  }

  const evidenceGaps = [...state.evidenceGaps];
  if (trial && !trial.whyStopped && ["TERMINATED", "WITHDRAWN", "SUSPENDED"].includes(normalizedStatus)) {
    evidenceGaps.push("The current registry record does not document why the trial stopped.");
  }
  if (state.completedTools.includes("pubmed") && !state.sources.some((source) => source.sourceType === "publication")) {
    evidenceGaps.push("No PubMed record linked by NCT ID was found; this does not prove that no results exist.");
  }

  return {
    runId: state.runId,
    nctId: state.input.nctId,
    status: state.status,
    trial,
    finding: { classification, statement, evidenceStrength },
    sources: state.sources,
    sourceCoverage: TOOLS.map((tool) => ({
      tool,
      status: state.completedTools.includes(tool) ? "completed" : state.failedTools.some((failure) => failure.tool === tool) ? "failed" : "not-run",
      records: state.sources.filter((source) => {
        if (tool === "clinical-trials-current") return source.sourceType === "registry";
        if (tool === "clinical-trials-history") return source.sourceType === "registry-history";
        return source.sourceType === "publication";
      }).length,
    })),
    evidenceGaps: [...new Set(evidenceGaps)],
    budget: { ...state.budget, stepsUsed: state.step, toolCallsUsed: state.toolCalls },
    trace: state.trace,
  };
}
