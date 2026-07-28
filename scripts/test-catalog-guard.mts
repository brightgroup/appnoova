/**
 * Batería de regresión del blindaje de catálogo: búsqueda de filas, resolución
 * de marcadores y los tres guardianes (campos, enlaces, importes).
 *
 * Cubre los casos que llegaron mal a clientes reales de Leyer Editores y los
 * que NO deben tocarse (envíos, citas normativas, teléfonos, horarios), que son
 * la otra mitad del riesgo: un guardián que corrige de más rompe respuestas
 * buenas.
 *
 * Uso: npx tsx scripts/test-catalog-guard.mts
 */
import { enforceCatalogFacts } from "../src/lib/data-tables/catalog-guard";
import { resolveProductCards } from "../src/lib/data-tables/format-context";
import { selectRowsForMessage } from "../src/lib/data-tables/search-rows";
import { pinRowsMentionedIn, mergeRowsUnique } from "../src/lib/data-tables/pinned-rows";
import { detectAssistantHandoffOffer } from "../src/lib/text-handoff";
import type { DataTableColumn, DataTableRowRecord } from "../src/types/data-table";

let pass = 0;
let fail = 0;

function check(name: string, ok: boolean, detail?: unknown) {
  if (ok) {
    pass++;
    console.log(`  PASS  ${name}`);
  } else {
    fail++;
    console.log(`  FALLA ${name}${detail === undefined ? "" : `\n        ${JSON.stringify(detail)}`}`);
  }
}

function section(title: string) {
  console.log(`\n=== ${title} ===`);
}

// ---------------------------------------------------------------------------
// Catálogo de prueba: mismas columnas y forma que la tabla real de Leyer.
// ---------------------------------------------------------------------------
const columns = [
  { key: "categoria", label: "Categoría", type: "text", display: true, filterable: true },
  { key: "nombre", label: "Nombre", type: "text", display: true, filterable: false },
  { key: "autor_catalogo", label: "Autor (catálogo)", type: "text", display: true, filterable: false },
  { key: "autor_completo", label: "Autor completo", type: "text", display: true, filterable: false },
  { key: "ed", label: "Ed.", type: "number", display: true, filterable: false },
  { key: "ano", label: "Año", type: "number", display: true, filterable: false },
  { key: "codigo", label: "Codigo", type: "text", display: true, filterable: false },
  { key: "paginas", label: "Páginas", type: "number", display: true, filterable: false },
  { key: "link", label: "Link", type: "text", display: true, filterable: false },
  { key: "precio_cop", label: "Precio COP", type: "number", display: true, filterable: false },
  { key: "resena", label: "Reseña", type: "text", display: true, filterable: false },
] as unknown as DataTableColumn[];

function row(
  id: string,
  nombre: string,
  precio: number,
  extra: Partial<Record<string, unknown>> = {}
): DataTableRowRecord {
  const slug = nombre.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  return {
    id,
    is_active: true,
    sort_order: 0,
    data: {
      categoria: "Códigos",
      nombre,
      autor_catalogo: "Gómez Sierra, Francisco",
      autor_completo: "Francisco Gómez Sierra",
      ed: 43,
      ano: 2026,
      codigo: `978-958-795-${id}`,
      paginas: 1200,
      link: `https://edileyer.com/tienda/codigos/${slug}/`,
      precio_cop: precio,
      resena: "Desarrollo normativo concordado con jurisprudencia de la Corte Constitucional.",
      ...extra,
    },
  } as unknown as DataTableRowRecord;
}

const anotada = row("631-3", "Constitución Política de Colombia Anotada", 160000);
const basica = row("611-5", "Constitución Política de Colombia Básica", 80000, { ed: 38 });
const bolsillo = row("601-6", "Constitución Política de Colombia Bolsillo", 65000, { ed: 11 });
const comentada = row("660-3", "Constitución Política de Colombia Comentada", 450000, { ed: 3 });
const civilAnotado = row("civil1", "Código Civil Anotado", 192000, {
  autor_catalogo: "Tafur González, Álvaro",
  autor_completo: "Álvaro Tafur González",
  ed: 44,
});
const penal = row("penal1", "Código Penal Anotado", 150000);

const catalogo = [anotada, basica, bolsillo, comentada, civilAnotado, penal];

