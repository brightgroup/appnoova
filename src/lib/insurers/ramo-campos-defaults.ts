import type { PolizaCampoFieldType } from "@/lib/insurers/poliza-ramo-campos-db";
import type { RamoCotizable } from "@/lib/insurers/ramos-cotizables";

/**
 * Traducción 1:1 de los `buildPromptBlock()`/`REQUIRED_*_FIELDS` que hoy están
 * hardcodeados en cada `*-quote-tool.ts` + `*-quote-agent-tool.ts` — el punto
 * de partida ("valores por defecto") que una organización ve la primera vez
 * que abre la configuración de un ramo, y lo único que usa la IA mientras la
 * organización no haya guardado nada propio (ver `getRamoCampoDefinitions` en
 * quote-guidance.ts). NO son copy inventado: cada pregunta/opción viene
 * exactamente de la prosa que hoy vive en el prompt de cada ramo.
 *
 * `placa` NO aparece acá para autos/motos/soat: el código la sigue pidiendo
 * siempre primero, fija — en autos/motos porque dispara la consulta real a
 * Verifik/PlacApi (no es un campo "de formulario"); en SOAT, aunque no
 * consulta ningún proveedor, se deja igual de fija por simplicidad y porque
 * define el flujo (ver soat-quote-tool.ts).
 */

export type RamoCampoPresentacion = "auto" | "botones" | "lista" | "texto";

export interface RamoCampoDef {
  fieldKey: string;
  label: string;
  /** Lo que la IA le dice al cliente para pedir el dato. */
  pregunta: string;
  /** Explicación corta si el cliente pregunta "¿qué significa?". */
  ayuda?: string;
  fieldType: PolizaCampoFieldType;
  /** Opciones cerradas — vacío = pregunta abierta (siempre texto). */
  options: string[];
  sortOrder: number;
  presentacion: RamoCampoPresentacion;
  /** false = campo informativo para el asesor que la IA no pregunta durante la cotización — siempre true en los defaults. */
  aplicaCotizacion: boolean;
  /** false = la IA no bloquea la cotización esperando este dato. */
  requeridoCotizacion: boolean;
}

interface CampoInput {
  fieldKey: string;
  label: string;
  pregunta: string;
  ayuda?: string;
  options?: string[];
  fieldType?: PolizaCampoFieldType;
  requeridoCotizacion?: boolean;
}

function campos(defs: CampoInput[]): RamoCampoDef[] {
  return defs.map((d, i) => ({
    fieldKey: d.fieldKey,
    label: d.label,
    pregunta: d.pregunta,
    ayuda: d.ayuda,
    fieldType: d.fieldType ?? (d.options?.length ? "select" : "text"),
    options: d.options ?? [],
    sortOrder: i,
    presentacion: "auto",
    aplicaCotizacion: true,
    requeridoCotizacion: d.requeridoCotizacion ?? true
  }));
}

const SI_NO = ["Sí", "No"];

const TOMADOR_BASICO: CampoInput[] = [
  { fieldKey: "nombre_tomador", label: "Nombre completo del tomador", pregunta: "¿Cuál es el nombre completo de quien toma la póliza?" },
  { fieldKey: "documento_tomador", label: "Documento del tomador", pregunta: "¿Cuál es el número de documento de identidad del tomador?" },
  { fieldKey: "fecha_nacimiento_tomador", label: "Fecha de nacimiento del tomador", pregunta: "¿Cuál es la fecha de nacimiento del tomador? (YYYY-MM-DD)", fieldType: "date" }
];

