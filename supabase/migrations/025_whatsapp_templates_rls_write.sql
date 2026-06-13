-- Plantillas WhatsApp: el inquilino gestiona las suyas

drop policy if exists "whatsapp_templates_insert_own" on public.whatsapp_templates;
create policy "whatsapp_templates_insert_own" on public.whatsapp_templates
  for insert with check (auth.uid() = user_id);

drop policy if exists "whatsapp_templates_update_own" on public.whatsapp_templates;
create policy "whatsapp_templates_update_own" on public.whatsapp_templates
  for update using (auth.uid() = user_id);

drop policy if exists "whatsapp_templates_delete_own" on public.whatsapp_templates;
create policy "whatsapp_templates_delete_own" on public.whatsapp_templates
  for delete using (auth.uid() = user_id);
