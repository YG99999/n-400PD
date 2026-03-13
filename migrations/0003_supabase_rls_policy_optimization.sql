create or replace function public.is_admin()
returns boolean
language sql
stable
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles
    where id = (select auth.uid()) and role = 'admin'
  );
$$;

drop policy if exists "profiles_select_own" on public.profiles;
create policy "profiles_select_own"
on public.profiles
for select
using ((select auth.uid()) = id or (select public.is_admin()));

drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own"
on public.profiles
for update
using ((select auth.uid()) = id or (select public.is_admin()))
with check ((select auth.uid()) = id or (select public.is_admin()));

drop policy if exists "sessions_owner_all" on public.application_sessions;
create policy "sessions_owner_all"
on public.application_sessions
for all
using ((select auth.uid()) = user_id or (select public.is_admin()))
with check ((select auth.uid()) = user_id or (select public.is_admin()));

drop policy if exists "messages_owner_all" on public.chat_messages;
create policy "messages_owner_all"
on public.chat_messages
for all
using ((select auth.uid()) = user_id or (select public.is_admin()))
with check ((select auth.uid()) = user_id or (select public.is_admin()));

drop policy if exists "payments_owner_select" on public.payments;
create policy "payments_owner_select"
on public.payments
for select
using ((select auth.uid()) = user_id or (select public.is_admin()));

drop policy if exists "documents_owner_select" on public.generated_documents;
create policy "documents_owner_select"
on public.generated_documents
for select
using ((select auth.uid()) = user_id or (select public.is_admin()));

drop policy if exists "jobs_owner_select" on public.document_jobs;
create policy "jobs_owner_select"
on public.document_jobs
for select
using ((select auth.uid()) = user_id or (select public.is_admin()));

drop policy if exists "support_owner_all" on public.support_tickets;
create policy "support_owner_all"
on public.support_tickets
for all
using ((select auth.uid()) = user_id or (select public.is_admin()))
with check ((select auth.uid()) = user_id or (select public.is_admin()));

drop policy if exists "privacy_owner_all" on public.privacy_requests;
create policy "privacy_owner_all"
on public.privacy_requests
for all
using ((select auth.uid()) = user_id or (select public.is_admin()))
with check ((select auth.uid()) = user_id or (select public.is_admin()));

drop policy if exists "audit_owner_select" on public.audit_events;
create policy "audit_owner_select"
on public.audit_events
for select
using ((select auth.uid()) = user_id or (select public.is_admin()));

drop policy if exists "stripe_events_admin_select" on public.stripe_events;
create policy "stripe_events_admin_select"
on public.stripe_events
for select
using ((select public.is_admin()));
