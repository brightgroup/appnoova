alter table public.test_phone_numbers
  add column if not exists active boolean not null default true,
  add column if not exists created_by_name text,
  add column if not exists updated_by_name text;
