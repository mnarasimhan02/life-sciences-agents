import type { AgentState, AgentTool, ComparableTrial, PlanDecision, SearchMode, ToolResult } from "../types.ts";
import { array, getJson, number, record, string } from "./http.ts";

const API = "https://clinicaltrials.gov/api/v2/studies";

function object(parent: Record<string, unknown>, key: string): Record<string, unknown> {
  return record(parent[key]);
}

function strings(value: unknown): string[] {
  return array(value).map(string).filter((item): item is string => Boolean(item));
}

function normalizeStudy(value: unknown): ComparableTrial | null {
  const study = record(value);
  const protocol = object(study, "protocolSection");
  const identification = object(protocol, "identificationModule");
  const nctId = string(identification.nctId);
  if (!nctId) return null;
  const status = object(protocol, "statusModule");
  const design = object(protocol, "designModule");
  const enrollmentInfo = object(design, "enrollmentInfo");
  const maskingInfo = object(design, "maskingInfo");
  const conditions = object(protocol, "conditionsModule");
  const arms = object(protocol, "armsInterventionsModule");
  const outcomes = object(protocol, "outcomesModule");
  const eligibility = object(protocol, "eligibilityModule");

  return {
    nctId,
    title: string(identification.briefTitle) ?? string(identification.officialTitle) ?? "Untitled study",
    status: string(status.overallStatus) ?? "UNKNOWN",
    phase: strings(design.phases),
    conditions: strings(conditions.conditions),
    interventions: array(arms.interventions)
      .map((item) => string(record(item).name))
      .filter((item): item is string => Boolean(item)),
    primaryOutcomes: array(outcomes.primaryOutcomes).map((item) => {
      const outcome = record(item);
      return { measure: string(outcome.measure) ?? "Unspecified outcome", timeFrame: string(outcome.timeFrame) };
    }),
    enrollment: number(enrollmentInfo.count),
    allocation: string(design.designAllocation),
    masking: string(maskingInfo.masking),
    eligibilityCriteria: string(eligibility.eligibilityCriteria),
    url: `https://clinicaltrials.gov/study/${nctId}`,
  };
}

function buildQuery(state: Readonly<AgentState>, mode: SearchMode): string {
  const terms = [state.concept.condition, state.concept.phase];
  if (mode === "focused") {
    if (state.concept.intervention) terms.push(state.concept.intervention);
    else if (state.concept.mechanism) terms.push(state.concept.mechanism);
  }
  return terms.filter(Boolean).join(" AND ");
}

function phaseNumbers(value: string): string[] {
  return [...value.toUpperCase().matchAll(/(?:PHASE\s*)?([1-4])/g)].map((match) => match[1]).filter((item): item is string => Boolean(item));
}

export function phaseMatches(requestedPhase: string, trialPhases: string[]): boolean {
  const requested = new Set(phaseNumbers(requestedPhase));
  if (!requested.size) return true;
  const observed = new Set(trialPhases.flatMap(phaseNumbers));
  return [...requested].some((phase) => observed.has(phase));
}

export class ClinicalTrialsSearchTool implements AgentTool {
  readonly name = "clinical-trials-search" as const;

  async execute(
    state: Readonly<AgentState>,
    decision: Extract<PlanDecision, { kind: "use-tool" }>,
    signal: AbortSignal,
  ): Promise<ToolResult> {
    const mode = decision.tool === this.name ? decision.mode : "focused";
    const query = buildQuery(state, mode);
    try {
      const url = `${API}?format=json&pageSize=50&query.term=${encodeURIComponent(query)}`;
      const payload = record(await getJson(url, signal));
      const trials = array(payload.studies)
        .map(normalizeStudy)
        .filter((item): item is ComparableTrial => Boolean(item))
        .filter((trial) => phaseMatches(state.concept.phase, trial.phase));
      return { tool: this.name, ok: true, mode, trials, query };
    } catch (error) {
      return { tool: this.name, ok: false, mode, trials: [], query, error: error instanceof Error ? error.message : String(error) };
    }
  }
}
