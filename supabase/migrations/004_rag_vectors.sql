-- RAG vector store: semantic search over HuggingFace medical datasets

create table if not exists rag_documents (
    id          uuid primary key default uuid_generate_v4(),
    source      text not null,       -- 'icd10' | 'mtsamples' | 'augmented_notes' | 'symptoms_icd10' | 'icd10_clinical_notes' | 'transcription_instruct' | 'cms_medicare'
    doc_type    text not null,       -- 'medical_code' | 'clinical_note' | 'symptom_mapping' | 'payment_benchmark'
    external_id text,                -- original code or row idx from source dataset
    code        text,                -- ICD-10 / CPT code when applicable
    title       text,
    content     text not null,
    metadata    jsonb not null default '{}',
    embedding   vector(384),         -- all-MiniLM-L6-v2 output dimension
    created_at  timestamptz not null default now()
);

-- Unique constraint enables idempotent upserts (re-running ingest is safe)
create unique index if not exists rag_documents_source_extid_idx
    on rag_documents (source, external_id)
    where external_id is not null;

-- ANN index for cosine similarity (ivfflat; rebuild with hnsw when row count > 1M)
create index if not exists rag_documents_embedding_idx
    on rag_documents
    using ivfflat (embedding vector_cosine_ops)
    with (lists = 200);

create index if not exists rag_documents_source_idx   on rag_documents (source);
create index if not exists rag_documents_code_idx     on rag_documents (code);
create index if not exists rag_documents_doc_type_idx on rag_documents (doc_type);

-- ── Semantic similarity RPC (called by Python retriever) ─────────────────────
create or replace function match_rag_documents(
    query_embedding vector(384),
    match_count     int     default 5,
    filter_source   text    default null,
    filter_doc_type text    default null
)
returns table (
    id          uuid,
    source      text,
    doc_type    text,
    code        text,
    title       text,
    content     text,
    metadata    jsonb,
    similarity  float
)
language sql stable
as $$
    select
        id, source, doc_type, code, title, content, metadata,
        1 - (embedding <=> query_embedding) as similarity
    from rag_documents
    where
        (filter_source   is null or source   = filter_source)
        and (filter_doc_type is null or doc_type = filter_doc_type)
        and embedding is not null
    order by embedding <=> query_embedding
    limit match_count;
$$;

-- ── Corpus size helper (used by /api/health) ──────────────────────────────────
create or replace function rag_corpus_size()
returns bigint
language sql stable
as $$
    select count(*) from rag_documents where embedding is not null;
$$;
