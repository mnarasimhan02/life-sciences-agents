import assert from "node:assert/strict";
import test from "node:test";

import { extractStudyConcept } from "../src/extraction-agent.ts";
import { SdkProtocolDesignAgent } from "../src/sdk-agent.ts";

const enabled = process.env.RUN_MODEL_E2E === "1" && Boolean(process.env.OPENAI_API_KEY);

test("model extraction through live evidence review returns cited user-facing data", { skip: !enabled, timeout: 120_000 }, async () => {
  const text = "Planning a randomized phase 2 trial of a PD-1 inhibitor versus docetaxel in adults with previously treated advanced non-small cell lung cancer. The primary endpoint is progression-free survival. We plan to enroll 180 participants and follow them for 52 weeks.";
  const extraction = await extractStudyConcept(text);
  assert.equal(extraction.phase.value, "Phase 2");
  assert.match(String(extraction.condition.value), /lung cancer/i);
  assert.match(String(extraction.primaryEndpoint.value), /progression-free survival/i);

  const concept = {
    condition: String(extraction.condition.value),
    phase: String(extraction.phase.value),
    intervention: String(extraction.intervention.value),
    primaryEndpoint: String(extraction.primaryEndpoint.value),
    comparator: String(extraction.comparator.value),
    enrollmentTarget: Number(extraction.enrollmentTarget.value),
    durationWeeks: Number(extraction.durationWeeks.value),
  };
  const result = await new SdkProtocolDesignAgent().review(concept);
  assert.equal(result.review.status, "complete");
  assert.ok(result.review.comparableTrials.length > 0);
  assert.ok(result.review.evidenceLibrary.length > 0);
  assert.ok(result.review.evidenceLibrary.every((source) => /^https:\/\//.test(source.url)));
  assert.ok(result.review.designChecks.some((check) => check.sourceIds.length > 0));
  assert.ok(result.review.trace.some((event) => event.type === "tool-completed" && typeof event.data?.query === "string"));
});
