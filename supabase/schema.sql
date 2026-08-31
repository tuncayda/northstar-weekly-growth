create table if not exists public.reviews (
  user_id uuid not null references auth.users(id) on delete cascade,
  week_id text not null,
  reviewed_at timestamptz not null default now(),
  week_label text not null,
  scores jsonb not null default '{}'::jsonb,
  notes jsonb not null default '{}'::jsonb,
  overall numeric not null check (overall between 1 and 10),
  primary key (user_id, week_id)
);

create table if not exists public.review_drafts (
  user_id uuid primary key references auth.users(id) on delete cascade,
  week_id text not null,
  current_index integer not null default 0 check (current_index between 0 and 12),
  scores jsonb not null default '{}'::jsonb,
  notes jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

create table if not exists public.weekly_insights (
  user_id uuid not null references auth.users(id) on delete cascade,
  week_id text not null,
  created_at timestamptz not null default now(),
  source_reviewed_at timestamptz not null,
  review_count integer not null check (review_count between 2 and 8),
  focus_skill_id text not null,
  pattern text not null,
  actions jsonb not null default '[]'::jsonb,
  reflection_question text not null,
  encouragement text not null,
  primary key (user_id, week_id)
);

alter table public.reviews enable row level security;
alter table public.review_drafts enable row level security;
alter table public.weekly_insights enable row level security;

revoke all on table public.reviews from anon;
revoke all on table public.review_drafts from anon;
revoke all on table public.weekly_insights from anon;
grant select, insert, update, delete on table public.reviews to authenticated;
grant select, insert, update, delete on table public.review_drafts to authenticated;
grant select, insert, update, delete on table public.weekly_insights to authenticated;

drop policy if exists "Users manage their own reviews" on public.reviews;
create policy "Users manage their own reviews"
on public.reviews for all to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

drop policy if exists "Users manage their own draft" on public.review_drafts;
create policy "Users manage their own draft"
on public.review_drafts for all to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

drop policy if exists "Users manage their own insights" on public.weekly_insights;
create policy "Users manage their own insights"
on public.weekly_insights for all to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);