/** Prompt del agente: importes y enlaces que el negocio sí autoriza. */
const PROMPT =
  "Costo de envío $20.000 para amazonas y $9.000 para los demás departamentos. " +
  "Bono regalo mínimo $50.000. Descuentos de hasta 25%. " +
  "Sitio web: www.edileyer.com. Línea de atención 315 800 6316. Tel (601) 8966557.";

const guard = (reply: string, rows: DataTableRowRecord[] = catalogo) =>
  enforceCatalogFacts(reply, rows, columns, PROMPT);

// ---------------------------------------------------------------------------
section("Búsqueda: qué filas llegan al modelo");
// ---------------------------------------------------------------------------
{
  const nombres = (msg: string, rows = catalogo) =>
    selectRowsForMessage(rows, columns, msg).rows.map(r => String(r.data.nombre));

  // El caso que originó todo: dos productos en un mismo mensaje.
  const dos = nombres("Me gustaría saber más información de estos dos: Código Civil Anotado y la Constitución Política Anotada");
  check("dos productos en un mensaje devuelven ambos",
    dos.includes("Código Civil Anotado") && dos.includes("Constitución Política de Colombia Anotada"), dos);

  const abrev = nombres("cuanto vale la constitucion anotada");
  check("nombre abreviado encuentra la fila", abrev.includes("Constitución Política de Colombia Anotada"), abrev);

  const porCodigo = nombres("tienen el 978-958-795-631-3?");
  check("búsqueda por ISBN", porCodigo.includes("Constitución Política de Colombia Anotada"), porCodigo);

  const familia = nombres("que versiones tienen de la constitucion politica");
  check("familia de producto devuelve varias versiones", familia.length >= 3, familia);

  const tres = nombres("precio de la constitucion basica, la anotada y el codigo penal anotado");
  check("tres productos en un mensaje", tres.length >= 3, tres);

  // Descripción automática de una imagen: texto largo que menciona de pasada
  // "catálogo" y "opciones" — no debe interpretarse como pedir categorías.
  const imagen = selectRowsForMessage(catalogo, columns,
    "La imagen muestra la pantalla de un celular a las 6:16 con 38% de batería y señal 5G. " +
    "Se ve una app con opciones de navegación como Catálogo y Mi cuenta, y en el centro un libro " +
    "titulado Constitución Política de Colombia Anotada con su portada azul.", );
  check("descripción de imagen larga no dispara rama de categorías",
    imagen.rows.some(r => String(r.data.nombre).includes("Anotada")), imagen.rows.map(r => r.data.nombre));

  // Seguimiento sin nombre de producto: el ancla lo mantiene en contexto.
  const seguimiento = selectRowsForMessage(catalogo, columns, "y ese precio es en fisico?");
  const anclado = mergeRowsUnique(
    seguimiento.rows,
    pinRowsMentionedIn("*Título:* Constitución Política de Colombia Anotada\n*Precio:* $160.000", catalogo, columns)
  );
  check("seguimiento conserva el producto ya mencionado",
    anclado.some(r => r.id === anotada.id), anclado.map(r => r.data.nombre));
}

// ---------------------------------------------------------------------------
section("Marcadores [[FICHA]] resueltos contra la fila real");
// ---------------------------------------------------------------------------
{
  const conMarcador = resolveProductCards(
    `*Precio:* [[FICHA:${anotada.id}:Precio COP]]`, catalogo, columns);
  check("marcador de campo se sustituye por el valor real", conMarcador.includes("$160.000"), conMarcador);

  const inventado = resolveProductCards("*Precio:* [[FICHA:no-existe:Precio COP]]", catalogo, columns);
  check("marcador con REF inventado se elimina",
    !inventado.includes("FICHA") && !inventado.includes("no-existe"), inventado);
}

