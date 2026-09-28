import { TrialEvidenceAgent } from "./agent.ts";

const nctId = process.argv[2];
if (!nctId) {
  console.error("Usage: npm run investigate -- NCT02569398");
  process.exitCode = 1;
} else {
  const agent = new TrialEvidenceAgent();
  const report = await agent.investigate(nctId);
  console.log(JSON.stringify(report, null, 2));
  if (report.status === "failed") process.exitCode = 1;
}
