-- Update handle_new_user to support phone-only signups (no email)
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $function$
declare
  base_username text;
  final_username text;
  i int := 0;
begin
  base_username := coalesce(
    new.raw_user_meta_data->>'username',
    nullif(split_part(coalesce(new.email, ''), '@', 1), ''),
    -- if phone-only, use last 6 digits of phone for a unique-ish base
    case when new.phone is not null then 'user' || right(regexp_replace(new.phone, '\D', '', 'g'), 6) else null end,
    'user'
  );
  base_username := lower(regexp_replace(base_username, '[^a-z0-9_]', '', 'gi'));
  if base_username = '' then base_username := 'user'; end if;
  final_username := base_username;
  while exists (select 1 from public.profiles where username = final_username) loop
    i := i + 1;
    final_username := base_username || i::text;
  end loop;

  insert into public.profiles (id, username, display_name)
  values (
    new.id,
    final_username,
    coalesce(
      new.raw_user_meta_data->>'display_name',
      base_username
    )
  );
  return new;
end $function$;