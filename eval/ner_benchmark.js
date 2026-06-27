// NER benchmark: diagnosis prose -> ICD 10, Claude NER vs the deterministic regex
// extractor, scored against gold ICD 10 codes on real public data.
//
// Requires:
//   1) ANTHROPIC_API_KEY in the environment
//   2) the product engine compiled to eval/_build (see eval/README.md):
//        cd frontend && npx tsc lib/synthure.ts lib/knowledge.ts lib/engine.ts \
//          --rootDir lib --outDir ../eval/_build --module commonjs --target es2019 \
//          --moduleResolution node --skipLibCheck --esModuleInterop
//
// Run:  ANTHROPIC_API_KEY=... node eval/ner_benchmark.js
//
// This is the exact procedure used to produce the NER numbers in eval/README.md.

const path = require('path')
const A = require(path.join(__dirname, '..', 'frontend', 'node_modules', '@anthropic-ai', 'sdk'))
const Anthropic = A.default || A
const { extract, assembleExtraction } = require(path.join(__dirname, '_build', 'engine.js'))
const data = require(path.join(__dirname, 'data', 'icd10_sample.json'))

const key = process.env.ANTHROPIC_API_KEY
if (!key) { console.error('Set ANTHROPIC_API_KEY'); process.exit(1) }
const client = new Anthropic({ apiKey: key })
const HAIKU = 'claude-haiku-4-5-20251001'

const NER_TOOL = {
  name: 'extract_entities',
  description: 'Extract clinical entities from the note and map them to standard codes.',
  input_schema: {
    type: 'object',
    properties: {
      diagnoses: { type: 'array', items: { type: 'object', properties: { code: { type: 'string' }, label: { type: 'string' } }, required: ['code', 'label'] } },
      procedures: { type: 'array', items: { type: 'object', properties: { code: { type: 'string' }, label: { type: 'string' } }, required: ['code', 'label'] } },
      medications: { type: 'array', items: { type: 'string' } },
      symptoms: { type: 'array', items: { type: 'string' } },
      labs: { type: 'array', items: { type: 'string' } },
    },
    required: ['diagnoses', 'procedures', 'medications', 'symptoms', 'labs'],
  },
}
const SYS = 'You are a biomedical NER agent. Read the clinical note and extract its entities. Map every diagnosis to its standard ICD 10 code, including diagnoses written in plain language or as abbreviations. Map procedures to their CPT code when known. Only return real, valid codes; if you are unsure of a code, omit that entry rather than inventing it. Write every label with no hyphens or dashes.'

async function ner(note) {
  const msg = await client.messages.create({
    model: HAIKU, max_tokens: 1200, tools: [NER_TOOL],
    tool_choice: { type: 'tool', name: 'extract_entities' }, system: SYS,
    messages: [{ role: 'user', content: `CLINICAL NOTE:\n${note}` }],
  })
  const b = msg.content.find((x) => x.type === 'tool_use')
  if (!b) throw new Error('no tool_use')
  return assembleExtraction(note, {
    icd10: b.input.diagnoses || [], cpt: b.input.procedures || [],
    medications: b.input.medications || [], symptoms: b.input.symptoms || [], labs: b.input.labs || [],
  }).icd10.map((c) => c.code)
}

const k3 = (c) => c.replace('.', '').slice(0, 3).toUpperCase()
const kf = (c) => c.replace('.', '').toUpperCase()

async function pool(items, worker, conc = 6) {
  const res = new Array(items.length); let i = 0
  async function run() { while (i < items.length) { const idx = i++; try { res[idx] = await worker(items[idx]) } catch (e) { res[idx] = { error: String(e) } } } }
  await Promise.all(Array.from({ length: conc }, run))
  return res
}

;(async () => {
  const N = Math.min(150, data.length)
  const results = await pool(data.slice(0, N), async (d) => {
    const note = `Clinical note. Reported symptoms: ${d.symptoms}. Assessment and plan: ${d.description}.`
    return { gold: d.code, pred: await ner(note), regex: extract(note).icd10.map((c) => c.code) }
  }, 6)
  let recCat = 0, recExact = 0, regexRec = 0, anyPred = 0, errors = 0
  for (const r of results) {
    if (r.error) { errors++; continue }
    const g3 = k3(r.gold), gf = kf(r.gold)
    if (r.pred.length) anyPred++
    if (r.pred.some((c) => k3(c) === g3)) recCat++
    if (r.pred.some((c) => kf(c) === gf)) recExact++
    if (r.regex.some((c) => k3(c) === g3)) regexRec++
  }
  const n = N - errors
  console.log('N scored =', n, ' errors =', errors)
  console.log('Claude NER  recall @ category =', (100 * recCat / n).toFixed(1) + '%', `(${recCat}/${n})`)
  console.log('Claude NER  recall @ exact    =', (100 * recExact / n).toFixed(1) + '%', `(${recExact}/${n})`)
  console.log('Claude NER  emits a code      =', (100 * anyPred / n).toFixed(1) + '%')
  console.log('Regex       recall @ category =', (100 * regexRec / n).toFixed(1) + '%', `(${regexRec}/${n})`)
})()
