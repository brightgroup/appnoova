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
  ]),

  // ─────────────────────────────────────────────────────────────────────────
  // A partir de acá: ramos sin lookup propio (motor genérico, ver
  // generic-quote-tool.ts) — el motor ya pide nombre/documento/fecha de
  // nacimiento/ocupación del tomador por su cuenta (TOMADOR_REQUERIDOS), así
  // que estos defaults NO repiten esos campos, solo los propios del riesgo.
  // Preguntas extraídas 1:1 de los formularios reales de Figuro (competidor,
  // ver fgr.link/noova-seguros/co/<ramo>) — Figuro ya es corredor y tiene
  // resuelto qué preguntar por ramo, no hay que reinventarlo.
  // ─────────────────────────────────────────────────────────────────────────

  salud: campos([
    { fieldKey: "para_quien", label: "Para quién es el seguro", pregunta: "¿Buscas un seguro para ti o para todo tu grupo familiar?", options: ["Solo para mí", "Para mí y mi familia"] },
    {
      fieldKey: "servicio_actual",
      label: "Servicio de salud actual",
      pregunta: "¿Cuál es el mejor servicio de salud al que estás afiliado actualmente?",
      options: ["EPS", "Plan Complementario", "Medicina Prepagada", "Seguro de Salud", "EMI, Emermédica o similares"]
    }
  ]),

  mascotas: campos([
    { fieldKey: "tipo_mascota", label: "Tipo de mascota", pregunta: "¿Qué tipo de mascota tienes?", options: ["Perro", "Gato"] },
    { fieldKey: "nombre_mascota", label: "Nombre de la mascota", pregunta: "¿Cómo se llama tu mascota?" },
    { fieldKey: "raza_mascota", label: "Raza", pregunta: "¿De qué raza es tu mascota?" },
    { fieldKey: "edad_mascota", label: "Edad de la mascota", pregunta: "¿Qué edad tiene tu mascota (en años)?" },
    {
      fieldKey: "interactua_otras_mascotas",
      label: "Interactúa con otras mascotas",
      pregunta: "¿Tu mascota suele interactuar con otras mascotas en parques o guarderías?",
      options: SI_NO,
      requeridoCotizacion: false
    },
    {
      fieldKey: "escapa_curioso",
      label: "Se escapa o es curioso",
      pregunta: "¿Es de los que se escapa o es muy curioso?",
      options: SI_NO,
      requeridoCotizacion: false
    },
    {
      fieldKey: "condicion_preexistente",
      label: "Condición preexistente",
      pregunta: "¿Tiene alguna condición preexistente o crónica?",
      options: ["Sí", "No", "Prefiero no decirlo"],
      requeridoCotizacion: false
    },
    {
      fieldKey: "gasto_ultima_visita_vet",
      label: "Gasto última visita al veterinario",
      pregunta: "¿Cuánto gastaste en tu última visita inesperada al veterinario?",
      requeridoCotizacion: false
    },
    {
      fieldKey: "puede_cubrir_dano_terceros",
      label: "Puede cubrir daño a terceros",
      pregunta: "Si tu mascota causara un daño a un tercero (muerde a alguien o rompe algo caro), ¿podrías cubrir legalmente ese gasto de tu bolsillo?",
      options: ["Sí", "No", "No estoy seguro"],
      requeridoCotizacion: false
    }
  ]),

  viajes_turismo: campos([
    { fieldKey: "tipo_asistencia", label: "Tipo de asistencia", pregunta: "¿Qué tipo de asistencia de viaje buscas?", options: ["Asistencia de Viaje General", "Asistencia para Deportes"] },
    { fieldKey: "fecha_inicio_viaje", label: "Fecha de inicio del viaje", pregunta: "¿Cuál es la fecha de inicio de tu viaje?", fieldType: "date" },
    { fieldKey: "fecha_fin_viaje", label: "Fecha de fin del viaje", pregunta: "¿Cuál es la fecha de fin de tu viaje?", fieldType: "date" },
    { fieldKey: "pais_origen", label: "País de origen", pregunta: "¿Cuál es el país de origen de tu viaje?" },
    { fieldKey: "destino_viaje", label: "Destino", pregunta: "¿Cuál es el destino al que viajarás?" },
    { fieldKey: "edades_viajeros", label: "Edades de los viajeros", pregunta: "¿Qué edades tendrá cada uno de los viajeros cuando inicie el viaje?" }
  ]),

  bicicleta: campos([
    { fieldKey: "marca_bicicleta", label: "Marca", pregunta: "¿Cuál es la marca de tu bicicleta?" },
    { fieldKey: "modelo_bicicleta", label: "Modelo", pregunta: "¿Cuál es el modelo de tu bicicleta?" },
    { fieldKey: "anio_bicicleta", label: "Año", pregunta: "¿De qué año es tu bicicleta?" },
    { fieldKey: "valor_comercial_bicicleta", label: "Valor comercial", pregunta: "¿Cuál es el valor comercial de tu bicicleta?" },
    { fieldKey: "tiene_factura_bicicleta", label: "Tiene factura o certificación", pregunta: "¿Cuentas con factura de compra o certificación de tienda especializada?", options: SI_NO }
  ]),

  educativo: campos([
    {
      fieldKey: "tipo_documento_hijo",
      label: "Tipo de documento del hijo(a)",
      pregunta: "¿Qué tipo de documento tiene tu hijo(a)?",
      options: ["Tarjeta de Identidad", "Registro Civil de Nacimiento", "Pasaporte"]
    },
    { fieldKey: "numero_documento_hijo", label: "Documento del hijo(a)", pregunta: "¿Cuál es el número del documento de tu hijo(a)?" },
    { fieldKey: "fecha_nacimiento_hijo", label: "Fecha de nacimiento del hijo(a)", pregunta: "¿Cuál es la fecha de nacimiento de tu hijo(a)?", fieldType: "date" },
    {
      fieldKey: "hijo_estudiando",
      label: "Está estudiando actualmente",
      pregunta: "¿El niño/niña está estudiando actualmente?",
      options: ["Sí", "No", "No Aplica"]
    },
    {
      fieldKey: "donde_estudiar",
      label: "Dónde quiere que estudie",
      pregunta: "¿Dónde quieres que estudie tu hijo(a)?",
      options: ["En Colombia", "En el extranjero"],
      requeridoCotizacion: false
    },
    {
      fieldKey: "presupuesto_mensual_educativo",
      label: "Presupuesto mensual",
      pregunta: "¿Cuánto puedes invertir al mes?",
      options: ["Menos de $500.000", "$500.000 – $1.000.000", "$1.000.001 – $2.000.000", "Más de $2.000.000"],
      requeridoCotizacion: false
    }
  ]),

  exequias: campos([
    { fieldKey: "para_quien", label: "Para quién es el seguro", pregunta: "¿Para quién es el seguro?", options: ["Sólo para mí", "Para mí y mi familia"] },
    {
      fieldKey: "alcance_cobertura",
      label: "Alcance de cobertura",
      pregunta: "¿Qué alcance de cobertura prefieres?",
      options: ["Local — sólo en mi país", "Regional — Latinoamérica", "Internacional — España + Latinoamérica", "Global — cobertura mundial", "No lo sé, asesórenme"]
    }
  ]),

  sepelio: campos([
    { fieldKey: "para_quien", label: "Para quién es el seguro", pregunta: "¿Para quién es el seguro?", options: ["Solo para mí", "Para mí y mi familia"] },
    {
      fieldKey: "tipo_cobertura_sepelio",
      label: "Tipo de cobertura",
      pregunta: "¿Qué tipo de cobertura prefieres?",
      options: ["Prefiero que me presten los servicios directamente", "Prefiero pagar y que me reintegren el dinero que gaste", "No lo sé, asesórenme"]
    },
    {
      fieldKey: "plan_cobertura_sepelio",
      label: "Plan de cobertura",
      pregunta: "¿Qué plan de cobertura necesitas?",
      options: ["Plan Básico - Cobertura estándar", "Plan Estándar - Cobertura mejorada", "Plan Premium - Cobertura completa", "No lo sé, asesórenme"]
    }
  ]),

  dental: campos([
    { fieldKey: "para_quien", label: "Para quién es el plan", pregunta: "¿Buscas un plan dental para ti o para tu familia?", options: ["Solo para mí", "Para mí y mi familia"] },
    {
      fieldKey: "tipo_cobertura_dental",
      label: "Tipo de cobertura dental",
      pregunta: "¿Qué tipo de cobertura dental te interesa?",
      options: ["Prevención y urgencias", "Odontología general (resinas, conductos, extracciones)", "Tratamientos especializados u ortodoncia", "Aún no lo sé, quiero asesoría"]
    }
  ]),

  arl: campos([
    { fieldKey: "nombre_empresa", label: "Nombre de la empresa", pregunta: "¿Cuál es el nombre de tu empresa?" },
    { fieldKey: "nit_empresa", label: "NIT", pregunta: "¿Cuál es el NIT de la empresa?" },
    { fieldKey: "actividad_economica", label: "Actividad económica (CIIU)", pregunta: "¿Cuál es la actividad económica principal de tu empresa?" },
    { fieldKey: "arl_actual", label: "ARL contratada actualmente", pregunta: "¿Con qué ARL estás actualmente, o todavía no tienes?" },
    { fieldKey: "ciudad_empresa", label: "Ciudad de la empresa", pregunta: "¿En qué ciudad está tu empresa?" }
  ]),

  arrendamiento: campos([
    { fieldKey: "tipo_propiedad_arrendamiento", label: "Tipo de propiedad", pregunta: "¿Qué tipo de propiedad quieres asegurar?", options: ["Vivienda", "Local", "Oficina", "Otro"] },
    { fieldKey: "direccion_arrendamiento", label: "Dirección del inmueble", pregunta: "¿Cuál es la dirección del inmueble que quieres asegurar?" },
    { fieldKey: "ciudad_arrendamiento", label: "Ciudad del inmueble", pregunta: "¿En qué ciudad está el inmueble?" },
    { fieldKey: "valor_arriendo", label: "Valor del arriendo", pregunta: "¿Cuál es el valor del arriendo?", requeridoCotizacion: false },
    { fieldKey: "valor_administracion", label: "Valor administración", pregunta: "¿Cuál es el valor de la administración?", requeridoCotizacion: false }
  ]),

  asistencia_medica: campos([
    { fieldKey: "nombre_empresa", label: "Nombre legal de la empresa", pregunta: "¿Cuál es el nombre legal de la empresa?" },
    {
      fieldKey: "tipo_documento_empresa",
      label: "Tipo de documento",
      pregunta: "¿Con qué tipo de documento se identifica la empresa?",
      options: ["Cédula de Ciudadanía", "Cédula de Extranjería", "Pasaporte", "NIT (Empresa)"]
    },
    { fieldKey: "numero_documento_empresa", label: "Número de documento", pregunta: "¿Cuál es el número de documento?" },
    { fieldKey: "actividad_economica", label: "Actividad económica", pregunta: "¿Cuál es la actividad económica de tu empresa?" },
    { fieldKey: "numero_sedes", label: "Número de sedes", pregunta: "¿En cuántas sedes opera la empresa actualmente?" }
  ]),

  colectivo: campos([
    { fieldKey: "nombre_empresa", label: "Nombre de la empresa", pregunta: "¿Cuál es el nombre de la empresa?" },
    { fieldKey: "nit_empresa", label: "NIT", pregunta: "¿Cuál es el NIT de la empresa?" },
    { fieldKey: "actividad_economica", label: "Actividad económica (CIIU)", pregunta: "¿Cuál es la actividad económica principal de tu empresa?" }
  ]),

  medicos: campos([
    { fieldKey: "especialidades_quirurgicas", label: "Especialidades quirúrgicas", pregunta: "¿Cuáles son tus especialidades quirúrgicas? (puedes mencionar varias)" },
    { fieldKey: "tiene_seguro_similar", label: "Ya tiene un seguro similar", pregunta: "¿Cuentas actualmente con un seguro similar?", options: SI_NO },
    {
      fieldKey: "cirugias_mes",
      label: "Cirugías al mes",
      pregunta: "¿Cuántas cirugías realizas en promedio al mes?",
      options: ["Menos de 5", "Entre 5 y 15", "Entre 15 y 30", "Más de 30"]
    }
  ]),

  copropiedades: campos([
    { fieldKey: "anio_construccion_edificio", label: "Año de construcción", pregunta: "¿En qué año fue construido el edificio o conjunto?" },
    { fieldKey: "pisos_edificio", label: "Número de pisos", pregunta: "¿Cuántos pisos tiene el edificio?" },
    { fieldKey: "unidades_edificio", label: "Número de unidades", pregunta: "¿Cuántas unidades (apartamentos/locales) tiene?" },
    { fieldKey: "sotanos_edificio", label: "Número de sótanos", pregunta: "¿Cuántos sótanos tiene?", requeridoCotizacion: false },
    { fieldKey: "parqueaderos_edificio", label: "Número de parqueaderos", pregunta: "¿Cuántos parqueaderos tiene?" },
    { fieldKey: "ascensores_edificio", label: "Número de ascensores", pregunta: "¿Cuántos ascensores tiene?", requeridoCotizacion: false },
    { fieldKey: "direccion_edificio", label: "Dirección del predio", pregunta: "¿Cuál es la dirección del predio?" },
    { fieldKey: "ciudad_edificio", label: "Ciudad", pregunta: "¿En qué ciudad está el predio?" }
  ]),

  cumplimiento: campos([
    {
      fieldKey: "tipo_documento_contractual",
      label: "Tipo de documento contractual",
      pregunta: "¿Qué tipo de documento contractual tienes: contrato firmado, orden de compra, remisión, o el pliego de una licitación?",
      options: ["Contrato firmado", "Orden de compra", "Remisión", "Licitación (pliego de condiciones)"]
    },
    { fieldKey: "fecha_inicio_contrato", label: "Fecha de inicio del contrato", pregunta: "¿Cuál es la fecha de inicio del contrato?", fieldType: "date" },
    { fieldKey: "duracion_contrato_meses", label: "Duración del contrato (meses)", pregunta: "¿Cuál es la duración del contrato en meses?" },
    { fieldKey: "valor_contrato", label: "Valor total del contrato", pregunta: "¿Cuál es el valor total del contrato?" },
    {
      fieldKey: "objeto_contrato",
      label: "Objeto del contrato",
      pregunta: "¿Cuál es el objeto del contrato? Más adelante un asesor te va a pedir el contrato, orden de compra o pliego firmados por este mismo chat."
    }
  ]),

  pyme: campos([
    { fieldKey: "nombre_asegurado", label: "Nombre del asegurado o empresa", pregunta: "¿Cuál es el nombre completo del asegurado, o el nombre completo de la empresa?" },
    {
      fieldKey: "tipo_documento_pyme",
      label: "Tipo de documento",
      pregunta: "¿Con qué tipo de documento se identifica?",
      options: ["Cédula de Ciudadanía", "Cédula de Extranjería", "Pasaporte", "NIT (Empresa)"]
    },
    { fieldKey: "numero_documento_pyme", label: "Número de documento", pregunta: "¿Cuál es el número de documento?" },
    { fieldKey: "actividad_economica", label: "Actividad económica", pregunta: "¿Cuál es la actividad económica de tu empresa?" },
    {
      fieldKey: "tipo_propiedad_pyme",
      label: "Tipo de propiedad a proteger",
      pregunta: "¿Qué tipo de propiedad quieres proteger?",
      options: ["Casa", "Apartamento", "Oficina", "Local Comercial", "Otro"]
    },
    { fieldKey: "propio_o_arrendado", label: "Propio o arrendado", pregunta: "¿La propiedad es propia o arrendada?", options: ["Propio", "Arrendado"] },
    {
      fieldKey: "siniestro_ultimos_3_anos",
      label: "Siniestro en los últimos 3 años",
      pregunta: "¿Has tenido algún tipo de daño o siniestro en esta propiedad en los últimos 3 años?",
      options: SI_NO,
      requeridoCotizacion: false
    },
    { fieldKey: "vigilancia_pyme", label: "Vigilancia o seguridad", pregunta: "¿La propiedad tiene vigilancia o sistemas de seguridad?", options: SI_NO },
    { fieldKey: "direccion_pyme", label: "Dirección del inmueble", pregunta: "¿Dónde está ubicado el inmueble que quieres asegurar?" },
    {
      fieldKey: "estrato_pyme",
      label: "Estrato",
      pregunta: "¿Cuál es el estrato del inmueble?",
      options: ["Estrato 1", "Estrato 2", "Estrato 3", "Estrato 4", "Estrato 5", "Estrato 6"]
    },
    { fieldKey: "ciudad_pyme", label: "Ciudad", pregunta: "¿En qué ciudad está el inmueble?" }
  ]),

  renta_pensional: campos([
    {
      fieldKey: "proposito_ahorro",
      label: "Propósito de ahorro",
      pregunta: "¿Tienes un propósito claro de ahorro?",
      options: ["Cerrar Brecha Pensional", "Ahorro de mediano plazo", "Ahorro complemento de pensión", "Optimizar impuestos", "Otro", "No lo tengo claro"]
    },
    {
      fieldKey: "metodo_cotizar_pension",
      label: "Cómo prefiere cotizar",
      pregunta: "¿Cómo prefieres cotizar: según un valor que quieres conseguir, según una renta futura, o según lo que puedes ahorrar hoy?",
      options: ["Según un valor que quiero conseguir en el futuro", "Según una renta que quiero que me paguen en el futuro", "Según lo que puedo ahorrar en el presente"]
    }
  ]),

  ciberriesgos: campos([
    { fieldKey: "actividad_economica", label: "Actividad económica", pregunta: "¿Cuál es la actividad económica principal de tu empresa?" },
    {
      fieldKey: "numero_empleados",
      label: "Número de empleados",
      pregunta: "¿Cuántos empleados tiene tu empresa?",
      options: ["1 a 10", "11 a 50", "51 a 200", "Más de 200"]
    },
    {
      fieldKey: "ingresos_anuales_empresa",
      label: "Ingresos anuales (COP)",
      pregunta: "¿En qué rango están los ingresos anuales de tu empresa?",
      options: ["Menos de $500 millones", "Entre $500 y $2.000 millones", "Entre $2.000 y $10.000 millones", "Más de $10.000 millones"]
    },
    { fieldKey: "ciudad_operacion_empresa", label: "Ciudad de operación", pregunta: "¿En qué ciudad opera principalmente tu empresa?" }
  ]),

  rc_profesionales_medicos: campos([
    { fieldKey: "profesion_medica", label: "Profesión", pregunta: "¿Cuál es tu profesión?" },
    { fieldKey: "fecha_graduacion_profesional", label: "Fecha de graduación profesional", pregunta: "¿Cuándo te graduaste como profesional?", fieldType: "date" },
    { fieldKey: "especializacion_medica", label: "Especialización", pregunta: "¿Cuál es tu especialización?", requeridoCotizacion: false },
    {
      fieldKey: "fecha_graduacion_especialista",
      label: "Fecha de graduación como especialista",
      pregunta: "¿Cuándo te graduaste como especialista?",
      fieldType: "date",
      requeridoCotizacion: false
    }
  ]),

  transporte: campos([
    { fieldKey: "tipo_mercancia", label: "Tipo de mercancía", pregunta: "¿Qué tipo de mercancía vas a transportar?" },
    { fieldKey: "descripcion_mercancia", label: "Descripción de la mercancía", pregunta: "Descríbeme en detalle la mercancía a transportar." },
    {
      fieldKey: "naturaleza_riesgo",
      label: "Naturaleza del riesgo",
      pregunta: "¿Qué naturaleza de riesgo tiene la mercancía?",
      fieldType: "multiselect",
      options: [
        "Frágil",
        "Perecedero",
        "Inflamable",
        "Explosivo",
        "Tóxico",
        "Corrosivo",
        "Radiactivo",
        "Alto valor",
        "Sensible a temperatura",
        "Sensible a humedad",
        "Sensible a vibración",
        "Oxidable",
        "Requiere refrigeración",
        "Requiere congelación",
        "Requiere atmósfera controlada",
        "Sin riesgos especiales"
      ]
    },
    {
      fieldKey: "tipo_empaque",
      label: "Tipo de empaque",
      pregunta: "¿Qué tipo de empaque se usa para la mercancía?",
      fieldType: "multiselect",
      options: [
        "Cajas de cartón",
        "Cajas de madera",
        "Estibas (pallets)",
        "Contenedor de 20 pies",
        "Contenedor de 40 pies",
        "Contenedor refrigerado (reefer)",
        "Contenedor tanque",
        "Bultos sueltos",
        "Sacos",
        "Barriles",
        "Tambores metálicos",
        "Big bags",
        "Canastas plásticas",
        "Granel sólido",
        "Granel líquido",
        "Cisternas",
        "Rollos",
        "Embalaje industrial",
        "Empaque al vacío",
        "Film plástico (stretch)",
        "Sin empaque (carga suelta)",
        "Otro"
      ]
    }
  ])
};
