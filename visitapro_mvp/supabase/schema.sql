-- VisitaPro schema. Execute no SQL Editor do teu projeto Supabase.
create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  created_at timestamptz not null default now()
);

create table if not exists public.clients (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  zone text not null check (zone in ('Norte', 'Sul/Ilhas')),
  address text,
  phone text,
  email text,
  notes text,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now()
);

create table if not exists public.visit_schedules (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  frequency text not null check (frequency in ('weekly', 'fortnightly', 'monthly')),
  last_visit_date date,
  next_due_date date,
  notes text,
  created_at timestamptz not null default now(),
  unique(client_id, user_id)
);

create table if not exists public.visits (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  visit_date date not null,
  notes text,
  created_at timestamptz not null default now()
);

create index if not exists clients_name_idx on public.clients (lower(name));
create index if not exists clients_zone_idx on public.clients (zone);
create index if not exists schedules_user_due_idx on public.visit_schedules (user_id, next_due_date);
create index if not exists visits_client_date_idx on public.visits (client_id, visit_date desc);

alter table public.profiles enable row level security;
alter table public.clients enable row level security;
alter table public.visit_schedules enable row level security;
alter table public.visits enable row level security;

-- Create a profile automatically for every newly registered account.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, coalesce(new.raw_user_meta_data->>'display_name', split_part(new.email, '@', 1)))
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute procedure public.handle_new_user();

create policy "Authenticated users can read profiles"
on public.profiles for select to authenticated using (true);
create policy "Users can update their own profile"
on public.profiles for update to authenticated using (auth.uid() = id) with check (auth.uid() = id);

-- Shared directory: all authenticated users can read and add clients.
create policy "Authenticated users can read clients"
on public.clients for select to authenticated using (true);
create policy "Authenticated users can add clients"
on public.clients for insert to authenticated with check (auth.uid() = created_by);
create policy "Authenticated users can update clients"
on public.clients for update to authenticated using (true) with check (true);

-- Each user's schedule is private.
create policy "Users can read own schedules"
on public.visit_schedules for select to authenticated using (auth.uid() = user_id);
create policy "Users can add own schedules"
on public.visit_schedules for insert to authenticated with check (auth.uid() = user_id);
create policy "Users can update own schedules"
on public.visit_schedules for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "Users can delete own schedules"
on public.visit_schedules for delete to authenticated using (auth.uid() = user_id);

-- Visit history is shared with the team; inserts are attributed to the signed-in user.
create policy "Authenticated users can read visit history"
on public.visits for select to authenticated using (true);
create policy "Users can add own visits"
on public.visits for insert to authenticated with check (auth.uid() = user_id);
create policy "Users can update own visits"
on public.visits for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "Users can delete own visits"
on public.visits for delete to authenticated using (auth.uid() = user_id);