// ---------------------------------------------------------------------------
section("Precios: se corrige lo falso, se respeta lo correcto");
// ---------------------------------------------------------------------------
{
  let r = guard("La *Constitución Política de Colombia Anotada* cuesta $160.000.");
  check("precio correcto intacto", r.violations.length === 0 && r.text.includes("$160.000"), r.text);

  r = guard("La *Constitución Política de Colombia Anotada* cuesta $89.000.");
  check("precio inventado corregido", r.text.includes("$160.000") && !r.text.includes("$89.000"), r.text);

  // El precio existe... pero es de OTRO producto. No vale como coartada.
  r = guard("La *Constitución Política de Colombia Anotada* cuesta $80.000.");
  check("precio de otra fila no se acepta", r.text.includes("$160.000") && !r.text.includes("$80.000"), r.text);

  r = guard("El *Código de Comercio* cuesta $75.000.");
  check("precio de producto ausente se elimina y escala",
    r.needsHuman && !r.text.includes("$75.000"), r.text);

  r = guard("Ese libro cuesta $77.000.", []);
  check("sin filas recuperadas, el precio se elimina", r.needsHuman && !r.text.includes("$77.000"), r.text);

  r = guard("La *Constitución Política de Colombia Anotada* tiene un valor de 160.000 pesos.");
  check("importe sin símbolo pero correcto se respeta", r.violations.length === 0, r.text);

  r = guard("El precio de la *Constitución Política de Colombia Anotada* es $160.000 COP.");
  check("sufijo COP no rompe la validación", r.violations.length === 0, r.text);

  r = guard(`*Constitución Política de Colombia Bolsillo:* $65.000
*Constitución Política de Colombia Básica:* $80.000
*Constitución Política de Colombia Anotada:* $160.000
*Constitución Política de Colombia Comentada:* $450.000`);
  check("listado de 4 versiones con precios correctos intacto", r.violations.length === 0, r.text);

  r = guard(`* Constitución Política de Colombia Bolsillo: $65.000
* Constitución Política de Colombia Básica: $95.000
* Constitución Política de Colombia Anotada: $160.000`);
  check("listado con un precio alterado se corrige solo en esa línea",
    r.text.includes("$80.000") && r.text.includes("$65.000") && r.text.includes("$160.000") && !r.text.includes("$95.000"), r.text);

  r = guard("La *Constitución Política de Colombia Básica* cuesta $80.000 y el envío a Bogotá $9.000, para un total de $89.000.");
  check("suma libro + envío en una sola línea", r.violations.length === 0, r.text);

  r = guard("La *Constitución Política de Colombia Básica* cuesta $80.000.\n\nCon el envío, el total es $89.000.");
  check("total en otro párrafo", r.violations.length === 0, r.text);

  r = guard("El *Código Civil Anotado* cuesta $150.000.");
  check("suma no se usa como excusa fuera de una línea de total",
    r.text.includes("$192.000") && !r.text.includes("$150.000"), r.text);

  r = guard("El envío cuesta $9.000 y a Amazonas $20.000. El bono mínimo es de $50.000.");
  check("importes autorizados por el prompt intactos", r.violations.length === 0, r.text);
}

// ---------------------------------------------------------------------------
section("Campos de ficha: autor, edición, año, código");
// ---------------------------------------------------------------------------
{
  const ficha = (autor: string, edAno: string, precio: string, link: string) =>
    `*Título:* Constitución Política de Colombia Anotada
*Autor:* ${autor}
*Edición/Año:* ${edAno}
*Formato:* Físico y digital
*Precio:* ${precio}
*Compra directa:* ${link}`;
  const LINK = String(anotada.data.link);

  let r = guard(ficha("Francisco Gómez Sierra", "43 / 2026", "$160.000", LINK));
  check("ficha correcta intacta", r.violations.length === 0, r.text);

  r = guard(ficha("Leyer", "43 / 2026", "$160.000", LINK));
  check("autor inventado corregido", r.text.includes("Gómez Sierra") && !/\*Autor:\* Leyer\b/.test(r.text), r.text);

  r = guard(ficha("Gómez Sierra, Francisco", "43 / 2026", "$160.000", LINK));
  check("autor en otro orden se acepta", r.violations.length === 0, r.text);

  r = guard(ficha("Francisco Gómez Sierra", "44 / 2026", "$160.000", LINK));
  check("edición inventada corregida", r.text.includes("43 / 2026") && !r.text.includes("44 / 2026"), r.text);

  r = guard(ficha("Francisco Gómez Sierra", "43 / 2025", "$160.000", LINK));
  check("año inventado corregido", r.text.includes("2026") && !r.text.includes("2025"), r.text);

  r = guard(ficha("Francisco Gómez Sierra", "43 / 2026", "$160.000", LINK));
  check("campo ajeno a la tabla (Formato) intacto", r.text.includes("*Formato:* Físico y digital"), r.text);

  r = guard("*Título:* Constitución Política de Colombia Anotada\n*Código:* 978-111-222-333-4");
  check("ISBN inventado corregido", r.text.includes("978-958-795-631-3"), r.text);

  r = guard("*Título:* Constitución Política de Colombia Anotada\n*Páginas:* 350");
  check("páginas inventadas corregidas", r.text.includes("1.200") || r.text.includes("1200"), r.text);

  const sinAutor = [{ ...anotada, data: { ...anotada.data, autor_catalogo: "", autor_completo: "" } }] as DataTableRowRecord[];
  r = guard("*Título:* Constitución Política de Colombia Anotada\n*Autor:* Editorial Leyer", sinAutor);
  check("columna vacía en la fila: se elimina la línea y escala",
    r.needsHuman && !r.text.includes("Editorial Leyer"), r.text);

  r = guard("*PRECIO:* $89.000 de la Constitución Política de Colombia Anotada");
  check("etiqueta en mayúsculas también se valida", r.text.includes("$160.000"), r.text);

  r = guard("*Horario:* Lunes a viernes de 9 a 5\n*Teléfono:* 300 279 6489");
  check("etiquetas que no son columnas quedan intactas",
    r.violations.length === 0 && r.text.includes("300 279 6489"), r.text);
}

