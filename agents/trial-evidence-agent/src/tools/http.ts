const USER_AGENT = "LifeSciencesAgents-TrialEvidence/0.1 (public research tool)";

export async function getJson(url: string, signal: AbortSignal): Promise<unknown> {
  const response = await fetch(url, {
    headers: {
      accept: "application/json",
      "user-agent": USER_AGENT,
    },
    signal,
  });
  if (!response.ok) throw new Error(`HTTP ${response.status} from ${new URL(url).hostname}`);
  return response.json();
}

export function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

export function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

export function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}
