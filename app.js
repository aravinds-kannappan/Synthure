// On GitHub Pages (static host), use embedded demo data.
// On Vercel (same origin), hit the real /api/* backend.
const IS_STATIC = window.location.hostname.endsWith('github.io');
const API = IS_STATIC ? null : '';
let token = null;

// ── Demo data ─────────────────────────────────────────────────────────────────

const DEMO_TRACE_JARGON = [
  { stage: "quality_gate",       duration_ms: 2,  confidence: 0.95, issues: [] },
  { stage: "entity_extraction",  duration_ms: 0,  model: "regex-fallback", entities_found: 4, confidence: 0.88 },
  { stage: "rag_retrieval",      duration_ms: 1,  docs_retrieved: 4, confidence: 0.82 },
  { stage: "generation",         duration_ms: 0,  model: "demo", sources_cited: ["icd10_I10", "icd10_E78_5"] },
  { stage: "citation_validation",duration_ms: 0,  hallucinations_stripped: 0 },
];

const DEMO_TRACE_INSURANCE = [
  { stage: "quality_gate",  duration_ms: 1, confidence: 1.0, issues: [] },
  { stage: "rag_retrieval", duration_ms: 1, docs_retrieved: 3, confidence: 0.91 },
  { stage: "generation",    duration_ms: 0, model: "demo", sources_cited: ["policy_medicaid_ca", "policy_chip"] },
];

const DEMO_TRACE_CLAIM_SIMPLE = [
  { stage: "quality_gate",       duration_ms: 2,  confidence: 1.0, issues: [] },
  { stage: "code_validation",    duration_ms: 0,  model: "passthrough-fallback", entities_found: 3, confidence: 0.9 },
  { stage: "rag_retrieval",      duration_ms: 1,  docs_retrieved: 3, confidence: 0.78 },
  { stage: "adjudication",       duration_ms: 0,  model: "demo", sources_cited: ["cpt_99213"] },
];

const DEMO_TRACE_CLAIM_COMPLEX = [
  { stage: "quality_gate",       duration_ms: 2,  confidence: 0.85, issues: [] },
  { stage: "code_validation",    duration_ms: 0,  model: "passthrough-fallback", entities_found: 6, confidence: 0.9 },
  { stage: "rag_retrieval",      duration_ms: 1,  docs_retrieved: 5, confidence: 0.96 },
  { stage: "adjudication",       duration_ms: 0,  model: "demo", sources_cited: ["denial_no_preauth_surgical", "denial_out_of_network", "cpt_27447"] },
];

