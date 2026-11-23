(function credibilityInstall(){
  const esc2=(v)=>String(v??"").replace(/[&<>"']/g,(c)=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[c]));
  const med=(a)=>{const s=a.filter(Number.isFinite).sort((x,y)=>x-y);if(!s.length)return null;const m=Math.floor(s.length/2);return s.length%2?s[m]:(s[m-1]+s[m])/2};
  const download=(name,body,type)=>{const u=URL.createObjectURL(new Blob([body],{type}));const a=document.createElement("a");a.href=u;a.download=name;a.click();URL.revokeObjectURL(u)};
  function enhance(){
    const payload=window.__protocolReview, host=document.querySelector(".n-fin");
    if(!payload||!host||host.querySelector(".cred"))return;
    const r=payload.review,trials=r.comparableTrials||[],ns=trials.map(x=>x.enrollment).filter(Number.isFinite);
    const stats={min:ns.length?Math.min(...ns):null,med:med(ns),max:ns.length?Math.max(...ns):null};
    const allocations=[...new Set(trials.map(x=>x.allocation).filter(Boolean))];
    const stopped=trials.filter(x=>["TERMINATED","WITHDRAWN","SUSPENDED"].includes(x.status));
    const completed=(r.trace||[]).filter(x=>x.type==="tool-completed");
    const returned=completed.reduce((n,x)=>n+(x.data?.trialCount||x.data?.literatureCount||0),0);
    const roles={
      "Statistician":["Define the ICH E9(R1) estimand and intercurrent-event strategy.","Challenge effect size, alpha, power, dropout and multiplicity assumptions."],
      "Clinical scientist":["Is the endpoint clinically meaningful for this population?","Do eligibility choices materially change the population from precedent?"],
      "Regulatory":["Justify the control group and interpretability under ICH E10.","Identify critical-to-quality factors under ICH E8(R1)."],
      "Operations":["Can sites recruit at the required rate?","Quantify participant and site burden."],
      "Ethics / DSMB":["Define safety surveillance and stopping rules.","Show that burden is proportionate to scientific value."]
    };
    const trialRows=trials.slice(0,30).map(t=>"<tr><td><a target='_blank' rel='noopener' href='"+esc2(t.url)+"'>"+esc2(t.nctId)+"</a></td><td>"+esc2((t.phase||[]).join(", ")||"—")+"</td><td>"+esc2(t.enrollment??"—")+"</td><td>"+esc2(t.allocation||"—")+"</td><td>"+esc2(t.primaryOutcomes?.[0]?.measure||"—")+"</td><td>"+esc2(t.status)+"</td></tr>").join("");
    const auditRows=completed.map(x=>"<tr><td>"+esc2(x.tool)+"</td><td>"+esc2(x.data?.query||"See exported execution trace")+"</td><td>"+esc2(x.timestamp)+"</td><td>"+esc2(x.data?.trialCount||x.data?.literatureCount||0)+"</td></tr>").join("");
    const panel=document.createElement("section");panel.className="cred";
    panel.innerHTML="<p class='h3'>Expert audit</p><div class='limits'><b>Boundaries</b><br>Decision support only; not medical or regulatory advice. Public sources may be incomplete. Generated "+esc2(new Date().toISOString())+".</div>"+
      "<div class='exports'><button id='export-json' class='go'>Export reproducible JSON</button><button id='export-md'>Export Markdown</button></div>"+
      "<p class='h3'>Comparable-trial benchmark</p><p class='src'>Enrollment min "+(stats.min??"—")+" · median "+(stats.med??"—")+" · max "+(stats.max??"—")+". These are precedents, not a power calculation.</p>"+
      "<div class='scroll'><table><thead><tr><th>ID</th><th>Phase</th><th>N</th><th>Allocation</th><th>Primary endpoint</th><th>Status</th></tr></thead><tbody><tr class='proposed'><td>Proposed</td><td>"+esc2(r.concept.phase)+"</td><td>"+esc2(r.concept.enrollmentTarget??"—")+"</td><td>"+esc2(r.concept.comparator||"—")+"</td><td>"+esc2(r.concept.primaryEndpoint||"—")+"</td><td>Concept</td></tr>"+trialRows+"</tbody></table></div>"+
      "<p class='h3'>Reproducible search flow</p><div class='audit-grid'><div><b>"+returned+"</b><br>records returned by completed tool calls</div><div><b>"+r.evidenceLibrary.length+"</b><br>passages retained as evidence</div></div><p class='src'>No deduplication or exclusion count is claimed unless the execution trace records it.</p><div class='scroll'><table><thead><tr><th>Source</th><th>Exact recorded query</th><th>Retrieved</th><th>Records</th></tr></thead><tbody>"+(auditRows||"<tr><td colspan='4'>No completed search recorded.</td></tr>")+"</tbody></table></div>"+
      "<p class='h3'>Contradictions and heterogeneity</p><ul>"+(allocations.length>1?"<li>Mixed allocation strategies: "+esc2(allocations.join(", "))+".</li>":"<li>No allocation contradiction detected in structured fields; this does not prove agreement.</li>")+(stats.min&&stats.max&&stats.max>stats.min*4?"<li>Enrollment varies widely; the median alone may be misleading.</li>":"")+"</ul>"+
      "<p class='h3'>Standards-oriented checks</p><table><tbody><tr><td><b>ICH E8(R1)</b></td><td>Partial</td><td>Critical-to-quality factors still require explicit review.</td></tr><tr><td><b>ICH E9(R1)</b></td><td>Missing</td><td>Estimand and intercurrent-event strategy are not captured.</td></tr><tr><td><b>ICH E10</b></td><td>"+(r.concept.comparator?"Partial":"Missing")+"</td><td>A named comparator does not establish its suitability or assay sensitivity.</td></tr><tr><td><b>SPIRIT</b></td><td>Partial</td><td>This is not a completed SPIRIT checklist.</td></tr></tbody></table>"+
      "<p class='h3'>Reviewer's questions</p><div class='role-tabs'>"+Object.keys(roles).map((x,i)=>"<button data-role='"+esc2(x)+"' class='"+(i?"":"active")+"'>"+esc2(x)+"</button>").join("")+"</div><div id='role-content'></div>"+
      "<p class='h3'>Comparable trials that stopped early</p>"+(stopped.length?"<table><tbody>"+stopped.map(x=>"<tr><td><a target='_blank' href='"+esc2(x.url)+"'>"+esc2(x.nctId)+"</a></td><td>"+esc2(x.status)+"</td><td>Open the registry record for the submitted stop reason.</td></tr>").join("")+"</tbody></table>":"<p>No terminated, withdrawn or suspended comparator was retrieved.</p>")+
      "<p class='h3'>Transparent exploratory sample-size calculator</p><div class='calc'><label>Null rate<input id='p0' type='number' value='.20' step='.01'></label><label>Target rate<input id='p1' type='number' value='.35' step='.01'></label><label>Alpha<input id='alpha' type='number' value='.05' step='.001'></label><label>Power<input id='power' type='number' value='.80' step='.01'></label><button id='calculate'>Calculate</button></div><output id='calc-result'>Editable normal approximation; requires statistician validation.</output>"+
      "<p class='h3'>Expert corrections</p><p class='src'>Each evidence card can be marked irrelevant. Feedback is included in the JSON export; explain the correction in the follow-up box to rerun.</p>";
    host.appendChild(panel);
    const renderRole=(name)=>{panel.querySelector("#role-content").innerHTML="<ul>"+roles[name].map(q=>"<li>"+esc2(q)+"</li>").join("")+"</ul>"};
    renderRole(Object.keys(roles)[0]);
    panel.querySelectorAll("[data-role]").forEach(b=>b.onclick=()=>{panel.querySelectorAll("[data-role]").forEach(x=>x.classList.remove("active"));b.classList.add("active");renderRole(b.dataset.role)});
    document.querySelectorAll(".sc").forEach(card=>{if(card.querySelector(".mark-irrelevant"))return;const b=document.createElement("button");b.className="link mark-irrelevant";b.textContent="Mark irrelevant";b.onclick=()=>{card.classList.toggle("excluded");b.textContent=card.classList.contains("excluded")?"Restore source":"Mark irrelevant"};card.querySelector(".ft")?.appendChild(b)});
    panel.querySelector("#calculate").onclick=()=>{const p0=+panel.querySelector("#p0").value,p1=+panel.querySelector("#p1").value,a=+panel.querySelector("#alpha").value,p=+panel.querySelector("#power").value;if(!(p0>0&&p0<1&&p1>0&&p1<1&&p0!==p1&&a>0&&a<1&&p>.5&&p<1)){panel.querySelector("#calc-result").textContent="Enter valid probabilities.";return}const za=a<=.01?2.576:a<=.05?1.96:1.645,zb=p>=.9?1.282:p>=.8?.842:.674,n=Math.ceil(Math.pow(za*Math.sqrt(p0*(1-p0))+zb*Math.sqrt(p1*(1-p1)),2)/Math.pow(p1-p0,2));panel.querySelector("#calc-result").textContent="Exploratory n = "+n+". One-sample proportion, normal approximation, no attrition adjustment. Validate with a statistician."};
    panel.querySelector("#export-json").onclick=()=>{const excluded=[...document.querySelectorAll(".sc.excluded .id")].map(x=>x.textContent);download("protocol-review-"+r.runId+".json",JSON.stringify({...payload,expertFeedback:{irrelevantSourceIds:excluded},exportedAt:new Date().toISOString()},null,2),"application/json")};
    panel.querySelector("#export-md").onclick=()=>download("protocol-review-"+r.runId+".md","# Protocol design review\n\n"+r.bottomLine.text+"\n\n## Evidence gaps\n"+r.evidenceGaps.map(x=>"- "+x).join("\n"),"text/markdown");
  }
  new MutationObserver(enhance).observe(document.body,{childList:true,subtree:true});setInterval(enhance,500);
})();
