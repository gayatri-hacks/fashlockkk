alter table editorial_articles add column if not exists research_sources jsonb not null default '[]'::jsonb;
alter table editorial_articles add column if not exists research_generated_at timestamp;
alter table editorial_articles add column if not exists research_model text;

