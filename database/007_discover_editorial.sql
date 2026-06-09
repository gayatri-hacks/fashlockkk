create extension if not exists "pgcrypto";

create table if not exists hero_videos (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  subtitle text not null,
  video_url text not null,
  poster_image_url text not null,
  cta_text text not null,
  cta_link text not null,
  is_active boolean not null default false,
  active_from timestamp,
  active_to timestamp
);

create table if not exists editorial_articles (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  subtitle text not null,
  slug text unique not null,
  cover_image_url text not null,
  category text not null,
  tags text[] not null default '{}',
  archetypes text[] not null default '{}',
  reading_time integer not null default 3,
  author text not null,
  published_date timestamp not null default now(),
  mood text,
  era text,
  culture_reference text,
  content text,
  is_featured boolean not null default false
);

create table if not exists micro_documentaries (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text not null,
  video_url text not null,
  thumbnail_url text not null,
  duration_seconds integer not null default 60,
  category text not null,
  tags text[] not null default '{}',
  archetypes text[] not null default '{}'
);

create table if not exists style_quiz_questions (
  id uuid primary key default gen_random_uuid(),
  question text not null,
  options jsonb not null
);

create table if not exists user_style_profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique,
  primary_archetype text not null,
  secondary_archetype text,
  preferred_colors text[] not null default '{}',
  preferred_eras text[] not null default '{}',
  preferred_moods text[] not null default '{}',
  created_at timestamp not null default now()
);

create table if not exists style_mood_weekly (
  id uuid primary key default gen_random_uuid(),
  week_start date not null,
  title text not null,
  description text not null,
  colors text[] not null default '{}',
  textures text[] not null default '{}',
  keywords text[] not null default '{}',
  image_board_urls text[] not null default '{}',
  linked_articles uuid[] not null default '{}'
);

create table if not exists personalization_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  article_id uuid,
  video_id uuid,
  event_type text not null,
  created_at timestamp not null default now()
);

insert into hero_videos (
  id, title, subtitle, video_url, poster_image_url, cta_text, cta_link, is_active, active_from, active_to
) values (
  '11111111-1111-4111-8111-111111111111',
  'Enter the world of style before it becomes obvious.',
  'A cinematic edit of garments, cultures, moods, and personalities shaping how people dress now.',
  'https://videos.pexels.com/video-files/853848/853848-hd_1920_1080_25fps.mp4',
  'https://images.unsplash.com/photo-1515886657613-9f3515b0c78f?auto=format&fit=crop&w=1800&q=85',
  'Start with your style',
  '#style-quiz',
  true,
  now() - interval '1 day',
  null
) on conflict (id) do update set
  title = excluded.title,
  subtitle = excluded.subtitle,
  video_url = excluded.video_url,
  poster_image_url = excluded.poster_image_url,
  cta_text = excluded.cta_text,
  cta_link = excluded.cta_link,
  is_active = excluded.is_active,
  active_from = excluded.active_from,
  active_to = excluded.active_to;

