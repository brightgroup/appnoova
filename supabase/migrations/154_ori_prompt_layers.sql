-- Prompt de Ori en capas.
--
-- Capa 1 (plataforma): la plantilla base vive en platform_settings con la key
-- 'ori_prompt' y la edita el superadmin desde /admin/ori. No hace falta tabla
-- nueva — platform_settings ya existe (migración 066) y es el mismo patrón que
-- call_engine_rules y time_rules. Si no hay fila, el código cae a
-- ORI_SYSTEM_PROMPT (src/lib/ori-prompt.ts), así que esta migración no necesita
-- sembrar nada.
--
-- Capa 2 (tenant): cada organización agrega SUS instrucciones encima. Se anexan
-- a la base, nunca la reemplazan — así un arreglo de plataforma sigue llegando a
-- todos los clientes aunque cada uno tenga sus propias reglas de negocio.
--
-- Tabla aparte y no una columna en `organizations` a propósito: esto es
-- configuración de un módulo, con su propio updated_by/updated_at para auditar
-- quién cambió el comportamiento de Ori, y `organizations` ya carga demasiado.
--
-- Ojo con la confusión clásica: `company_contexts` (QUÉ es la empresa) es por
-- usuario y lo comparten los agentes de texto, WhatsApp, micrositio y widget.
-- Esto otro es CÓMO se comporta Ori, es por organización, y no lo ve ningún
-- agente que hable con clientes externos.
create table if not exists public.ori_org_instructions (
  organization_id uuid primary key references public.organizations(id) on delete cascade,
  instrucciones   text not null default '',
  tono            text not null default 'default' check (tono in ('default', 'tu', 'usted')),
  extension       text not null default 'default' check (extension in ('default', 'breve', 'detallada')),
  filas_por_consulta integer not null default 15 check (filas_por_consulta between 5 and 30),
  updated_at      timestamptz not null default now(),
  updated_by      uuid
);

alter table public.ori_org_instructions enable row level security;

-- Solo service_role (las APIs ya validan organización + permiso RBAC).
drop policy if exists "ori_org_instructions_deny" on public.ori_org_instructions;
create policy "ori_org_instructions_deny" on public.ori_org_instructions
  for all using (false) with check (false);
