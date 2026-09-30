-- 159 — Endurecimiento de seguridad (2026-09-30)
--
-- Hallazgos en producción:
--   1. 51 tablas de `public` con RLS desactivado y privilegios SELECT/UPDATE para
--      `anon`/`authenticated` → legibles/modificables con la anon key pública.
--   2. Funciones SECURITY DEFINER de facturación/ERP/dialer ejecutables por
--      `anon`/`authenticated` vía /rest/v1/rpc (p. ej. billing_admin_add_credits).
--   3. Políticas de Storage "service_*" sin `TO service_role` (aplican a todos) y
--      bucket `voice-call-recordings` público.
--
-- El servidor usa la service role (bypass de RLS), así que activar RLS no afecta
-- las rutas API. El navegador solo consulta `users` y `voice_agents` desde paneles
-- de super admin; esas lecturas quedan cubiertas por políticas de super admin.

-- ── 1. RLS en todas las tablas de public ────────────────────────────────────
do $$
declare t record;
begin
  for t in
    select c.relname
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind in ('r', 'p') and not c.relrowsecurity
  loop
    execute format('alter table public.%I enable row level security', t.relname);
  end loop;
end $$;

-- Paneles de super admin que leen desde el navegador.
drop policy if exists users_select_self on public.users;
create policy users_select_self on public.users
  for select to authenticated
  using (id = auth.uid() or public.is_platform_admin(auth.uid()));

drop policy if exists "voice_agents_select_own" on public.voice_agents;
create policy "voice_agents_select_own" on public.voice_agents
  for select to authenticated
  using (user_id = auth.uid() or public.is_super_admin(auth.uid()));

-- ── 2. RPC sensibles: solo service_role ─────────────────────────────────────
do $$
declare f record;
begin
  for f in
    select p.oid::regprocedure as sig
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and (
        p.proname like 'billing\_%'
        or p.proname like 'erp\_%'
        or p.proname in (
          'try_acquire_campaign_dialer_tick',
          'release_campaign_dialer_tick',
          'count_campaign_dialer_active_slots',
          'seed_organization_system_roles',
          'sync_role_template_permissions'
        )
      )
  loop
    execute format('revoke execute on function %s from public, anon, authenticated', f.sig);
    execute format('grant execute on function %s to service_role', f.sig);
  end loop;
end $$;

-- ── 3. Storage ──────────────────────────────────────────────────────────────
-- Grabaciones de llamadas: bucket privado; la app entrega URLs firmadas.
update storage.buckets set public = false where id = 'voice-call-recordings';

drop policy if exists voice_recordings_public_read on storage.objects;
drop policy if exists voice_recordings_service_read on storage.objects;
drop policy if exists voice_recordings_service_insert on storage.objects;
drop policy if exists voice_recordings_service_delete on storage.objects;
create policy voice_recordings_service_read on storage.objects
  for select to service_role using (bucket_id = 'voice-call-recordings');
create policy voice_recordings_service_insert on storage.objects
  for insert to service_role with check (bucket_id = 'voice-call-recordings');
create policy voice_recordings_service_delete on storage.objects
  for delete to service_role using (bucket_id = 'voice-call-recordings');

drop policy if exists whatsapp_media_service_read on storage.objects;
drop policy if exists whatsapp_media_service_insert on storage.objects;
drop policy if exists whatsapp_media_service_delete on storage.objects;
create policy whatsapp_media_service_read on storage.objects
  for select to service_role using (bucket_id = 'whatsapp-media');
create policy whatsapp_media_service_insert on storage.objects
  for insert to service_role with check (bucket_id = 'whatsapp-media');
create policy whatsapp_media_service_delete on storage.objects
  for delete to service_role using (bucket_id = 'whatsapp-media');

-- Microsite: lectura pública (logos/favicons), escritura solo del servidor.
drop policy if exists microsite_assets_service_insert on storage.objects;
drop policy if exists microsite_assets_service_delete on storage.objects;
create policy microsite_assets_service_insert on storage.objects
  for insert to service_role with check (bucket_id = 'microsite-assets');
create policy microsite_assets_service_delete on storage.objects
  for delete to service_role using (bucket_id = 'microsite-assets');
