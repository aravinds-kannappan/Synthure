-- ── Clinical notes, AI pipeline results, and relationship tables
-- Every physician note submission is persisted here.
-- All portal views (patient, physician, hospital, employer) read from these tables.

-- One row per physician visit / note submission
CREATE TABLE IF NOT EXISTS clinical_notes (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    patient_id      UUID NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
    physician_id    UUID REFERENCES users(id) ON DELETE SET NULL,
    org_id          UUID NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
    note_text       TEXT NOT NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- AI pipeline outputs stored per note, per pipeline type.
-- Queried by all four portals based on their permission scope.
CREATE TABLE IF NOT EXISTS ai_pipeline_results (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    clinical_note_id    UUID NOT NULL REFERENCES clinical_notes(id) ON DELETE CASCADE,
    patient_id          UUID NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
    org_id              UUID NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
    pipeline_type       TEXT NOT NULL CHECK (pipeline_type IN ('jargon', 'insurance', 'claims')),
    result_json         JSONB NOT NULL DEFAULT '{}',
    model_used          TEXT,
    duration_ms         INTEGER,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Physician-to-patient assignment (many-to-many).
-- Created automatically when a physician submits their first note for a patient.
CREATE TABLE IF NOT EXISTS physician_patients (
    physician_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    patient_id      UUID NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
    org_id          UUID NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
    assigned_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (physician_id, patient_id)
);

-- Employer-to-hospital (org) association.
-- Employers see aggregated data from all linked hospitals.
CREATE TABLE IF NOT EXISTS employer_hospitals (
    employer_id     UUID NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
    hospital_id     UUID NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (employer_id, hospital_id)
);

-- ── Indexes
CREATE INDEX IF NOT EXISTS idx_clinical_notes_patient     ON clinical_notes(patient_id);
CREATE INDEX IF NOT EXISTS idx_clinical_notes_physician   ON clinical_notes(physician_id);
CREATE INDEX IF NOT EXISTS idx_clinical_notes_org         ON clinical_notes(org_id);
CREATE INDEX IF NOT EXISTS idx_pipeline_results_note      ON ai_pipeline_results(clinical_note_id);
CREATE INDEX IF NOT EXISTS idx_pipeline_results_patient   ON ai_pipeline_results(patient_id);
CREATE INDEX IF NOT EXISTS idx_pipeline_results_org       ON ai_pipeline_results(org_id);
CREATE INDEX IF NOT EXISTS idx_physician_patients_phys    ON physician_patients(physician_id);
CREATE INDEX IF NOT EXISTS idx_physician_patients_pat     ON physician_patients(patient_id);
CREATE INDEX IF NOT EXISTS idx_employer_hospitals_emp     ON employer_hospitals(employer_id);

-- updated_at trigger
CREATE TRIGGER trg_clinical_notes_updated
    BEFORE UPDATE ON clinical_notes
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
