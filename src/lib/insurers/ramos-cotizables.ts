/**
 * Ramos que la IA de Noova sabe calificar y (cuando hay aseguradora conectada
 * que los declare) cotizar — un subconjunto chico y con nombre estable
 * (autos/vida/hogar), distinto del catálogo completo `ramos_catalogo` (93
 * ramos, sembrado desde Softseguros para uso de pólizas). El picker de "qué
 * ramos cotiza esta aseguradora" en el conector deja elegir de TODO el
 * catálogo (es un hecho real del negocio del corredor), pero solo estos tres
 * activan una tool de calificación por WhatsApp/ORI hoy.
 *
 * `catalogoSlug` es el slug real en `ramos_catalogo` — no coincide letra por
 * letra con la clave interna ("autos" acá vs "autos-vehiculos" en el
 * catálogo), así que quote-guidance.ts cruza por acá, nunca comparando los
 * strings directamente.
 */
export const RAMOS_COTIZABLES = {
  autos: { catalogoSlug: "autos-vehiculos", label: "Autos" },
  motos: { catalogoSlug: "motos", label: "Motos" },
  vida: { catalogoSlug: "vida", label: "Vida" },
  hogar: { catalogoSlug: "hogar", label: "Hogar" },
  salud: { catalogoSlug: "salud", label: "Salud" },
  soat: { catalogoSlug: "soat", label: "SOAT" },
  accidentes_personales: { catalogoSlug: "accidentes-personales", label: "Accidentes Personales" },
  // A partir de acá: ramos sin tool dedicada — corren sobre el motor genérico
  // (generic-quote-tool.ts/generic-quote-agent-tools.ts), extraídos 1:1 de los
  // formularios reales de Figuro (competidor) porque son corredores y ya
  // tienen resuelto qué preguntar por ramo. Ver ramo-campos-defaults.ts.
  mascotas: { catalogoSlug: "mascotas", label: "Mascotas" },
  viajes_turismo: { catalogoSlug: "viajes-turismo", label: "Viajes/Turismo" },
  bicicleta: { catalogoSlug: "bicicleta", label: "Bicicleta" },
  educativo: { catalogoSlug: "educativo", label: "Educativo" },
  exequias: { catalogoSlug: "exequias", label: "Exequias" },
  sepelio: { catalogoSlug: "sepelio", label: "Sepelio" },
  dental: { catalogoSlug: "dental", label: "Plan Dental" },
  arl: { catalogoSlug: "arl", label: "ARL" },
  arrendamiento: { catalogoSlug: "arrendamiento", label: "Arrendamiento" },
  asistencia_medica: { catalogoSlug: "asistencia-medica", label: "Asistencia Médica (Empresas)" },
  colectivo: { catalogoSlug: "colectivo", label: "Colectivas y Beneficios Corporativos" },
  medicos: { catalogoSlug: "medicos", label: "Complicaciones Quirúrgicas" },
  copropiedades: { catalogoSlug: "copropiedades", label: "Copropiedades" },
  cumplimiento: { catalogoSlug: "cumplimiento", label: "Cumplimiento" },
  pyme: { catalogoSlug: "pyme", label: "Pymes" },
  renta_pensional: { catalogoSlug: "renta-pensional", label: "Pensiones Voluntarias" },
  ciberriesgos: { catalogoSlug: "ciberriesgos", label: "Ciberriesgos (Empresas)" },
  rc_profesionales_medicos: { catalogoSlug: "rc-profesionales-medicos", label: "RC Médicos & Profesionales" },
  transporte: { catalogoSlug: "transporte", label: "Transporte de Mercancías" }
} as const;

/** Ramos que corren sobre el motor genérico (iniciar_cotizacion_seguro/registrar_dato_cotizacion) en vez de una tool dedicada — todo lo que no necesita una integración propia (placa/Verifik como autos y motos). */
export const RAMOS_MOTOR_GENERICO: RamoCotizable[] = [
  "salud",
  "mascotas",
  "viajes_turismo",
  "bicicleta",
  "educativo",
  "exequias",
  "sepelio",
  "dental",
  "arl",
  "arrendamiento",
  "asistencia_medica",
  "colectivo",
  "medicos",
  "copropiedades",
  "cumplimiento",
  "pyme",
  "renta_pensional",
  "ciberriesgos",
  "rc_profesionales_medicos",
  "transporte"
];

export type RamoCotizable = keyof typeof RAMOS_COTIZABLES;

/** Dado un slug de ramos_catalogo (lo que guarda insurer_connections.ramos), ¿a qué ramo cotizable de la IA corresponde? Null si ese ramo del catálogo no tiene tool de calificación todavía. */
export function ramoCotizableFromCatalogoSlug(catalogoSlug: string): RamoCotizable | null {
  const entry = (Object.entries(RAMOS_COTIZABLES) as Array<[RamoCotizable, { catalogoSlug: string }]>).find(
    ([, v]) => v.catalogoSlug === catalogoSlug
  );
  return entry ? entry[0] : null;
}
