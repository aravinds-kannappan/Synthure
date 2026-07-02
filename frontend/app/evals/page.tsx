import Nav from '@/components/Nav'
import evals from '@/data/evals.json'

export const metadata = { title: 'Synthure — Model evaluations' }

type Evals = typeof evals

function pct(n: number) {
  return `${(n * 100).toFixed(1)}%`
}

function Metric({ label, value, sub, tone = 'teal' }: { label: string; value: string; sub?: string; tone?: string }) {
  const color =
    tone === 'amber' ? 'text-amber-400' : tone === 'rose' ? 'text-rose-400' : tone === 'violet' ? 'text-violet-400' : 'text-teal-400'
  return (
    <div className="rounded-xl border border-white/[0.07] bg-white/[0.02] p-4">
      <div className="text-[11px] uppercase tracking-wider text-slate-500">{label}</div>
      <div className={`mt-1 text-2xl font-bold ${color}`}>{value}</div>
      {sub && <div className="mt-0.5 text-[11px] text-slate-500">{sub}</div>}
    </div>
  )
}

function Card({ title, owner, children }: { title: string; owner: string; children: React.ReactNode }) {
  const badge =
    owner === 'OpenMed' ? 'border-cyan-400/30 bg-cyan-400/10 text-cyan-300'
      : owner === 'rule-based' ? 'border-slate-400/30 bg-slate-400/10 text-slate-300'
        : 'border-teal-400/30 bg-teal-400/10 text-teal-300'
  return (
    <section className="rounded-2xl border border-white/[0.08] bg-white/[0.015] p-5">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-lg font-semibold text-white">{title}</h2>
        <span className={`rounded-md border px-2.5 py-1 text-[11px] ${badge}`}>{owner}</span>
      </div>
      {children}
    </section>
  )
}

