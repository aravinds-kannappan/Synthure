-- Enable required PostgreSQL extensions
create extension if not exists "uuid-ossp";
create extension if not exists vector;      -- pgvector for RAG embeddings
create extension if not exists pg_cron;     -- nightly eval harness & corpus refresh
