import type { AgentState, DesignCheck, DesignReview, EndpointAssessment, EvidenceSource } from "./types.ts";

function normalize(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function endpointMatch(proposed: string, observed: string): boolean {
  const a = normalize(proposed);
  const b = normalize(observed);
  if (a.includes(b) || b.includes(a)) return true;
  const aTokens = new Set(a.split(" ").filter((token) => token.length > 3));
  const bTokens = new Set(b.split(" ").filter((token) => token.length > 3));
  const overlap = [...aTokens].filter((token) => bTokens.has(token)).length;
  return overlap >= Math.min(2, aTokens.size, bTokens.size);
}

function median(values: number[]): number | null {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  const current = sorted[middle];
  if (current == null) return null;
  return sorted.length % 2 ? current : ((sorted[middle - 1] ?? current) + current) / 2;
}

function evidenceLibrary(state: Readonly<AgentState>): EvidenceSource[] {
  const registry: EvidenceSource[] = state.comparables.slice(0, 12).map((trial, index) => ({
    id: `R${index + 1}`,
    type: "Registry",
    title: `${trial.nctId}: ${trial.title}`,
    passage: [
      `Phase: ${trial.phase.join(", ") || "not reported"}.`,
      `Status: ${trial.status}.`,
      `Enrollment: ${trial.enrollment ?? "not reported"}.`,
      `Allocation: ${trial.allocation ?? "not reported"}.`,
      `Primary outcomes: ${trial.primaryOutcomes.map((outcome) => `${outcome.measure}${outcome.timeFrame ? ` (${outcome.timeFrame})` : ""}`).join("; ") || "not reported"}.`,
    ].join(" "),
    url: trial.url,
    identifier: trial.nctId,
    relevance: Math.max(60, 96 - index * 3),
  }));
  const literature: EvidenceSource[] = state.literature.slice(0, 10).map((record, index) => ({
    id: `L${index + 1}`,
    type: "Literature",
    title: record.title,
    passage: record.abstract ?? `Citation metadata: ${record.journal ?? "journal not reported"}, ${record.publicationDate ?? "date not reported"}. Abstract was unavailable from PubMed.`,
    url: record.url,
    identifier: `PMID ${record.pmid}`,
    relevance: Math.max(55, 92 - index * 4),
  }));
  return [...registry, ...literature];
}

function buildDesignChecks(state: Readonly<AgentState>, endpoint: EndpointAssessment, enrollmentMedian: number | null, sources: EvidenceSource[]): DesignCheck[] {
  const registryIds = sources.filter((source) => source.type === "Registry").slice(0, 4).map((source) => source.id);
  const endpointTrialIds = state.comparables
    .map((trial, index) => ({ trial, id: `R${index + 1}` }))
    .filter(({ trial }) => state.concept.primaryEndpoint && trial.primaryOutcomes.some((outcome) => endpointMatch(state.concept.primaryEndpoint ?? "", outcome.measure)))
    .slice(0, 3)
    .map(({ id }) => id);
  const literatureIds = sources.filter((source) => source.type === "Literature").slice(0, 2).map((source) => source.id);
  const enrollmentIds = state.comparables
    .map((trial, index) => ({ trial, id: `R${index + 1}` }))
    .filter(({ trial }) => trial.enrollment != null)
    .slice(0, 3)
    .map(({ id }) => id);
  const durationIds = state.comparables
    .map((trial, index) => ({ trial, id: `R${index + 1}` }))
    .filter(({ trial }) => trial.primaryOutcomes.some((outcome) => outcome.timeFrame))
    .slice(0, 3)
    .map(({ id }) => id);
  return [
    {
      choice: "Phase",
      verdict: registryIds.length ? "supported" : "gap",
      text: registryIds.length ? `${state.comparables.length} phase-matched registry comparators were retrieved.` : "No phase-matched registry comparator was available.",
      sourceIds: registryIds,
    },
    {
      choice: "Endpoint",
      verdict: endpoint.precedentStrength === "repeated" ? "supported" : endpoint.precedentStrength === "not-proposed" ? "gap" : "caution",
      text: endpoint.interpretation,
      sourceIds: [...new Set([...endpointTrialIds, ...literatureIds])],
    },
    {
      choice: "Comparator",
      verdict: state.concept.comparator ? "caution" : "gap",
      text: state.concept.comparator
        ? `The proposed comparator is ${state.concept.comparator}. Retrieved design patterns provide precedent only; they do not establish suitability.`
        : "No comparator was supplied, so its interpretability cannot be assessed.",
      sourceIds: state.concept.comparator ? registryIds : [],
    },
    {
      choice: "Enrollment",
      verdict: state.concept.enrollmentTarget && enrollmentMedian ? (state.concept.enrollmentTarget > enrollmentMedian * 2 ? "caution" : "supported") : "gap",
      text: state.concept.enrollmentTarget && enrollmentMedian
        ? `The proposed enrollment of ${state.concept.enrollmentTarget} compares with a retrieved median of ${enrollmentMedian}. This is a precedent comparison, not a power calculation.`
        : "Enrollment could not be compared because the proposal or comparator median was unavailable.",
      sourceIds: enrollmentIds,
    },
    {
      choice: "Duration",
      verdict: state.concept.durationWeeks && durationIds.length ? "caution" : "gap",
      text: state.concept.durationWeeks
        ? `The proposed duration is ${state.concept.durationWeeks} weeks. Registry outcome timeframes provide context, but a protocol-level schedule review is still required.`
        : "Study duration was not supplied.",
      sourceIds: state.concept.durationWeeks ? durationIds : [],
    },
  ];
}

function endpointAssessment(state: Readonly<AgentState>): EndpointAssessment {
  const counts = new Map<string, { measure: string; trials: Set<string> }>();
  for (const trial of state.comparables) {
    for (const outcome of trial.primaryOutcomes) {
      const key = normalize(outcome.measure);
      const value = counts.get(key) ?? { measure: outcome.measure, trials: new Set<string>() };
      value.trials.add(trial.nctId);
      counts.set(key, value);
    }
  }
  const observedEndpoints = [...counts.values()]
    .map((item) => ({ measure: item.measure, trialCount: item.trials.size }))
    .sort((a, b) => b.trialCount - a.trialCount)
    .slice(0, 10);
  const proposed = state.concept.primaryEndpoint ?? null;
  if (!proposed) {
    return {
      proposedEndpoint: null,
      precedentCount: 0,
      precedentStrength: "not-proposed",
      observedEndpoints,
      interpretation: "No primary endpoint was supplied, so the agent can show precedent but cannot assess the proposal.",
    };
  }
  const precedentCount = state.comparables.filter((trial) => trial.primaryOutcomes.some((outcome) => endpointMatch(proposed, outcome.measure))).length;
  const precedentStrength = precedentCount >= 3 ? "repeated" : precedentCount > 0 ? "limited" : "not-observed";
  return {
    proposedEndpoint: proposed,
    precedentCount,
    precedentStrength,
    observedEndpoints,
    interpretation: precedentCount >= 3
      ? `A similar endpoint appears in ${precedentCount} comparable trials; this establishes public precedent, not suitability or regulatory acceptance.`
      : precedentCount > 0
        ? `A similar endpoint appears in only ${precedentCount} comparable trial(s); applicability requires further review.`
        : "No closely matching primary endpoint was observed in the retrieved comparator set; this is an evidence gap, not proof the endpoint is inappropriate.",
  };
}

export function buildReview(state: Readonly<AgentState>): DesignReview {
  const endpoint = endpointAssessment(state);
  const inclusion = state.concept.inclusionCriteria ?? [];
  const exclusion = state.concept.exclusionCriteria ?? [];
  const criterionCount = inclusion.length + exclusion.length;
  const populationObservations: string[] = [];
  let complexity: DesignReview["populationAssessment"]["complexity"] = "not-assessable";
  if (criterionCount) {
    complexity = criterionCount >= 16 ? "higher" : criterionCount >= 8 ? "moderate" : "lower";
    populationObservations.push(`${criterionCount} proposed eligibility rules were supplied; rule count is an operational-complexity signal, not a patient-availability estimate.`);
  } else {
    populationObservations.push("Structured inclusion and exclusion criteria were not supplied, so eligibility complexity cannot be assessed.");
  }
  if (state.concept.population) populationObservations.push(`Target population supplied: ${state.concept.population}`);

  const enrollments = state.comparables.map((trial) => trial.enrollment).filter((value): value is number => value != null && value > 0);
  const enrollmentMedian = median(enrollments);
  const operations: string[] = [];
  if (enrollmentMedian != null) operations.push(`Median enrollment across ${enrollments.length} retrieved comparators is ${enrollmentMedian}.`);
  if (state.concept.enrollmentTarget && enrollmentMedian && state.concept.enrollmentTarget > enrollmentMedian * 2) {
    operations.push("The proposed enrollment is more than twice the retrieved comparator median; confirm effect-size assumptions, recruitment capacity and timeline.");
  }
  const annualizedVisitRate = state.concept.plannedVisitCount && state.concept.durationWeeks
    ? Math.round((state.concept.plannedVisitCount / state.concept.durationWeeks) * 52 * 10) / 10
    : null;
  if (annualizedVisitRate != null) {
    operations.push(`The plan annualizes to approximately ${annualizedVisitRate} visits per participant-year.`);
    if (annualizedVisitRate > 18) operations.push("Visit frequency is operationally intensive; assess retention, site load and whether remote assessments are possible.");
  } else {
    operations.push("Visit count and duration were not both supplied, so visit burden cannot be benchmarked.");
  }

  const options: string[] = [];
  if (endpoint.observedEndpoints[0]) options.push(`Compare the proposed endpoint against the most frequent retrieved alternative: ${endpoint.observedEndpoints[0].measure}.`);
  if (!state.concept.comparator && /2|3|II|III/i.test(state.concept.phase)) options.push("Define and justify the comparator for the proposed later-stage interventional design.");
  if (endpoint.precedentStrength === "not-observed") options.push("Run a targeted endpoint-validation review before locking the primary endpoint.");
  if (!criterionCount) options.push("Add structured eligibility criteria so recruitment and operational complexity can be challenged.");

  const gaps = [...state.evidenceGaps];
  if (!state.comparables.length) gaps.push("No comparable public trials were retrieved after the available search paths.");
  if (!state.concept.primaryEndpoint) gaps.push("No proposed primary endpoint was supplied.");
  if (state.completedTools.includes("pubmed-endpoint-search") && !state.literature.length) gaps.push("No PubMed records were retrieved for the condition-endpoint query; absence of a result is not evidence of no literature.");
  if (!criterionCount) gaps.push("Eligibility criteria were not available for burden assessment.");

  const summary = state.comparables.length
    ? `Reviewed ${state.comparables.length} unique public comparator trial(s); the proposed design has ${options.length} decision point(s) requiring confirmation.`
    : "Public comparator evidence was insufficient for a substantive design review.";
  const sources = evidenceLibrary(state);
  const designChecks = buildDesignChecks(state, endpoint, enrollmentMedian, sources);
  const bottomLineSourceIds = [...new Set(designChecks.flatMap((check) => check.sourceIds))].slice(0, 5);

  return {
    runId: state.runId,
    status: state.status === "failed" ? "failed" : "complete",
    concept: state.concept,
    summary,
    endpointAssessment: endpoint,
    populationAssessment: { criterionCount, complexity, observations: populationObservations },
    operationalAssessment: {
      comparableEnrollmentMedian: enrollmentMedian,
      proposedEnrollment: state.concept.enrollmentTarget ?? null,
      annualizedVisitRate,
      observations: operations,
    },
    designOptions: options,
    evidenceGaps: [...new Set(gaps)],
    comparableTrials: state.comparables,
    literature: state.literature,
    bottomLine: {
      text: `${summary} ${endpoint.interpretation}`,
      sourceIds: bottomLineSourceIds,
    },
    designChecks,
    evidenceLibrary: sources,
    sourceCoverage: (["clinical-trials-search", "pubmed-endpoint-search"] as const).map((source) => ({
      source,
      status: state.completedTools.includes(source) ? "completed" : state.failures.some((item) => item.tool === source) ? "failed" : "not-run",
      records: source === "clinical-trials-search" ? state.comparables.length : state.literature.length,
    })),
    budget: { ...state.budget, stepsUsed: state.step, toolCallsUsed: state.toolCalls },
    trace: state.trace,
  };
}
