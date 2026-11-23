export async function getJson(url: string, signal: AbortSignal): Promise<unknown> {
  const response = await fetch(url, {
    headers: {
      accept: "application/json",
      "user-agent": "LifeSciencesAgents-ProtocolDesign/0.1 (public research tool)",
    },
    signal,
  });
  if (!response.ok) throw new Error(`HTTP ${response.status} from ${new URL(url).hostname}`);
  return response.json();
}

export async function getText(url: string, signal: AbortSignal): Promise<string> {
  const response = await fetch(url, {
    headers: {
      accept: "application/xml, text/xml, text/plain",
      "user-agent": "LifeSciencesAgents-ProtocolDesign/0.1 (public research tool)",
    },
    signal,
  });
  if (!response.ok) throw new Error(`HTTP ${response.status} from ${new URL(url).hostname}`);
  return response.text();
}

export function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

export function array(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

export function string(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

export function number(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}
