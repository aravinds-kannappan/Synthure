import Nav from '@/components/Nav'
import evals from '@/data/evals.json'
import modelEvals from '@/data/model_evals.json'
import { Bars } from '@/components/Charts'

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
  const mc = modelEvals.icd_coder
  const mf = modelEvals.faithfulness as { flag_precision: number; flag_recall: number; auroc: number } | null
  return (
    <div className="min-h-screen grid-bg">
      <Nav />
      <main className="relative mx-auto max-w-5xl px-6 pb-24 pt-28">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-white sm:text-4xl">Model evaluations</h1>
          <p className="mt-3 max-w-3xl leading-relaxed text-slate-400">
            The two cards below are the A100 trained models, evaluated on open real world data: CodiEsp clinical cases for the coder and a held out corruption set for the faithfulness checker. The Synthure owned models beneath them run in process and are evaluated by <span className="font-mono text-slate-300">ml/evaluate.py</span> on a held out split, shipped as <span className="font-mono text-slate-300">data/evals.json</span>. Built {modelEvals.built}.
          </p>
          <div className="mt-4 rounded-xl border border-amber-400/20 bg-amber-400/[0.06] px-4 py-3 text-[13px] leading-relaxed text-amber-100/90">
            <span className="font-semibold text-amber-200">Scope.</span> The in process Synthure models use a <span className="font-semibold">synthetic</span> corpus: {e.corpus.note} Absolute numbers reflect that controlled distribution. The trained coder above is measured on CodiEsp. This is a research and prototype grade system with auditable outputs and human review, not a production medical device.
          </div>
        </div>

        {/* Trained on the A100, evaluated on real (open) data */}
        <div className="mb-8 grid gap-4 md:grid-cols-2">
          <section className="rounded-2xl border border-emerald-400/20 bg-emerald-400/[0.03] p-5">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-white">Trained ICD coder</h2>
              <span className="rounded-md border border-emerald-400/30 bg-emerald-400/10 px-2.5 py-1 text-[11px] text-emerald-300">A100 · trained</span>
            </div>
            <Bars items={[
              { label: 'acc@1 · exact code ranked first', value: mc.codiesp.acc1, tone: 'emerald' },
              { label: 'acc@5 · code in top 5', value: mc.codiesp.acc5, tone: 'emerald' },
              { label: 'MRR', value: mc.codiesp.mrr, tone: 'teal' },
            ]} />
            <p className="mt-4 text-[12px] leading-relaxed text-slate-400">
              A bi encoder retriever ({mc.train_pairs.toLocaleString()} phrase to code pairs over the {mc.index_codes.toLocaleString()} code FY2026 index) plus a cross encoder reranker fine tuned on CodiEsp. Measured on {mc.codiesp.mentions.toLocaleString()} gold evidence mentions from CodiEsp, Spanish clinical cases translated to English: the exact ICD 10 CM code is ranked first {Math.round(mc.codiesp.acc1 * 100)}% of the time and within the top five {Math.round(mc.codiesp.acc5 * 100)}%.
            </p>
            <p className="mt-2 text-[11px] leading-relaxed text-slate-500">
              Whole document coding on the same set scores lower (MAP {mc.codiesp.doc_map.toFixed(3)}): it feeds full narrative sentences to a retriever trained on short mentions and scores them against the Spanish ICD 10 modification. On the short English mentions the pipeline actually calls it with, ranking is stronger.
            </p>
          </section>

          <section className="rounded-2xl border border-white/[0.08] bg-white/[0.015] p-5">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-white">Faithfulness checker</h2>
              <span className="rounded-md border border-emerald-400/30 bg-emerald-400/10 px-2.5 py-1 text-[11px] text-emerald-300">A100 · trained</span>
            </div>
            {mf ? (
              <>
                <Bars items={[
                  { label: 'Flag precision', value: mf.flag_precision, tone: 'amber' },
                  { label: 'Flag recall', value: mf.flag_recall, tone: 'amber' },
                  { label: 'AUROC', value: mf.auroc, tone: 'violet' },
                ]} />
                <p className="mt-4 text-[12px] leading-relaxed text-slate-400">
                  A cross encoder scoring each portal sentence against the note and extraction. On the held out corruption test set it catches {Math.round(mf.flag_recall * 100)}% of unsupported sentences at {Math.round(mf.flag_precision * 100)}% precision, AUROC {mf.auroc.toFixed(2)}.
                </p>
              </>
            ) : (
              <p className="text-[13px] leading-relaxed text-slate-400">
                A cross encoder that scores each portal sentence against the note and extraction and flags unsupported claims, built in <span className="font-mono text-slate-300">ml/faithfulness</span>. Its benchmark is a held out FactCC style corruption test set: flag precision, flag recall, and AUROC over supported vs corrupted claims. It is not deployed in the live demo; the running writer check is a verifier and a constitution critic that audit each report against the extracted facts.
              </p>
            )}
          </section>
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
            <p className="mt-3 text-[12px] leading-relaxed text-slate-500">TF IDF word 1 to 2 grams plus multinomial logistic regression. Synthetic notes are highly separable, so accuracy is near ceiling; the real test is clinical text.</p>
          </Card>

          <Card title="Section parser" owner="rule-based">
            <div className="grid grid-cols-3 gap-3">
              <Metric label="Precision" value={pct(e.sections.precision)} />
              <Metric label="Recall" value={pct(e.sections.recall)} />
              <Metric label="F1" value={e.sections.f1.toFixed(3)} />
            </div>
            <p className="mt-3 text-[12px] leading-relaxed text-slate-500">Header detection with a section name map. Deterministic rule based detection, not a trained model.</p>
          </Card>

          <Card title="ICD candidate reranker (in browser)" owner="Synthure">
            <div className="grid grid-cols-3 gap-3">
              <Metric label="Top 1" value={pct(e.coding.top1_accuracy)} />
              <Metric label="Top 3" value={pct(e.coding.top3_accuracy)} />
              <Metric label="Halluc. rate" value={e.coding.hallucination_rate.toFixed(3)} tone="teal" />
            </div>
            <p className="mt-3 text-[12px] leading-relaxed text-slate-500">Logistic regression over lexical features (overlap, term length, billable, retrieval rank) on candidates from the official ICD 10 CM index. The trained bi and cross encoder coder above supersedes this for linking; this lightweight model stays as the in process fallback. Codes outside the index cannot be produced, so the hallucination rate is zero by construction.</p>
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
            <p className="mt-3 text-[12px] leading-relaxed text-slate-500">Gradient boosted trees over structural features, isotonic calibrated on validation. The readiness label is rule derived (no public claim adjudication data exists), and it is a weak label, not a real payer outcome.</p>
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
