-- Bucket público para grabaciones de llamadas (subida vía API con service role)
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'voice-call-recordings',
  'voice-call-recordings',
  true,
  52428800,
  array['audio/webm', 'audio/wav', 'audio/x-wav', 'audio/ogg', 'audio/mpeg', 'audio/mp4']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "voice_recordings_public_read" on storage.objects;
drop policy if exists "voice_recordings_service_insert" on storage.objects;
drop policy if exists "voice_recordings_service_delete" on storage.objects;

create policy "voice_recordings_public_read" on storage.objects
  for select using (bucket_id = 'voice-call-recordings');

create policy "voice_recordings_service_insert" on storage.objects
  for insert with check (bucket_id = 'voice-call-recordings');

create policy "voice_recordings_service_delete" on storage.objects
  for delete using (bucket_id = 'voice-call-recordings');
