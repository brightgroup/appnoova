-- Assets públicos del micrositio (logo, favicon)
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'microsite-assets',
  'microsite-assets',
  true,
  5242880,
  array['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml', 'image/x-icon', 'image/vnd.microsoft.icon']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "microsite_assets_public_read" on storage.objects;
drop policy if exists "microsite_assets_service_insert" on storage.objects;
drop policy if exists "microsite_assets_service_delete" on storage.objects;

create policy "microsite_assets_public_read" on storage.objects
  for select using (bucket_id = 'microsite-assets');

create policy "microsite_assets_service_insert" on storage.objects
  for insert with check (bucket_id = 'microsite-assets');

create policy "microsite_assets_service_delete" on storage.objects
  for delete using (bucket_id = 'microsite-assets');
