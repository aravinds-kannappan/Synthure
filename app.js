// On GitHub Pages (static), use demo data. On Vercel (or localhost), hit the real API.
const IS_STATIC = window.location.hostname.endsWith('github.io');
const API = IS_STATIC ? null : '';  // empty = same origin (Vercel serves /api/*)
let token = null;

// ── Demo data ────────────────────────────────────────────────────────────────

const DEMO = {
  jargon: {
    success: true, source: "demo",
    data: {
      summary: "Your visit showed signs of high blood pressure affecting your heart. The doctor has prescribed two medications to lower your blood pressure and cholesterol, and recommends lifestyle changes including a low-sodium diet.",
      conditions: [
        { term: "Essential Hypertension (I10)", plain: "High blood pressure — your heart is working too hard to pump blood through your arteries." },
        { term: "Left Ventricular Hypertrophy (LVH)", plain: "The main pumping chamber of your heart has thickened walls, a common result of long-term high blood pressure." },
        { term: "Dyslipidemia", plain: "Your blood fats (cholesterol and triglycerides) are out of healthy balance — LDL is too high, HDL is too low." },
      ],
      medications: [
        { name: "Lisinopril 10mg", purpose: "Lowers blood pressure by relaxing and widening your blood vessels", instructions: "Take once every morning, with or without food. Do not stop suddenly." },
        { name: "Atorvastatin 20mg", purpose: "Lowers bad cholesterol (LDL) and reduces heart disease risk", instructions: "Take once at bedtime. Avoid grapefruit juice while on this medication." },
      ],
      followup: "Return to clinic in 4 weeks. Get a fasting blood draw (no food 8 hrs before) before that appointment so the doctor can check your cholesterol and kidney function.",
      urgency: "soon",
    },
  },
  insurance: {
    success: true, source: "rule-engine + demo",
    recommendations: [
      { plan: "Medicaid", match_score: 90, reason: "Income $28,000/yr falls within Medicaid eligibility threshold for California" },
      { plan: "CHIP (for dependents)", match_score: 70, reason: "Dependents qualify for Children's Health Insurance Program at this income level" },
      { plan: "ACA Marketplace (Subsidized)", match_score: 55, reason: "Income qualifies for premium tax credits — significant monthly savings available" },
    ],
    ai_insight: {
      ai_insight: "At age 34 with an income of $28,000 and dependents, Medicaid is your strongest option — comprehensive coverage at little to no cost. Enroll your children in CHIP simultaneously, which adds dental and vision benefits Medicaid may not fully cover.",
      key_consideration: "Medicaid enrollment has no open-enrollment window — you can apply any time of year.",
      warning: "If your income fluctuates above the Medicaid threshold, set up ACA Marketplace alerts — losing Medicaid triggers a Special Enrollment Period.",
    },
  },
  claimSimple: {
    success: true, source: "demo",
    claim_id: "CLM-DEMO-PT-1042",
    complexity_score: 10, route: "standard",
    result: {
      decision: "approved", confidence: 94,
      reasoning: "Claim meets all standard criteria. Diagnosis codes align with the office visit procedure. Amount of $185 is within usual and customary range for a Level 3 office visit (CPT 99213).",
      denial_reason: null, appeal_path: null, estimated_reimbursement: 148,
    },
  },
  claimComplex: {
    success: true, source: "demo",
    claim_id: "CLM-DEMO-PT-8827",
    complexity_score: 100, route: "frontier",
    result: {
      decision: "denied", confidence: 78,
      reasoning: "Total knee arthroplasty (CPT 27447) at an out-of-network facility without prior authorization is not covered under current policy terms. The claim was also previously denied on the same grounds. Five diagnosis codes indicate significant comorbidities requiring documented medical necessity review.",
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

// ── Auth ─────────────────────────────────────────────────────────────────────

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

    const userName = document.getElementById("user-name");
    if (userName) userName.textContent = "Dr. Sarah Chen";
    document.getElementById("login-screen").classList.remove("active");
    document.getElementById("app-screen").classList.add("active");

    // Update AI status indicator
    const statusEl = document.getElementById("ai-status");
    if (statusEl) {
      if (IS_STATIC) {
        statusEl.dataset.mode = "demo";
        statusEl.querySelector(".status-text").textContent = "Demo mode";
      } else {
        statusEl.dataset.mode = "live";
        statusEl.querySelector(".status-text").textContent = "AI live";
      }
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

// ── Tabs ──────────────────────────────────────────────────────────────────────

document.querySelectorAll(".tab").forEach((tab) => {
  tab.addEventListener("click", () => {
    document.querySelectorAll(".tab").forEach(t => t.classList.remove("active"));
    document.querySelectorAll(".tab-content").forEach(c => c.classList.remove("active"));
    tab.classList.add("active");
    document.getElementById(`tab-${tab.dataset.tab}`).classList.add("active");
  });
});

// ── Helpers ───────────────────────────────────────────────────────────────────

function setLoading(el) {
  el.innerHTML = `<div class="loading"><div class="spinner"></div><span>Processing…</span></div>`;
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

// ── Feature 1: Jargon Decoder ─────────────────────────────────────────────────

function loadJargonDemo() {
  document.getElementById("jargon-notes").value =
    "Pt is a 58 y/o M with PMHx of essential hypertension (ICD-10: I10), presenting with c/o exertional dyspnea x2 weeks. Echo reveals LVH with EF 55%. Labs show dyslipidemia: LDL 148, HDL 38, TG 210. EKG: NSR, no ST changes. Plan: initiate Lisinopril 10mg QD, Atorvastatin 20mg QHS. Dietary counseling re: DASH diet. RTC 4 weeks with fasting lipid panel and BMP.";
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
    renderJargon(result, data.data, data.source);
  } catch (ex) {
    result.innerHTML = `<div class="result-body"><div class="denial-box">${ex.message}</div></div>`;
  } finally {
    btn.disabled = false;
  }
}

function renderJargon(el, d, source) {
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
      <div class="r-box" style="font-style:italic">${d.followup}</div>
    </div>
    ${d.conditions?.length ? `<div>
      <div class="r-section-label">Medical Terms Explained</div>
      <div class="term-list">
        ${d.conditions.map(c => `<div class="term-item">
          <div class="term-medical">${c.term}</div>
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
    <div><span class="source-badge">⚡ ${source === "ai" ? "Powered by Claude AI" : "Demo mode — add ANTHROPIC_API_KEY for live AI"}</span></div>
  </div>`;
}

// ── Feature 2: Insurance Matcher ──────────────────────────────────────────────

function loadInsuranceDemo() {
  document.getElementById("ins-age").value     = 34;
  document.getElementById("ins-income").value  = 28000;
  document.getElementById("ins-state").value   = "CA";
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
  const { recommendations, ai_insight, source } = data;
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
    <div><span class="source-badge">⚡ ${source.includes("ai") ? "Rule engine + Claude AI" : "Demo mode — add ANTHROPIC_API_KEY for live AI"}</span></div>
  </div>`;
}

// ── Feature 3: Claim Routing ──────────────────────────────────────────────────

function loadClaimDemo(type) {
  if (type === "simple") {
    document.getElementById("claim-patient-id").value = "PT-10042";
    document.getElementById("claim-npi").value        = "1234567890";
    document.getElementById("claim-procedure").value  = "99213";
    document.getElementById("claim-amount").value     = "185";
    document.getElementById("claim-dx").value         = "J06.9, Z00.00";
    document.getElementById("claim-denial").checked      = false;
    document.getElementById("claim-oon").checked         = false;
    document.getElementById("claim-experimental").checked = false;
  } else {
    document.getElementById("claim-patient-id").value = "PT-88271";
    document.getElementById("claim-npi").value        = "9876543210";
    document.getElementById("claim-procedure").value  = "27447";
    document.getElementById("claim-amount").value     = "42500";
    document.getElementById("claim-dx").value         = "M17.11, M79.3, Z96.641, Z87.39, E11.9";
    document.getElementById("claim-denial").checked      = true;
    document.getElementById("claim-oon").checked         = true;
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
        patient_id: patientId,
        provider_npi: npi,
        procedure_code: proc,
        amount: parseFloat(amount),
        diagnosis_codes: codes,
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
    <div><span class="source-badge">⚡ ${IS_STATIC ? `Demo mode (${route} route) — add ANTHROPIC_API_KEY for live AI` : `Routed via ${route} model`}</span></div>
  </div>`;
}
