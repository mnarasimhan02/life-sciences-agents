import type { AgentTool, InvestigationState, SourceRecord, ToolResult } from "../types.ts";
import { asArray, asRecord, asString, getJson } from "./http.ts";

const EUTILS = "https://eutils.ncbi.nlm.nih.gov/entrez/eutils";

export class PubMedTool implements AgentTool {
  readonly name = "pubmed" as const;

  async execute(state: Readonly<InvestigationState>, signal: AbortSignal): Promise<ToolResult> {
    const nctId = state.input.nctId;
    try {
      const query = encodeURIComponent(`\"${nctId}\"[All Fields]`);
      const search = asRecord(await getJson(`${EUTILS}/esearch.fcgi?db=pubmed&retmode=json&retmax=10&term=${query}`, signal));
      const searchResult = asRecord(search.esearchresult);
      const ids = asArray(searchResult.idlist).map(asString).filter((id): id is string => Boolean(id));
      if (!ids.length) return { tool: this.name, ok: true, records: [], metadata: { query: nctId } };

      const summary = asRecord(await getJson(`${EUTILS}/esummary.fcgi?db=pubmed&retmode=json&id=${ids.join(",")}`, signal));
      const result = asRecord(summary.result);
      const records: SourceRecord[] = ids.map((id) => {
        const item = asRecord(result[id]);
        return {
          id: `pubmed-${id}`,
          sourceType: "publication",
          title: asString(item.title) ?? `PubMed ${id}`,
          url: `https://pubmed.ncbi.nlm.nih.gov/${id}/`,
          date: asString(item.pubdate),
          detail: asString(item.fulljournalname) ?? "Trial-linked PubMed record",
        };
      });
      return { tool: this.name, ok: true, records, metadata: { query: nctId } };
    } catch (error) {
      return { tool: this.name, ok: false, records: [], error: error instanceof Error ? error.message : String(error) };
    }
  }
}
