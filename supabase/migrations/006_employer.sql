-- ── Employer: employer_groups, benefit_plans, enrollments, cobra, aca_reports

create table if not exists employer_groups (
    id              uuid primary key default uuid_generate_v4(),
    org_id          uuid not null references orgs(id) on delete cascade,
    name            text not null,
    ein             text,
    industry        text,
    employee_count  integer default 0,
    state           text,
    created_at      timestamptz not null default now(),
    updated_at      timestamptz not null default now()
);

create table if not exists benefit_plans (
    id                  uuid primary key default uuid_generate_v4(),
    employer_id         uuid not null references employer_groups(id) on delete cascade,
    org_id              uuid not null references orgs(id) on delete cascade,
    plan_name           text not null,
    plan_type           text check (plan_type in ('medical','dental','vision','fsa','hsa','life')),
    carrier             text,
    plan_year           integer not null,
    premium_employee    numeric(10,2),
    premium_employer    numeric(10,2),
    deductible          numeric(10,2),
    oop_max             numeric(10,2),
    is_active           boolean default true,
    enrollment_start    date,
    enrollment_end      date,
    created_at          timestamptz not null default now()
);

create table if not exists enrollments (
    id              uuid primary key default uuid_generate_v4(),
    employer_id     uuid not null references employer_groups(id) on delete cascade,
    plan_id         uuid not null references benefit_plans(id) on delete cascade,
    org_id          uuid not null references orgs(id) on delete cascade,
    employee_id     uuid,
    employee_email  text not null,
    employee_name   text not null,
    department      text,
    plan_year       integer not null,
    status          text not null default 'active' check (status in ('active','waived','terminated','cobra')),
    enrolled_at     timestamptz default now(),
    terminated_at   timestamptz,
    created_at      timestamptz not null default now()
);

create table if not exists cobra_events (
    id                  uuid primary key default uuid_generate_v4(),
    enrollment_id       uuid references enrollments(id) on delete set null,
    employer_id         uuid not null references employer_groups(id) on delete cascade,
    org_id              uuid not null references orgs(id) on delete cascade,
    employee_email      text not null,
    employee_name       text not null,
    qualifying_event    text not null,
    event_date          date not null,
    notice_deadline     date not null,
    election_deadline   date not null,
    notice_sent_at      timestamptz,
    elected             boolean,
    elected_at          timestamptz,
    created_at          timestamptz not null default now()
);

create table if not exists aca_reports (
    id              uuid primary key default uuid_generate_v4(),
    employer_id     uuid not null references employer_groups(id) on delete cascade,
    org_id          uuid not null references orgs(id) on delete cascade,
    report_year     integer not null,
    report_type     text not null check (report_type in ('1095-C','1094-C','ACA_summary')),
    data            jsonb not null default '{}',
    generated_at    timestamptz not null default now(),
    filed_at        timestamptz,
    created_at      timestamptz not null default now()
);

create index if not exists idx_benefit_plans_employer on benefit_plans(employer_id);
create index if not exists idx_enrollments_employer   on enrollments(employer_id);
create index if not exists idx_enrollments_plan       on enrollments(plan_id);
create index if not exists idx_cobra_events_employer  on cobra_events(employer_id);
create index if not exists idx_aca_reports_employer   on aca_reports(employer_id);

create trigger trg_employer_groups_updated before update on employer_groups
    for each row execute function set_updated_at();
