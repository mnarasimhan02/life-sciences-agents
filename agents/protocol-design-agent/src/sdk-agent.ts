import { Agent, run, tool } from "@openai/agents";
import { z } from "zod";

import { buildReview } from "./analyzer.ts";
import { applyResult, createState, gap, trace } from "./state.ts";
import { ClinicalTrialsSearchTool } from "./tools/clinical-trials.ts";
import { PubMedEndpointTool } from "./tools/pubmed.ts";
import type { AgentBudget, AgentState, DesignReview, PlanDecision, SearchMode, StudyConcept } from "./types.ts";

export type AgentStreamEvent = {
  type: "status" | "trace" | "result" | "error";
  message?: string;
  trace?: AgentState["trace"][number];
  result?: SdkAgentResult;
};

export type SdkAgentResult = {
  runtime: "openai-agents-sdk";
  model: string;
  finalOutput: string;
  review: DesignReview;
};

function conceptPrompt(concept: StudyConcept): string {
  return `Review this proposed clinical study concept. Investigate it with the available tools, adapt based on the evidence returned, record material evidence gaps, and stop when there is enough evidence for a bounded design review.\n\nStudy concept:\n${JSON.stringify(concept, null, 2)}`;
}

function assertBudget(state: AgentState): void {
  if (state.toolCalls >= state.budget.maxToolCalls) {
    trace(state, "budget-exhausted", "The model requested another tool after the configured tool-call budget was reached.");
    throw new Error("Tool-call budget exhausted.");
  }
}

export class SdkProtocolDesignAgent {
  private readonly model: string;
  private readonly budget: Partial<AgentBudget>;

  constructor(options: { model?: string; budget?: Partial<AgentBudget> } = {}) {
    this.model = options.model ?? process.env.OPENAI_MODEL ?? "gpt-5.4";
    this.budget = options.budget ?? {};
  }

