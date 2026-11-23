const $ = (id) => document.getElementById(id);
const esc = (value) => String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" })[char]);

const EXAMPLE = "Planning a phase 2 trial of a PD-1 inhibitor for previously treated advanced NSCLC, enrolling around 120 patients. Mostly we care about whether tumors shrink.";
const FIELDS = [
  { key: "condition", label: "Condition", question: "Which condition is this study in?", options: ["Non-small cell lung cancer", "Breast cancer", "Type 2 diabetes"] },
  { key: "phase", label: "Phase", question: "Which trial phase is it?", options: ["Phase 1", "Phase 2", "Phase 3"] },
  { key: "intervention", label: "Intervention", question: "What intervention or mechanism is being tested?", options: [] },
  { key: "primaryEndpoint", label: "Primary endpoint", question: "What is the proposed primary endpoint?", options: ["Objective response rate", "Progression-free survival", "Overall survival"] },
  { key: "comparator", label: "Comparator", question: "What comparator or control design is planned?", options: ["Single-arm", "Placebo", "Standard of care"] },
  { key: "enrollmentTarget", label: "Enrollment", question: "How many participants do you plan to enroll?", options: ["60", "120", "300"] },
  { key: "durationWeeks", label: "Duration", question: "How long does the study run, in weeks?", options: ["24", "52", "104"] },
];

let currentText = "";
let fields = {};
let runSequence = 0;

function setStage(active) {
  const names = ["Reading", "Clarifying", "Researching", "Reviewing"];
  $("stage").innerHTML = names.map((name, index) => `<span class="${index < active ? "done" : index === active ? "on" : ""}">${name}</span>`).join("");
}

function addMessage(avatar, className, html) {
  const message = document.createElement("div");
  message.className = "msg";
  message.innerHTML = `<div class="av ${className}">${avatar}</div><div class="body">${html}</div>`;
  $("log").appendChild(message);
  message.scrollIntoView({ block: "end", behavior: "smooth" });
  return message.querySelector(".body");
}

function highlightedText(text) {
  const spans = Object.values(fields)
    .map((field) => field?.sourceQuote)
    .filter(Boolean)
    .map((quote) => {
      const index = text.toLowerCase().indexOf(quote.toLowerCase());
      return { index, length: quote.length };
    })
    .filter((span) => span.index >= 0)
    .sort((a, b) => a.index - b.index);
  let html = "";
  let cursor = 0;
  for (const span of spans) {
    if (span.index < cursor) continue;
    html += esc(text.slice(cursor, span.index));
    html += `<mark>${esc(text.slice(span.index, span.index + span.length))}</mark>`;
    cursor = span.index + span.length;
  }
  return html + esc(text.slice(cursor));
}

function understandingTable() {
  const rows = FIELDS.map((definition) => {
    const field = fields[definition.key];
    const found = field?.value && !field.unsure;
    const status = found ? "s-found" : field?.unsure ? "s-none" : "s-ask";
    const display = found
      ? `${esc(definition.key === "durationWeeks" ? `${field.value} weeks` : field.value)} ${field.sourceQuote ? `<span class="src">from “${esc(field.sourceQuote)}”</span>` : '<span class="src">from your answer</span>'}`
      : field?.unsure ? "Not sure yet" : "Asking you";
    return `<div class="l">${definition.label}</div><div class="v ${status}">${display}</div>`;
  }).join("");
  return `<p class="k">What I understood</p><div class="card"><div class="u">${rows}</div></div>`;
}

