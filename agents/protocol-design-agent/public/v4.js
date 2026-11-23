const $ = (id) => document.getElementById(id);
const esc = (value) => String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" })[char]);
const EXAMPLE = "Planning a phase 2 trial of a PD-1 inhibitor for previously treated advanced NSCLC, enrolling around 120 patients. Mostly we care about whether tumors shrink.";
const FIELD_DEFINITIONS = [
  { key: "condition", label: "Condition", question: "Which condition is this study in?", options: ["Non-small cell lung cancer", "Type 2 diabetes", "Breast cancer"] },
  { key: "phase", label: "Phase", question: "Which trial phase is it?", options: ["Phase 1", "Phase 2", "Phase 3"] },
  { key: "intervention", label: "Intervention", question: "What is being tested?", options: [] },
  { key: "primaryEndpoint", label: "Primary endpoint", question: "What is the proposed primary endpoint?", options: ["Objective response rate", "Overall survival", "Progression-free survival"] },
  { key: "comparator", label: "Comparator", question: "What comparator or control design is planned?", options: ["Single-arm", "Placebo", "Standard of care"] },
  { key: "enrollmentTarget", label: "Enrollment", question: "How many participants do you plan to enroll?", options: ["60", "120", "300"] },
  { key: "durationWeeks", label: "Duration", question: "How long does the study run, in weeks?", options: ["24", "52", "104"] },
];

let fields = {};
let originalText = "";
let runId = 0;
let elapsedTimer;
let startedAt = 0;

function stage(index) {
  const titles = ["Reading your description", "Waiting on your answer", "Researching connected sources", "Checking every claim", "Review ready"];
  $("rt").textContent = titles[index];
  $("seg").innerHTML = [0, 1, 2, 3].map((step) => `<i class="${step < index ? "d" : step === index ? "on" : ""}"></i>`).join("");
}

function add(kind, html) {
  const item = document.createElement("div");
  item.className = `msg n-${kind}`;
  item.innerHTML = html;
  $("log").appendChild(item);
  item.scrollIntoView({ block: "end", behavior: "smooth" });
  return item;
}

function startClock() {
  clearInterval(elapsedTimer);
  startedAt = performance.now();
  elapsedTimer = setInterval(() => { $("el").textContent = `${((performance.now() - startedAt) / 1000).toFixed(1)}s`; }, 100);
}

function stopClock() { clearInterval(elapsedTimer); }

function renderUnderstanding() {
  $("ru").innerHTML = FIELD_DEFINITIONS.map((definition) => {
    const field = fields[definition.key];
    const className = field?.value ? "f1" : field?.unsure ? "f3" : "f2";
    const value = field?.value
      ? `${esc(definition.key === "durationWeeks" ? `${field.value} weeks` : field.value)}${field.sourceQuote ? `<span class="src"> from “${esc(field.sourceQuote)}”</span>` : ""}`
      : field?.unsure ? "Not specified" : "Needs your input";
    return `<div class="ur"><span class="d ${className}"></span><div><p class="ul">${definition.label}</p><p class="uv">${value}</p></div></div>`;
  }).join("");
}

function ask(definition) {
  return new Promise((resolve) => {
    const message = add("ag", `<p class="k">A question for you</p><p class="q">${definition.question}</p><div class="chips"></div><form class="ans"><input aria-label="${definition.label}" placeholder="Type an answer"><button class="go">Answer</button></form><button class="link" type="button">Not sure yet</button>`);
    const finish = (value, unsure) => {
      message.querySelector(".ans").remove();
      message.querySelector(".chips").remove();
      message.querySelector(".link").remove();
      message.insertAdjacentHTML("beforeend", `<p class="src" style="margin:10px 0 0">${unsure ? "Carried forward as unknown." : `Got it: ${esc(value)}`}</p>`);
      resolve({ value, unsure });
    };
    for (const option of definition.options) {
      const chip = document.createElement("button");
      chip.textContent = option;
      chip.onclick = () => finish(option, false);
      message.querySelector(".chips").appendChild(chip);
    }
    message.querySelector("form").onsubmit = (event) => {
      event.preventDefault();
      const value = message.querySelector("input").value.trim();
      if (value) finish(value, false);
    };
    message.querySelector(".link").onclick = () => finish("", true);
    message.querySelector("input").focus();
  });
}

function conceptFromFields() {
  const get = (key, fallback = "") => fields[key]?.value || fallback;
  const concept = { condition: get("condition", "unspecified condition"), phase: get("phase", "unspecified phase") };
  if (get("intervention")) concept.intervention = get("intervention");
  if (get("primaryEndpoint")) concept.primaryEndpoint = get("primaryEndpoint");
  if (get("comparator")) concept.comparator = get("comparator");
  for (const key of ["enrollmentTarget", "durationWeeks"]) {
    const value = Number(get(key));
    if (value > 0) concept[key] = value;
  }
  return concept;
}