  async review(concept: StudyConcept, onEvent: (event: AgentStreamEvent) => void = () => {}): Promise<SdkAgentResult> {
    if (!process.env.OPENAI_API_KEY) throw new Error("OPENAI_API_KEY is required for agent mode.");
    if (!concept.condition?.trim() || !concept.phase?.trim()) throw new Error("Condition and phase are required.");

    const state = createState({ ...concept, condition: concept.condition.trim(), phase: concept.phase.trim() }, this.budget);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), state.budget.timeoutMs);
    const trials = new ClinicalTrialsSearchTool();
    const pubmed = new PubMedEndpointTool();
    const emitTrace = (): void => {
      const event = state.trace.at(-1);
      if (event) onEvent({ type: "trace", trace: event });
    };
    trace(state, "run-started", `Model-directed protocol review started with ${this.model}.`);
    emitTrace();
    onEvent({ type: "status", message: "The agent is planning its evidence investigation." });

    const searchTrials = tool({
      name: "search_comparable_trials",
      description: "Search ClinicalTrials.gov for phase-matched comparable trials. Start focused; broaden only when focused evidence is sparse or unsuitable.",
      parameters: z.object({
        mode: z.enum(["focused", "broadened"]),
        rationale: z.string().min(5).describe("A short user-visible explanation of why this search is needed."),
      }),
      execute: async ({ mode, rationale }) => {
        assertBudget(state);
        state.step += 1;
        state.toolCalls += 1;
        trace(state, "model-decision", rationale, { data: { action: "search_comparable_trials", mode } });
        emitTrace();
        trace(state, "tool-started", `Searching ${mode} trial comparators.`, { tool: "clinical-trials-search" });
        emitTrace();
        const decision: Extract<PlanDecision, { tool: "clinical-trials-search" }> = {
          kind: "use-tool",
          tool: "clinical-trials-search",
          mode: mode as SearchMode,
          reason: rationale,
        };
        const result = await trials.execute(state, decision, controller.signal);
        applyResult(state, result);
        emitTrace();
        onEvent({ type: "status", message: `The agent observed ${result.trials?.length ?? 0} phase-matched trial records and is replanning.` });
        return JSON.stringify({ ok: result.ok, mode, count: result.trials?.length ?? 0, query: result.query, error: result.error ?? null, trials: result.trials?.slice(0, 20) ?? [] });
      },
    });

    const searchLiterature = tool({
      name: "search_endpoint_literature",
      description: "Search PubMed for literature connecting the proposed condition and primary endpoint. Use only when a primary endpoint is supplied.",
      parameters: z.object({
        rationale: z.string().min(5).describe("A short user-visible explanation of why the literature search is needed."),
      }),
      execute: async ({ rationale }) => {
        assertBudget(state);
        state.step += 1;
        state.toolCalls += 1;
        trace(state, "model-decision", rationale, { data: { action: "search_endpoint_literature" } });
        emitTrace();
        trace(state, "tool-started", "Searching endpoint literature.", { tool: "pubmed-endpoint-search" });
        emitTrace();
        const decision: Extract<PlanDecision, { tool: "pubmed-endpoint-search" }> = {
          kind: "use-tool",
          tool: "pubmed-endpoint-search",
          reason: rationale,
        };
        const result = await pubmed.execute(state, decision, controller.signal);
        applyResult(state, result);
        emitTrace();
        onEvent({ type: "status", message: `The agent observed ${result.literature?.length ?? 0} PubMed records and is replanning.` });
        return JSON.stringify({ ok: result.ok, count: result.literature?.length ?? 0, query: result.query, error: result.error ?? null, records: result.literature ?? [] });
      },
    });

    const recordGap = tool({
      name: "record_evidence_gap",
      description: "Record an important missing input or unavailable evidence that limits the protocol-design assessment.",
      parameters: z.object({
        gap: z.string().min(5),
        rationale: z.string().min(5).describe("A short user-visible explanation of why the gap matters."),
      }),
      execute: async ({ gap: message, rationale }) => {
        state.step += 1;
        gap(state, message);
        trace(state, "model-decision", rationale, { data: { action: "record_evidence_gap", gap: message } });
        emitTrace();
        return JSON.stringify({ recorded: true, gap: message });
      },
    });

    const agent = new Agent({
      name: "Protocol Design Agent",
      model: this.model,
      instructions: `You are an evidence-grounded clinical protocol design research agent. You independently choose and sequence tools. Begin with a focused comparator search. Inspect the returned evidence and broaden only if needed. Search endpoint literature when a primary endpoint is supplied. Record consequential evidence gaps. Never claim that frequency establishes regulatory validity, statistical adequacy, safety, or clinical suitability. Do not provide patient-specific advice. Your final answer must briefly state what you investigated, the strongest observed design signals, important limitations, and why you stopped. Tool rationales are shown to users, so keep them concise and decision-focused; never provide private chain-of-thought.`,
      tools: [searchTrials, searchLiterature, recordGap],
    });

    try {
      const result = await run(agent, conceptPrompt(state.concept), { maxTurns: state.budget.maxSteps });
      state.status = "complete";
      state.stopReason = "The model completed its evidence investigation.";
      trace(state, "run-completed", state.stopReason);
      emitTrace();
      const completed = {
        runtime: "openai-agents-sdk",
        model: this.model,
        finalOutput: typeof result.finalOutput === "string" ? result.finalOutput : JSON.stringify(result.finalOutput),
        review: buildReview(state),
      } satisfies SdkAgentResult;
      onEvent({ type: "result", result: completed });
      return completed;
    } catch (error) {
      state.status = "failed";
      state.stopReason = error instanceof Error ? error.message : String(error);
      trace(state, "run-failed", state.stopReason);
      emitTrace();
      const failed = { runtime: "openai-agents-sdk", model: this.model, finalOutput: state.stopReason, review: buildReview(state) } satisfies SdkAgentResult;
      onEvent({ type: "error", message: state.stopReason, result: failed });
      return failed;
    } finally {
      clearTimeout(timeout);
    }
  }
}
