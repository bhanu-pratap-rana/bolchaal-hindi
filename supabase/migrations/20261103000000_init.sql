-- Bolchaal Hindi: initial schema. Audio bytes live in Storage; Postgres keeps metadata and cues.
create type public.line_gender as enum ('m','f','neutral','learner');
create type public.audio_source as enum ('tts','human');
create type public.audio_kind as enum ('line','scene','adhoc');

create table public.voices (
  id text primary key,                         -- 'piper-pratham', 'parler-divya'
  provider text not null, model text not null,
  gender text not null check (gender in ('m','f')),
  language text not null default 'hi-IN',
  is_generated boolean not null default true,
  licence text not null, commercial_ok boolean not null default false, attribution text
);

create table public.lessons (
  id text primary key, day_no int not null unique,
  title_hi text not null, title_en text not null,
  status text not null default 'draft' check (status in ('draft','review','published')),
  sort int not null
);

create table public.audio_assets (
  id uuid primary key default gen_random_uuid(),
  cache_key text not null unique,              -- sha256(voice, settings, normalised text) or of the stitched PCM
  kind public.audio_kind not null default 'line',
  voice_id text references public.voices,
  source public.audio_source not null default 'tts',
  storage_path text not null,                  -- 'tts/male_1/0130264c265beaab.mp3' or 'scenes/scene-d07s3-m-....mp3'
  mime text not null default 'audio/mpeg', bytes int, duration_ms int not null,
  settings jsonb not null default '{}', created_at timestamptz not null default now()
);

create table public.scenes (
  id text primary key,
  lesson_id text not null references public.lessons on delete cascade,
  sort int not null, title_hi text not null, title_en text not null, situation_en text
);

-- One stitched audio file per scene per learner variant (m = male tourist, f = female tourist).
create table public.scene_audio (
  scene_id text not null references public.scenes on delete cascade,
  variant text not null check (variant in ('m','f')),
  audio_id uuid not null references public.audio_assets,
  duration_ms int not null,
  primary key (scene_id, variant)
);

create table public.roles (
  id uuid primary key default gen_random_uuid(),
  lesson_id text not null references public.lessons on delete cascade,
  key text not null,                           -- 'traveller', 'waiter'
  name_hi text not null, name_en text not null,
  is_learner boolean not null default false,
  grammatical_gender public.line_gender not null,
  voice_m text not null references public.voices, voice_f text not null references public.voices,
  unique (lesson_id, key)
);

create table public.dialogue_lines (
  id text primary key,
  scene_id text not null references public.scenes on delete cascade,
  sort int not null, role_id uuid not null references public.roles,
  text_hi text not null, text_roman text not null, text_en text not null,
  text_hi_f text, text_roman_f text,          -- feminine-learner variant, when the wording changes
  reviewed_by text, reviewed_at timestamptz
);

-- Cue times of each line inside each scene_audio file.
create table public.line_cues (
  line_id text not null references public.dialogue_lines on delete cascade,
  variant text not null check (variant in ('m','f')),
  clip_id uuid references public.audio_assets,
  start_ms int not null, end_ms int not null,
  primary key (line_id, variant)
);

create table public.profiles (
  id uuid primary key references auth.users on delete cascade,
  display_name text, learner_variant text not null default 'm' check (learner_variant in ('m','f')),
  support_language text not null default 'en', created_at timestamptz not null default now()
);

create table public.learner_progress (
  user_id uuid not null references auth.users on delete cascade,
  scene_id text not null references public.scenes on delete cascade,
  heard_at timestamptz, best_check_score int, checks_taken int not null default 0,
  primary key (user_id, scene_id)
);

-- ---------- Row-level security ----------
alter table public.voices enable row level security;
alter table public.lessons enable row level security;
alter table public.audio_assets enable row level security;
alter table public.scenes enable row level security;
alter table public.scene_audio enable row level security;
alter table public.roles enable row level security;
alter table public.dialogue_lines enable row level security;
alter table public.line_cues enable row level security;
alter table public.profiles enable row level security;
alter table public.learner_progress enable row level security;

create policy "voices are public" on public.voices for select to anon, authenticated using (true);
create policy "audio metadata is public" on public.audio_assets for select to anon, authenticated using (true);
create policy "published lessons are readable" on public.lessons for select to anon, authenticated
  using (status = 'published');
create policy "scenes of published lessons" on public.scenes for select to anon, authenticated
  using (exists (select 1 from public.lessons l where l.id = lesson_id and l.status = 'published'));
create policy "scene audio of published lessons" on public.scene_audio for select to anon, authenticated
  using (exists (select 1 from public.scenes s join public.lessons l on l.id = s.lesson_id
                 where s.id = scene_id and l.status = 'published'));
create policy "roles of published lessons" on public.roles for select to anon, authenticated
  using (exists (select 1 from public.lessons l where l.id = lesson_id and l.status = 'published'));
create policy "lines of published lessons" on public.dialogue_lines for select to anon, authenticated
  using (exists (select 1 from public.scenes s join public.lessons l on l.id = s.lesson_id
                 where s.id = scene_id and l.status = 'published'));
create policy "cues of published lines" on public.line_cues for select to anon, authenticated
  using (exists (select 1 from public.dialogue_lines d join public.scenes s on s.id = d.scene_id
                 join public.lessons l on l.id = s.lesson_id where d.id = line_id and l.status = 'published'));

create policy "read own profile" on public.profiles for select to authenticated using ((select auth.uid()) = id);
create policy "insert own profile" on public.profiles for insert to authenticated with check ((select auth.uid()) = id);
create policy "update own profile" on public.profiles for update to authenticated
  using ((select auth.uid()) = id) with check ((select auth.uid()) = id);

create policy "read own progress" on public.learner_progress for select to authenticated
  using ((select auth.uid()) = user_id);
create policy "insert own progress" on public.learner_progress for insert to authenticated
  with check ((select auth.uid()) = user_id);
create policy "update own progress" on public.learner_progress for update to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

-- Public audio bucket (served through Supabase's CDN). Writes only with the secret key.
insert into storage.buckets (id, name, public) values ('lesson-audio', 'lesson-audio', true)
  on conflict (id) do nothing;
