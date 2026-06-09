create table if not exists style_profiles (
  id uuid primary key default gen_random_uuid(),
  session_id text unique not null,
  gender text,
  body_type text,
  skin_tone text,
  skin_undertone text,
  lifestyle text[],
  style_personality text[],
  colour_palette text[],
  budget_range text,
  avoids text[],
  favourite_pieces text,
  onboarding_complete boolean default false,
  created_at timestamp default now(),
  updated_at timestamp default now()
);

create index if not exists style_profiles_session_id_idx
on style_profiles (session_id);