function askQuestion(definition) {
  return new Promise((resolve) => {
    const body = addMessage("A", "ag", `<p style="margin:0">${definition.question}</p><div class="chips"></div><form class="ans"><input aria-label="${definition.label}" placeholder="Type an answer"><button class="go">Answer</button></form><div class="row" style="margin-top:6px"><button class="link" type="button">Not sure yet</button></div>`);
    const finish = (value, unsure) => {
      body.querySelector(".ans").remove();
      body.querySelector(".chips").remove();
      body.querySelector(".row").remove();
      body.insertAdjacentHTML("beforeend", `<p class="src" style="margin:8px 0 0">${unsure ? "Carried forward as unknown." : `Got it: ${esc(value)}`}</p>`);
      resolve({ value, unsure });
    };
    for (const option of definition.options) {
      const chip = document.createElement("button");
      chip.textContent = option;
      chip.onclick = () => finish(option, false);
      body.querySelector(".chips").appendChild(chip);
    }
    body.querySelector(".ans").onsubmit = (event) => {
      event.preventDefault();
      const value = body.querySelector("input").value.trim();
      if (value) finish(value, false);
    };
    body.querySelector(".link").onclick = () => finish("", true);
    body.querySelector("input").focus();
  });
}

function conceptFromFields() {
  const value = (key, fallback) => fields[key]?.value || fallback;
  const number = (key) => {
    const parsed = Number(value(key, ""));
    return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
  };
  const concept = {
    condition: value("condition", "unspecified condition"),
    phase: value("phase", "unspecified phase"),
  };
  if (value("intervention", "")) concept.intervention = value("intervention", "");
  if (value("primaryEndpoint", "")) concept.primaryEndpoint = value("primaryEndpoint", "");
  if (value("comparator", "")) concept.comparator = value("comparator", "");
  if (number("enrollmentTarget")) concept.enrollmentTarget = number("enrollmentTarget");
  if (number("durationWeeks")) concept.durationWeeks = number("durationWeeks");
  return concept;
}

function traceMessage(event) {
  const presentation = {
    "run-started": ["A", "t-think", "Starting"],
    "model-decision": ["?", "t-think", "Decision"],
    "tool-started": [">", "t-tool", "Tool call"],
    "tool-completed": ["o", "t-obs", "Observation"],
    "tool-failed": ["!", "t-rep", "Tool failure"],
    "replanned": ["~", "t-rep", "Replanning"],
    "budget-exhausted": ["!", "t-rep", "Budget"],
    "run-completed": ["A", "t-obs", "Finished"],
    "run-failed": ["!", "t-rep", "Stopped"],
  }[event.type] ?? ["A", "ag", event.type];
  const details = event.data ? `<details><summary>Structured details</summary><div class="code">${esc(JSON.stringify(event.data, null, 2))}</div></details>` : "";
  addMessage(presentation[0], presentation[1], `<p class="k">${presentation[2]}</p><p style="margin:0">${esc(event.message)}</p>${event.tool ? `<div class="code">${esc(event.tool)}</div>` : ""}${details}`);
}

async function research(concept) {
  const response = await fetch("/api/review/stream", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ concept }),
  });
  if (!response.ok || !response.body) throw new Error("Could not start the agent run.");
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
      if (event.type === "trace" && event.trace) traceMessage(event.trace);
      if (event.type === "status" && /replanning/i.test(event.message ?? "")) addMessage("~", "t-rep", `<p class="k">Replanning</p><p style="margin:0">${esc(event.message)}</p>`);
      if (event.type === "result") result = event.result;
      if (event.type === "error" && !event.result) throw new Error(event.message || "Agent run failed.");
      if (event.type === "error" && event.result) result = event.result;
    }
    if (chunk.done) break;
  }
  if (!result) throw new Error("The agent stopped without returning a review.");
  return result;
}

function confidenceFor(review, kind) {
  const penalty = Math.min(45, review.evidenceGaps.length * 7);
  if (kind === "endpoint") return Math.max(30, ({ repeated: 88, limited: 67, "not-observed": 45, "not-proposed": 30 }[review.endpointAssessment.precedentStrength] ?? 50) - penalty);
  return Math.max(30, 84 - penalty);
}

function findingCard(label, text, className, confidence) {
  return `<div class="f ${className}"><p class="n">${esc(label)}</p><p>${esc(text)}</p><div class="conf">Confidence ${confidence}%<i><b style="width:${confidence}%"></b></i></div></div>`;
}

