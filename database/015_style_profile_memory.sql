alter table style_profiles
add column if not exists user_id uuid references auth.users(id),
add column if not exists vibe text,
add column if not exists colours_that_glow text[],
add column if not exists colours_to_avoid text[],
add column if not exists camilles_take text,
add column if not exists current_outfit_read text;

create index if not exists style_profiles_user_id_idx
on style_profiles (user_id);

alter table style_interactions
add column if not exists user_id uuid references auth.users(id);

create index if not exists style_interactions_user_id_idx
on style_interactions (user_id);
