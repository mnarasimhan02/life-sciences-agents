import type { AgentTool, InvestigationState, SourceRecord, ToolResult, TrialProfile } from "../types.ts";
import { asArray, asRecord, asString, getJson } from "./http.ts";

const API = "https://clinicaltrials.gov/api/v2";
const HISTORY_API = "https://clinicaltrials.gov/api/int/studies";

function nested(record: Record<string, unknown>, key: string): Record<string, unknown> {
  return asRecord(record[key]);
}

function stringArray(value: unknown): string[] {
  return asArray(value).map(asString).filter((item): item is string => Boolean(item));
}

function normalizeTrial(payload: unknown, nctId: string): TrialProfile {
  const study = asRecord(payload);
  const protocol = nested(study, "protocolSection");
  const identification = nested(protocol, "identificationModule");
  const status = nested(protocol, "statusModule");
  const sponsorModule = nested(protocol, "sponsorCollaboratorsModule");
  const leadSponsor = nested(sponsorModule, "leadSponsor");
  const design = nested(protocol, "designModule");
  const arms = nested(protocol, "armsInterventionsModule");
  const interventions = asArray(arms.interventions)
    .map((item) => asString(asRecord(item).name))
    .filter((item): item is string => Boolean(item));
  const conditions = nested(protocol, "conditionsModule");
  const lastUpdate = nested(status, "lastUpdatePostDateStruct");

  return {
    nctId,
    title: asString(identification.briefTitle) ?? asString(identification.officialTitle) ?? "Untitled study",
    officialTitle: asString(identification.officialTitle),
    status: asString(status.overallStatus) ?? "UNKNOWN",
    whyStopped: asString(status.whyStopped),
    sponsor: asString(leadSponsor.name),
    interventions,
    conditions: stringArray(conditions.conditions),
    phase: stringArray(design.phases),
    hasResults: study.hasResults === true || Boolean(study.resultsSection),
    lastUpdate: asString(lastUpdate.date),
  };
}

export class ClinicalTrialsCurrentTool implements AgentTool {
  readonly name = "clinical-trials-current" as const;

  async execute(state: Readonly<InvestigationState>, signal: AbortSignal): Promise<ToolResult> {
    const nctId = state.input.nctId;
    try {
      const payload = await getJson(`${API}/studies/${encodeURIComponent(nctId)}`, signal);
      const trial = normalizeTrial(payload, nctId);
      const source: SourceRecord = {
        id: `ctg-current-${nctId}`,
        sourceType: "registry",
        title: "ClinicalTrials.gov current record",
        url: `https://clinicaltrials.gov/study/${nctId}`,
        date: trial.lastUpdate,
        detail: `${trial.status}${trial.whyStopped ? ` — ${trial.whyStopped}` : ""}`,
      };
      return { tool: this.name, ok: true, records: [source], trial };
    } catch (error) {
      return { tool: this.name, ok: false, records: [], error: error instanceof Error ? error.message : String(error) };
    }
  }
}

export class ClinicalTrialsHistoryTool implements AgentTool {
  readonly name = "clinical-trials-history" as const;

  async execute(state: Readonly<InvestigationState>, signal: AbortSignal): Promise<ToolResult> {
    const nctId = state.input.nctId;
    try {
      const payload = asRecord(await getJson(`${HISTORY_API}/${encodeURIComponent(nctId)}/history`, signal));
      const changes = asArray(payload.changes);
      const latest = asRecord(changes.at(-1));
      const source: SourceRecord = {
        id: `ctg-history-${nctId}`,
        sourceType: "registry-history",
        title: "ClinicalTrials.gov record history",
        url: `https://clinicaltrials.gov/study/${nctId}?format=json`,
        date: asString(latest.date),
        detail: `${changes.length} submitted registry version(s) identified for temporal review.`,
      };
      return { tool: this.name, ok: true, records: [source], metadata: { versionCount: changes.length } };
    } catch (error) {
      return { tool: this.name, ok: false, records: [], error: error instanceof Error ? error.message : String(error) };
    }
  }
}