insert into editorial_articles (
  id, title, subtitle, slug, cover_image_url, category, tags, archetypes, reading_time, author,
  published_date, mood, era, culture_reference, content, is_featured
) values
('22222222-0001-4222-8222-222222222222','How Style Defined the 70s Without Asking Permission','Flared denim, suede, disco shine, and anti-establishment dressing became a whole body language.','how-style-defined-the-70s','https://images.unsplash.com/photo-1529139574466-a303027c1d8b?auto=format&fit=crop&w=1200&q=85','history',array['70s','denim','silhouette'],array['Bohemian','Romantic','Street Muse'],5,'Fashion Trend Desk','2026-05-20','free-spirited','1970s','Disco, counterculture, and vintage denim','The 70s turned clothing into attitude: flare, suede, fringe, shine, and softness all moved together.',true),
('22222222-0002-4222-8222-222222222222','The Psychology of Dressing Like You Have Somewhere to Be','Why structured clothes change posture, presence, and how seriously you take yourself.','psychology-of-structured-style','https://images.unsplash.com/photo-1507679799987-c73779587ccf?auto=format&fit=crop&w=1200&q=85','psychology',array['tailoring','confidence','identity'],array['Classic','Minimalist'],6,'Fashion Trend Desk','2026-05-23','composed','modern','Power dressing and contemporary tailoring','Structure is not stiffness. A clean shoulder, long line, or sharp trouser can make the body feel more deliberate.',true),
('22222222-0003-4222-8222-222222222222','Romantic Dressing Is Not Softness. It Is Drama.','Lace, drape, shine, and skin become emotional tools when they are styled with intention.','romantic-dressing-is-drama','https://images.unsplash.com/photo-1503342217505-b0a15ec3261c?auto=format&fit=crop&w=1200&q=85','psychology',array['romantic','drape','texture'],array['Romantic','Bohemian'],4,'Fashion Trend Desk','2026-05-24','cinematic','modern','Film costume and red-carpet styling','Romantic style works when it has tension: softness against structure, shine against matte, exposure against mystery.',false),
('22222222-0004-4222-8222-222222222222','Streetwear Became the New Social Uniform','Sneakers, cargos, oversized layers, and graphic codes turned comfort into identity.','streetwear-social-uniform','https://images.unsplash.com/photo-1552346154-21d32810aba3?auto=format&fit=crop&w=1200&q=85','culture',array['streetwear','sneakers','youth'],array['Street Muse','Avant-Garde'],5,'Fashion Trend Desk','2026-05-22','kinetic','2010s-now','Hip-hop, skate, K-pop, and drop culture','Streetwear made ease aspirational. Its power is not only silhouette; it is belonging.',true),
('22222222-0005-4222-8222-222222222222','Minimalism Is a Discipline, Not an Absence','The fewer pieces you use, the more fit, fabric, and proportion matter.','minimalism-is-discipline','https://images.unsplash.com/photo-1529139574466-a303027c1d8b?auto=format&fit=crop&w=1200&q=85','style',array['minimalism','proportion','wardrobe'],array['Minimalist','Classic'],3,'Fashion Trend Desk','2026-05-21','quiet','modern','90s minimalism and quiet luxury','Minimalism becomes interesting when the silhouette is exact and the material carries the emotion.',false),
('22222222-0006-4222-8222-222222222222','Bohemian Style Works Best When It Avoids Costume','Texture, print, craft, and looseness need one modern anchor to feel current.','bohemian-without-costume','https://images.unsplash.com/photo-1544441893-675973e31985?auto=format&fit=crop&w=1200&q=85','style',array['bohemian','print','craft'],array['Bohemian','Romantic'],4,'Fashion Trend Desk','2026-05-19','earthy','1970s-now','Festival style, craft markets, and vintage wardrobes','Bohemian style needs grounding: a clean shoe, sharp bag, or single-color base can keep texture from becoming clutter.',false),
('22222222-0007-4222-8222-222222222222','Avant-Garde Dressing Starts With One Wrong Shape','A strange sleeve, hard line, asymmetry, or sculptural volume can transform an ordinary outfit.','avant-garde-one-wrong-shape','https://images.unsplash.com/photo-1496747611176-843222e1e57c?auto=format&fit=crop&w=1200&q=85','style',array['avant-garde','shape','runway'],array['Avant-Garde','Minimalist'],5,'Fashion Trend Desk','2026-05-18','architectural','runway','Japanese design, Antwerp designers, and sculptural runway codes','Avant-garde style is not random. It works when one thing breaks the expected line and everything else supports it.',false),
('22222222-0008-4222-8222-222222222222','Why the Sari Never Stops Becoming New','A drape is not a fixed garment. It is a system for personal authorship.','sari-never-stops-becoming-new','https://images.unsplash.com/photo-1617019114583-affb34d1b3cd?auto=format&fit=crop&w=1200&q=85','history',array['sari','india','drape'],array['Romantic','Classic','Bohemian'],6,'Fashion Trend Desk','2026-05-17','expressive','timeless','Indian draping traditions and contemporary styling','The sari survives because it is not one silhouette. It lets the wearer make the final edit.',true),
('22222222-0009-4222-8222-222222222222','The Trench Coat Is a Weather System','Why one coat keeps returning whenever fashion wants utility to look intelligent.','trench-coat-weather-system','https://images.unsplash.com/photo-1593032465175-481ac7f401a0?auto=format&fit=crop&w=1200&q=85','history',array['trench','outerwear','classic'],array['Classic','Minimalist'],4,'Fashion Trend Desk','2026-05-16','polished','20th century','Military outerwear, film noir, and city dressing','The trench works because it gives ordinary clothes a frame.',false),
('22222222-0010-4222-8222-222222222222','How Denim Learned to Signal Rebellion and Routine','The same fabric can be workwear, sex appeal, uniform, luxury, or rebellion depending on cut.','denim-rebellion-routine','https://images.unsplash.com/photo-1542272604-787c3835535d?auto=format&fit=crop&w=1200&q=85','culture',array['denim','jeans','workwear'],array['Street Muse','Classic','Bohemian'],5,'Fashion Trend Desk','2026-05-15','worn-in','1950s-now','Workwear, youth rebellion, and designer denim','Denim is never neutral. Wash, rise, and fit decide the story.',false),
('22222222-0011-4222-8222-222222222222','Clothes Change When You Dress for a Future Self','The psychology of using style as rehearsal for the person you are trying to become.','dress-for-future-self','https://images.unsplash.com/photo-1483985988355-763728e1935b?auto=format&fit=crop&w=1200&q=85','psychology',array['identity','confidence','transformation'],array['Romantic','Classic','Avant-Garde'],7,'Fashion Trend Desk','2026-05-14','transformative','modern','Enclothed cognition and personal styling','A wardrobe can become a rehearsal space. The strongest outfits often point slightly ahead of who you are today.',true),
('22222222-0012-4222-8222-222222222222','Why Colour Feels Personal Before It Looks Stylish','Palette is memory, mood, skin, season, and identity before it is trend.','colour-feels-personal','https://images.unsplash.com/photo-1509631179647-0177331693ae?auto=format&fit=crop&w=1200&q=85','psychology',array['colour','mood','personal style'],array['Romantic','Bohemian','Minimalist'],4,'Fashion Trend Desk','2026-05-13','intimate','modern','Colour psychology and personal styling','The colors people repeat are rarely random. They are often emotional shortcuts.',false)
on conflict (id) do nothing;

