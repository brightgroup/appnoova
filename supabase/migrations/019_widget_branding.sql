-- Logo y favicon propios del widget (independientes de Mi Link)
alter table public.broker_web_widgets
  add column if not exists logo_url text,
  add column if not exists favicon_url text;