// ---------------------------------------------------------------------------
section("Campos: contexto añadido vs. cifras inventadas");
// ---------------------------------------------------------------------------
{
  let r = guard("*Precio:* $160.000 COP\n*Título:* Constitución Política de Colombia Anotada");
  check("contexto textual junto al precio se acepta", r.violations.length === 0, r.text);

  r = guard("*Autor:* Francisco Gómez Sierra, reconocido jurista\n*Título:* Constitución Política de Colombia Anotada");
  check("aposición junto al autor se acepta", r.violations.length === 0, r.text);

  r = guard("*Título:* Constitución Política de Colombia Anotada\n*Precio:* $160.000 con descuento a $120.000");
  check("cifra extra en campo numérico se descarta",
    r.text.includes("$160.000") && !r.text.includes("120.000"), r.text);

  r = guard("*Título:* Constitución Política de Colombia Anotada\n*Páginas:* 1.200");
  check("separador de miles opcional no cuenta como diferencia", r.violations.length === 0, r.text);

  r = guard("*Título:* Constitución Política de Colombia Anotada\n*Edición/Año:* 43 / 2026");
  check("etiqueta compuesta correcta intacta", r.violations.length === 0, r.text);

  // Precio correcto pero acompañado del nombre en la misma línea: la línea se
  // normaliza y el guardián de importes no debe borrar su propia corrección.
  r = guard("*PRECIO:* $89.000 de la Constitución Política de Colombia Anotada");
  check("corrección en línea con texto extra sobrevive al guardián de importes",
    r.text.includes("$160.000") && !r.text.includes("$89.000"), r.text);
}

// ---------------------------------------------------------------------------
section("Enlaces");
// ---------------------------------------------------------------------------
{
  let r = guard(`Puedes comprarlo aquí: ${anotada.data.link}`);
  check("enlace real del catálogo intacto", r.violations.length === 0, r.text);

  r = guard("Puedes comprarlo aquí: https://edileyer.com/tienda/codigos/codigo-de-comercio-anotado/");
  check("enlace deducido que no existe se elimina y escala",
    r.needsHuman && !r.text.includes("codigo-de-comercio"), r.text);

  r = guard("Visita www.edileyer.com para ver el catálogo completo.");
  check("dominio del prompt intacto", r.violations.length === 0, r.text);

  r = guard(`Míralo en ${anotada.data.link}.`);
  check("enlace con punto final intacto", r.violations.length === 0, r.text);
}