export default function EvalsPage() {
  const e = evals as Evals
  const om = e.openmed
  return (
    <div className="min-h-screen grid-bg">
      <Nav />
      <main className="relative mx-auto max-w-5xl px-6 pb-24 pt-28">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-white sm:text-4xl">Model evaluations</h1>
          <p className="mt-3 max-w-3xl leading-relaxed text-slate-400">
            Every Synthure owned model is trained and evaluated in a reproducible harness (see <span className="font-mono text-slate-300">ml/</span>).
            These numbers are produced by <span className="font-mono text-slate-300">ml/evaluate.py</span> on a held out test split and shipped as
            <span className="font-mono text-slate-300"> data/evals.json</span>. Built {e.built}.
          </p>
          <div className="mt-4 rounded-xl border border-amber-400/20 bg-amber-400/[0.06] px-4 py-3 text-[13px] leading-relaxed text-amber-100/90">
            <span className="font-semibold text-amber-200">Read this first.</span> The corpus is <span className="font-semibold">synthetic</span>: {e.corpus.note} This is a research and prototype grade
            system with auditable outputs, human review, and measurable evals, not a production medical device.
          </div>
        </div>

        <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Metric label="Note type accuracy" value={pct(e.note_type.accuracy)} sub={`n=${e.note_type.n}, synthetic`} />
          <Metric label="ICD top 3" value={pct(e.coding.top3_accuracy)} sub={`n=${e.coding.n} codes`} />
          <Metric label="Readiness AUROC" value={e.readiness.auroc.toFixed(3)} sub={`AUPRC ${e.readiness.auprc.toFixed(2)}`} tone="violet" />
          <Metric label="Hallucinated codes" value={String(e.coding.hallucinated_codes)} sub="structurally impossible" tone="teal" />
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <Card title="Note type classifier" owner="Synthure">
            <div className="grid grid-cols-2 gap-3">
              <Metric label="Accuracy" value={pct(e.note_type.accuracy)} />
              <Metric label="Latency" value={`${e.note_type.ms_per_note} ms`} sub="per note, in process" />
            </div>
            <p className="mt-3 text-[12px] leading-relaxed text-slate-500">TF IDF word 1 to 2 grams plus multinomial logistic regression. Synthetic notes are highly separable, so accuracy is near ceiling; the honest test is real clinical text.</p>
          </Card>

          <Card title="Section parser" owner="rule-based">
            <div className="grid grid-cols-3 gap-3">
              <Metric label="Precision" value={pct(e.sections.precision)} />
              <Metric label="Recall" value={pct(e.sections.recall)} />
              <Metric label="F1" value={e.sections.f1.toFixed(3)} />
            </div>
            <p className="mt-3 text-[12px] leading-relaxed text-slate-500">Header detection with a section name map. Deterministic and honestly labeled as rule based, not a trained model.</p>
          </Card>

          <Card title="ICD candidate reranker" owner="Synthure">
            <div className="grid grid-cols-3 gap-3">
              <Metric label="Top 1" value={pct(e.coding.top1_accuracy)} />
              <Metric label="Top 3" value={pct(e.coding.top3_accuracy)} />
              <Metric label="Halluc. rate" value={e.coding.hallucination_rate.toFixed(3)} tone="teal" />
            </div>
            <p className="mt-3 text-[12px] leading-relaxed text-slate-500">Logistic regression over lexical features (overlap, term length, billable, retrieval rank) on candidates from the official ICD 10 CM index. Codes outside the index cannot be produced, so the hallucination rate is zero by construction.</p>
          </Card>

          <Card title="Missing information detector" owner="Synthure">
            <div className="mb-3">
              <Metric label="Micro F1" value={e.missing_info.micro_f1.toFixed(3)} />
            </div>
            <div className="space-y-1.5">
              {Object.entries(e.missing_info.per_field_f1).map(([f, v]) => (
                <div key={f} className="flex items-center gap-2 text-[12px]">
                  <span className="w-40 text-slate-400">{f.replace(/_/g, ' ')}</span>
                  <span className="h-2 rounded-full bg-teal-400/70" style={{ width: `${Math.max(4, (v as number) * 120)}px` }} />
                  <span className="text-slate-500">{(v as number).toFixed(2)}</span>
                </div>
              ))}
            </div>
          </Card>

          <Card title="Claim / prior-auth readiness" owner="Synthure">
            <div className="grid grid-cols-2 gap-3">
              <Metric label="AUROC" value={e.readiness.auroc.toFixed(3)} tone="violet" />
              <Metric label="AUPRC" value={e.readiness.auprc.toFixed(3)} tone="violet" />
              <Metric label="ECE (calibrated)" value={e.readiness.ece_calibrated.toFixed(3)} sub={`raw ${e.readiness.ece_raw.toFixed(3)}`} />
              <Metric label="Abstention lift" value={`${pct(e.readiness.accuracy_all)} → ${pct(e.readiness.accuracy_confident)}`} sub={`withholding least confident ${pct(e.readiness.abstain_frac)}`} tone="amber" />
            </div>
            <p className="mt-3 text-[12px] leading-relaxed text-slate-500">Gradient boosted trees over structural features, isotonic calibrated on validation. The readiness label is rule derived (no public claim adjudication data exists), and this is stated as a weak label, not a real payer outcome.</p>
          </Card>

          <Card title="OpenMed backbone (de-id + NER)" owner="OpenMed">
            {om.available ? (
              <>
                <div className="grid grid-cols-2 gap-3">
                  <Metric label="De-id recall" value={pct(om.deid_recall)} sub={`${om.deid_seeded_spans} seeded spans`} tone="teal" />
                  <Metric label="Disease NER F1" value={om.ner_disease.f1.toFixed(2)} sub={`R ${om.ner_disease.recall.toFixed(2)} P ${om.ner_disease.precision.toFixed(2)}`} tone="teal" />
                </div>
                <p className="mt-3 text-[12px] leading-relaxed text-slate-500">Evaluated directly with onnxruntime against gold spans on {om.n_notes} notes. Recall is high; precision is lower because the models tag more entity types than the narrow synthetic gold covers. De identification runs on device in the product.</p>
              </>
            ) : (
              <p className="text-[13px] text-slate-500">OpenMed backbone eval was not run in this build.</p>
            )}
          </Card>
        </div>

        <p className="mt-8 text-center text-[12px] text-slate-600">
          Reproduce: <span className="font-mono">python3 ml/generate.py 2400 &amp;&amp; python3 ml/train.py &amp;&amp; python3 ml/evaluate.py</span>
        </p>
      </main>
    </div>
  )
}