const DEMO = {
  jargon: {
    success: true, source: "demo",
    entity_confidence: 0.88,
    sources_cited: ["icd10_I10", "icd10_E78_5"],
    quality_issues: [],
    pipeline_trace: DEMO_TRACE_JARGON,
    data: {
      summary: "Your visit showed signs of high blood pressure affecting your heart. Your doctor has prescribed two medications to manage these conditions and wants to follow up in about a month to check your progress.",
      conditions: [
        { term: "Essential Hypertension (I10)", plain: "High blood pressure — your heart is working harder than it should to pump blood through your arteries.", source_doc_id: "icd10_I10" },
        { term: "Left Ventricular Hypertrophy (LVH)", plain: "The main pumping chamber of your heart has thickened walls, a common result of long-term high blood pressure.", source_doc_id: "icd10_I10" },
        { term: "Dyslipidemia (E78.5)", plain: "Your blood fats are out of balance — your LDL (bad cholesterol) is too high and your HDL (good cholesterol) is too low, raising your heart disease risk.", source_doc_id: "icd10_E78_5" },
      ],
      medications: [
        { name: "Lisinopril 10mg", purpose: "Lowers blood pressure by relaxing and widening your blood vessels so your heart doesn't work as hard", instructions: "Take once every morning with or without food. Do not stop suddenly." },
        { name: "Atorvastatin 20mg", purpose: "Lowers bad cholesterol (LDL) and reduces your heart disease risk", instructions: "Take once at bedtime. Avoid large amounts of grapefruit juice while on this medication." },
      ],
      followup: "Return to clinic in 4 weeks. Get a fasting blood draw (no food 8 hrs before) before that appointment to check your cholesterol and kidney function.",
      urgency: "soon",
    },
  },
  insurance: {
    success: true, source: "rule-engine + demo",
    entity_confidence: 0, sources_cited: ["policy_medicaid_ca", "policy_chip"],
    quality_issues: [], pipeline_trace: DEMO_TRACE_INSURANCE,
    recommendations: [
      { plan: "Medicaid", match_score: 90, reason: "Income $28,000/yr falls within Medicaid eligibility threshold for California" },
      { plan: "CHIP (for dependents)", match_score: 70, reason: "Dependents qualify for Children's Health Insurance Program at this income level" },
      { plan: "ACA Marketplace (Subsidized)", match_score: 55, reason: "Income qualifies for premium tax credits — significant monthly savings available" },
    ],
    ai_insight: {
      ai_insight: "At age 34 with an income of $28,000 and dependents, Medicaid is your strongest option — comprehensive coverage at little to no cost. Enroll your children in CHIP simultaneously, which adds dental and vision benefits Medicaid may not fully cover.",
      key_consideration: "Medicaid enrollment has no open-enrollment window — you can apply any time of year.",
      warning: "If your income rises above the Medicaid threshold, set up ACA Marketplace alerts — losing Medicaid triggers a Special Enrollment Period.",
    },
  },
  claimSimple: {
    success: true, source: "demo", claim_id: "CLM-DEMO-PT-1042",
    complexity_score: 10, route: "standard",
    entity_confidence: 0.90, sources_cited: ["cpt_99213"],
    quality_issues: [], pipeline_trace: DEMO_TRACE_CLAIM_SIMPLE,
    result: {
      decision: "approved", confidence: 94,
      reasoning: "Claim meets all standard criteria. Diagnosis codes align with the office visit procedure. Amount of $185 is within the usual and customary range for a Level 3 office visit (CPT 99213).",
      denial_reason: null, appeal_path: null, estimated_reimbursement: 148,
    },
  },
  claimComplex: {
    success: true, source: "demo", claim_id: "CLM-DEMO-PT-8827",
    complexity_score: 100, route: "frontier",
    entity_confidence: 0.90, sources_cited: ["denial_no_preauth_surgical", "denial_out_of_network", "cpt_27447"],
    quality_issues: [], pipeline_trace: DEMO_TRACE_CLAIM_COMPLEX,
    result: {
      decision: "denied", confidence: 78,
      reasoning: "Total knee arthroplasty (CPT 27447) at an out-of-network facility without prior authorization is not covered under current policy terms. The claim was also previously denied on the same grounds.",
      denial_reason: "Missing prior authorization — CPT 27447 requires pre-approval per policy section 4.2. Out-of-network providers not covered except in emergencies.",
      appeal_path: "File a Level 1 appeal within 180 days. Include: (1) letter of medical necessity from the treating orthopedic surgeon, (2) operative notes and imaging reports, (3) documentation that in-network alternatives were not reasonably available, (4) completed appeal form CMS-20031.",
      estimated_reimbursement: 0,
    },
  },
};

async function demoFetch(key, delay = 900) {
  await new Promise(r => setTimeout(r, delay));
  return JSON.parse(JSON.stringify(DEMO[key]));
}

// ── Auth ──────────────────────────────────────────────────────────────────────

