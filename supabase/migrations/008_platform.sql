-- ── Platform: webhooks, api_keys, billing

create table if not exists webhooks (
    id              uuid primary key default uuid_generate_v4(),
    org_id          uuid not null references orgs(id) on delete cascade,
    url             text not null,
    events          text[] not null default '{}',
    secret          text not null,
    is_active       boolean not null default true,
    last_triggered  timestamptz,
    failure_count   integer default 0,
    created_at      timestamptz not null default now()
);

create table if not exists api_keys (
    id              uuid primary key default uuid_generate_v4(),
    org_id          uuid not null references orgs(id) on delete cascade,
    name            text not null,
    key_hash        text not null unique,
    key_prefix      text not null,
    scopes          text[] not null default '{}',
    rate_limit      integer default 1000,
    last_used_at    timestamptz,
    expires_at      timestamptz,
    revoked_at      timestamptz,
    created_at      timestamptz not null default now()
);

create table if not exists billing_usage (
    id              uuid primary key default uuid_generate_v4(),
    org_id          uuid not null references orgs(id) on delete cascade,
    period_start    timestamptz not null,
    period_end      timestamptz not null,
    portal_role     text not null,
    api_calls       integer default 0,
    ai_tokens       integer default 0,
    stripe_item_id  text,
    created_at      timestamptz not null default now()
);
