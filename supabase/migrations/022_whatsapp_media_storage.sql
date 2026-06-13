-- Media WhatsApp (imágenes, audio, video) — bucket privado, lectura vía API con auth
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'whatsapp-media',
  'whatsapp-media',
  false,
  16777216,
  array[
    'image/jpeg', 'image/png', 'image/webp', 'image/gif',
    'audio/ogg', 'audio/mpeg', 'audio/mp4', 'audio/amr', 'audio/aac',
    'video/mp4', 'video/3gpp', 'video/quicktime',
    'application/pdf'
  ]
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "whatsapp_media_service_insert" on storage.objects;
drop policy if exists "whatsapp_media_service_read" on storage.objects;
drop policy if exists "whatsapp_media_service_delete" on storage.objects;

create policy "whatsapp_media_service_insert" on storage.objects
  for insert with check (bucket_id = 'whatsapp-media');

create policy "whatsapp_media_service_read" on storage.objects
  for select using (bucket_id = 'whatsapp-media');

create policy "whatsapp_media_service_delete" on storage.objects
  for delete using (bucket_id = 'whatsapp-media');