document.getElementById("login-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const btn = document.getElementById("login-btn");
  const err = document.getElementById("login-error");
  err.classList.add("hidden");
  btn.disabled = true;
  btn.textContent = "Signing in…";

  try {
    if (IS_STATIC) {
      const email = document.getElementById("email").value;
      const pass  = document.getElementById("password").value;
      if (email !== "demo@synthure.ai" || pass !== "demo1234") throw new Error("Invalid credentials");
      await new Promise(r => setTimeout(r, 600));
      token = "demo-token";
    } else {
      const res  = await fetch(`${API}/api/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: document.getElementById("email").value, password: document.getElementById("password").value }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error?.message || "Login failed");
      token = data.token;
    }

    document.getElementById("user-name").textContent = "Dr. Sarah Chen";
    document.getElementById("login-screen").classList.remove("active");
    document.getElementById("app-screen").classList.add("active");

    const statusEl = document.getElementById("ai-status");
    if (IS_STATIC) {
      statusEl.dataset.mode = "demo";
      statusEl.querySelector(".status-text").textContent = "Demo mode";
    } else {
      statusEl.dataset.mode = "live";
      statusEl.querySelector(".status-text").textContent = "AI live";
    }
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
  const res  = await fetch(`${API}${path}`, {
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
  const color = colors[cls] || "#56718a";
  return `<svg width="46" height="46" viewBox="0 0 46 46">
    <circle cx="${c}" cy="${c}" r="${r}" fill="none" stroke="rgba(255,255,255,0.06)" stroke-width="3"/>
    <circle cx="${c}" cy="${c}" r="${r}" fill="none" stroke="${color}" stroke-width="3"
      stroke-dasharray="${circ}" stroke-dashoffset="${fill}" stroke-linecap="round"
      style="transform:rotate(-90deg);transform-origin:center;transition:stroke-dashoffset 0.8s ease"/>
  </svg>`;
}

// ── Pipeline trace renderer ───────────────────────────────────────────────────

const STAGE_LABELS = {
  quality_gate:        { icon: "🛡️", label: "Quality Gate" },
  entity_extraction:   { icon: "🏷️", label: "Entity Extraction" },
  code_validation:     { icon: "🔍", label: "Code Validation" },
  rag_retrieval:       { icon: "📚", label: "RAG Retrieval" },
  generation:          { icon: "✨", label: "Generation" },
  adjudication:        { icon: "⚖️", label: "Adjudication" },
  citation_validation: { icon: "✅", label: "Citation Check" },
};

function renderTrace(trace, sources_cited, entity_confidence, quality_issues) {
  if (!trace || !trace.length) return "";

  const stageHtml = trace.map(step => {
    const meta = STAGE_LABELS[step.stage] || { icon: "⚙️", label: step.stage };
    const hasIssues = step.issues && step.issues.length > 0;
    const statusIcon = hasIssues ? "⚠️" : "✓";
    const statusColor = hasIssues ? "var(--yellow)" : "var(--green)";

    let detail = "";
    if (step.model && step.model !== "demo")  detail += `<span class="trace-chip">${step.model}</span>`;
    if (step.entities_found)                  detail += `<span class="trace-chip">${step.entities_found} entities</span>`;
    if (step.docs_retrieved)                  detail += `<span class="trace-chip">${step.docs_retrieved} docs</span>`;
    if (step.confidence)                      detail += `<span class="trace-chip">conf ${(step.confidence * 100).toFixed(0)}%</span>`;
    if (step.hallucinations_stripped)         detail += `<span class="trace-chip trace-chip-warn">${step.hallucinations_stripped} hallucinations stripped</span>`;
    if (step.duration_ms > 0)                 detail += `<span class="trace-chip trace-chip-dim">${step.duration_ms}ms</span>`;

    return `<div class="trace-step">
      <div class="trace-step-icon">${meta.icon}</div>
      <div class="trace-step-body">
        <div class="trace-step-name">
          <span>${meta.label}</span>
          <span style="color:${statusColor};font-size:10px;font-weight:700">${statusIcon}</span>
        </div>
        <div class="trace-chips">${detail}</div>
        ${hasIssues ? `<div class="trace-issues">${step.issues.map(i => `<span>⚠ ${i}</span>`).join("")}</div>` : ""}
      </div>
    </div>`;
  }).join('<div class="trace-arrow">→</div>');

  const citationsHtml = sources_cited && sources_cited.length
    ? `<div class="citations">
        <span class="citations-label">Sources cited</span>
        ${sources_cited.map(id => `<span class="citation-chip">${id}</span>`).join("")}
       </div>`
    : "";

  const warningsHtml = quality_issues && quality_issues.length
    ? `<div class="quality-warnings">${quality_issues.map(i => `<div class="quality-warning-row">⚠ ${i}</div>`).join("")}</div>`
    : "";

  const confHtml = entity_confidence > 0
    ? `<span class="conf-badge">Entity confidence ${(entity_confidence * 100).toFixed(0)}%</span>`
    : "";

  return `<div class="pipeline-trace">
    <div class="pipeline-trace-header">
      <span class="pipeline-trace-label">Processing Pipeline</span>
      ${confHtml}
    </div>
    ${warningsHtml}
    <div class="trace-steps">${stageHtml}</div>
    ${citationsHtml}
  </div>`;
}

// ── Feature 1: Jargon Decoder ─────────────────────────────────────────────────

function loadJargonDemo() {
  document.getElementById("jargon-notes").value =
    "Pt is a 58 y/o M with PMHx of essential hypertension (ICD-10: I10), presenting with c/o exertional dyspnea x2 weeks. Echo reveals LVH with EF 55%. Labs show dyslipidemia (E78.5): LDL 148, HDL 38, TG 210. EKG: NSR, no ST changes. Plan: initiate Lisinopril 10mg QD, Atorvastatin 20mg QHS. Dietary counseling re: DASH diet. RTC 4 weeks with fasting lipid panel and BMP.";
}

async function explainJargon() {
  const notes = document.getElementById("jargon-notes").value.trim();
  if (!notes) { alert("Please enter visit notes."); return; }
  const btn    = document.getElementById("jargon-btn");
  const result = document.getElementById("jargon-result");
  btn.disabled = true;
  setLoading(result);
  try {
    const data = IS_STATIC
      ? await demoFetch("jargon")
      : await apiFetch("/api/explain-jargon", { notes });
    renderJargon(result, data);
  } catch (ex) {
    result.innerHTML = `<div class="result-body"><div class="denial-box">${ex.message}</div></div>`;
  } finally {
    btn.disabled = false;
  }
}

function renderJargon(el, data) {
  const d = data.data;
  const urgencyDot = { routine: "🟢", soon: "🟡", urgent: "🔴" };
  el.innerHTML = `<div class="result-body">
    <div>
      <div class="r-section-label">Summary</div>
      <div class="r-box">${d.summary}</div>
    </div>
    <div>
      <div class="r-section-label" style="display:flex;align-items:center;gap:8px">
        Urgency &nbsp;
        <span class="urgency-chip urgency-${d.urgency}">${urgencyDot[d.urgency] || "⚪"} ${d.urgency}</span>
      </div>
      <div class="r-box" style="font-style:italic;margin-top:8px">${d.followup}</div>
    </div>
    ${d.conditions?.length ? `<div>
      <div class="r-section-label">Medical Terms Explained</div>
      <div class="term-list">
        ${d.conditions.map(c => `<div class="term-item">
          <div class="term-medical">${c.term}
            ${c.source_doc_id && c.source_doc_id !== "general_knowledge" ? `<span class="source-pill">${c.source_doc_id}</span>` : ""}
          </div>
          <div class="term-plain">${c.plain}</div>
        </div>`).join("")}
      </div>
    </div>` : ""}
    ${d.medications?.length ? `<div>
      <div class="r-section-label">Medications</div>
      ${d.medications.map(m => `<div class="med-item">
        <div class="med-name">${m.name}</div>
        <div class="med-purpose">${m.purpose}</div>
        <div class="med-instructions">${m.instructions}</div>
      </div>`).join("")}
    </div>` : ""}
    ${renderTrace(data.pipeline_trace, data.sources_cited, data.entity_confidence, data.quality_issues)}
  </div>`;
}

// ── Feature 2: Insurance Matcher ──────────────────────────────────────────────

function loadInsuranceDemo() {
  document.getElementById("ins-age").value      = 34;
  document.getElementById("ins-income").value   = 28000;
  document.getElementById("ins-state").value    = "CA";
  document.getElementById("ins-employed").value = "false";
  document.getElementById("ins-dependents").checked = true;
  document.getElementById("ins-chronic").checked    = false;
}

async function matchInsurance() {
  const age    = document.getElementById("ins-age").value;
  const income = document.getElementById("ins-income").value;
  if (!age || !income) { alert("Age and income are required."); return; }
  const btn    = document.getElementById("insurance-btn");
  const result = document.getElementById("insurance-result");
  btn.disabled = true;
  setLoading(result);
  try {
    const data = IS_STATIC
      ? await demoFetch("insurance")
      : await apiFetch("/api/match-insurance", {
          age: parseInt(age),
          annual_income: parseInt(income),
          state: document.getElementById("ins-state").value,
          employed: document.getElementById("ins-employed").value === "true",
          has_dependents: document.getElementById("ins-dependents").checked,
          chronic_condition: document.getElementById("ins-chronic").checked,
        });
    renderInsurance(result, data);
  } catch (ex) {
    result.innerHTML = `<div class="result-body"><div class="denial-box">${ex.message}</div></div>`;
  } finally {
    btn.disabled = false;
  }
}

function renderInsurance(el, data) {
  const { recommendations, ai_insight } = data;
  el.innerHTML = `<div class="result-body">
    <div>
      <div class="r-section-label">Best Matches</div>
      ${recommendations.map((r, i) => {
        const cls = scoreClass(r.match_score);
        return `<div class="match-card ${cls}">
          <div class="score-ring ${cls}">
            ${scoreRingSVG(r.match_score, cls)}
            <div class="score-ring-text">${r.match_score}%</div>
          </div>
          <div class="match-info">
            <div class="match-plan">${i === 0 ? "★ " : ""}${r.plan}</div>
            <div class="match-reason">${r.reason}</div>
          </div>
        </div>`;
      }).join("")}
    </div>
    <div class="ai-insight-box">
      <div class="ai-insight-label">AI Guidance</div>
      <div class="ai-insight-text">${ai_insight.ai_insight}</div>
      ${ai_insight.key_consideration ? `<div class="ai-insight-text" style="margin-top:8px"><strong style="color:var(--text)">Key factor:</strong> ${ai_insight.key_consideration}</div>` : ""}
    </div>
    ${ai_insight.warning ? `<div class="warning-box"><span>⚠️</span><span>${ai_insight.warning}</span></div>` : ""}
    ${renderTrace(data.pipeline_trace, data.sources_cited, 0, data.quality_issues)}
  </div>`;
}

// ── Feature 3: Claim Routing ──────────────────────────────────────────────────

function loadClaimDemo(type) {
  if (type === "simple") {
    document.getElementById("claim-patient-id").value  = "PT-10042";
    document.getElementById("claim-npi").value         = "1234567890";
    document.getElementById("claim-procedure").value   = "99213";
    document.getElementById("claim-amount").value      = "185";
    document.getElementById("claim-dx").value          = "J06.9, Z00.00";
    document.getElementById("claim-denial").checked       = false;
    document.getElementById("claim-oon").checked          = false;
    document.getElementById("claim-experimental").checked = false;
  } else {
    document.getElementById("claim-patient-id").value  = "PT-88271";
    document.getElementById("claim-npi").value         = "9876543210";
    document.getElementById("claim-procedure").value   = "27447";
    document.getElementById("claim-amount").value      = "42500";
    document.getElementById("claim-dx").value          = "M17.11, M79.3, Z96.641, Z87.39, E11.9";
    document.getElementById("claim-denial").checked       = true;
    document.getElementById("claim-oon").checked          = true;
    document.getElementById("claim-experimental").checked = false;
  }
}

async function submitClaim() {
  const patientId = document.getElementById("claim-patient-id").value.trim();
  const npi       = document.getElementById("claim-npi").value.trim();
  const proc      = document.getElementById("claim-procedure").value.trim();
  const amount    = document.getElementById("claim-amount").value;
  const dxRaw     = document.getElementById("claim-dx").value;
  const codes     = dxRaw.split(",").map(s => s.trim()).filter(Boolean);
  if (!patientId || !npi || !proc || !amount || !codes.length) {
    alert("Please fill all required fields."); return;
  }
  const btn    = document.getElementById("claim-btn");
  const result = document.getElementById("claim-result");
  btn.disabled = true;
  setLoading(result);
  try {
    let data;
    if (IS_STATIC) {
      const isComplex = parseFloat(amount) > 5000 || codes.length > 3 ||
        document.getElementById("claim-denial").checked ||
        document.getElementById("claim-oon").checked;
      data = await demoFetch(isComplex ? "claimComplex" : "claimSimple", 1100);
    } else {
      data = await apiFetch("/api/claim/submit", {
        patient_id: patientId, provider_npi: npi, procedure_code: proc,
        amount: parseFloat(amount), diagnosis_codes: codes,
        prior_denial: document.getElementById("claim-denial").checked,
        out_of_network: document.getElementById("claim-oon").checked,
        experimental_treatment: document.getElementById("claim-experimental").checked,
      });
    }
    renderClaim(result, data);
  } catch (ex) {
    result.innerHTML = `<div class="result-body"><div class="denial-box">${ex.message}</div></div>`;
  } finally {
    btn.disabled = false;
  }
}

function renderClaim(el, data) {
  const { claim_id, complexity_score, route, result: r } = data;
  const icons  = { approved: "✅", pending_review: "⏳", denied: "❌" };
  const labels = { approved: "Approved", pending_review: "Pending Review", denied: "Denied" };
  const cClass = complexityClass(complexity_score);
  el.innerHTML = `<div class="result-body">
    <div class="decision-banner decision-${r.decision}">
      <div class="decision-icon">${icons[r.decision]}</div>
      <div>
        <div class="decision-label">${labels[r.decision]}</div>
        <div class="decision-claim-id">${claim_id}</div>
      </div>
      <div class="decision-confidence">
        <div class="conf-val">${r.confidence}%</div>
        <div class="conf-label">Confidence</div>
      </div>
    </div>
    <div class="meta-row">
      <div class="meta-chip">Route: <strong>${route === "frontier" ? "🧠 Frontier AI" : "⚡ Standard"}</strong></div>
      <div class="meta-chip">Complexity: <strong>${complexity_score}/100</strong></div>
      ${r.estimated_reimbursement != null ? `<div class="meta-chip">Est. reimbursement: <strong>$${r.estimated_reimbursement.toLocaleString()}</strong></div>` : ""}
    </div>
    <div>
      <div class="r-section-label" style="margin-bottom:5px">Complexity Score</div>
      <div class="complexity-track">
        <div class="complexity-fill ${cClass}" style="width:${complexity_score}%"></div>
      </div>
    </div>
    <div>
      <div class="r-section-label">Reasoning</div>
      <div class="r-box">${r.reasoning}</div>
    </div>
    ${r.denial_reason ? `<div>
      <div class="r-section-label" style="color:var(--red)">Denial Reason</div>
      <div class="denial-box">${r.denial_reason}</div>
    </div>` : ""}
    ${r.appeal_path ? `<div class="appeal-box">
      <div class="appeal-label">Appeal Path</div>
      <div class="appeal-text">${r.appeal_path}</div>
    </div>` : ""}
    ${renderTrace(data.pipeline_trace, data.sources_cited, data.entity_confidence, data.quality_issues)}
  </div>`;
}
