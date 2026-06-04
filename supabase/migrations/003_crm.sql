-- ── CRM: patients, insurance, conditions, medications, providers, payers

-- Patients (CRM root record)
create table if not exists patients (
    id              uuid primary key default uuid_generate_v4(),
    org_id          uuid not null references orgs(id) on delete cascade,
    user_id         uuid references users(id) on delete set null,  -- linked portal account
    mrn             text,
    first_name      text not null,
    last_name       text not null,
    date_of_birth   date,
    sex             text,
    email           text,
    phone           text,
    address         jsonb default '{}',
    primary_language text default 'en',
    created_at      timestamptz not null default now(),
    updated_at      timestamptz not null default now()
);

-- Insurance coverage layers per patient
create table if not exists patient_insurance (
    id              uuid primary key default uuid_generate_v4(),
    patient_id      uuid not null references patients(id) on delete cascade,
    org_id          uuid not null references orgs(id) on delete cascade,
    payer_id        uuid,
    plan_name       text not null,
    member_id       text,
    group_number    text,
    coverage_type   text check (coverage_type in ('primary', 'secondary', 'tertiary')),
    effective_date  date,
    termination_date date,
    deductible      numeric(10,2),
    deductible_met  numeric(10,2) default 0,
    oop_max         numeric(10,2),
    oop_met         numeric(10,2) default 0,
    copay           numeric(10,2),
    coinsurance     numeric(5,2),
    ocr_raw         jsonb,
    created_at      timestamptz not null default now(),
    updated_at      timestamptz not null default now()
);

-- Conditions per patient
create table if not exists patient_conditions (
    id          uuid primary key default uuid_generate_v4(),
    patient_id  uuid not null references patients(id) on delete cascade,
    org_id      uuid not null references orgs(id) on delete cascade,
    icd10_code  text not null,
    description text,
    status      text default 'active' check (status in ('active', 'resolved', 'chronic')),
    onset_date  date,
    noted_by    text,
    created_at  timestamptz not null default now()
);

-- Medications per patient
create table if not exists patient_medications (
    id          uuid primary key default uuid_generate_v4(),
    patient_id  uuid not null references patients(id) on delete cascade,
    org_id      uuid not null references orgs(id) on delete cascade,
    rxcui       text,
    name        text not null,
    dose        text,
    frequency   text,
    route       text,
    status      text default 'active' check (status in ('active', 'discontinued', 'hold')),
    prescribed_by text,
    prescribed_date date,
    created_at  timestamptz not null default now()
);

-- Providers (NPI registry)
create table if not exists providers (
    id                  uuid primary key default uuid_generate_v4(),
    org_id              uuid not null references orgs(id) on delete cascade,
    npi                 text not null,
    first_name          text,
    last_name           text not null,
    specialty           text,
    taxonomy_code       text,
    network_status      text default 'in-network' check (network_status in ('in-network', 'out-of-network')),
    credentialing_status text default 'active',
    license_expiration  date,
    dea_expiration      date,
    email               text,
    phone               text,
    created_at          timestamptz not null default now(),
    updated_at          timestamptz not null default now()
);

-- Payers
create table if not exists payers (
    id                  uuid primary key default uuid_generate_v4(),
    org_id              uuid not null references orgs(id) on delete cascade,
    name                text not null,
    edi_payer_id        text,
    pa_phone            text,
    portal_url          text,
    timely_filing_days  integer default 90,
    contract_renewal_date date,
    -- Live scorecard (updated as claims resolve)
    denial_rate         numeric(5,2) default 0,
    avg_days_to_pay     numeric(6,2) default 0,
    appeal_win_rate     numeric(5,2) default 0,
    pa_approval_rate    numeric(5,2) default 0,
    created_at          timestamptz not null default now(),
    updated_at          timestamptz not null default now()
);

-- Patient documents
create table if not exists patient_documents (
    id                  uuid primary key default uuid_generate_v4(),
    patient_id          uuid not null references patients(id) on delete cascade,
    org_id              uuid not null references orgs(id) on delete cascade,
    document_type       text not null,
    file_url            text,
    file_name           text,
    ai_classification   text,
    ai_extracted_data   jsonb,
    visible_to_patient  boolean default false,
    processed_at        timestamptz,
    created_at          timestamptz not null default now()
);

-- Communications log
create table if not exists communications (
    id          uuid primary key default uuid_generate_v4(),
    patient_id  uuid references patients(id) on delete set null,
    org_id      uuid not null references orgs(id) on delete cascade,
    channel     text not null check (channel in ('sms', 'email', 'portal', 'fax', 'phone')),
    direction   text not null check (direction in ('outbound', 'inbound')),
    subject     text,
    body        text,
    status      text default 'sent',
    sent_by     text,
    ai_generated boolean default false,
    created_at  timestamptz not null default now()
);

-- Patient consents for autonomous actions
create table if not exists patient_consents (
    id              uuid primary key default uuid_generate_v4(),
    patient_id      uuid not null references patients(id) on delete cascade,
    org_id          uuid not null references orgs(id) on delete cascade,
    consent_type    text not null,
    consented       boolean not null default false,
    consented_at    timestamptz,
    revoked_at      timestamptz,
    ip_address      text,
    created_at      timestamptz not null default now()
);

-- ── Indexes
create index if not exists idx_patients_org           on patients(org_id);
create index if not exists idx_patient_insurance_pat  on patient_insurance(patient_id);
create index if not exists idx_conditions_patient     on patient_conditions(patient_id);
create index if not exists idx_medications_patient    on patient_medications(patient_id);
create index if not exists idx_providers_org          on providers(org_id);
create index if not exists idx_payers_org             on payers(org_id);
create index if not exists idx_documents_patient      on patient_documents(patient_id);
create index if not exists idx_communications_patient on communications(patient_id);

-- updated_at triggers
create trigger trg_patients_updated before update on patients
    for each row execute function set_updated_at();
create trigger trg_providers_updated before update on providers
    for each row execute function set_updated_at();
create trigger trg_payers_updated before update on payers
    for each row execute function set_updated_at();
