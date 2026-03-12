create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null unique,
  full_name text,
  email_verified boolean not null default false,
  marketing_opt_in boolean not null default false,
  role text not null default 'user' check (role in ('user', 'admin')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.application_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  status text not null,
  current_section text not null,
  form_data jsonb not null default '{}'::jsonb,
  red_flags jsonb not null default '[]'::jsonb,
  workflow_state jsonb not null default '{}'::jsonb,
  payment_status text not null default 'none',
  pdf_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.chat_messages (
  id uuid primary key,
  session_id uuid not null references public.application_sessions(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  role text not null,
  content text not null,
  section text,
  extracted_fields jsonb,
  tool_events jsonb,
  timestamp timestamptz not null
);

create table if not exists public.payments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  session_id uuid not null references public.application_sessions(id) on delete cascade,
  amount_cents integer not null,
  status text not null,
  provider text not null,
  provider_reference text unique,
  receipt_email text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.stripe_events (
  id text primary key,
  type text not null,
  payload jsonb not null,
  processed_at timestamptz not null default now()
);

create table if not exists public.document_jobs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  session_id uuid not null references public.application_sessions(id) on delete cascade,
  trigger text not null,
  status text not null,
  error text,
  document_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.generated_documents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  session_id uuid not null references public.application_sessions(id) on delete cascade,
  job_id uuid not null references public.document_jobs(id) on delete cascade,
  kind text not null,
  status text not null,
  storage_path text,
  remote_path text,
  storage_provider text,
  download_url text,
  file_size integer,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.support_tickets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  session_id uuid references public.application_sessions(id) on delete set null,
  category text not null,
  subject text not null,
  message text not null,
  status text not null default 'open',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.privacy_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  type text not null,
  status text not null default 'requested',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.audit_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles(id) on delete set null,
  action text not null,
  target_type text not null,
  target_id text,
  metadata jsonb,
  created_at timestamptz not null default now()
);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, full_name, email_verified, created_at, updated_at)
  values (
    new.id,
    coalesce(new.email, ''),
    new.raw_user_meta_data ->> 'full_name',
    coalesce(new.email_confirmed_at is not null, false),
    now(),
    now()
  )
  on conflict (id) do update
  set
    email = excluded.email,
    full_name = coalesce(excluded.full_name, public.profiles.full_name),
    email_verified = excluded.email_verified,
    updated_at = now();
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute procedure public.handle_new_user();

drop trigger if exists set_profiles_updated_at on public.profiles;
create trigger set_profiles_updated_at before update on public.profiles for each row execute procedure public.set_updated_at();
drop trigger if exists set_application_sessions_updated_at on public.application_sessions;
create trigger set_application_sessions_updated_at before update on public.application_sessions for each row execute procedure public.set_updated_at();
drop trigger if exists set_payments_updated_at on public.payments;
create trigger set_payments_updated_at before update on public.payments for each row execute procedure public.set_updated_at();
drop trigger if exists set_document_jobs_updated_at on public.document_jobs;
create trigger set_document_jobs_updated_at before update on public.document_jobs for each row execute procedure public.set_updated_at();
drop trigger if exists set_generated_documents_updated_at on public.generated_documents;
create trigger set_generated_documents_updated_at before update on public.generated_documents for each row execute procedure public.set_updated_at();
drop trigger if exists set_support_tickets_updated_at on public.support_tickets;
create trigger set_support_tickets_updated_at before update on public.support_tickets for each row execute procedure public.set_updated_at();
drop trigger if exists set_privacy_requests_updated_at on public.privacy_requests;
create trigger set_privacy_requests_updated_at before update on public.privacy_requests for each row execute procedure public.set_updated_at();

alter table public.profiles enable row level security;
alter table public.application_sessions enable row level security;
alter table public.chat_messages enable row level security;
alter table public.payments enable row level security;
alter table public.document_jobs enable row level security;
alter table public.generated_documents enable row level security;
alter table public.support_tickets enable row level security;
alter table public.privacy_requests enable row level security;
alter table public.audit_events enable row level security;
alter table public.stripe_events enable row level security;

create or replace function public.is_admin()
returns boolean
language sql
stable
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles
    where id = auth.uid() and role = 'admin'
  );
$$;

drop policy if exists "profiles_select_own" on public.profiles;
create policy "profiles_select_own" on public.profiles for select using (auth.uid() = id or public.is_admin());
drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own" on public.profiles for update using (auth.uid() = id or public.is_admin()) with check (auth.uid() = id or public.is_admin());

drop policy if exists "sessions_owner_all" on public.application_sessions;
create policy "sessions_owner_all" on public.application_sessions for all using (auth.uid() = user_id or public.is_admin()) with check (auth.uid() = user_id or public.is_admin());
drop policy if exists "messages_owner_all" on public.chat_messages;
create policy "messages_owner_all" on public.chat_messages for all using (auth.uid() = user_id or public.is_admin()) with check (auth.uid() = user_id or public.is_admin());
drop policy if exists "payments_owner_select" on public.payments;
create policy "payments_owner_select" on public.payments for select using (auth.uid() = user_id or public.is_admin());
drop policy if exists "documents_owner_select" on public.generated_documents;
create policy "documents_owner_select" on public.generated_documents for select using (auth.uid() = user_id or public.is_admin());
drop policy if exists "jobs_owner_select" on public.document_jobs;
create policy "jobs_owner_select" on public.document_jobs for select using (auth.uid() = user_id or public.is_admin());
drop policy if exists "support_owner_all" on public.support_tickets;
create policy "support_owner_all" on public.support_tickets for all using (auth.uid() = user_id or public.is_admin()) with check (auth.uid() = user_id or public.is_admin());
drop policy if exists "privacy_owner_all" on public.privacy_requests;
create policy "privacy_owner_all" on public.privacy_requests for all using (auth.uid() = user_id or public.is_admin()) with check (auth.uid() = user_id or public.is_admin());
drop policy if exists "audit_owner_select" on public.audit_events;
create policy "audit_owner_select" on public.audit_events for select using (auth.uid() = user_id or public.is_admin());
drop policy if exists "stripe_events_admin_select" on public.stripe_events;
create policy "stripe_events_admin_select" on public.stripe_events for select using (public.is_admin());

insert into storage.buckets (id, name, public)
values ('citizenflow-documents', 'citizenflow-documents', false)
on conflict (id) do nothing;

drop policy if exists "document_bucket_owner_read" on storage.objects;
create policy "document_bucket_owner_read"
on storage.objects
for select
using (
  bucket_id = 'citizenflow-documents'
  and auth.role() = 'authenticated'
  and (storage.foldername(name))[1] = 'users'
  and (storage.foldername(name))[2] = auth.uid()::text
);

drop policy if exists "document_bucket_owner_insert" on storage.objects;
create policy "document_bucket_owner_insert"
on storage.objects
for insert
with check (
  bucket_id = 'citizenflow-documents'
  and auth.role() = 'authenticated'
  and (storage.foldername(name))[1] = 'users'
  and (storage.foldername(name))[2] = auth.uid()::text
);
