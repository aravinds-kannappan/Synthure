-- ── Features: action_queue, discharge_records, prior_auth_requests

-- Action queue — Tier 1 autonomous actions pending execution
create table if not exists action_queue (
    id              uuid primary key default uuid_generate_v4(),
    org_id          uuid not null references orgs(id) on delete cascade,
    patient_id      uuid references patients(id) on delete set null,
    encounter_id    uuid,
    action_type     text not null,
    tier            text not null check (tier in ('1','2','3')),
    status          text not null default 'pending'
                        check (status in ('pending','executing','completed','failed','cancelled')),
    payload         jsonb not null default '{}',
    result          jsonb,
    error           text,
    approved_by     text,
    approved_at     timestamptz,
    executed_at     timestamptz,
    created_at      timestamptz not null default now()
);

create index if not exists idx_action_queue_org    on action_queue(org_id);
create index if not exists idx_action_queue_status on action_queue(status);
create index if not exists idx_action_queue_tier   on action_queue(tier, status);

-- Encounters — root record for each Navigator run
create table if not exists encounters (
    id              uuid primary key default uuid_generate_v4(),
    org_id          uuid not null references orgs(id) on delete cascade,
    patient_id      uuid references patients(id) on delete set null,
    physician_id    uuid references users(id) on delete set null,
    encounter_date  timestamptz not null default now(),
    chief_complaint text,
    raw_note        text,
    jargon_output   jsonb,
    insurance_output jsonb,
    claim_output    jsonb,
    readmission_risk numeric(5,2),
    status          text default 'active',
    created_at      timestamptz not null default now()
);

create index if not exists idx_encounters_patient on encounters(patient_id);
create index if not exists idx_encounters_org    on encounters(org_id);

-- Discharge education records
create table if not exists discharge_records (
    id                  uuid primary key default uuid_generate_v4(),
    encounter_id        uuid not null references encounters(id) on delete cascade,
    patient_id          uuid references patients(id) on delete set null,
    org_id              uuid not null references orgs(id) on delete cascade,
    instructions        text,
    condition_materials jsonb default '[]',
    medication_guides   jsonb default '[]',
    readability_score   numeric(5,2),
    language            text default 'en',
    sent_via_sms        boolean default false,
    sent_at             timestamptz,
    created_at          timestamptz not null default now()
);
