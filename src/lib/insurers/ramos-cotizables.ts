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
  accidentes_personales: { catalogoSlug: "accidentes-personales", label: "Accidentes Personales" }
} as const;

export type RamoCotizable = keyof typeof RAMOS_COTIZABLES;

/** Dado un slug de ramos_catalogo (lo que guarda insurer_connections.ramos), ¿a qué ramo cotizable de la IA corresponde? Null si ese ramo del catálogo no tiene tool de calificación todavía. */
export function ramoCotizableFromCatalogoSlug(catalogoSlug: string): RamoCotizable | null {
  const entry = (Object.entries(RAMOS_COTIZABLES) as Array<[RamoCotizable, { catalogoSlug: string }]>).find(
    ([, v]) => v.catalogoSlug === catalogoSlug
  );
  return entry ? entry[0] : null;
}
