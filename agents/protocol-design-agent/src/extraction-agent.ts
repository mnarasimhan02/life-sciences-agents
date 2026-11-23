import { Agent, run } from "@openai/agents";
import { z } from "zod";

const extractedField = z.object({
  value: z.string().nullable(),
  sourceQuote: z.string().nullable(),
});

const extractionSchema = z.object({
  condition: extractedField,
  phase: extractedField,
  intervention: extractedField,
  primaryEndpoint: extractedField,
  comparator: extractedField,
  enrollmentTarget: extractedField,
  durationWeeks: extractedField,
});

export type ExtractedConcept = z.infer<typeof extractionSchema>;

export async function extractStudyConcept(text: string): Promise<ExtractedConcept> {
  if (!process.env.OPENAI_API_KEY) throw new Error("OPENAI_API_KEY is required for extraction.");
  if (!text.trim()) throw new Error("Study description is required.");

  const agent = new Agent({
    name: "Study Concept Extraction Agent",
    model: process.env.OPENAI_MODEL ?? "gpt-5.4",
    outputType: extractionSchema,
    instructions: `Extract a proposed clinical study concept from the user's text. Return only information explicitly stated or unambiguously paraphrased. For each populated value, sourceQuote must be the shortest exact phrase copied from the input that supports it. Use null for both value and sourceQuote when a field is missing. Normalize phase to "Phase 1", "Phase 2", "Phase 3", or "Phase 4". Normalize enrollmentTarget to digits as a string. Normalize durationWeeks to a number of weeks expressed as a string; convert months using 4.3 weeks and years using 52 weeks. Do not infer a comparator or endpoint from general study language.`,
  });

  const result = await run(agent, text, { maxTurns: 3 });
  if (!result.finalOutput) throw new Error("The extraction agent returned no structured result.");
  return result.finalOutput;
}
