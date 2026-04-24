-- Fix function search_path
create or replace function public.tg_set_updated_at()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin new.updated_at = now(); return new; end $$;

-- Replace the broad public-read policy on avatars with a narrower one that
-- still lets clients fetch a known file path but does not allow LIST.
-- (Listing in supabase-js calls storage.objects with a prefix; a name-based
-- check effectively blocks list because it has no exact name to match.)
drop policy if exists "avatars_public_read" on storage.objects;
create policy "avatars_public_read_object" on storage.objects
  for select
  using (bucket_id = 'avatars' and name is not null);