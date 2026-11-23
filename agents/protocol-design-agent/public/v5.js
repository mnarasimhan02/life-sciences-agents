const $ = (id) => document.getElementById(id);
const esc = (value) => String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" })[char]);
const EXAMPLE = "Planning a randomized phase 2 trial of a PD-1 inhibitor versus docetaxel in adults with previously treated advanced non-small cell lung cancer. The primary endpoint is progression-free survival. We plan to enroll 180 participants and follow them for 52 weeks.";

const FIELDS = [
  { key: "condition", label: "Condition", question: "Which condition is this study in?", options: [] },
  { key: "phase", label: "Phase", question: "Which trial phase is it?", options: ["Phase 1", "Phase 2", "Phase 3"] },
  { key: "intervention", label: "Intervention", question: "What is being tested?", options: [] },
  { key: "primaryEndpoint", label: "Endpoint", question: "What is the proposed primary endpoint?", options: [] },
  { key: "comparator", label: "Comparator", question: "What comparator or control design is planned?", options: [] },
  { key: "enrollmentTarget", label: "Enrollment", question: "How many participants do you plan to enroll?", options: [] },
  { key: "durationWeeks", label: "Duration", question: "How long does the study run, in weeks?", options: [] },
];
const STAGES = ["Read description", "Clarify details", "Search sources", "Verify claims", "Review ready"];
const ICON = { you: "↑", read: "◎", ask: "?", think: "⟳", tool: "▶", obs: "●", rep: "↺", done: "✓" };
const LABEL = { you: "You", read: "Reading", ask: "Clarifying", think: "Thinking", tool: "Tool call", obs: "Observation", rep: "Replanning", done: "Complete" };

let fields = {};
let originalText = "";
let runId = 0;
let timer;
let startedAt = 0;
let lastPayload = null;

function setStage(active) {
  $("stage-list").innerHTML = STAGES.map((label, index) => {
    const className = index < active ? "done" : index === active ? "active" : "";
    return `<div class="stage-item ${className}"><span class="si">${index < active ? "✓" : index === active ? "" : index + 1}</span>${label}</div>`;
  }).join("");
}

function renderFields(askingKey = null) {
  $("field-list").innerHTML = FIELDS.map((definition) => {
    const field = fields[definition.key];
    let value = "Not specified";
    let className = "missing";
    if (askingKey === definition.key) { value = "Asking…"; className = "asking"; }
    else if (field?.value) {
      value = definition.key === "durationWeeks" ? `${field.value} wks` : field.value;
      className = "";
    }
    return `<div class="field-row"><span class="fl">${definition.label}</span><span class="fv ${className}" title="${esc(field?.sourceQuote ?? "")}">${esc(value)}</span></div>`;
  }).join("");
}

function addTimeline(kind, html) {
  $("trace-empty").style.display = "none";
  const item = document.createElement("div");
  item.className = `tl n-${kind} anim`;
  item.innerHTML = `<div class="tl-node">${ICON[kind]}</div><div class="tl-label">${LABEL[kind]}</div><div class="tl-body">${html}</div>`;
  $("log").appendChild(item);
  item.scrollIntoView({ block: "end", behavior: "smooth" });
  return item.querySelector(".tl-body");
}

function startClock() {
  clearInterval(timer);
  startedAt = performance.now();
  timer = setInterval(() => { $("c-el").textContent = `${((performance.now() - startedAt) / 1000).toFixed(1)}s`; }, 100);
}
function stopClock() { clearInterval(timer); }

function ask(definition) {
  renderFields(definition.key);
  return new Promise((resolve) => {
    const body = addTimeline("ask", `<div class="tl-input-block"><div class="tl-q">${esc(definition.question)}</div><div class="chip-row">${definition.options.map((option) => `<button class="chip-btn" type="button">${esc(option)}</button>`).join("")}</div><form class="tl-answer-row"><input placeholder="Or type an answer…" aria-label="${esc(definition.label)}"><button class="btn-primary" type="submit">Answer</button></form><button class="tl-skip" type="button">Not sure yet</button></div>`);
    const finish = (value, unsure) => {
      body.innerHTML = `<span style="color:var(--mute)">${unsure ? "Carried forward as unspecified." : `<b>Got it:</b> ${esc(value)}`}</span>`;
      resolve({ value, unsure });
    };
    body.querySelectorAll(".chip-btn").forEach((button) => { button.onclick = () => finish(button.textContent, false); });
    body.querySelector("form").onsubmit = (event) => { event.preventDefault(); const value = body.querySelector("input").value.trim(); if (value) finish(value, false); };
    body.querySelector(".tl-skip").onclick = () => finish("", true);
    body.querySelector("input").focus({ preventScroll: true });
  });
}

