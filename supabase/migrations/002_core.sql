-- ── Core tables: orgs, users, notifications, care_events, audit_logs, realtime_events

-- Organizations (multi-tenant root)
create table if not exists orgs (
    id          uuid primary key default uuid_generate_v4(),
    name        text not null,
    type        text not null check (type in ('hospital', 'employer', 'practice', 'platform')),
    plan        text not null default 'trial',
    settings    jsonb not null default '{}',
    created_at  timestamptz not null default now(),
    updated_at  timestamptz not null default now()
);

-- Users — one row per Supabase Auth user
create table if not exists users (
    id          uuid primary key default uuid_generate_v4(),
    auth_id     uuid unique,
    org_id      uuid references orgs(id) on delete cascade,
    email       text unique not null,
    name        text not null,
    role        text not null check (role in ('patient', 'physician', 'hospital_admin', 'employer_admin', 'provider')),
    avatar_url  text,
    settings    jsonb not null default '{}',
    created_at  timestamptz not null default now(),
    updated_at  timestamptz not null default now()
);

-- Notifications (cross-portal, role-aware)
create table if not exists notifications (
    id              uuid primary key default uuid_generate_v4(),
    user_id         uuid references users(id) on delete cascade,
    org_id          uuid references orgs(id) on delete cascade,
    type            text not null,
    title           text not null,
    body            text,
    portal          text not null check (portal in ('patient', 'physician', 'hospital', 'employer')),
    tier            text check (tier in ('1', '2', '3')),
    action_type     text,
    action_payload  jsonb,
    read_at         timestamptz,
    dismissed_at    timestamptz,
    created_at      timestamptz not null default now()
);

-- Care events — patient journey timeline
create table if not exists care_events (
    id                  uuid primary key default uuid_generate_v4(),
    patient_id          uuid,
    org_id              uuid references orgs(id) on delete cascade,
    event_type          text not null,
    title               text not null,
    detail              text,
    actor               text,
    portal_visibility   text[] not null default array['patient','physician','hospital'],
    ai_generated        boolean not null default false,
    tier                text,
    metadata            jsonb not null default '{}',
    created_at          timestamptz not null default now()
);

-- HIPAA audit logs — every PHI access recorded
create table if not exists audit_logs (
    id              uuid primary key default uuid_generate_v4(),
    org_id          uuid references orgs(id) on delete cascade,
    user_id         uuid references users(id) on delete set null,
    resource_type   text not null,
    resource_id     text not null,
    action          text not null,
    ip_address      text,
    detail          text,
    created_at      timestamptz not null default now()
);

-- Realtime events — triggers Supabase Realtime broadcasts to portal clients
create table if not exists realtime_events (
    id          uuid primary key default uuid_generate_v4(),
    org_id      uuid,
    patient_id  uuid,
    portal      text not null,
    event_type  text not null,
    payload     jsonb,
    created_at  timestamptz not null default now()
);

-- ── Indexes
create index if not exists idx_users_org          on users(org_id);
create index if not exists idx_users_role         on users(role);
create index if not exists idx_notifications_user on notifications(user_id);
create index if not exists idx_notifications_org  on notifications(org_id, portal);
create index if not exists idx_care_events_patient on care_events(patient_id);
create index if not exists idx_care_events_org    on care_events(org_id);
create index if not exists idx_audit_logs_org     on audit_logs(org_id);
create index if not exists idx_realtime_events    on realtime_events(org_id, portal);

-- ── updated_at trigger
create or replace function set_updated_at()
returns trigger language plpgsql as $$
begin
    new.updated_at = now();
    return new;
end;
$$;

create trigger trg_orgs_updated before update on orgs
    for each row execute function set_updated_at();
create trigger trg_users_updated before update on users
    for each row execute function set_updated_at();
