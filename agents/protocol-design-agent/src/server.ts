import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";

import { SdkProtocolDesignAgent } from "./sdk-agent.ts";
import { extractStudyConcept } from "./extraction-agent.ts";
import type { StudyConcept } from "./types.ts";

const port = Number(process.env.PORT ?? 3000);
const publicDirectory = fileURLToPath(new URL("../public/", import.meta.url));
const mimeTypes: Record<string, string> = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
};

function json(response: ServerResponse, status: number, body: unknown): void {
  response.writeHead(status, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" });
  response.end(JSON.stringify(body));
}

async function readJson(request: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of request) {
    const buffer = Buffer.from(chunk);
    size += buffer.length;
    if (size > 100_000) throw new Error("Request body exceeds 100 KB.");
    chunks.push(buffer);
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

async function serveStatic(pathname: string, response: ServerResponse): Promise<void> {
  const requested = pathname === "/" ? "index.html" : pathname.replace(/^\/+/, "");
  const safePath = normalize(requested).replace(/^(\.\.[/\\])+/, "");
  const filePath = join(publicDirectory, safePath);
  try {
    const body = await readFile(filePath);
    response.writeHead(200, { "content-type": mimeTypes[extname(filePath)] ?? "application/octet-stream" });
    response.end(body);
  } catch {
    json(response, 404, { error: "Not found" });
  }
}

const server = createServer(async (request, response) => {
  const url = new URL(request.url ?? "/", `http://${request.headers.host ?? "localhost"}`);
  if (request.method === "GET" && url.pathname === "/api/health") {
    json(response, 200, {
      status: "ok",
      agentModeAvailable: Boolean(process.env.OPENAI_API_KEY),
      model: process.env.OPENAI_MODEL ?? "gpt-5.4",
      tools: ["ClinicalTrials.gov", "PubMed"],
    });
    return;
  }

  if (request.method === "POST" && url.pathname === "/api/review") {
    try {
      const payload = await readJson(request) as { concept?: StudyConcept };
      if (!payload.concept) throw new Error("A study concept is required.");
      const result = await new SdkProtocolDesignAgent().review(payload.concept);
      json(response, result.review.status === "failed" ? 502 : 200, result);
    } catch (error) {
      json(response, 400, { error: error instanceof Error ? error.message : String(error) });
    }
    return;
  }

  if (request.method === "POST" && url.pathname === "/api/extract") {
    try {
      const payload = await readJson(request) as { text?: string };
      if (!payload.text?.trim()) throw new Error("Study description is required.");
      const extraction = await extractStudyConcept(payload.text);
      json(response, 200, { extraction });
    } catch (error) {
      json(response, 400, { error: error instanceof Error ? error.message : String(error) });
    }
    return;
  }

  if (request.method === "POST" && url.pathname === "/api/review/stream") {
    response.writeHead(200, {
      "content-type": "application/x-ndjson; charset=utf-8",
      "cache-control": "no-cache, no-transform",
      connection: "keep-alive",
      "x-content-type-options": "nosniff",
    });
    const send = (event: unknown): void => { response.write(`${JSON.stringify(event)}\n`); };
    try {
      const payload = await readJson(request) as { concept?: StudyConcept };
      if (!payload.concept) throw new Error("A study concept is required.");
      await new SdkProtocolDesignAgent().review(payload.concept, send);
    } catch (error) {
      send({ type: "error", message: error instanceof Error ? error.message : String(error) });
    } finally {
      response.end();
    }
    return;
  }

  if (request.method === "GET") {
    await serveStatic(url.pathname, response);
    return;
  }
  json(response, 405, { error: "Method not allowed" });
});

server.listen(port, "0.0.0.0", () => {
  console.log(`Protocol Design Agent app listening on http://0.0.0.0:${port}`);
});
