alter table style_knowledge
add column if not exists category_tags text[] not null default '{}';

create index if not exists style_knowledge_category_tags_idx
on style_knowledge
using gin (category_tags);