function conceptFromFields() {
  const get = (key, fallback = "") => fields[key]?.value || fallback;
  const concept = { condition: get("condition", "unspecified condition"), phase: get("phase", "unspecified phase") };
  for (const key of ["intervention", "primaryEndpoint", "comparator"]) if (get(key)) concept[key] = get(key);
  for (const key of ["enrollmentTarget", "durationWeeks"]) { const value = Number(get(key)); if (value > 0) concept[key] = value; }
  return concept;
}

function traceEvent(event) {
  const mapping = {
    "run-started": ["think", "Starting"], "model-decision": ["think", "Decision"],
    "tool-started": ["tool", "Tool call"], "tool-completed": ["obs", "Observation"],
    "tool-failed": ["rep", "Tool unavailable"], replanned: ["rep", "Replanning"],
    "budget-exhausted": ["rep", "Budget reached"], "run-completed": ["done", "Complete"], "run-failed": ["rep", "Stopped"],
  };
  const [kind, label] = mapping[event.type] ?? ["think", event.type];
  const details = event.data ? `<details class="raw"><summary>Structured details</summary><div class="tool-box">${esc(JSON.stringify(event.data, null, 2))}</div></details>` : "";
  addTimeline(kind, `<b>${esc(label)}</b><br>${esc(event.message)}${event.tool ? `<div class="tool-box"><span class="tool-name">${esc(event.tool)}</span></div>` : ""}${details}`);
  if (event.type === "tool-completed") {
    const count = event.data?.trialCount || event.data?.literatureCount || 0;
    $("c-src").textContent = String(Number($("c-src").textContent) + 1);
    $("c-scr").textContent = String(Number($("c-scr").textContent) + count);
  }
}

async function runResearch(concept) {
  const response = await fetch("/api/review/stream", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ concept }) });
  if (!response.ok || !response.body) throw new Error("Could not start the research agent.");
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let result = null;
  while (true) {
    const chunk = await reader.read();
    buffer += decoder.decode(chunk.value ?? new Uint8Array(), { stream: !chunk.done });
    const lines = buffer.split("\n"); buffer = lines.pop() ?? "";
    for (const line of lines) {
      if (!line.trim()) continue;
      const event = JSON.parse(line);
      if (event.type === "trace" && event.trace) traceEvent(event.trace);
      if (event.type === "result") result = event.result;
      if (event.type === "error" && event.result) result = event.result;
      else if (event.type === "error") throw new Error(event.message || "Agent run failed.");
    }
    if (chunk.done) break;
  }
  if (!result) throw new Error("The agent stopped without returning a review.");
  return result;
}