function showReview(payload) {
  const review = payload.review;
  const cards = [
    findingCard("Endpoint precedent", review.endpointAssessment.interpretation, review.endpointAssessment.precedentStrength === "repeated" ? "ok" : "wr", confidenceFor(review, "endpoint")),
    findingCard("Operational signal", review.operationalAssessment.observations.join(" ") || "Operational evidence was insufficient.", "ac", confidenceFor(review, "operations")),
    findingCard("Design action", review.designOptions.join(" ") || "No additional design option was generated from the retrieved evidence.", "ac", confidenceFor(review, "design")),
    findingCard("Open evidence", review.evidenceGaps.join(" ") || "No material evidence gap was recorded in this bounded review.", review.evidenceGaps.length ? "wr" : "ok", confidenceFor(review, "gaps")),
  ].join("");
  addMessage("A", "ag", `<p class="k">My review</p><p>${esc(payload.finalOutput)}</p><div class="fin">${cards}</div><form class="ans" id="follow-up" style="margin-top:14px"><input id="follow-up-text" placeholder="Add detail or change something, and I will re-run" aria-label="Follow up"><button class="go">Update review</button></form><div class="row"><button class="link" id="start-over">Start over</button></div>`);
  $("follow-up").onsubmit = (event) => {
    event.preventDefault();
    const addition = $("follow-up-text").value.trim();
    if (addition) start(`${currentText}\n${addition}`);
  };
  $("start-over").onclick = () => {
    runSequence += 1;
    $("thread").hidden = true;
    $("hero").hidden = false;
    $("in").value = "";
  };
}

async function start(text) {
  const sequence = ++runSequence;
  currentText = text;
  fields = {};
  $("hero").hidden = true;
  $("thread").hidden = false;
  $("log").innerHTML = "";
  setStage(0);
  addMessage("You", "me", `<div class="doc">${esc(text)}</div>`);
  const reading = addMessage("A", "ag", '<p style="margin:0" class="pulse">Reading your description with the extraction agent…</p>');
  try {
    const response = await fetch("/api/extract", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ text }) });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error || "Extraction failed.");
    if (sequence !== runSequence) return;
    fields = payload.extraction;
    const found = FIELDS.filter((definition) => fields[definition.key]?.value).length;
    reading.innerHTML = `<p style="margin:0 0 8px">I found ${found} of ${FIELDS.length} design details and will ask only about the missing items.</p><div class="doc">${highlightedText(text)}</div><div id="understanding" style="margin-top:12px"></div>`;
    $("understanding").innerHTML = understandingTable();
    setStage(1);
    for (const definition of FIELDS) {
      if (fields[definition.key]?.value) continue;
      const answer = await askQuestion(definition);
      if (sequence !== runSequence) return;
      fields[definition.key] = answer.unsure ? { value: null, sourceQuote: null, unsure: true } : { value: answer.value, sourceQuote: null };
      $("understanding").innerHTML = understandingTable();
    }
    setStage(2);
    const result = await research(conceptFromFields());
    if (sequence !== runSequence) return;
    setStage(3);
    showReview(result);
    setStage(4);
  } catch (error) {
    reading.innerHTML = `<p style="margin:0;color:var(--amber)">${esc(error.message)}</p>`;
  }
}

$("go").onclick = () => {
  const text = $("in").value.trim();
  if (text) start(text);
  else $("in").focus();
};
$("ex").onclick = () => { $("in").value = EXAMPLE; $("in").focus(); };

const helpDialog = $("help-dialog");
$("help").onclick = () => helpDialog.showModal();
$("help-close").onclick = () => helpDialog.close();
helpDialog.addEventListener("click", (event) => {
  if (event.target === helpDialog) helpDialog.close();
});
document.querySelectorAll("[data-example]").forEach((button) => {
  button.addEventListener("click", () => {
    $("in").value = button.dataset.example;
    helpDialog.close();
    $("in").focus();
  });
});

fetch("/api/health").then((response) => response.json()).then((health) => {
  document.querySelector(".live").innerHTML = `<i></i>${health.agentModeAvailable ? `Agent ready · ${esc(health.model)}` : "Agent unavailable · configure OPENAI_API_KEY"}`;
  $("go").disabled = !health.agentModeAvailable;
}).catch(() => {
  document.querySelector(".live").textContent = "Agent unavailable";
  $("go").disabled = true;
});
