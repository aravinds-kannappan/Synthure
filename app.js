// Always calls the real /api/* backend (Vercel serverless).
// For local dev, set API_BASE = 'http://localhost:5050'
const API_BASE = '';

let token = null;

// ── Auth ──────────────────────────────────────────────────────────────────────

document.getElementById("login-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const btn = document.getElementById("login-btn");
  const err = document.getElementById("login-error");
  err.classList.add("hidden");
  btn.disabled = true;
  btn.textContent = "Signing in…";

  try {
    const res  = await fetch(`${API_BASE}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email:    document.getElementById("email").value,
        password: document.getElementById("password").value,
      }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error?.message || "Login failed");
    token = data.token;

    document.getElementById("user-name").textContent = data.name || "Dr. Sarah Chen";
    document.getElementById("login-screen").classList.remove("active");
    document.getElementById("app-screen").classList.add("active");

    fetch(`${API_BASE}/api/health`).then(r => r.json()).then(h => {
      const s = document.getElementById("ai-status");
      s.dataset.mode = h.ai_enabled ? "live" : "demo";
      s.querySelector(".status-text").textContent = h.ai_enabled ? "AI live" : "Demo mode";
    }).catch(() => {});
  } catch (ex) {
    err.textContent = ex.message;
    err.classList.remove("hidden");
  } finally {
    btn.disabled = false;
    btn.innerHTML = 'Sign in to platform <svg width="14" height="14" viewBox="0 0 16 16" fill="none"><path d="M3 8H13M13 8L9 4M13 8L9 12" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  }
});

document.getElementById("logout-btn").addEventListener("click", () => {
  token = null;
  document.getElementById("app-screen").classList.remove("active");
  document.getElementById("login-screen").classList.add("active");
  const s = document.getElementById("ai-status");
  s.dataset.mode = "demo";
  s.querySelector(".status-text").textContent = "Demo mode";
});

// ── Tab navigation ────────────────────────────────────────────────────────────

document.querySelectorAll(".tab").forEach(tab => {
  tab.addEventListener("click", () => {
    document.querySelectorAll(".tab").forEach(t => t.classList.remove("active"));
    document.querySelectorAll(".tab-content").forEach(c => c.classList.remove("active"));
    tab.classList.add("active");
    document.getElementById(`tab-${tab.dataset.tab}`).classList.add("active");
  });
});

// ── API helpers ───────────────────────────────────────────────────────────────

function setLoading(el) {
  el.innerHTML = `<div class="loading"><div class="spinner"></div><span>Running pipeline…</span></div>`;
}

async function apiFetch(path, body) {
  const res  = await fetch(`${API_BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error?.message || `Error ${res.status}`);
  return data;
}

function scoreClass(n) { return n >= 75 ? "score-high" : n >= 50 ? "score-med" : "score-low"; }
function complexityClass(n) { return n < 35 ? "complexity-low" : n < 65 ? "complexity-med" : "complexity-high"; }

function scoreRingSVG(score, cls) {
  const r = 18, c = 23, circ = 2 * Math.PI * r;
  const fill = circ * (1 - score / 100);
  const colors = { "score-high": "#34d399", "score-med": "#fbbf24", "score-low": "#56718a" };
  return `<svg width="46" height="46" viewBox="0 0 46 46">
    <circle cx="${c}" cy="${c}" r="${r}" fill="none" stroke="rgba(255,255,255,0.06)" stroke-width="3"/>
    <circle cx="${c}" cy="${c}" r="${r}" fill="none" stroke="${colors[cls]||"#56718a"}" stroke-width="3"
      stroke-dasharray="${circ}" stroke-dashoffset="${fill}" stroke-linecap="round"
      style="transform:rotate(-90deg);transform-origin:center;transition:stroke-dashoffset 0.8s ease"/>
  </svg>`;
}

// ── Pipeline trace renderer ───────────────────────────────────────────────────

const STAGE_META = {
  quality_gate:        { icon: "🛡️", label: "Quality Gate" },
  entity_extraction:   { icon: "🏷️", label: "Entity Extraction" },
  code_validation:     { icon: "🔍", label: "Code Validation" },
  rag_retrieval:       { icon: "📚", label: "RAG Retrieval" },
  generation:          { icon: "✨", label: "Generation" },
  adjudication:        { icon: "⚖️", label: "Adjudication" },
  citation_validation: { icon: "✅", label: "Citation Check" },
};

function renderTrace(trace, sources_cited, entity_confidence, quality_issues) {
  if (!trace?.length) return "";

  const steps = trace.map(step => {
    const meta = STAGE_META[step.stage] || { icon: "⚙️", label: step.stage };
    const hasIssues = step.issues?.length > 0;
    let chips = "";
    if (step.model && step.model !== "demo") chips += `<span class="trace-chip">${step.model}</span>`;
    if (step.entities_found)                 chips += `<span class="trace-chip">${step.entities_found} entities</span>`;
    if (step.docs_retrieved)                 chips += `<span class="trace-chip">${step.docs_retrieved} docs</span>`;
    if (step.confidence)                     chips += `<span class="trace-chip">conf ${(step.confidence*100).toFixed(0)}%</span>`;
    if (step.hallucinations_stripped)        chips += `<span class="trace-chip trace-chip-warn">${step.hallucinations_stripped} halluc. stripped</span>`;
    if (step.duration_ms > 0)               chips += `<span class="trace-chip trace-chip-dim">${step.duration_ms}ms</span>`;
    return `<div class="trace-step">
      <div class="trace-step-icon">${meta.icon}</div>
      <div class="trace-step-body">
        <div class="trace-step-name">
          <span>${meta.label}</span>
          <span style="color:${hasIssues?"var(--yellow)":"var(--green)"};font-size:10px;font-weight:700">${hasIssues?"⚠":"✓"}</span>
        </div>
        <div class="trace-chips">${chips}</div>
        ${hasIssues?`<div class="trace-issues">${step.issues.map(i=>`<span>⚠ ${i}</span>`).join("")}</div>`:""}
      </div>
    </div>`;
  }).join('<div class="trace-arrow">→</div>');

  const citations = sources_cited?.length
    ? `<div class="citations"><span class="citations-label">Sources cited</span>${sources_cited.map(id=>`<span class="citation-chip">${id}</span>`).join("")}</div>`
    : "";
  const warnings = quality_issues?.length
    ? `<div class="quality-warnings">${quality_issues.map(i=>`<div class="quality-warning-row">⚠ ${i}</div>`).join("")}</div>`
    : "";
  const confBadge = entity_confidence > 0
    ? `<span class="conf-badge">Entity confidence ${(entity_confidence*100).toFixed(0)}%</span>`
    : "";

  return `<div class="pipeline-trace">
    <div class="pipeline-trace-header"><span class="pipeline-trace-label">Processing Pipeline</span>${confBadge}</div>
    ${warnings}<div class="trace-steps">${steps}</div>${citations}
  </div>`;
}

// ── Jargon Decoder ────────────────────────────────────────────────────────────

function loadJargonDemo() {
  document.getElementById("jargon-notes").value =
    "Pt is a 58 y/o M with PMHx of essential hypertension (ICD-10: I10), presenting with c/o exertional dyspnea x2 weeks. Echo reveals LVH with EF 55%. Labs show dyslipidemia (E78.5): LDL 148, HDL 38, TG 210. EKG: NSR, no ST changes. Plan: initiate Lisinopril 10mg QD, Atorvastatin 20mg QHS. Dietary counseling re: DASH diet. RTC 4 weeks with fasting lipid panel and BMP.";
}

async function explainJargon() {
  const notes = document.getElementById("jargon-notes").value.trim();
  if (!notes) { alert("Please enter visit notes."); return; }
  const btn = document.getElementById("jargon-btn");
  const result = document.getElementById("jargon-result");
  btn.disabled = true; setLoading(result);
  try { renderJargon(result, await apiFetch("/api/explain-jargon", { notes })); }
  catch (ex) { result.innerHTML = `<div class="result-body"><div class="denial-box">${ex.message}</div></div>`; }
  finally { btn.disabled = false; }
}

function renderJargon(el, data) {
  const d = data.data;
  const urgencyDot = { routine: "🟢", soon: "🟡", urgent: "🔴" };
  el.innerHTML = `<div class="result-body">
    <div><div class="r-section-label">Summary</div><div class="r-box">${d.summary}</div></div>
    <div>
      <div class="r-section-label" style="display:flex;align-items:center;gap:8px">
        Urgency &nbsp;<span class="urgency-chip urgency-${d.urgency}">${urgencyDot[d.urgency]||"⚪"} ${d.urgency}</span>
      </div>
      <div class="r-box" style="font-style:italic;margin-top:8px">${d.followup}</div>
    </div>
    ${d.conditions?.length ? `<div><div class="r-section-label">Medical Terms Explained</div><div class="term-list">
      ${d.conditions.map(c=>`<div class="term-item">
        <div class="term-medical">${c.term}${c.source_doc_id&&c.source_doc_id!=="general_knowledge"?`<span class="source-pill">${c.source_doc_id}</span>`:""}</div>
        <div class="term-plain">${c.plain}</div>
      </div>`).join("")}
    </div></div>` : ""}
    ${d.medications?.length ? `<div><div class="r-section-label">Medications</div>
      ${d.medications.map(m=>`<div class="med-item">
        <div class="med-name">${m.name}</div>
        <div class="med-purpose">${m.purpose}</div>
        <div class="med-instructions">${m.instructions}</div>
      </div>`).join("")}
    </div>` : ""}
    ${renderTrace(data.pipeline_trace, data.sources_cited, data.entity_confidence, data.quality_issues)}
  </div>`;
}

// ── Insurance Matcher ─────────────────────────────────────────────────────────

function loadInsuranceDemo() {
  document.getElementById("ins-age").value      = 34;
  document.getElementById("ins-income").value   = 28000;
  document.getElementById("ins-state").value    = "CA";
  document.getElementById("ins-employed").value = "false";
  document.getElementById("ins-dependents").checked = true;
  document.getElementById("ins-chronic").checked    = false;
}

async function matchInsurance() {
  const age = document.getElementById("ins-age").value;
  const income = document.getElementById("ins-income").value;
  if (!age || !income) { alert("Age and income are required."); return; }
  const btn = document.getElementById("insurance-btn");
  const result = document.getElementById("insurance-result");
  btn.disabled = true; setLoading(result);
  try {
    renderInsurance(result, await apiFetch("/api/match-insurance", {
      age: parseInt(age), annual_income: parseInt(income),
      state:             document.getElementById("ins-state").value,
      employed:          document.getElementById("ins-employed").value === "true",
      has_dependents:    document.getElementById("ins-dependents").checked,
      chronic_condition: document.getElementById("ins-chronic").checked,
    }));
  } catch (ex) { result.innerHTML = `<div class="result-body"><div class="denial-box">${ex.message}</div></div>`; }
  finally { btn.disabled = false; }
}

function renderInsurance(el, data) {
  const { recommendations, ai_insight } = data;
  el.innerHTML = `<div class="result-body">
    <div><div class="r-section-label">Best Matches</div>
      ${recommendations.map((r,i) => {
        const cls = scoreClass(r.match_score);
        return `<div class="match-card ${cls}">
          <div class="score-ring ${cls}">${scoreRingSVG(r.match_score,cls)}<div class="score-ring-text">${r.match_score}%</div></div>
          <div class="match-info">
            <div class="match-plan">${i===0?"★ ":""}${r.plan}</div>
            <div class="match-reason">${r.reason}</div>
          </div>
        </div>`;
      }).join("")}
    </div>
    <div class="ai-insight-box">
      <div class="ai-insight-label">AI Guidance</div>
      <div class="ai-insight-text">${ai_insight.ai_insight}</div>
      ${ai_insight.key_consideration?`<div class="ai-insight-text" style="margin-top:8px"><strong style="color:var(--text)">Key factor:</strong> ${ai_insight.key_consideration}</div>`:""}
    </div>
    ${ai_insight.warning?`<div class="warning-box"><span>⚠️</span><span>${ai_insight.warning}</span></div>`:""}
    ${renderTrace(data.pipeline_trace, data.sources_cited, 0, data.quality_issues)}
  </div>`;
}

// ── Claim Routing ─────────────────────────────────────────────────────────────

function loadClaimDemo(type) {
  const f=(id,v)=>document.getElementById(id).value=v;
  const c=(id,v)=>document.getElementById(id).checked=v;
  if (type==="simple") {
    f("claim-patient-id","PT-10042"); f("claim-npi","1234567890");
    f("claim-procedure","99213");     f("claim-amount","185");
    f("claim-dx","J06.9, Z00.00");
    c("claim-denial",false); c("claim-oon",false); c("claim-experimental",false);
  } else {
    f("claim-patient-id","PT-88271"); f("claim-npi","9876543210");
    f("claim-procedure","27447");     f("claim-amount","42500");
    f("claim-dx","M17.11, M79.3, Z96.641, Z87.39, E11.9");
    c("claim-denial",true); c("claim-oon",true); c("claim-experimental",false);
  }
}

async function submitClaim() {
  const patientId = document.getElementById("claim-patient-id").value.trim();
  const npi       = document.getElementById("claim-npi").value.trim();
  const proc      = document.getElementById("claim-procedure").value.trim();
  const amount    = document.getElementById("claim-amount").value;
  const codes     = document.getElementById("claim-dx").value.split(",").map(s=>s.trim()).filter(Boolean);
  if (!patientId||!npi||!proc||!amount||!codes.length) { alert("Please fill all required fields."); return; }
  const btn = document.getElementById("claim-btn");
  const result = document.getElementById("claim-result");
  btn.disabled = true; setLoading(result);
  try {
    renderClaim(result, await apiFetch("/api/claim/submit", {
      patient_id: patientId, provider_npi: npi, procedure_code: proc,
      amount: parseFloat(amount), diagnosis_codes: codes,
      prior_denial:           document.getElementById("claim-denial").checked,
      out_of_network:         document.getElementById("claim-oon").checked,
      experimental_treatment: document.getElementById("claim-experimental").checked,
    }));
  } catch (ex) { result.innerHTML = `<div class="result-body"><div class="denial-box">${ex.message}</div></div>`; }
  finally { btn.disabled = false; }
}

function renderClaim(el, data) {
  const { claim_id, complexity_score, route, result: r } = data;
  const icons  = { approved:"✅", pending_review:"⏳", denied:"❌" };
  const labels = { approved:"Approved", pending_review:"Pending Review", denied:"Denied" };
  const cClass = complexityClass(complexity_score);
  el.innerHTML = `<div class="result-body">
    <div class="decision-banner decision-${r.decision}">
      <div class="decision-icon">${icons[r.decision]}</div>
      <div>
        <div class="decision-label">${labels[r.decision]}</div>
        <div class="decision-claim-id">${claim_id}</div>
      </div>
      <div class="decision-confidence"><div class="conf-val">${r.confidence}%</div><div class="conf-label">Confidence</div></div>
    </div>
    <div class="meta-row">
      <div class="meta-chip">Route: <strong>${route==="frontier"?"🧠 Frontier AI":"⚡ Standard"}</strong></div>
      <div class="meta-chip">Complexity: <strong>${complexity_score}/100</strong></div>
      ${r.estimated_reimbursement!=null?`<div class="meta-chip">Est. reimbursement: <strong>$${r.estimated_reimbursement.toLocaleString()}</strong></div>`:""}
    </div>
    <div>
      <div class="r-section-label" style="margin-bottom:5px">Complexity Score</div>
      <div class="complexity-track"><div class="complexity-fill ${cClass}" style="width:${complexity_score}%"></div></div>
    </div>
    <div><div class="r-section-label">Reasoning</div><div class="r-box">${r.reasoning}</div></div>
    ${r.denial_reason?`<div><div class="r-section-label" style="color:var(--red)">Denial Reason</div><div class="denial-box">${r.denial_reason}</div></div>`:""}
    ${r.appeal_path?`<div class="appeal-box"><div class="appeal-label">Appeal Path</div><div class="appeal-text">${r.appeal_path}</div></div>`:""}
    ${renderTrace(data.pipeline_trace, data.sources_cited, data.entity_confidence, data.quality_issues)}
  </div>`;
}