function sourceProgress() {
  const wrapper = document.createElement("div");
  wrapper.className = "sg";
  wrapper.innerHTML = [
    ["ClinicalTrials.gov", "Registry", "clinical-trials-search"],
    ["PubMed", "Literature", "pubmed-endpoint-search"],
  ].map(([label, type, tool]) => `<div class="sr" data-tool="${tool}"><span>${label} <span class="tag t-${type}">${type}</span></span><span class="pb"><i></i></span><em>waiting</em></div>`).join("");
  return wrapper;
}

function updateSource(tool, status, count = null) {
  const row = document.querySelector(`[data-tool="${tool}"]`);
  if (!row) return;
  row.querySelector("i").style.width = status === "complete" || status === "failed" ? "100%" : "55%";
  row.querySelector("i").style.background = status === "failed" ? "var(--coral)" : "var(--blue)";
  row.querySelector("em").textContent = status === "complete" ? `${count ?? 0} records` : status;
}

function traceEvent(event) {
  if (event.type === "tool-started") updateSource(event.tool, "searching");
  if (event.type === "tool-completed") {
    const count = event.data?.trialCount || event.data?.literatureCount || 0;
    updateSource(event.tool, "complete", count);
    $("c1").textContent = String(Number($("c1").textContent) + 1);
    $("c2").textContent = String(Number($("c2").textContent) + count);
  }
  if (event.type === "tool-failed") updateSource(event.tool, "failed");
  const style = {
    "run-started": ["think", "Starting"],
    "model-decision": ["think", "Decision"],
    "tool-started": ["tool", "Tool call"],
    "tool-completed": ["obs", "Observation"],
    "tool-failed": ["rep", "Tool unavailable"],
    "replanned": ["rep", "Replanning"],
    "budget-exhausted": ["rep", "Budget reached"],
    "run-completed": ["fin", "Investigation complete"],
    "run-failed": ["rep", "Investigation stopped"],
  }[event.type] ?? ["ag", event.type];
  const details = event.data ? `<details><summary>Structured details</summary><div class="code">${esc(JSON.stringify(event.data, null, 2))}</div></details>` : "";
  add(style[0], `<p class="k">${style[1]}</p><p class="tx">${esc(event.message)}</p>${event.tool ? `<div class="code">${esc(event.tool)}</div>` : ""}${details}`);
}

async function runResearch(concept) {
  const progressMessage = add("tool", '<p class="k">Searching connected sources</p><p class="tx">Live coverage is shown below. Planned sources are not counted.</p>');
  progressMessage.appendChild(sourceProgress());
  const response = await fetch("/api/review/stream", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ concept }) });
  if (!response.ok || !response.body) throw new Error("Could not start the research agent.");
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let result = null;
  while (true) {
    const chunk = await reader.read();
    buffer += decoder.decode(chunk.value ?? new Uint8Array(), { stream: !chunk.done });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      if (!line.trim()) continue;
      const event = JSON.parse(line);
      if (event.type === "trace" && event.trace) traceEvent(event.trace);
      if (event.type === "status" && /replanning/i.test(event.message ?? "")) add("rep", `<p class="k">Replanning</p><p class="tx">${esc(event.message)}</p>`);
      if (event.type === "result") result = event.result;
      if (event.type === "error" && event.result) result = event.result;
      else if (event.type === "error") throw new Error(event.message || "Agent run failed.");
    }
    if (chunk.done) break;
  }
  if (!result) throw new Error("The agent stopped without returning a review.");
  return result;
}

function citationButtons(sourceIds) {
  return sourceIds.map((id) => `<button class="cite" type="button" data-cite="${esc(id)}" title="View source ${esc(id)}" aria-label="View source ${esc(id)}">${esc(id)}</button>`).join("");
}

function verdictLabel(verdict) { return verdict === "supported" ? "Direct precedent" : verdict === "caution" ? "Inferred / needs review" : "No evidence found"; }

