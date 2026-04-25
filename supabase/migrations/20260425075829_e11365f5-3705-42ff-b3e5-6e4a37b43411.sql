create table if not exists public.phone_otp_codes (
  id uuid primary key default gen_random_uuid(),
  phone text not null,
  code_hash text not null,
  attempts integer not null default 0,
  resend_count integer not null default 0,
  last_sent_at timestamptz not null default now(),
  expires_at timestamptz not null,
  consumed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists phone_otp_codes_phone_idx
  on public.phone_otp_codes (phone);

create index if not exists phone_otp_codes_phone_created_idx
  on public.phone_otp_codes (phone, created_at desc);

alter table public.phone_otp_codes enable row level security;

create policy "phone_otp_codes_no_client_access"
on public.phone_otp_codes
for all
to authenticated
using (false)
with check (false);

create policy "phone_otp_codes_no_anon_access"
on public.phone_otp_codes
for all
to anon
using (false)
with check (false);

create or replace function public.tg_validate_phone_otp_code()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.phone !~ '^\+[1-9][0-9]{7,14}$' then
    raise exception 'phone_must_be_e164';
  end if;

  if new.expires_at <= now() then
    raise exception 'otp_expiry_must_be_future';
  end if;

  if new.attempts < 0 then
    raise exception 'otp_attempts_must_be_non_negative';
  end if;

  if new.resend_count < 0 then
    raise exception 'otp_resend_count_must_be_non_negative';
  end if;

  return new;
end;
$$;

create trigger phone_otp_codes_validate
before insert or update on public.phone_otp_codes
for each row execute function public.tg_validate_phone_otp_code();

create trigger phone_otp_codes_updated_at
before update on public.phone_otp_codes
for each row execute function public.tg_set_updated_at();