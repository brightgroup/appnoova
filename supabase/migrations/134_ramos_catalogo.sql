-- Catálogo estándar de ramos de seguros (Noova Seguros) — vocabulario de la INDUSTRIA, no de una
-- organización puntual (igual que un catálogo de países o monedas). Sembrado con los 93 "ramos
-- globales" reales, extraídos en vivo el 2026-09-09 de una cuenta real de Softseguros
-- (GET /api/ramosglobales/, paginado completo) — no es una lista inventada, es el lenguaje que ya
-- usan las aseguradoras colombianas y que Softseguros ya modela igual.
--
-- Deliberadamente SIN organization_id: cualquier corredor en cualquier organización ve el mismo
-- catálogo. `polizas.ramo` (texto libre) se mantiene aparte para permitir un ramo no catalogado —
-- mismo criterio que Softseguros mantiene `ramo_nombre` como texto denormalizado aunque exista la
-- relación real detrás.

create table if not exists public.ramos_catalogo (
  id      uuid primary key default gen_random_uuid(),
  nombre  text not null unique,
  slug    text not null unique,
  activo  boolean not null default true
);

comment on table public.ramos_catalogo is
  'Catálogo estándar de ramos de seguros (vocabulario de industria, no por organización) — ver 130_ramos_catalogo.sql para el origen de los datos.';

alter table public.ramos_catalogo enable row level security;

drop policy if exists ramos_catalogo_read_all on public.ramos_catalogo;
create policy ramos_catalogo_read_all on public.ramos_catalogo
  for select to authenticated
  using (true);