export const DEFAULT_CAMPOS_POR_RAMO: Partial<Record<RamoCotizable, RamoCampoDef[]>> = {
  autos: campos([
    { fieldKey: "nuevo_o_usado", label: "Nuevo o usado", pregunta: "¿El vehículo es nuevo o usado?", options: ["Nuevo", "Usado"] },
    {
      fieldKey: "uso_vehiculo",
      label: "Uso del vehículo",
      pregunta: "¿Qué uso tiene el vehículo?",
      options: ["Particular", "Servicio Público", "Uber/Cabify o similares"]
    },
    {
      fieldKey: "importacion_directa",
      label: "Importación directa",
      pregunta: "¿Es de importación directa?",
      ayuda: "Es un vehículo traído del exterior por cuenta propia, sin pasar por un concesionario en Colombia.",
      options: ["No", "Sí, es de importación directa", "No estoy seguro"]
    },
    {
      fieldKey: "tarjeta_propiedad",
      label: "Tarjeta de propiedad",
      pregunta: "¿La tarjeta de propiedad está a su nombre?",
      options: ["A mi nombre", "En trámite de traspaso", "A nombre de otra persona"]
    },
    { fieldKey: "ciudad", label: "Ciudad", pregunta: "¿En qué ciudad circula el vehículo?" },
    ...TOMADOR_BASICO
  ]),

  motos: campos([
    { fieldKey: "nuevo_o_usado", label: "Nueva o usada", pregunta: "¿La moto es nueva o usada?", options: ["Nuevo", "Usado"] },
    {
      fieldKey: "uso_vehiculo",
      label: "Uso de la moto",
      pregunta: "¿Qué uso tiene la moto?",
      options: ["Particular", "Servicio Público", "Uber/Cabify o similares"]
    },
    {
      fieldKey: "importacion_directa",
      label: "Importación directa",
      pregunta: "¿Es de importación directa?",
      ayuda: "Es un vehículo traído del exterior por cuenta propia, sin pasar por un concesionario en Colombia.",
      options: ["No", "Sí, es de importación directa", "No estoy seguro"]
    },
    { fieldKey: "ciudad", label: "Ciudad", pregunta: "¿En qué ciudad circula la moto?" },
    ...TOMADOR_BASICO
  ]),

  vida: campos([
    {
      fieldKey: "tipo_cobertura",
      label: "Qué proteger",
      pregunta: "¿Qué le gustaría proteger?",
      options: [
        "Vida (muerte por cualquier causa)",
        "Vida + Invalidez",
        "Vida + Invalidez + Enfermedades Graves",
        "Vida + Invalidez + Enfermedades + Renta diaria",
        "No lo sé, asesórame"
      ]
    },
    {
      fieldKey: "suma_asegurada_deseada",
      label: "Valor de cobertura deseado",
      pregunta: "¿Qué valor de cobertura busca?",
      options: ["Menos de 50 millones", "Entre 50 y 200 millones", "Entre 200 y 500 millones", "Más de 500 millones", "No lo sé, asesórame"]
    },
    {
      fieldKey: "presupuesto_mensual",
      label: "Presupuesto mensual",
      pregunta: "¿Cuál es su presupuesto mensual aproximado?",
      options: ["Hasta $50.000", "Hasta $150.000", "Hasta $300.000", "Más de $300.000", "No lo sé, asesórame"]
    },
    {
      fieldKey: "fumador",
      label: "Fumador o condición médica",
      pregunta: "¿Fuma o tiene alguna condición médica?",
      ayuda: "Determina el riesgo de la póliza — es obligatoria, nunca se omite.",
      options: SI_NO
    },
    ...TOMADOR_BASICO,
    { fieldKey: "ocupacion", label: "Ocupación", pregunta: "¿Cuál es su ocupación u oficio?" },
    {
      fieldKey: "interes_ahorro",
      label: "Interés en fondo de ahorro",
      pregunta: "¿Le interesa un fondo de ahorro con su seguro de vida?",
      options: ["Sí", "No", "No lo sé, asesórame"],
      requeridoCotizacion: false
    }
  ]),

  hogar: campos([
    {
      fieldKey: "tipo_inmueble",
      label: "Tipo de inmueble",
      pregunta: "¿Qué tipo de inmueble es?",
      options: ["Casa", "Apartamento", "Casa en condominio", "Finca o casa campestre"]
    },
    {
      fieldKey: "vigilancia_seguridad",
      label: "Vigilancia o seguridad",
      pregunta: "¿Tiene vigilancia o sistemas de seguridad?",
      options: SI_NO
    },
    {
      fieldKey: "estrato",
      label: "Estrato",
      pregunta: "¿Cuál es el estrato del inmueble?",
      options: ["Estrato 1", "Estrato 2", "Estrato 3", "Estrato 4", "Estrato 5", "Estrato 6"]
    },
    { fieldKey: "nombre_tomador", label: "Nombre completo del tomador", pregunta: "¿Cuál es el nombre completo de quien toma la póliza?" },
    { fieldKey: "documento_tomador", label: "Documento del tomador", pregunta: "¿Cuál es el número de documento de identidad del tomador?" },
    { fieldKey: "direccion_inmueble", label: "Dirección del inmueble", pregunta: "¿Cuál es la dirección del inmueble a asegurar?" },
    { fieldKey: "valor_aproximado_inmueble", label: "Valor aproximado del inmueble", pregunta: "¿Cuál es el valor aproximado del inmueble, en pesos colombianos?" }
  ]),

  soat: campos([
    { fieldKey: "placa", label: "Placa", pregunta: "¿Cuál es la placa del vehículo?" },
    { fieldKey: "motor_ultimos_digitos", label: "Últimos dígitos del motor", pregunta: "¿Cuáles son los últimos 4 dígitos del número de motor?" },
    { fieldKey: "ciudad", label: "Ciudad", pregunta: "¿En qué ciudad circula el vehículo?" },
    ...TOMADOR_BASICO
  ]),

  accidentes_personales: campos([
    {
      fieldKey: "proteccion_deseada",
      label: "Qué proteger",
      pregunta: "¿Qué le gustaría proteger?",
      options: [
        "Muerte accidental",
        "Invalidez por accidente o enfermedad",
        "Renta diaria si me incapacito por cualquier causa",
        "Todas las anteriores",
        "No lo sé, asesórenme"
      ]
    },
    {
      fieldKey: "tipo_poliza",
      label: "Tipo de póliza",
      pregunta: "¿La póliza es para usted o una póliza colectiva?",
      options: ["Para mí (individual)", "Póliza colectiva"]
    },
    {
      fieldKey: "valor_cobertura",
      label: "Valor de cobertura",
      pregunta: "¿Qué valor de cobertura busca?",
      options: ["10 millones", "Entre 10 y 20 millones", "Entre 20 y 50 millones", "Entre 50 y 100 millones", "Más de 100 millones", "No lo sé, asesórenme"]
    },
    { fieldKey: "ya_tiene_seguro", label: "Ya tiene un seguro similar", pregunta: "¿Ya tiene un seguro de accidentes personales?", options: SI_NO },
    ...TOMADOR_BASICO
  ])
};