insert into micro_documentaries (
  id, title, description, video_url, thumbnail_url, duration_seconds, category, tags, archetypes
) values
('33333333-0001-4333-8333-333333333333','How Chanel Changed Workwear','A 60-second edit on black, jersey, and clothes that let women move.','https://videos.pexels.com/video-files/853848/853848-hd_1920_1080_25fps.mp4','https://images.unsplash.com/photo-1515886657613-9f3515b0c78f?auto=format&fit=crop&w=900&q=85',60,'history',array['chanel','workwear','black dress'],array['Minimalist','Classic']),
('33333333-0002-4333-8333-333333333333','The Sneaker Becomes a Passport','How comfort became social currency.','https://videos.pexels.com/video-files/853848/853848-hd_1920_1080_25fps.mp4','https://images.unsplash.com/photo-1552346154-21d32810aba3?auto=format&fit=crop&w=900&q=85',60,'culture',array['sneakers','streetwear'],array['Street Muse','Avant-Garde']),
('33333333-0003-4333-8333-333333333333','The Sari Is a System','One cloth, infinite silhouettes.','https://videos.pexels.com/video-files/853848/853848-hd_1920_1080_25fps.mp4','https://images.unsplash.com/photo-1617019114583-affb34d1b3cd?auto=format&fit=crop&w=900&q=85',60,'history',array['sari','drape','india'],array['Romantic','Bohemian']),
('33333333-0004-4333-8333-333333333333','Minimalism Under Pressure','Why quiet clothes need perfect proportion.','https://videos.pexels.com/video-files/853848/853848-hd_1920_1080_25fps.mp4','https://images.unsplash.com/photo-1529139574466-a303027c1d8b?auto=format&fit=crop&w=900&q=85',60,'style',array['minimalism','proportion'],array['Minimalist','Classic']),
('33333333-0005-4333-8333-333333333333','The Return of Bohemian Texture','Fringe, print, handwork, and the danger of costume.','https://videos.pexels.com/video-files/853848/853848-hd_1920_1080_25fps.mp4','https://images.unsplash.com/photo-1544441893-675973e31985?auto=format&fit=crop&w=900&q=85',60,'style',array['bohemian','texture'],array['Bohemian','Romantic']),
('33333333-0006-4333-8333-333333333333','Why Blazers Still Work','Structure without shouting.','https://videos.pexels.com/video-files/853848/853848-hd_1920_1080_25fps.mp4','https://images.unsplash.com/photo-1507679799987-c73779587ccf?auto=format&fit=crop&w=900&q=85',60,'psychology',array['blazer','tailoring'],array['Classic','Minimalist']),
('33333333-0007-4333-8333-333333333333','When Weird Shapes Become Beautiful','A beginner guide to avant-garde dressing.','https://videos.pexels.com/video-files/853848/853848-hd_1920_1080_25fps.mp4','https://images.unsplash.com/photo-1496747611176-843222e1e57c?auto=format&fit=crop&w=900&q=85',60,'style',array['avant-garde','shape'],array['Avant-Garde']),
('33333333-0008-4333-8333-333333333333','Color as Personality','Why your palette reveals more than your taste.','https://videos.pexels.com/video-files/853848/853848-hd_1920_1080_25fps.mp4','https://images.unsplash.com/photo-1509631179647-0177331693ae?auto=format&fit=crop&w=900&q=85',60,'psychology',array['color','mood'],array['Romantic','Bohemian','Minimalist'])
on conflict (id) do nothing;

