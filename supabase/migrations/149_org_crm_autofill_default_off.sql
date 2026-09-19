-- 148_org_crm_autofill_toggle.sql ya se había aplicado con default true antes
-- de decidir que el interruptor debe empezar apagado. Como nadie lo había
-- tocado todavía (la función es nueva), resetear todas las filas a false es
-- seguro: no se pierde ninguna elección real de un tenant.
alter table public.organizations
  alter column crm_autofill_enabled set default false;

update public.organizations
set crm_autofill_enabled = false;