function citationButtons(ids = []) {
  return ids.map((id) => `<button class="cite-btn" type="button" data-cite="${esc(id)}">${esc(id)}</button>`).join("");
}
function median(values) { const sorted = values.filter(Number.isFinite).sort((a, b) => a - b); if (!sorted.length) return null; const mid = Math.floor(sorted.length / 2); return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2; }
function standardRows(review) {
  const concept = review.concept;
  return [
    ["ICH E8(R1)", "Partial", "Critical-to-quality factors still require explicit review."],
    ["ICH E9(R1)", "Missing", "Estimand and intercurrent-event strategy are not captured."],
    ["ICH E10", concept.comparator ? "Partial" : "Missing", "A named comparator does not establish suitability or assay sensitivity."],
    ["SPIRIT", "Partial", "This is not a completed SPIRIT checklist."],
  ];
}
const REVIEWER_QUESTIONS = {
  Statistician: ["Define the ICH E9(R1) estimand and intercurrent-event strategy.", "Challenge effect size, alpha, power, dropout and multiplicity assumptions."],
  "Clinical scientist": ["Is the endpoint clinically meaningful for this population?", "Do eligibility choices materially change the population from precedent?"],
  Regulatory: ["Justify the control group and interpretability under ICH E10.", "Identify critical-to-quality factors under ICH E8(R1)."],
  Operations: ["Can sites recruit at the required rate?", "Quantify participant and site burden."],
  "Ethics / DSMB": ["Define safety surveillance and stopping rules.", "Show that burden is proportionate to scientific value."],
};
function renderReviewer(role) {
  document.querySelectorAll("#reviewer-tabs button").forEach((button) => button.classList.toggle("on", button.dataset.role === role));
  $("reviewer-questions").innerHTML = REVIEWER_QUESTIONS[role].map((question) => `<li>${esc(question)}</li>`).join("");
}
function pdfText(value) {
  return String(value ?? "")
    .replace(/[\u2018\u2019]/g, "'").replace(/[\u201c\u201d]/g, '"')
    .replace(/[\u2013\u2014]/g, "-").replace(/\u2026/g, "...")
    .normalize("NFKD").replace(/[^\x20-\x7E]/g, "?");
}
function wrapPdfText(value, width) {
  const words = pdfText(value).split(/\s+/).filter(Boolean);
  const lines = [];
  let line = "";
  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word;
    if (candidate.length <= width) line = candidate;
    else { if (line) lines.push(line); line = word; }
  }
  if (line) lines.push(line);
  return lines.length ? lines : [""];
}
function pdfEscape(value) { return pdfText(value).replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)"); }
function createReviewPdf(review) {
  const referencedIds = new Set([
    ...(review.bottomLine.sourceIds ?? []),
    ...review.designChecks.flatMap((check) => check.sourceIds ?? []),
  ]);
  const sources = review.evidenceLibrary.filter((source) => referencedIds.has(source.id));
  const blocks = [
    { text: "Protocol Design Review", size: 20, bold: true, after: 12 },
    { text: [review.concept.condition, review.concept.phase, review.concept.primaryEndpoint].filter(Boolean).join(" | "), size: 10, after: 14 },
    { text: "SUMMARY", size: 11, bold: true, after: 6 },
    { text: `${review.bottomLine.text} ${(review.bottomLine.sourceIds ?? []).map((id) => `[${id}]`).join(" ")}`, size: 11, after: 14 },
    { text: "DESIGN FINDINGS", size: 11, bold: true, after: 6 },
    ...review.designChecks.flatMap((check) => [
      { text: `${check.choice} - ${check.verdict}`, size: 10, bold: true, after: 3 },
      { text: `${check.text} ${(check.sourceIds ?? []).map((id) => `[${id}]`).join(" ")}`, size: 10, indent: 10, after: 8 },
    ]),
    { text: "EVIDENCE GAPS", size: 11, bold: true, after: 6 },
    ...(review.evidenceGaps.length ? review.evidenceGaps : ["No material gap was recorded in this bounded run."]).map((gap) => ({ text: `- ${gap}`, size: 10, after: 5 })),
    { text: "CITED SOURCES", size: 11, bold: true, after: 6 },
    ...sources.flatMap((source) => [
      { text: `[${source.id}] ${source.title}`, size: 10, bold: true, after: 3 },
      { text: source.passage, size: 9, indent: 10, after: 3 },
      { text: source.url, size: 8, indent: 10, after: 9 },
    ]),
    { text: "Decision support only. This review does not create or approve a protocol and requires qualified clinical, statistical, regulatory and operational review.", size: 8, after: 0 },
  ];
  const pages = [[]];
  let y = 744;
  for (const block of blocks) {
    const size = block.size ?? 10;
    const indent = block.indent ?? 0;
    const maxChars = Math.max(28, Math.floor((504 - indent) / (size * .52)));
    const lines = wrapPdfText(block.text, maxChars);
    const needed = lines.length * (size + 4) + (block.after ?? 0);
    if (y - needed < 52) { pages.push([]); y = 744; }
    for (const line of lines) {
      pages.at(-1).push({ text: line, x: 54 + indent, y, size, bold: block.bold });
      y -= size + 4;
    }
    y -= block.after ?? 0;
  }
  const objects = ["", "", "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>", "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>"];
  const pageIds = [];
  pages.forEach((page) => {
    const stream = page.map((line) => `BT /${line.bold ? "F2" : "F1"} ${line.size} Tf ${line.x} ${line.y} Td (${pdfEscape(line.text)}) Tj ET`).join("\n");
    const contentId = objects.push(`<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`);
    const pageId = objects.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${contentId} 0 R >>`);
    pageIds.push(pageId);
  });
  objects[0] = "<< /Type /Catalog /Pages 2 0 R >>";
  objects[1] = `<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(" ")}] /Count ${pageIds.length} >>`;
  let pdf = "%PDF-1.4\n";
  const offsets = [0];
  objects.forEach((object, index) => { offsets.push(pdf.length); pdf += `${index + 1} 0 obj\n${object}\nendobj\n`; });
  const xref = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets.slice(1).map((offset) => `${String(offset).padStart(10, "0")} 00000 n `).join("\n")}\ntrailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return new Blob([pdf], { type: "application/pdf" });
}
function exportReviewPdf() {
  if (!lastPayload) return;
  const blob = createReviewPdf(lastPayload.review);
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `protocol-design-review-${lastPayload.review.runId}.pdf`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function renderReview(payload) {
  lastPayload = payload;
  const review = payload.review;
  const trials = review.comparableTrials ?? [];
  const enrollments = trials.map((trial) => trial.enrollment).filter(Number.isFinite);
  const enrollmentMedian = median(enrollments);
  $("c-kep").textContent = String(review.evidenceLibrary.length);
  $("run-title").textContent = [review.concept.condition, review.concept.phase, review.concept.primaryEndpoint].filter(Boolean).join(" · ");

  $("rv-bottom").innerHTML = `<div class="bottom-line">${esc(review.bottomLine.text)} ${citationButtons(review.bottomLine.sourceIds)}</div>`;
  $("rv-checks").innerHTML = review.designChecks.map((check) => {
    const label = check.verdict === "supported" ? "Direct precedent" : check.verdict === "caution" ? "Needs review" : "No evidence";
    const className = check.verdict === "supported" ? "v-ok" : check.verdict === "caution" ? "v-caution" : "v-gap";
    return `<tr><td>${esc(check.choice)}</td><td><span class="verdict ${className}">${label}</span></td><td>${esc(check.text)} ${citationButtons(check.sourceIds)}</td></tr>`;
  }).join("");
  $("rv-actions").innerHTML = (review.designOptions.length ? review.designOptions : ["Review the evidence and remaining gaps with the study team."]).map((action, index) => `<div class="action-card"><div class="ac-label">Action ${index + 1}</div><div class="ac-title">Design decision</div><div class="ac-body">${esc(action)}</div></div>`).join("");
  $("rv-std").innerHTML = standardRows(review).map(([standard, status, text]) => `<tr><td>${standard}</td><td><span class="verdict ${status === "Missing" ? "v-gap" : "v-caution"}">${status}</span></td><td style="color:var(--mute);font-size:13px">${esc(text)}</td></tr>`).join("");
  $("reviewer-tabs").innerHTML = Object.keys(REVIEWER_QUESTIONS).map((role) => `<button type="button" data-role="${esc(role)}">${esc(role)}</button>`).join("");
  $("reviewer-tabs").querySelectorAll("button").forEach((button) => { button.onclick = () => renderReviewer(button.dataset.role); });
  renderReviewer(Object.keys(REVIEWER_QUESTIONS)[0]);
  const allocations = [...new Set(trials.map((trial) => trial.allocation).filter(Boolean))];
  const contradictions = [];
  if (allocations.length > 1) contradictions.push(`Retrieved comparators use mixed allocation strategies: ${allocations.join(", ")}.`);
  if (enrollments.length && Math.max(...enrollments) > Math.min(...enrollments) * 4) contradictions.push(`Enrollment varies from ${Math.min(...enrollments)} to ${Math.max(...enrollments)}; the median alone can hide material design differences.`);
  $("rv-contra").textContent = contradictions.join(" ") || "No explicit contradiction was detected in the structured fields; this does not prove the sources agree.";
  $("rv-limits").innerHTML = (review.evidenceGaps.length ? review.evidenceGaps : ["No material gap was recorded in this bounded run."]).map((gap) => `<li>${esc(gap)}</li>`).join("");

  $("bench-stat").textContent = `${trials.length} comparators`;
  $("bench-note").textContent = enrollments.length ? `Enrollment median ${enrollmentMedian}; range ${Math.min(...enrollments)}–${Math.max(...enrollments)}. These are precedents, not a power calculation.` : "Enrollment was not available for benchmarking.";
  const proposed = { nctId: "Proposed", phase: [review.concept.phase], enrollment: review.concept.enrollmentTarget ?? "—", allocation: review.concept.comparator ?? "—", primaryOutcomes: [{ measure: review.concept.primaryEndpoint ?? "—" }], status: "Concept" };
  $("bench-body").innerHTML = [proposed, ...trials].map((trial, index) => `<tr class="${index === 0 ? "proposed" : ""}"><td>${trial.nctId.startsWith("NCT") ? `<a href="${esc(trial.url)}" target="_blank" rel="noopener">${esc(trial.nctId)}</a>` : esc(trial.nctId)}</td><td>${esc((trial.phase ?? []).join(", ") || "—")}</td><td>${esc(trial.enrollment ?? "—")}</td><td>${esc(trial.allocation ?? "—")}</td><td>${esc(trial.primaryOutcomes?.[0]?.measure ?? "—")}</td><td>${esc(trial.status)}</td></tr>`).join("");

  const coverage = review.sourceCoverage.map((source) => `${source.source}: ${source.status}${source.status === "completed" ? ` (${source.records})` : ""}`).join(" · ");
  $("ev-banner").textContent = `Live evidence only. ${coverage}. Planned source families are not counted.`;
  $("ev-list").innerHTML = review.evidenceLibrary.map((source) => `<div class="ev-card" id="ev-${esc(source.id)}" data-source="${esc(source.id)}"><div class="ev-head"><span class="ev-id">[${esc(source.id)}]</span><span class="tag t-${source.type}">${esc(source.type)}</span><span class="ev-title">${esc(source.title)}</span></div><blockquote>${esc(source.passage)}</blockquote><div class="ev-foot"><a href="${esc(source.url)}" target="_blank" rel="noopener">Open source</a><span>${esc(source.identifier)}</span><span>Retrieved evidence passage</span><button class="mark-source" type="button">Mark irrelevant</button></div></div>`).join("") || "<p>No evidence passage was retained.</p>";
  $("ev-list").querySelectorAll(".mark-source").forEach((button) => { button.onclick = () => { const card = button.closest(".ev-card"); card.classList.toggle("excluded"); button.textContent = card.classList.contains("excluded") ? "Restore source" : "Mark irrelevant"; }; });

  const completed = review.trace.filter((event) => event.type === "tool-completed");
  $("sf-rows").innerHTML = completed.map((event) => `<div class="sf-row"><code>${esc(event.tool)}</code><span>${esc(event.data?.query ?? "Query preserved in execution trace")}</span><span>${esc(event.timestamp)}</span><b>${esc(event.data?.trialCount || event.data?.literatureCount || 0)}</b></div>`).join("") || "<p>No completed search was recorded.</p>";
  $("sf-note").textContent = "Counts come from this run. No deduplication or exclusion count is claimed unless the execution trace records it.";

  $("activity-log").innerHTML = $("log").innerHTML;
  $("workspace").classList.add("review-mode");
  selectPane("p-review");
  $("review-panel").classList.remove("empty"); $("rp-empty").hidden = true; $("rp-main").hidden = false; $("rp-main").style.display = "flex";
  document.querySelectorAll("[data-cite]").forEach((button) => { button.onclick = () => highlightEvidence(button.dataset.cite); });
}

function selectPane(id) {
  document.querySelectorAll(".rp-tab").forEach((tab) => tab.classList.toggle("on", tab.dataset.pane === id));
  document.querySelectorAll(".rp-pane").forEach((pane) => pane.classList.toggle("on", pane.id === id));
}
function highlightEvidence(id) {
  selectPane("p-evidence");
  document.querySelectorAll(".ev-card").forEach((card) => card.classList.remove("hl"));
  setTimeout(() => { const card = $(`ev-${id}`); if (card) { card.classList.add("hl"); card.scrollIntoView({ block: "center", behavior: "smooth" }); } }, 40);
}

async function start(text) {
  const currentRun = ++runId;
  originalText = text;
  fields = {};
  $("landing").hidden = true; $("workspace").hidden = false; $("workspace").classList.remove("review-mode"); $("log").innerHTML = '<div class="trace-empty" id="trace-empty"><div class="te-icon" aria-hidden="true">ACT</div><div>Agent trace will appear here</div></div>';
  $("c-src").textContent = "0"; $("c-scr").textContent = "0"; $("c-kep").textContent = "0"; $("c-el").textContent = "0.0s";
  $("rp-main").hidden = true; $("rp-empty").hidden = false; $("review-panel").classList.add("empty");
  setStage(0); renderFields(); startClock();
  addTimeline("you", `<div class="tl-input-block">${esc(text)}</div>`);
  const reading = addTimeline("read", "Extracting the study choices and their supporting phrases…");
  try {
    const response = await fetch("/api/extract", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ text }) });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error || "Extraction failed.");
    if (currentRun !== runId) return;
    fields = payload.extraction;
    const found = FIELDS.filter((definition) => fields[definition.key]?.value).length;
    reading.textContent = `Found ${found} of ${FIELDS.length} study details. Missing items will be asked one at a time.`;
    renderFields(); setStage(1);
    for (const definition of FIELDS) {
      if (fields[definition.key]?.value) continue;
      const answer = await ask(definition);
      if (currentRun !== runId) return;
      fields[definition.key] = answer.unsure ? { value: null, sourceQuote: null, unsure: true } : { value: answer.value, sourceQuote: null };
      renderFields();
    }
    setStage(2); addTimeline("think", "The agent is selecting the next evidence tool from the remaining design questions.");
    const result = await runResearch(conceptFromFields());
    if (currentRun !== runId) return;
    setStage(3); addTimeline("done", "Evidence collection is complete. The structured review is ready in the right panel.");
    renderReview(result); setStage(4); stopClock();
  } catch (error) {
    stopClock(); addTimeline("rep", `<span style="color:var(--red)">${esc(error.message)}</span>`);
  }
}

document.querySelectorAll(".rp-tab").forEach((tab) => { tab.onclick = () => selectPane(tab.dataset.pane); });
$("start-btn").onclick = () => { const text = $("txt").value.trim(); if (text) start(text); else $("txt").focus(); };
$("ex-btn").onclick = () => { $("txt").value = EXAMPLE; $("txt").focus(); };
$("help-btn").onclick = () => $("help-dialog").showModal();
$("help-close").onclick = () => $("help-dialog").close();
$("help-dialog").onclick = (event) => { if (event.target === $("help-dialog")) $("help-dialog").close(); };
$("calc-btn").onclick = () => {
  const p0 = Number($("p0").value), p1 = Number($("p1").value), alpha = Number($("alpha").value), power = Number($("power").value);
  if (!(p0 > 0 && p0 < 1 && p1 > 0 && p1 < 1 && p0 !== p1 && alpha > 0 && alpha < 1 && power > .5 && power < 1)) { $("calc-result").textContent = "Enter valid probabilities."; return; }
  const zAlpha = alpha <= .01 ? 2.576 : alpha <= .05 ? 1.96 : 1.645;
  const zPower = power >= .9 ? 1.282 : power >= .8 ? .842 : .674;
  const sampleSize = Math.ceil(((zAlpha * Math.sqrt(p0 * (1 - p0)) + zPower * Math.sqrt(p1 * (1 - p1))) ** 2) / ((p1 - p0) ** 2));
  $("calc-result").textContent = `Exploratory n = ${sampleSize}. One-sample proportion normal approximation; no attrition adjustment. Validate with a statistician.`;
};
$("export-pdf").onclick = exportReviewPdf;

fetch("/api/health").then((response) => response.json()).then((health) => {
  document.querySelector("#topbar .badge").innerHTML = `<span class="dot"></span>${health.agentModeAvailable ? `Agent ready · ${esc(health.model)}` : "Agent unavailable · configure OPENAI_API_KEY"}`;
  $("start-btn").disabled = !health.agentModeAvailable;
}).catch(() => { document.querySelector("#topbar .badge").textContent = "Agent unavailable"; $("start-btn").disabled = true; });
