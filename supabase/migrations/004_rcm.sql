-- ── RCM: claims, eligibility, prior_auth, denials, appeals, payments, collections

-- Claims lifecycle state machine
create table if not exists claims (
    id                  uuid primary key default uuid_generate_v4(),
    org_id              uuid not null references orgs(id) on delete cascade,
    patient_id          uuid references patients(id) on delete set null,
    payer_id            uuid references payers(id) on delete set null,
    provider_npi        text not null,
    procedure_code      text not null,
    diagnosis_codes     text[] not null default '{}',
    amount              numeric(10,2) not null,
    status              text not null default 'draft'
                            check (status in ('draft','validated','submitted','acknowledged',
                                              'adjudicated','paid','denied','appealed','voided')),
    complexity_score    integer default 0 check (complexity_score between 0 and 100),
    route               text default 'standard' check (route in ('standard','frontier')),
    denial_risk         numeric(5,2),          -- ML pre-submission score 0-100
    ai_decision         jsonb,                 -- full adjudication JSON from Navigator
    flags               jsonb default '{}',    -- prior_denial, out_of_network, experimental
    submitted_at        timestamptz,
    acknowledged_at     timestamptz,
    adjudicated_at      timestamptz,
    paid_at             timestamptz,
    paid_amount         numeric(10,2),
    patient_responsibility numeric(10,2),
    created_at          timestamptz not null default now(),
    updated_at          timestamptz not null default now()
);

-- Claim status transition log
create table if not exists claim_transitions (
    id          uuid primary key default uuid_generate_v4(),
    claim_id    uuid not null references claims(id) on delete cascade,
    org_id      uuid not null,
    from_status text,
    to_status   text not null,
    actor       text,
    note        text,
    created_at  timestamptz not null default now()
);

-- Eligibility verifications
create table if not exists eligibility_checks (
    id              uuid primary key default uuid_generate_v4(),
    patient_id      uuid references patients(id) on delete set null,
    org_id          uuid not null references orgs(id) on delete cascade,
    payer_id        uuid references payers(id) on delete set null,
    insurance_id    uuid references patient_insurance(id) on delete set null,
    status          text not null check (status in ('active','inactive','pending','unknown')),
    deductible_met  numeric(10,2),
    oop_met         numeric(10,2),
    copay           numeric(10,2),
    coinsurance     numeric(5,2),
    raw_response    jsonb,
    checked_at      timestamptz not null default now(),
    created_at      timestamptz not null default now()
);

-- Prior authorizations
create table if not exists prior_auths (
    id                  uuid primary key default uuid_generate_v4(),
    claim_id            uuid references claims(id) on delete set null,
    patient_id          uuid references patients(id) on delete set null,
    org_id              uuid not null references orgs(id) on delete cascade,
    payer_id            uuid references payers(id) on delete set null,
    procedure_code      text not null,
    diagnosis_codes     text[] not null default '{}',
    status              text not null default 'pending'
                            check (status in ('pending','approved','denied','expired','cancelled')),
    auth_number         text,
    approval_score      numeric(5,2),          -- ML approval prediction
    submitted_at        timestamptz,
    approved_at         timestamptz,
    expiration_date     date,
    payer_form          jsonb,                 -- auto-filled per payer format
    created_at          timestamptz not null default now(),
    updated_at          timestamptz not null default now()
);

-- Denial events
create table if not exists denial_events (
    id              uuid primary key default uuid_generate_v4(),
    claim_id        uuid not null references claims(id) on delete cascade,
    org_id          uuid not null references orgs(id) on delete cascade,
    carc_code       text,                  -- Claim Adjustment Reason Code
    rarc_code       text,                  -- Remittance Advice Remark Code
    denial_reason   text,
    appeal_deadline date,
    appeal_status   text default 'pending' check (appeal_status in ('pending','filed','won','lost','withdrawn')),
    amount_at_stake numeric(10,2),
    created_at      timestamptz not null default now()
);

-- Appeal letters
create table if not exists appeals (
    id              uuid primary key default uuid_generate_v4(),
    denial_id       uuid not null references denial_events(id) on delete cascade,
    claim_id        uuid not null references claims(id) on delete cascade,
    org_id          uuid not null references orgs(id) on delete cascade,
    letter_text     text,                  -- AI-generated appeal letter
    filed_at        timestamptz,
    outcome         text check (outcome in ('won','lost','pending','withdrawn')),
    outcome_amount  numeric(10,2),
    created_at      timestamptz not null default now()
);

-- Payment postings
create table if not exists payments (
    id                  uuid primary key default uuid_generate_v4(),
    claim_id            uuid not null references claims(id) on delete cascade,
    org_id              uuid not null references orgs(id) on delete cascade,
    payer_id            uuid references payers(id) on delete set null,
    payment_amount      numeric(10,2) not null,
    contractual_adj     numeric(10,2) default 0,  -- expected write-off
    other_adj           numeric(10,2) default 0,  -- unexpected adjustment
    patient_resp        numeric(10,2) default 0,
    underpayment_flag   boolean default false,
    era_reference       text,
    posted_at           timestamptz not null default now(),
    created_at          timestamptz not null default now()
);

-- Collections workflow
create table if not exists collections (
    id              uuid primary key default uuid_generate_v4(),
    claim_id        uuid not null references claims(id) on delete cascade,
    patient_id      uuid references patients(id) on delete set null,
    org_id          uuid not null references orgs(id) on delete cascade,
    stage           text not null default 'statement_1'
                        check (stage in ('statement_1','statement_2','agency_referral','write_off')),
    balance_due     numeric(10,2) not null,
    last_action_at  timestamptz,
    next_action_at  timestamptz,
    created_at      timestamptz not null default now(),
    updated_at      timestamptz not null default now()
);

-- ── Indexes
create index if not exists idx_claims_org         on claims(org_id);
create index if not exists idx_claims_patient      on claims(patient_id);
create index if not exists idx_claims_status       on claims(status);
create index if not exists idx_transitions_claim   on claim_transitions(claim_id);
create index if not exists idx_eligibility_patient on eligibility_checks(patient_id);
create index if not exists idx_pa_claim            on prior_auths(claim_id);
create index if not exists idx_denials_claim       on denial_events(claim_id);
create index if not exists idx_appeals_denial      on appeals(denial_id);
create index if not exists idx_payments_claim      on payments(claim_id);
create index if not exists idx_collections_claim   on collections(claim_id);

-- updated_at triggers
create trigger trg_claims_updated before update on claims
    for each row execute function set_updated_at();
create trigger trg_pa_updated before update on prior_auths
    for each row execute function set_updated_at();
create trigger trg_collections_updated before update on collections
    for each row execute function set_updated_at();

-- AR aging view
create or replace view ar_aging as
select
    c.org_id,
    c.id as claim_id,
    c.patient_id,
    c.amount,
    c.status,
    c.submitted_at,
    extract(day from now() - coalesce(c.submitted_at, c.created_at)) as days_outstanding,
    case
        when extract(day from now() - coalesce(c.submitted_at, c.created_at)) <= 30 then '0-30'
        when extract(day from now() - coalesce(c.submitted_at, c.created_at)) <= 60 then '31-60'
        when extract(day from now() - coalesce(c.submitted_at, c.created_at)) <= 90 then '61-90'
        else '90+'
    end as aging_bucket
from claims c
where c.status not in ('paid', 'voided', 'denied');
