/**
 * Ciudades → código DANE (departamento + municipio) que exige `address.city`
 * en la API de Siigo al crear un cliente. Cubre capitales/ciudades grandes;
 * si no está el nombre exacto (normalizado sin tildes, minúsculas), la
 * emisión de la factura se detiene y queda pendiente de completar manual en
 * Siigo — mejor eso que inventar un código DANE incorrecto (afecta la
 * jurisdicción fiscal reportada del cliente).
 */
export interface DaneCity {
  state_code: string;
  city_code: string;
}

const CITIES: Record<string, DaneCity> = {
  "bogota": { state_code: "11", city_code: "11001" },
  "bogota dc": { state_code: "11", city_code: "11001" },
  "medellin": { state_code: "05", city_code: "05001" },
  "cali": { state_code: "76", city_code: "76001" },
  "barranquilla": { state_code: "08", city_code: "08001" },
  "cartagena": { state_code: "13", city_code: "13001" },
  "cucuta": { state_code: "54", city_code: "54001" },
  "soledad": { state_code: "08", city_code: "08758" },
  "ibague": { state_code: "73", city_code: "73001" },
  "bucaramanga": { state_code: "68", city_code: "68001" },
  "soacha": { state_code: "25", city_code: "25754" },
  "santa marta": { state_code: "47", city_code: "47001" },
  "villavicencio": { state_code: "50", city_code: "50001" },
  "valledupar": { state_code: "20", city_code: "20001" },
  "pereira": { state_code: "66", city_code: "66001" },
  "monteria": { state_code: "23", city_code: "23001" },
  "itagui": { state_code: "05", city_code: "05360" },
  "pasto": { state_code: "52", city_code: "52001" },
  "manizales": { state_code: "17", city_code: "17001" },
  "neiva": { state_code: "41", city_code: "41001" },
  "palmira": { state_code: "76", city_code: "76520" },
  "armenia": { state_code: "63", city_code: "63001" },
  "popayan": { state_code: "19", city_code: "19001" },
  "sincelejo": { state_code: "70", city_code: "70001" },
  "floridablanca": { state_code: "68", city_code: "68276" },
  "envigado": { state_code: "05", city_code: "05266" },
  "buenaventura": { state_code: "76", city_code: "76109" },
  "tulua": { state_code: "76", city_code: "76834" },
  "girardot": { state_code: "25", city_code: "25307" },
  "tunja": { state_code: "15", city_code: "15001" },
  "riohacha": { state_code: "44", city_code: "44001" },
  "florencia": { state_code: "18", city_code: "18001" },
  "quibdo": { state_code: "27", city_code: "27001" },
  "yopal": { state_code: "85", city_code: "85001" },
  "mocoa": { state_code: "86", city_code: "86001" },
  "san andres": { state_code: "88", city_code: "88001" },
  "leticia": { state_code: "91", city_code: "91001" },
  "arauca": { state_code: "81", city_code: "81001" },
  "inirida": { state_code: "94", city_code: "94001" },
  "puerto carreno": { state_code: "99", city_code: "99001" },
  "mitu": { state_code: "97", city_code: "97001" },
};

function normalize(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim()
    .replace(/\s+/g, " ");
}

export function resolveDaneCity(cityName: string | null | undefined): DaneCity | null {
  if (!cityName) return null;
  return CITIES[normalize(cityName)] ?? null;
}
