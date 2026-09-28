export type ToolName = "clinical-trials-current" | "clinical-trials-history" | "pubmed";

export type InvestigationStatus = "running" | "complete" | "failed";

export type TrialProfile = {
  nctId: string;
  title: string;
  officialTitle: string | null;
  status: string;
  whyStopped: string | null;
  sponsor: string | null;
  interventions: string[];
  conditions: string[];
  phase: string[];
  hasResults: boolean;
  lastUpdate: string | null;
};

export type SourceRecord = {
  id: string;
  sourceType: "registry" | "registry-history" | "publication";
  title: string;
  url: string;
  date: string | null;
  detail: string;
};

export type ToolResult = {
  tool: ToolName;
  ok: boolean;
  records: SourceRecord[];
  trial?: TrialProfile;
  error?: string;
  metadata?: Record<string, unknown>;
};

export type TraceEventType =
  | "run-started"
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
  type: TraceEventType;
  message: string;
  tool?: ToolName;
  data?: Record<string, unknown>;
};

export type AgentBudget = {
  maxSteps: number;
  maxToolCalls: number;
  timeoutMs: number;
};

export type InvestigationState = {
  runId: string;
  input: { nctId: string };
  status: InvestigationStatus;
  startedAt: string;
  completedAt: string | null;
  step: number;
  toolCalls: number;
  budget: AgentBudget;
  trial: TrialProfile | null;
  attemptedTools: ToolName[];
  completedTools: ToolName[];
  failedTools: Array<{ tool: ToolName; error: string }>;
  sources: SourceRecord[];
  evidenceGaps: string[];
  trace: TraceEvent[];
  stopReason: string | null;
};

export type PlanDecision =
  | { kind: "use-tool"; tool: ToolName; reason: string }
  | { kind: "finish"; reason: string }
  | { kind: "fail"; reason: string };

export type InvestigationReport = {
  runId: string;
  nctId: string;
  status: InvestigationStatus;
  trial: TrialProfile | null;
  finding: {
    classification: "documented-stop" | "active-or-ongoing" | "completed" | "unclear";
    statement: string;
    evidenceStrength: "directly-documented" | "registry-only" | "insufficient";
  };
  sources: SourceRecord[];
  sourceCoverage: Array<{ tool: ToolName; status: "completed" | "failed" | "not-run"; records: number }>;
  evidenceGaps: string[];
  budget: AgentBudget & { stepsUsed: number; toolCallsUsed: number };
  trace: TraceEvent[];
};

export interface AgentTool {
  readonly name: ToolName;
  execute(state: Readonly<InvestigationState>, signal: AbortSignal): Promise<ToolResult>;
}
