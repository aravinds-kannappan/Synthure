-- ── MLE: embeddings, model_versions, evals, feature_stores, ab_experiments, prompt_versions

-- Vector embeddings for RAG
create table if not exists embeddings (
    id          uuid primary key default uuid_generate_v4(),
    doc_id      text not null,
    doc_type    text not null,
    content     text not null,
    embedding   vector(768),           -- HuggingFace all-MiniLM-L6-v2
    metadata    jsonb default '{}',
    created_at  timestamptz not null default now()
);

create index if not exists idx_embeddings_doc_type on embeddings(doc_type);
create index if not exists idx_embeddings_vector
    on embeddings using ivfflat (embedding vector_cosine_ops) with (lists = 100);

-- ML model version registry
create table if not exists model_versions (
    id              uuid primary key default uuid_generate_v4(),
    model_name      text not null,
    version         text not null,
    artifact_path   text,
    metrics         jsonb default '{}',   -- f1, auc, precision, recall
    is_active       boolean not null default false,
    trained_at      timestamptz,
    training_rows   integer,
    created_at      timestamptz not null default now()
);

create unique index if not exists idx_model_versions_active
    on model_versions(model_name) where is_active = true;

-- Model evaluation results (nightly harness)
create table if not exists model_evals (
    id              uuid primary key default uuid_generate_v4(),
    model_name      text not null,
    model_version   text not null,
    eval_type       text not null,       -- 'classification', 'llm_judge'
    metrics         jsonb not null,
    dataset_size    integer,
    notes           text,
    created_at      timestamptz not null default now()
);

-- Patient + claim feature store
create table if not exists feature_store (
    id              uuid primary key default uuid_generate_v4(),
    entity_type     text not null check (entity_type in ('patient', 'claim')),
    entity_id       uuid not null,
    org_id          uuid references orgs(id) on delete cascade,
    features        jsonb not null,
    computed_at     timestamptz not null default now(),
    expires_at      timestamptz
);

create unique index if not exists idx_feature_store_entity on feature_store(entity_type, entity_id);

-- A/B experiment tracking
create table if not exists ab_experiments (
    id              uuid primary key default uuid_generate_v4(),
    name            text not null unique,
    description     text,
    variants        jsonb not null default '["control","treatment"]',
    traffic_split   numeric(5,2) default 50.0,
    is_active       boolean not null default true,
    started_at      timestamptz default now(),
    ended_at        timestamptz,
    results         jsonb
);

-- Prompt version registry (DB-backed prompt versioning)
create table if not exists prompt_versions (
    id              uuid primary key default uuid_generate_v4(),
    prompt_name     text not null,
    version         integer not null,
    system_prompt   text,
    user_template   text,
    tool_schema     jsonb,
    is_active       boolean not null default false,
    notes           text,
    created_at      timestamptz not null default now()
);

create unique index if not exists idx_prompt_versions_active
    on prompt_versions(prompt_name) where is_active = true;
