export type SearchMode = "focused" | "broadened";
export type ToolName = "clinical-trials-search" | "pubmed-endpoint-search";

export type StudyConcept = {
  condition: string;
  phase: string;
  intervention?: string;
  mechanism?: string;
  population?: string;
  primaryEndpoint?: string;
  comparator?: string;
  enrollmentTarget?: number;
  durationWeeks?: number;
  plannedVisitCount?: number;
  inclusionCriteria?: string[];
  exclusionCriteria?: string[];
};

export type Outcome = {
  measure: string;
  timeFrame: string | null;
};

export type ComparableTrial = {
  nctId: string;
  title: string;
  status: string;
  phase: string[];
  conditions: string[];
  interventions: string[];
  primaryOutcomes: Outcome[];
  enrollment: number | null;
  allocation: string | null;
  masking: string | null;
  eligibilityCriteria: string | null;
  url: string;
};

export type LiteratureRecord = {
  pmid: string;
  title: string;
  journal: string | null;
  publicationDate: string | null;
  abstract: string | null;
  url: string;
};

export type EvidenceSource = {
  id: string;
  type: "Registry" | "Literature";
  title: string;
  passage: string;
  url: string;
  identifier: string;
};

export type DesignCheck = {
  choice: "Phase" | "Endpoint" | "Comparator" | "Enrollment" | "Duration";
  verdict: "supported" | "caution" | "gap";
  text: string;
  sourceIds: string[];
};

export type ToolResult = {
  tool: ToolName;
  ok: boolean;
  mode?: SearchMode;
  trials?: ComparableTrial[];
  literature?: LiteratureRecord[];
  query: string;
  error?: string;
};

export type TraceType =
  | "run-started"
  | "model-decision"
  | "plan-created"
  | "tool-started"
  | "tool-completed"
  | "tool-failed"
  | "replanned"
  | "budget-exhausted"
  | "run-completed"
  | "run-failed";

export type TraceEvent = {
  sequence: number;
  timestamp: string;
  type: TraceType;
  message: string;
  tool?: ToolName;
  data?: Record<string, unknown>;
};

export type AgentBudget = {
  maxSteps: number;
  maxToolCalls: number;
  timeoutMs: number;
};

export type AgentState = {
  runId: string;
  concept: StudyConcept;
  status: "running" | "complete" | "failed";
  step: number;
  toolCalls: number;
  budget: AgentBudget;
  attemptedSearchModes: SearchMode[];
  attemptedTools: ToolName[];
  completedTools: ToolName[];
  failures: Array<{ tool: ToolName; error: string }>;
  comparables: ComparableTrial[];
  literature: LiteratureRecord[];
  evidenceGaps: string[];
  trace: TraceEvent[];
  stopReason: string | null;
};

export type PlanDecision =
  | { kind: "use-tool"; tool: "clinical-trials-search"; mode: SearchMode; reason: string }
  | { kind: "use-tool"; tool: "pubmed-endpoint-search"; reason: string }
  | { kind: "finish"; reason: string }
  | { kind: "fail"; reason: string };

export type EndpointAssessment = {
  proposedEndpoint: string | null;
  precedentCount: number;
  precedentStrength: "repeated" | "limited" | "not-observed" | "not-proposed";
  observedEndpoints: Array<{ measure: string; trialCount: number }>;
  interpretation: string;
};

export type DesignReview = {
  runId: string;
  status: "complete" | "failed";
  concept: StudyConcept;
  summary: string;
  endpointAssessment: EndpointAssessment;
  populationAssessment: {
    criterionCount: number;
    complexity: "not-assessable" | "lower" | "moderate" | "higher";
    observations: string[];
  };
  operationalAssessment: {
    comparableEnrollmentMedian: number | null;
    proposedEnrollment: number | null;
    annualizedVisitRate: number | null;
    observations: string[];
  };
  designOptions: string[];
  evidenceGaps: string[];
  comparableTrials: ComparableTrial[];
  literature: LiteratureRecord[];
  bottomLine: { text: string; sourceIds: string[] };
  designChecks: DesignCheck[];
  evidenceLibrary: EvidenceSource[];
  sourceCoverage: Array<{ source: ToolName; status: "completed" | "failed" | "not-run"; records: number }>;
  budget: AgentBudget & { stepsUsed: number; toolCallsUsed: number };
  trace: TraceEvent[];
};

export interface AgentTool {
  readonly name: ToolName;
  execute(state: Readonly<AgentState>, decision: Extract<PlanDecision, { kind: "use-tool" }>, signal: AbortSignal): Promise<ToolResult>;
}
