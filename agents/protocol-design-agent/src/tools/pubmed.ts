import type { AgentState, AgentTool, LiteratureRecord, PlanDecision, ToolResult } from "../types.ts";
import { array, getJson, getText, record, string } from "./http.ts";

const EUTILS = "https://eutils.ncbi.nlm.nih.gov/entrez/eutils";

function decodeXml(value: string): string {
  return value
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

function abstractsByPmid(xml: string): Map<string, string> {
  const abstracts = new Map<string, string>();
  for (const article of xml.matchAll(/<PubmedArticle>[\s\S]*?<\/PubmedArticle>/g)) {
    const block = article[0];
    const pmid = block.match(/<PMID[^>]*>([^<]+)<\/PMID>/)?.[1];
    const parts = [...block.matchAll(/<AbstractText[^>]*>([\s\S]*?)<\/AbstractText>/g)].map((match) => decodeXml(match[1] ?? "")).filter(Boolean);
    if (pmid && parts.length) abstracts.set(pmid, parts.join(" "));
  }
  return abstracts;
}

export class PubMedEndpointTool implements AgentTool {
  readonly name = "pubmed-endpoint-search" as const;

  async execute(
    state: Readonly<AgentState>,
    _decision: Extract<PlanDecision, { kind: "use-tool" }>,
    signal: AbortSignal,
  ): Promise<ToolResult> {
    const endpoint = state.concept.primaryEndpoint ?? "";
    const query = `${state.concept.condition}[Title/Abstract] AND ${endpoint}[Title/Abstract]`;
    try {
      const searchUrl = `${EUTILS}/esearch.fcgi?db=pubmed&retmode=json&retmax=10&sort=relevance&term=${encodeURIComponent(query)}`;
      const search = record(await getJson(searchUrl, signal));
      const ids = array(record(search.esearchresult).idlist).map(string).filter((id): id is string => Boolean(id));
      if (!ids.length) return { tool: this.name, ok: true, literature: [], query };

      const summaryUrl = `${EUTILS}/esummary.fcgi?db=pubmed&retmode=json&id=${ids.join(",")}`;
      const [summaryPayload, abstractXml] = await Promise.all([
        getJson(summaryUrl, signal),
        getText(`${EUTILS}/efetch.fcgi?db=pubmed&retmode=xml&id=${ids.join(",")}`, signal),
      ]);
      const summary = record(summaryPayload);
      const result = record(summary.result);
      const abstracts = abstractsByPmid(abstractXml);
      const literature: LiteratureRecord[] = ids.map((pmid) => {
        const item = record(result[pmid]);
        return {
          pmid,
          title: string(item.title) ?? `PubMed ${pmid}`,
          journal: string(item.fulljournalname),
          publicationDate: string(item.pubdate),
          abstract: abstracts.get(pmid) ?? null,
          url: `https://pubmed.ncbi.nlm.nih.gov/${pmid}/`,
        };
      });
      return { tool: this.name, ok: true, literature, query };
    } catch (error) {
      return { tool: this.name, ok: false, literature: [], query, error: error instanceof Error ? error.message : String(error) };
    }
  }
}
