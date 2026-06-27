// ── FHIR R4 to clinical note adapter (interoperability, scaling item 1) ───────
// Turns a FHIR Bundle into the plain note text Synthure's pipeline ingests, so
// the API can accept a real FHIR payload instead of only pasted text. Covers the
// common US Core resources a SMART on FHIR app would pull from an EHR.

/* eslint-disable @typescript-eslint/no-explicit-any */

export interface FhirBundle {
  resourceType?: string
  entry?: { resource?: any }[]
}

function codeableText(cc: any): string | undefined {
  if (!cc) return undefined
  if (cc.text) return cc.text
  const c = cc.coding?.[0]
  return c?.display || c?.code
}

function codingOf(cc: any, system: RegExp): string | undefined {
  return (cc?.coding || []).find((c: any) => system.test(c.system || ''))?.code
}

export function fhirBundleToNote(bundle: FhirBundle): string {
  const resources = (bundle?.entry || []).map((e) => e?.resource).filter(Boolean) as any[]
  const by = (t: string) => resources.filter((r) => r.resourceType === t)
  const lines: string[] = []

  // Free text note bodies (DocumentReference attachments).
  for (const dr of by('DocumentReference')) {
    for (const c of dr.content || []) {
      const data = c.attachment?.data
      if (typeof data === 'string') {
        try { lines.push(Buffer.from(data, 'base64').toString('utf8')) } catch { /* ignore */ }
      } else if (c.attachment?.text) {
        lines.push(c.attachment.text)
      }
    }
  }

  const conditions = by('Condition')
    .map((r) => {
      const label = codeableText(r.code)
      const icd = codingOf(r.code, /icd-?10/i)
      return label ? (icd ? `${label} (${icd})` : label) : undefined
    })
    .filter(Boolean)
  if (conditions.length) lines.push(`Diagnoses: ${conditions.join(', ')}.`)

  const meds = [...by('MedicationRequest'), ...by('MedicationStatement')]
    .map((r) => codeableText(r.medicationCodeableConcept))
    .filter(Boolean)
  if (meds.length) lines.push(`Medications: ${meds.join(', ')}.`)

  const procs = [...by('Procedure'), ...by('ServiceRequest')]
    .map((r) => {
      const label = codeableText(r.code)
      const cpt = codingOf(r.code, /cpt|hcpcs/i)
      return label ? (cpt ? `${label} (CPT ${cpt})` : label) : undefined
    })
    .filter(Boolean)
  if (procs.length) lines.push(`Procedures: ${procs.join(', ')}.`)

  const obs = by('Observation')
    .map((r) => {
      const label = codeableText(r.code)
      const v = r.valueQuantity
        ? `${r.valueQuantity.value} ${r.valueQuantity.unit || ''}`.trim()
        : codeableText(r.valueCodeableConcept)
      return label ? (v ? `${label} ${v}` : label) : undefined
    })
    .filter(Boolean)
  if (obs.length) lines.push(`Observations: ${obs.join(', ')}.`)

  return lines.join('\n').trim()
}
