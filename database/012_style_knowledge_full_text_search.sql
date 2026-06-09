alter table style_knowledge
add column if not exists content_search tsvector
generated always as (
  to_tsvector(
    'english',
    coalesce(title, '') || ' ' || coalesce(content, '')
  )
) stored;

create index if not exists style_knowledge_search_idx
on style_knowledge
using gin (content_search);

create or replace function search_style_knowledge(
  query_text text,
  gender_filter text default 'both',
  limit_count int default 5
)
returns table (
  id uuid,
  title text,
  content text,
  source text,
  category text,
  rank real
) as $$
begin
  return query
  select
    sk.id,
    sk.title,
    sk.content,
    sk.source,
    sk.category,
    ts_rank(sk.content_search, plainto_tsquery('english', query_text)) as rank
  from style_knowledge sk
  where
    sk.content_search @@ plainto_tsquery('english', query_text)
    and (
      sk.gender = gender_filter
      or sk.gender = 'both'
      or gender_filter = 'both'
    )
  order by rank desc
  limit limit_count;
end;
$$ language plpgsql;