insert into public.ramos_catalogo (nombre, slug) values
  ('ARL', 'arl'),
  ('CUMPLIMIENTO', 'cumplimiento'),
  ('VIDA', 'vida'),
  ('AHORRO', 'ahorro'),
  ('SALUD', 'salud'),
  ('ACCIDENTES PERSONALES', 'accidentes-personales'),
  ('SEGUROS DE ACCIDENTES', 'seguros-de-accidentes'),
  ('RIESGOS FINANCIEROS', 'riesgos-financieros'),
  ('INCENDIO Y LÍNEAS ALIADAS', 'incendio-y-lineas-aliadas'),
  ('RESPONSABILIDAD CIVIL', 'responsabilidad-civil'),
  ('AUTOS/VEHÍCULOS', 'autos-vehiculos'),
  ('AGROPECUARIO', 'agropecuario'),
  ('FIANZAS/ROBO/SUSTRACCIÓN', 'fianzas-robo-sustraccion'),
  ('ROBO O ASALTO', 'robo-o-asalto'),
  ('SEGURO DE CRÉDITO', 'seguro-de-credito'),
  ('TRANSPORTE', 'transporte'),
  ('INGENIERÍA', 'ingenieria'),
  ('MULTIRIESGO', 'multiriesgo'),
  ('MICROSEGURO', 'microseguro'),
  ('SOAT', 'soat'),
  ('COPROPIEDADES', 'copropiedades'),
  ('HOGAR', 'hogar'),
  ('PYME', 'pyme'),
  ('ARRENDAMIENTO', 'arrendamiento'),
  ('MAQUINARIA Y EQUIPO/ROTURA MAQUINARIA', 'maquinaria-y-equipo-rotura-maquinaria'),
  ('MASCOTAS', 'mascotas'),
  ('TODO RIESGO', 'todo-riesgo'),
  ('MANEJO', 'manejo'),
  ('VIAJES/TURISMO', 'viajes-turismo'),
  ('OTROS', 'otros'),
  ('CASCO', 'casco'),
  ('FINANCIACIÓN DE PRIMAS', 'financiacion-de-primas'),
  ('EQUIPO ELÉCTRICO', 'equipo-electrico'),
  ('EXEQUIAS', 'exequias'),
  ('ESTUDIANTIL', 'estudiantil'),
  ('LUCRO CESANTE', 'lucro-cesante'),
  ('POS', 'pos'),
  ('PLAN COMPLEMENTARIO', 'plan-complementario'),
  ('VENTA DE VEHÍCULO', 'venta-de-vehiculo'),
  ('CRÉDITO Y CAUCIÓN', 'credito-y-caucion'),
  ('INVERSIÓN', 'inversion'),
  ('AVIACIÓN', 'aviacion'),
  ('RESPONSABILIDAD CIVIL PARA PROFESIONALES MÉDICOS', 'rc-profesionales-medicos'),
  ('RESPONSABILIDAD CIVIL PARA PARQUEADEROS', 'rc-parqueaderos'),
  ('VIDA GRUPO', 'vida-grupo'),
  ('TODO RIESGO CONSTRUCCIÓN', 'todo-riesgo-construccion'),
  ('JURÍDICA', 'juridica'),
  ('DAÑOS MATERIALES', 'danos-materiales'),
  ('RESPONSABILIDAD CIVIL DIRECTORES Y ADMINISTRADORES', 'rc-directores-y-administradores'),
  ('TÍTULO CAPITALIZACIÓN', 'titulo-capitalizacion'),
  ('VIDA INDIVIDUAL', 'vida-individual'),
  ('MEDICINA PREPAGADA', 'medicina-prepagada'),
  ('TERREMOTO', 'terremoto'),
  ('VIDA DEUDORES', 'vida-deudores'),
  ('TODO RIESGO CONTRATISTA', 'todo-riesgo-contratista'),
  ('EDUCATIVO', 'educativo'),
  ('RENTA PENSIONAL', 'renta-pensional'),
  ('SERIEDAD DE OFERTA', 'seriedad-de-oferta'),
  ('RIESGOS ESPECIALES', 'riesgos-especiales'),
  ('BANCOS E INSTITUCIONES FINANCIERAS (BBB)', 'bancos-e-instituciones-financieras-bbb'),
  ('EQUIPO Y MAQUINARIA DE CONTRATISTA', 'equipo-y-maquinaria-de-contratista'),
  ('FIDELIDAD', 'fidelidad'),
  ('GARANTÍAS ADUANERAS', 'garantias-aduaneras'),
  ('OBRAS CIVILES TERMINADAS', 'obras-civiles-terminadas'),
  ('PÉRDIDA DE BENEFICIO POR ROTURA DE MAQUINARIA', 'perdida-de-beneficio-por-rotura-de-maquinaria'),
  ('DINERO Y VALORES', 'dinero-y-valores'),
  ('EJECUCIÓN DE OBRA Y BUENA CALIDAD DE MATERIALES', 'ejecucion-de-obra-y-buena-calidad-de-materiales'),
  ('MARÍTIMO', 'maritimo'),
  ('BUEN USO DE ANTICIPO', 'buen-uso-de-anticipo'),
  ('MONTAJE DE MAQUINARIA', 'montaje-de-maquinaria'),
  ('CUMPLIMIENTO DE CONTRATO', 'cumplimiento-de-contrato'),
  ('ROTURA DE MAQUINARIA', 'rotura-de-maquinaria'),
  ('ASISTENCIA MÉDICA', 'asistencia-medica'),
  ('COLECTIVO', 'colectivo'),
  ('RIESGOS DIVERSOS', 'riesgos-diversos'),
  ('MÉDICOS', 'medicos'),
  ('SCTR', 'sctr'),
  ('EPS', 'eps'),
  ('ACCIDENTES', 'accidentes'),
  ('VIDA LEY', 'vida-ley'),
  ('ONCOLÓGICO', 'oncologico'),
  ('FINANCIACIÓN PRIMAS', 'financiacion-primas'),
  ('GENERALES', 'generales'),
  ('PERSONAS', 'personas'),
  ('ENFERMEDADES', 'enfermedades'),
  ('VIDRIOS', 'vidrios'),
  ('RENTA EDUCATIVA', 'renta-educativa'),
  ('FORMACIÓN LABORAL', 'formacion-laboral'),
  ('PROTECCIÓN DE DATOS', 'proteccion-de-datos'),
  ('RESPONSABILIDAD CIVIL CONTRA Y EXTRA', 'rc-contra-y-extra'),
  ('OBLIGATORIOS', 'obligatorios'),
  ('PATRIMONIALES', 'patrimoniales'),
  ('GASTOS MÉDICOS', 'gastos-medicos')
on conflict (nombre) do nothing;
