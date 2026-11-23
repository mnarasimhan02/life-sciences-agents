import { readFile } from "node:fs/promises";

import { ProtocolDesignAgent } from "./agent.ts";
import type { StudyConcept } from "./types.ts";

const path = process.argv[2];
if (!path) {
  console.error("Usage: npm run review -- examples/phase2-oncology.json");
  process.exitCode = 1;
} else {
  const concept = JSON.parse(await readFile(path, "utf8")) as StudyConcept;
  const report = await new ProtocolDesignAgent().review(concept);
  console.log(JSON.stringify(report, null, 2));
  if (report.status === "failed") process.exitCode = 1;
}
