// ── Shared clinical knowledge ───────────────────────────────────────────────
// Dictionaries + cost estimation shared by the server engine (engine.ts) and the
// client portals (portals.ts). Pure data + pure functions, safe on both sides.

import type { ExtractionResult } from './synthure'

export const ICD_LABELS: Record<string, string> = {
  I10: 'Essential (primary) hypertension',
  E782: 'Mixed hyperlipidemia',
  E119: 'Type 2 diabetes mellitus without complications',
  I214: 'Non ST elevation myocardial infarction (NSTEMI)',
  M1711: 'Unilateral primary osteoarthritis, right knee',
  J449: 'Chronic obstructive pulmonary disease',
  N189: 'Chronic kidney disease, unspecified',
  F329: 'Major depressive disorder, single episode',
  E785: 'Hyperlipidemia, unspecified',
}

export const PLAIN_DX: Record<string, string> = {
  I10: 'high blood pressure. When it stays high, your heart and blood vessels work harder, which over time can affect your heart, kidneys, and eyes.',
  E782: 'high levels of cholesterol and other fats in your blood. Over time these can build up inside your arteries.',
  E785: 'high cholesterol, meaning there is more fat in your blood than is healthy.',
  E119: 'type 2 diabetes, which means your blood sugar runs higher than normal. Keeping it in range protects your eyes, kidneys, nerves, and heart.',
  I214: 'a heart attack caused by reduced blood flow to part of your heart muscle. It needs prompt treatment and close follow up.',
  M1711: 'wear and tear arthritis in your right knee, where the cushioning cartilage has worn down and is causing pain and stiffness.',
  J449: 'a long term lung condition that makes it harder to breathe and move air in and out of your lungs.',
  N189: 'reduced kidney function. Your care team will watch your labs to keep your kidneys as healthy as possible.',
  F329: 'depression. It is a common and treatable medical condition, not a personal weakness.',
}

export const MED_INFO: Record<string, { use: string; how: string }> = {
  lisinopril: { use: 'lowers your blood pressure and helps protect your kidneys', how: 'usually taken once a day. Let your team know if you get a dry cough or feel dizzy.' },
  atorvastatin: { use: 'lowers your cholesterol', how: 'often taken at night. Report any unusual muscle aches.' },
  simvastatin: { use: 'lowers your cholesterol', how: 'usually taken in the evening. Report any muscle aches.' },
  metformin: { use: 'lowers your blood sugar in type 2 diabetes', how: 'taken with meals. Mild stomach upset early on usually settles.' },
  insulin: { use: 'controls your blood sugar directly', how: 'dosing and timing matter. Follow your team’s instructions and watch for low blood sugar.' },
  aspirin: { use: 'thins your blood to lower the chance of clots', how: 'taken as directed. Tell your team about unusual bruising or bleeding.' },
  clopidogrel: { use: 'helps prevent blood clots', how: 'taken daily. Do not stop without talking to your cardiologist.' },
  heparin: { use: 'prevents blood clots', how: 'given in the hospital and monitored with blood tests.' },
  metoprolol: { use: 'slows your heart rate and lowers blood pressure', how: 'taken as directed. Do not stop suddenly.' },
  amlodipine: { use: 'relaxes your blood vessels to lower blood pressure', how: 'taken once a day. Mild ankle swelling can occur.' },
  losartan: { use: 'lowers blood pressure and protects your kidneys', how: 'taken once a day.' },
  hydrochlorothiazide: { use: 'a water pill that lowers blood pressure', how: 'taken in the morning so it does not affect your sleep.' },
  furosemide: { use: 'a water pill that removes extra fluid', how: 'taken as directed. Track your weight as your team advises.' },
  warfarin: { use: 'thins your blood to prevent clots', how: 'needs regular blood tests and a steady diet of leafy greens.' },
  gabapentin: { use: 'helps with nerve related pain', how: 'increased slowly. May cause drowsiness at first.' },
  omeprazole: { use: 'reduces stomach acid', how: 'taken before a meal.' },
  albuterol: { use: 'opens your airways to help you breathe', how: 'used as a rescue inhaler when you feel short of breath.' },
  prednisone: { use: 'reduces inflammation', how: 'taken exactly as scheduled and tapered, never stopped abruptly.' },
}

export const CPT_LABELS: Record<string, string> = {
  '80061': 'Lipid panel',
  '93458': 'Cardiac catheterization with coronary angiography',
  '27447': 'Total knee arthroplasty',
  '80048': 'Basic metabolic panel',
  '93000': 'Electrocardiogram, complete',
  '99214': 'Office visit, established patient, moderate complexity',
  '99213': 'Office visit, established patient, low complexity',
}

export const CPT_PRICE: Record<string, number> = {
  '80061': 95,
  '93458': 3400,
  '27447': 34000,
  '80048': 60,
  '93000': 120,
  '99214': 185,
  '99213': 130,
}

// Lab result plain-language meanings, keyed by the LAB_VALUE entity text.
export const LAB_MEANING: Record<string, string> = {
  A1C: 'a three month average of your blood sugar. Lower numbers mean better control.',
  LDL: 'the harmful cholesterol. Bringing it down lowers your risk of heart problems.',
  HDL: 'the protective cholesterol. Higher numbers are generally better.',
  'Blood pressure': 'the force in your arteries. Your team wants it in a healthy range.',
  Troponin: 'a blood test that shows whether your heart muscle was stressed.',
  BMI: 'a measure of body weight relative to height, used to gauge health risk.',
  EKG: 'a tracing of your heart’s electrical activity.',
  eGFR: 'an estimate of how well your kidneys are filtering.',
  Creatinine: 'a blood marker your team uses to check kidney function.',
}

export const icdKey = (code: string) => code.replace('.', '').toUpperCase()
export const fmt$ = (n: number) => '$' + Math.round(n).toLocaleString('en-US')

// ── Illustrative coverage estimate (typical commercial PPO) ──────────────────
export interface CoverageEstimate {
  lines: string[]
  allowed: number
  patientLow: number
  patientHigh: number
  medMonthly: number
  services: { code: string; label: string; price: number; patient: number }[]
}

export function estimateCoverage(ex: ExtractionResult): CoverageEstimate {
  const lines: string[] = []
  const services: CoverageEstimate['services'] = []
  let allowed = 0
  let patient = 0
  const coins = 0.2 // plan pays 80% after deductible (illustrative commercial PPO)
  for (const c of ex.cpt) {
    const price = CPT_PRICE[c.code] ?? 150
    allowed += price
    const you = Math.round(price * coins)
    patient += you
    const label = CPT_LABELS[c.code] || `service ${c.code}`
    services.push({ code: c.code, label, price, patient: you })
    lines.push(`${label}: estimated allowed amount ${fmt$(price)}. A typical plan pays about 80% after your deductible, leaving roughly ${fmt$(you)} to you.`)
  }
  const medCount = ex.entities.filter((e) => e.type === 'MEDICATION').length
  const medMonthly = medCount * 10
  if (medCount) {
    lines.push(`${medCount} prescription${medCount > 1 ? 's' : ''}: generics like these usually sit in the lowest copay tier, often $5 to $15 each per month.`)
    patient += medMonthly
  }
  if (!lines.length) lines.push('This encounter is mostly an office visit, which is typically covered with a standard copay.')
  return {
    lines,
    allowed,
    patientLow: Math.round(patient * 0.6),
    patientHigh: Math.round(patient * 1.4),
    medMonthly,
    services,
  }
}