function renderReview(payload) {
  window.__protocolReview = payload;
  const review = payload.review;
  $("c3").textContent = String(review.evidenceLibrary.length);
  const checks = review.designChecks.map((check) => `<tr><td>${esc(check.choice)}</td><td><span class="tag v-${check.verdict === "supported" ? "ok" : check.verdict === "caution" ? "wr" : "gap"}">${verdictLabel(check.verdict)}</span></td><td>${esc(check.text)}${citationButtons(check.sourceIds)}</td></tr>`).join("");
  const actions = review.designOptions.length
    ? review.designOptions.map((option, index) => `<div class="f ac"><p class="n">Action ${index + 1}</p><p class="hd">Design decision</p><p>${esc(option)}</p></div>`).join("")
    : '<div class="f ok"><p class="n">No additional action</p><p class="hd">No design option was generated</p><p>Review the evidence and remaining gaps with the study team.</p></div>';
  const sources = review.evidenceLibrary.map((source) => `<div class="sc" id="source-${esc(source.id)}"><div class="t"><span class="id">[${esc(source.id)}]</span><span class="tag t-${source.type}">${esc(source.type)}</span><span class="tt">${esc(source.title)}</span></div><blockquote>${esc(source.passage)}</blockquote><div class="ft"><a href="${esc(source.url)}" target="_blank" rel="noopener">Open specific source</a><span>${esc(source.identifier)}</span><span>Retrieved evidence passage</span></div></div>`).join("");
  const coverage = review.sourceCoverage.map((source) => `${source.source}: ${source.status}${source.status === "completed" ? ` (${source.records} records)` : ""}`).join(" · ");
  const message = add("fin", `<p class="k">My review</p><p class="bl">${esc(review.bottomLine.text)}${citationButtons(review.bottomLine.sourceIds)}</p><p class="h3">Design choice check</p><table class="chk">${checks}</table><p class="h3">What to do next</p><div class="fin">${actions}</div><p class="h3">Limits of this review</p><ul>${review.evidenceGaps.map((gap) => `<li>${esc(gap)}</li>`).join("") || "<li>No material gap was recorded in this bounded run.</li>"}</ul><p class="h3">Evidence library</p><p class="demo">Live sources only. Coverage: ${esc(coverage)}. Planned source families are not represented as searched.</p>${sources || '<p>No evidence passage was retained.</p>'}<form class="ans" id="follow-up" style="margin-top:20px"><input id="follow-up-text" placeholder="Add detail or change something, and I will re-run" aria-label="Follow up"><button class="go">Update review</button></form><button class="link" id="start-over">Start over</button>`);
  message.querySelectorAll("[data-cite]").forEach((button) => button.addEventListener("click", () => {
    document.querySelectorAll(".sc").forEach((card) => card.classList.remove("hl"));
    const source = $(`source-${button.dataset.cite}`);
    if (!source) return;
    source.classList.add("hl");
    source.scrollIntoView({ block: "center", behavior: "smooth" });
  }));
  $("follow-up").onsubmit = (event) => {
    event.preventDefault();
    const addition = $("follow-up-text").value.trim();
    if (addition) start(`${originalText}\n${addition}`);
  };
  $("start-over").onclick = () => { runId += 1; stopClock(); $("thread").hidden = true; $("hero").hidden = false; $("in").value = ""; };
}

async function start(text) {
  const currentRun = ++runId;
  originalText = text;
  fields = {};
  $("hero").hidden = true;
  $("thread").hidden = false;
  $("log").innerHTML = "";
  $("c1").textContent = "0"; $("c2").textContent = "0"; $("c3").textContent = "0"; $("el").textContent = "0.0s";
  stage(0); startClock();
  add("me", `<p class="k">You</p><div class="doc">${esc(text)}</div>`);
  const reading = add("ag", '<p class="k">Reading</p><p class="tx pulse">Looking for the details that define this study…</p>');
  try {
    const response = await fetch("/api/extract", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ text }) });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error || "Extraction failed.");
    if (currentRun !== runId) return;
    fields = payload.extraction;
    const found = FIELD_DEFINITIONS.filter((definition) => fields[definition.key]?.value).length;
    reading.innerHTML = `<p class="k">Reading</p><p class="tx">I found ${found} of ${FIELD_DEFINITIONS.length} design details. I will ask only about missing information.</p>`;
    renderUnderstanding();
    stage(1);
    for (const definition of FIELD_DEFINITIONS) {
      if (fields[definition.key]?.value) continue;
      const answer = await ask(definition);
      if (currentRun !== runId) return;
      fields[definition.key] = answer.unsure ? { value: null, sourceQuote: null, unsure: true } : { value: answer.value, sourceQuote: null };
      renderUnderstanding();
    }
    stage(2);
    const result = await runResearch(conceptFromFields());
    if (currentRun !== runId) return;
    stage(3);
    renderReview(result);
    stage(4);
    stopClock();
  } catch (error) {
    stopClock();
    reading.innerHTML = `<p class="k">Stopped</p><p class="tx" style="color:var(--coral)">${esc(error.message)}</p>`;
  }
}

$("go").onclick = () => { const text = $("in").value.trim(); if (text) start(text); else $("in").focus(); };
$("ex").onclick = () => { $("in").value = EXAMPLE; $("in").focus(); };

const helpDialog = $("help-dialog");
$("help").onclick = () => helpDialog.showModal();
$("help-close").onclick = () => helpDialog.close();
helpDialog.addEventListener("click", (event) => { if (event.target === helpDialog) helpDialog.close(); });
document.querySelectorAll("[data-example]").forEach((button) => button.addEventListener("click", () => { $("in").value = button.dataset.example; helpDialog.close(); $("in").focus(); }));

fetch("/api/health").then((response) => response.json()).then((health) => {
  document.querySelector(".live").innerHTML = `<i></i>${health.agentModeAvailable ? `Agent ready · ${esc(health.model)}` : "Agent unavailable · configure OPENAI_API_KEY"}`;
  $("go").disabled = !health.agentModeAvailable;
}).catch(() => { document.querySelector(".live").textContent = "Agent unavailable"; $("go").disabled = true; });
