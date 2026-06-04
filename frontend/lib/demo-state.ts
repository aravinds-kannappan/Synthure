// All portals now read live data from the backend API after authentication.
// This file is kept solely to supply the sample clinical note in the Navigator form.
// The DemoEncounter type, writeDemoEncounter, readDemoEncounter, and useDemoEncounter
// have been removed — portal content is no longer driven by localStorage.

export const SAMPLE_NOTE = `Patient: Maria Santos, 58F, DOB: 1966-03-12
MRN: 00847291 | Insurance: BlueCross PPO | PCP: Dr. Sarah Chen

Chief Complaint: Productive cough × 5 days, fever to 38.8°C, progressively worsening dyspnea on exertion.

Past Medical History:
• Type 2 diabetes mellitus (E11.9) — A1C 7.8% at last visit (3 months ago)
• Essential hypertension (I10) — controlled on lisinopril 10mg QD
• No prior hospitalizations. No known drug allergies.

Physical Examination:
Hemodynamically stable. HR 96 bpm (mildly tachycardic), BP 138/84 mmHg, RR 20/min, Temp 38.6°C, SpO2 95% on room air.
Pulmonary auscultation revealed focal inspiratory crackles and diminished breath sounds within the right lower posterior lung field, suggestive of localized alveolar involvement.

Laboratory:
• WBC 13.2 × 10³/µL with neutrophilic predominance (leukocytosis)
• CRP elevated at 84 mg/L (normal < 5)
• ESR 68 mm/hr (elevated)
• Blood glucose 186 mg/dL (above goal)
• BMP otherwise within normal limits

Imaging:
Chest radiography revealed patchy right basilar airspace opacification consistent with lobar consolidation.

Assessment & Plan:
1. Community-acquired pneumonia (J18.9) — right lower lobe. Moderate severity.
   → Amoxicillin-clavulanate 875mg PO BID × 7 days

2. Type 2 diabetes mellitus (E11.9) — suboptimally controlled.
   → Continue metformin 1000mg BID. Monitor glucose q6h during illness.

3. Essential hypertension (I10) — continue lisinopril 10mg QD.

Follow-up: 7–10 days with repeat chest radiograph.

CPT: 99214 (Office visit, moderate complexity)
ICD-10: J18.9, E11.9, I10`
