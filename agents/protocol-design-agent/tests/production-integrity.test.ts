import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { createState } from "../src/state.ts";
import { ClinicalTrialsSearchTool } from "../src/tools/clinical-trials.ts";
import { PubMedEndpointTool } from "../src/tools/pubmed.ts";

test("production page loads only the live v5 client", async () => {
  const html = await readFile(new URL("../public/index.html", import.meta.url), "utf8");
  const scripts = [...html.matchAll(/<script[^>]+src="([^"]+)"/g)].map((match) => match[1]);
  assert.deepEqual(scripts, ["/v5.js"]);
});

test("landing page makes only supported product and source claims", async () => {
  const html = await readFile(new URL("../public/index.html", import.meta.url), "utf8");
  const unsupported = [
    /\b78%\b/,
    /\b74\s*sec(?:onds?)?\b/i,
    /\b94%\b/,
    /\b6\s+(?:connected\s+)?databases?\b/i,
    /\bunder\s+2\s+minutes\b/i,
    /⚡|📋|🔬|📊|🛡|🧪/u,
  ];
  for (const pattern of unsupported) assert.doesNotMatch(html, pattern);
  assert.match(html, /Protocol Design Review Agent/);
  assert.match(html, /ClinicalTrials\.gov · live/);
  assert.match(html, /PubMed · live/);
  assert.match(html, /EU CTIS · planned/);
  assert.match(html, /It does not create or approve a protocol/);
  assert.match(html, /Run design review/);
  assert.match(html, /Decision support:.*qualified clinical, statistical, regulatory and operational review/s);
});

test("production client contains no embedded trial records, publications, counts, timestamps or relevance scores", async () => {
  const client = await readFile(new URL("../public/v5.js", import.meta.url), "utf8");
  const forbidden = [
    /NCT\d{8}/,
    /PMID\s*\d+/i,
    /(?:414|163|39)\s*(?:records?|sources?)/i,
    /Relevance\s+\d+%/i,
    /202\d-\d{2}-\d{2}T\d{2}:/,
    /const\s+(?:SOURCES|BENCH)\s*=/,
  ];
  for (const pattern of forbidden) assert.doesNotMatch(client, pattern);
});

test("evidence sources do not expose a synthetic relevance score", async () => {
  const analyzer = await readFile(new URL("../src/analyzer.ts", import.meta.url), "utf8");
  const types = await readFile(new URL("../src/types.ts", import.meta.url), "utf8");
  assert.doesNotMatch(analyzer, /relevance\s*:/i);
  assert.doesNotMatch(types, /relevance\s*:/i);
});

test("live ClinicalTrials.gov and PubMed tools return traceable records", { skip: process.env.RUN_LIVE_TESTS !== "1" }, async () => {
  const state = createState({
    condition: "non-small cell lung cancer",
    phase: "Phase 2",
    intervention: "PD-1 inhibitor",
    primaryEndpoint: "objective response rate",
  });
  const signal = AbortSignal.timeout(30_000);
  const trials = await new ClinicalTrialsSearchTool().execute(state, {
    kind: "use-tool", tool: "clinical-trials-search", mode: "focused", reason: "integration test",
  }, signal);
  assert.equal(trials.ok, true);
  assert.match(trials.query, /non-small cell lung cancer/i);
  assert.ok((trials.trials?.length ?? 0) > 0);
  assert.ok(trials.trials?.every((trial) => /^NCT\d{8}$/.test(trial.nctId) && trial.url.endsWith(trial.nctId)));

  const literature = await new PubMedEndpointTool().execute(state, {
    kind: "use-tool", tool: "pubmed-endpoint-search", reason: "integration test",
  }, signal);
  assert.equal(literature.ok, true);
  assert.match(literature.query, /objective response rate/i);
  assert.ok((literature.literature?.length ?? 0) > 0);
  assert.ok(literature.literature?.every((record) => /^\d+$/.test(record.pmid) && record.url.includes(record.pmid)));
});