insert into style_quiz_questions (id, question, options) values
('44444444-0001-4444-8444-444444444444','What makes you save an outfit instantly?','[{"label":"Soft drape and emotion","archetype":"Romantic","colors":["rose","ivory"],"moods":["dreamy"]},{"label":"Clean lines and restraint","archetype":"Minimalist","colors":["black","bone"],"moods":["quiet"]},{"label":"A shape nobody else would wear","archetype":"Avant-Garde","colors":["black","chrome"],"moods":["strange"]}]'::jsonb),
('44444444-0002-4444-8444-444444444444','Which detail feels most like you?','[{"label":"A perfect blazer shoulder","archetype":"Classic","eras":["1990s"],"moods":["polished"]},{"label":"Oversized denim and sneakers","archetype":"Street Muse","eras":["2010s"],"moods":["kinetic"]},{"label":"Print, texture, and movement","archetype":"Bohemian","eras":["1970s"],"moods":["earthy"]}]'::jsonb),
('44444444-0003-4444-8444-444444444444','Pick the fashion world you want to enter.','[{"label":"Paris after dark","archetype":"Romantic","colors":["black","wine"],"moods":["cinematic"]},{"label":"Tokyo concept store","archetype":"Avant-Garde","colors":["black","silver"],"moods":["architectural"]},{"label":"Seoul street corner","archetype":"Street Muse","colors":["charcoal","indigo"],"moods":["youthful"]}]'::jsonb),
('44444444-0004-4444-8444-444444444444','Your ideal outfit changes your...','[{"label":"Presence","archetype":"Classic","moods":["composed"]},{"label":"Mood","archetype":"Romantic","moods":["expressive"]},{"label":"Silhouette","archetype":"Avant-Garde","moods":["sculptural"]}]'::jsonb),
('44444444-0005-4444-8444-444444444444','Choose a texture.','[{"label":"Raw denim","archetype":"Street Muse","moods":["worn-in"]},{"label":"Crisp cotton","archetype":"Minimalist","moods":["clean"]},{"label":"Embroidered cotton","archetype":"Bohemian","moods":["handmade"]}]'::jsonb),
('44444444-0006-4444-8444-444444444444','Which era keeps pulling you in?','[{"label":"The 70s","archetype":"Bohemian","eras":["1970s"]},{"label":"The 90s","archetype":"Minimalist","eras":["1990s"]},{"label":"The future","archetype":"Avant-Garde","eras":["future"]}]'::jsonb),
('44444444-0007-4444-8444-444444444444','What do you want clothes to do first?','[{"label":"Make me feel softer","archetype":"Romantic"},{"label":"Make me look sharper","archetype":"Classic"},{"label":"Make me look current","archetype":"Street Muse"}]'::jsonb),
('44444444-0008-4444-8444-444444444444','Pick a closet rule.','[{"label":"Less, but better","archetype":"Minimalist"},{"label":"One dramatic piece","archetype":"Avant-Garde"},{"label":"Always add texture","archetype":"Bohemian"}]'::jsonb)
on conflict (id) do nothing;

insert into style_mood_weekly (
  id, week_start, title, description, colors, textures, keywords, image_board_urls, linked_articles
) values (
  '55555555-5555-4555-8555-555555555555',
  date_trunc('week', current_date)::date,
  'Soft structure, city romance',
  'The week is about contrast: tailored shapes softened by drape, blush against black, denim against shine.',
  array['#0f0f10','#f4e7df','#9f6a79','#d8c7b4','#6f7582'],
  array['brushed cotton','silk sheen','washed denim','soft leather'],
  array['structured romance','quiet drama','city softness','modern sari'],
  array[
    'https://images.unsplash.com/photo-1515886657613-9f3515b0c78f?auto=format&fit=crop&w=900&q=85',
    'https://images.unsplash.com/photo-1503342217505-b0a15ec3261c?auto=format&fit=crop&w=900&q=85',
    'https://images.unsplash.com/photo-1552346154-21d32810aba3?auto=format&fit=crop&w=900&q=85',
    'https://images.unsplash.com/photo-1617019114583-affb34d1b3cd?auto=format&fit=crop&w=900&q=85'
  ],
  array['22222222-0002-4222-8222-222222222222'::uuid,'22222222-0003-4222-8222-222222222222'::uuid]
) on conflict (id) do update set
  week_start = excluded.week_start,
  title = excluded.title,
  description = excluded.description,
  colors = excluded.colors,
  textures = excluded.textures,
  keywords = excluded.keywords,
  image_board_urls = excluded.image_board_urls,
  linked_articles = excluded.linked_articles;
