-- PROFILES
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text unique not null,
  display_name text not null,
  avatar_url text,
  status text default 'Hey there! I am using Texto.',
  last_seen timestamptz default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.profiles enable row level security;

create policy "profiles_select_authenticated" on public.profiles
  for select to authenticated using (true);
create policy "profiles_update_own" on public.profiles
  for update to authenticated using (auth.uid() = id);
create policy "profiles_insert_own" on public.profiles
  for insert to authenticated with check (auth.uid() = id);

-- CONVERSATIONS
create table public.conversations (
  id uuid primary key default gen_random_uuid(),
  is_group boolean not null default false,
  name text,
  created_by uuid references auth.users(id) on delete set null,
  last_message_at timestamptz default now(),
  created_at timestamptz not null default now()
);
alter table public.conversations enable row level security;

-- PARTICIPANTS
create table public.conversation_participants (
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  joined_at timestamptz not null default now(),
  primary key (conversation_id, user_id)
);
alter table public.conversation_participants enable row level security;

-- Security definer helper to avoid recursive RLS
create or replace function public.is_participant(_conv uuid, _user uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.conversation_participants
    where conversation_id = _conv and user_id = _user
  )
$$;

create policy "conversations_select_participant" on public.conversations
  for select to authenticated
  using (public.is_participant(id, auth.uid()));
create policy "conversations_insert_authenticated" on public.conversations
  for insert to authenticated with check (auth.uid() = created_by);
create policy "conversations_update_participant" on public.conversations
  for update to authenticated
  using (public.is_participant(id, auth.uid()));

create policy "participants_select_own_conversations" on public.conversation_participants
  for select to authenticated
  using (public.is_participant(conversation_id, auth.uid()));
create policy "participants_insert_self_or_creator" on public.conversation_participants
  for insert to authenticated
  with check (
    auth.uid() = user_id
    or exists (
      select 1 from public.conversations c
      where c.id = conversation_id and c.created_by = auth.uid()
    )
  );
create policy "participants_delete_self" on public.conversation_participants
  for delete to authenticated using (auth.uid() = user_id);

-- MESSAGES
create table public.messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  sender_id uuid not null references auth.users(id) on delete cascade,
  content text,
  media_url text,
  media_type text,
  media_name text,
  edited_at timestamptz,
  deleted_for_everyone boolean not null default false,
  created_at timestamptz not null default now()
);
alter table public.messages enable row level security;
create index messages_conv_created_idx on public.messages(conversation_id, created_at desc);

create policy "messages_select_participant" on public.messages
  for select to authenticated
  using (public.is_participant(conversation_id, auth.uid()));
create policy "messages_insert_participant_self" on public.messages
  for insert to authenticated
  with check (auth.uid() = sender_id and public.is_participant(conversation_id, auth.uid()));
create policy "messages_update_own" on public.messages
  for update to authenticated using (auth.uid() = sender_id);
create policy "messages_delete_own" on public.messages
  for delete to authenticated using (auth.uid() = sender_id);

-- "Delete for me"
create table public.message_deletions (
  message_id uuid not null references public.messages(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  primary key (message_id, user_id)
);
alter table public.message_deletions enable row level security;
create policy "deletions_select_own" on public.message_deletions
  for select to authenticated using (auth.uid() = user_id);
create policy "deletions_insert_own" on public.message_deletions
  for insert to authenticated with check (auth.uid() = user_id);

-- Updated_at trigger
create or replace function public.tg_set_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;
create trigger profiles_updated_at before update on public.profiles
  for each row execute function public.tg_set_updated_at();

-- Bump conversation last_message_at
create or replace function public.tg_bump_conversation()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  update public.conversations set last_message_at = now() where id = new.conversation_id;
  return new;
end $$;
create trigger messages_bump_conv after insert on public.messages
  for each row execute function public.tg_bump_conversation();

-- Auto-create profile on signup
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  base_username text;
  final_username text;
  i int := 0;
begin
  base_username := coalesce(
    new.raw_user_meta_data->>'username',
    split_part(new.email, '@', 1)
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
    coalesce(new.raw_user_meta_data->>'display_name', base_username)
  );
  return new;
end $$;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- REALTIME
alter publication supabase_realtime add table public.messages;
alter publication supabase_realtime add table public.conversations;
alter publication supabase_realtime add table public.conversation_participants;
alter table public.messages replica identity full;
alter table public.conversations replica identity full;

-- STORAGE BUCKETS
insert into storage.buckets (id, name, public) values ('avatars', 'avatars', true)
  on conflict (id) do nothing;
insert into storage.buckets (id, name, public) values ('chat-media', 'chat-media', false)
  on conflict (id) do nothing;

-- Avatar policies (path: <user_id>/...)
create policy "avatars_public_read" on storage.objects
  for select using (bucket_id = 'avatars');
create policy "avatars_user_insert" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'avatars' and auth.uid()::text = (storage.foldername(name))[1]);
create policy "avatars_user_update" on storage.objects
  for update to authenticated
  using (bucket_id = 'avatars' and auth.uid()::text = (storage.foldername(name))[1]);
create policy "avatars_user_delete" on storage.objects
  for delete to authenticated
  using (bucket_id = 'avatars' and auth.uid()::text = (storage.foldername(name))[1]);

-- Chat media policies (path: <conversation_id>/<user_id>/<filename>)
create policy "chat_media_participant_read" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'chat-media'
    and public.is_participant(((storage.foldername(name))[1])::uuid, auth.uid())
  );
create policy "chat_media_participant_insert" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'chat-media'
    and auth.uid()::text = (storage.foldername(name))[2]
    and public.is_participant(((storage.foldername(name))[1])::uuid, auth.uid())
  );