// ---------------------------------------------------------------------------
section("Falsos positivos: lo que NO debe tocarse");
// ---------------------------------------------------------------------------
{
  const intacto = (name: string, reply: string, rows: DataTableRowRecord[] = catalogo) => {
    const r = enforceCatalogFacts(reply, rows, columns, PROMPT);
    check(name, r.violations.length === 0 && r.text.trim() === reply.trim(), { out: r.text, v: r.violations });
  };

  intacto("horario de librería", "Nuestra librería en Manizales atiende de lunes a viernes de 9:00 a.m. a 1:00 p.m. y de 2:00 p.m. a 5:30 p.m.");
  intacto("teléfonos y direcciones", "Estamos en la calle 23 no. 23-46, teléfono 300 279 6489. También al 315 800 6316.");
  intacto("cita normativa junto a la palabra precio",
    "El precio de la obra sobre la Ley 1.098 de 2006 no lo tengo a la mano.");
  intacto("varias citas normativas", "La obra desarrolla la Ley 1.437 de 2011 y el Decreto 1.070 de 2015.");
  intacto("porcentaje de descuento", "Tenemos descuentos de hasta 25% en publicaciones jurídicas.");
  intacto("saludo con dos puntos", "Hola Isabel: con gusto te ayudo con tu consulta.");
  intacto("pregunta de seguimiento sin datos", "¿Deseas que te comparta el enlace de compra o prefieres pasar por la librería?");
  intacto("mención de producto sin dar datos",
    "Sí, tenemos la *Constitución Política de Colombia Anotada* disponible en formato físico y digital.");
  intacto("años sin separador de miles", "La edición de 2026 ya está disponible desde marzo de 2026.");
  intacto("respuesta de envío estándar",
    "Los pedidos se entregan entre 2 y 5 días hábiles después del despacho, según la transportadora.");

  // Agente sin columna de precios: el guardián de importes no debe intervenir.
  const sinPrecio = [
    { key: "nombre", label: "Nombre", type: "text", display: true, filterable: false },
    { key: "ciudad", label: "Ciudad", type: "text", display: true, filterable: false },
  ] as unknown as DataTableColumn[];
  const sedes = [{ id: "s1", data: { nombre: "Librería Manizales", ciudad: "Manizales" } }] as unknown as DataTableRowRecord[];
  const r = enforceCatalogFacts("El bono regalo cuesta $50.000.", sedes, sinPrecio, PROMPT);
  check("tabla sin columna de precio: no interviene", r.violations.length === 0, r.text);
}

// ---------------------------------------------------------------------------
section("Traspaso a asesor");
// ---------------------------------------------------------------------------
{
  let r = guard("La *Constitución Política de Colombia Anotada* cuesta $89.000.");
  check("corrección no escala (el cliente recibe el dato bueno)", !r.needsHuman, r.text);

  r = guard("El *Código de Comercio* cuesta $75.000.");
  check("eliminación escala", r.needsHuman, r.text);
  check("el aviso de traspaso es detectado por el handoff", detectAssistantHandoffOffer(r.text), r.text);

  r = guard("El *Código de Comercio* cuesta $75.000.\n\nMíralo en https://edileyer.com/tienda/otro/");
  check("aviso de traspaso aparece una sola vez",
    r.text.split("Te paso con un asesor").length - 1 === 1, r.text);

  r = guard("Nuestro horario es de 9:00 a.m. a 5:30 p.m.");
  check("respuesta sin datos de producto no escala", !r.needsHuman, r.text);
}

// ---------------------------------------------------------------------------
section("Robustez");
// ---------------------------------------------------------------------------
{
  const casos: [string, string][] = [
    ["respuesta vacía", ""],
    ["solo espacios", "   \n  "],
    ["solo emoji", "📚"],
    ["línea con dos puntos sin valor", "Precio:"],
    ["muchos saltos de línea", "Hola\n\n\n\nAdiós"],
    ["texto muy largo", "Sí. ".repeat(2000)],
  ];
  for (const [name, reply] of casos) {
    try {
      const r = guard(reply);
      check(`no revienta con ${name}`, typeof r.text === "string");
    } catch (err) {
      check(`no revienta con ${name}`, false, String(err));
    }
  }

  const r = guard("La *Constitución Política de Colombia Anotada* cuesta $160.000.", []);
  check("sin filas, un precio real del catálogo tampoco se cuela", r.needsHuman, r.text);
}

// ---------------------------------------------------------------------------
console.log(`\n${"=".repeat(46)}\nTOTAL: ${pass} pasaron, ${fail} fallaron\n`);
process.exit(fail === 0 ? 0 : 1);
