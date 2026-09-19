import { Type } from "@google/genai";
import type { AgentToolDefinition, AgentToolContext, AgentToolResult, AgentToolRulesContext } from "@/lib/agent-tools/registry";
import { getActiveWooCommerceConnectionSecrets } from "@/lib/woocommerce/connections-db";
import {
  credentialsFromConnection,
  buscarProductos,
  buscarPedidos,
  actualizarProducto,
  actualizarPedido,
  WooCommerceApiError,
  type WooCommerceProduct,
  type WooCommerceOrder
} from "@/lib/woocommerce/client";

/**
 * Tools de WooCommerce — consultan y actualizan la tienda EN VIVO en cada
 * llamada (decisión explícita del usuario, 2026-09-17: sin catálogo espejo en
 * Noova). Cada una repite el chequeo de permiso dentro de `execute` además de
 * `isEnabled` (mismo patrón que `buscarHorariosDisponiblesTool` en
 * src/lib/scheduling/tools.ts) para que un cambio de permiso a mitad de
 * conversación nunca se salte.
 */

function wooEnabled(ctx: AgentToolRulesContext): boolean {
  return Boolean(ctx.wooCommerceConnection) && ctx.wooCommerceRules.enabled;
}

function productToResult(p: WooCommerceProduct) {
  return {
    id: p.id,
    nombre: p.name,
    sku: p.sku,
    precio: p.price,
    en_oferta: Boolean(p.sale_price) && p.sale_price !== p.regular_price,
    stock: p.stock_quantity,
    disponible: p.stock_status === "instock",
    descripcion: p.short_description || p.description,
    categorias: p.categories.map(c => c.name),
    imagen_url: p.images[0]?.src ?? null,
    enlace: p.permalink
  };
}

function orderToResult(o: WooCommerceOrder) {
  return {
    id: o.id,
    numero: o.number,
    estado: o.status,
    total: o.total,
    moneda: o.currency,
    fecha: o.date_created,
    cliente: `${o.billing.first_name} ${o.billing.last_name}`.trim(),
    telefono_cliente: o.billing.phone,
    nota: o.customer_note,
    productos: o.line_items.map(i => ({ nombre: i.name, cantidad: i.quantity, total: i.total }))
  };
}

async function getWooCommerceCreds(ctx: AgentToolContext): Promise<ReturnType<typeof credentialsFromConnection> | null> {
  const secrets = await getActiveWooCommerceConnectionSecrets(ctx.db, ctx.organizationId);
  return secrets ? credentialsFromConnection(secrets) : null;
}

const NO_CONNECTION_RESULT: AgentToolResult = { ok: false, reason: "No hay una tienda WooCommerce conectada para esta empresa" };

export const consultarProductosWoocommerceTool: AgentToolDefinition = {
  name: "consultar_productos_woocommerce",
  declaration: {
    name: "consultar_productos_woocommerce",
    description:
      "Busca productos reales en la tienda WooCommerce de la empresa (por nombre, palabra clave o SKU) y devuelve precio, stock, descripción y enlace de compra actualizados en vivo. Úsala siempre que el cliente pregunte por un producto, precio o disponibilidad — nunca inventes esos datos.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        busqueda: { type: Type.STRING, description: "Nombre, palabra clave o SKU del producto que pregunta el cliente" }
      },
      required: ["busqueda"]
    }
  },
  isEnabled: ctx => wooEnabled(ctx) && ctx.wooCommerceRules.canReadProducts,
  buildPromptBlock() {
    return "Tienes acceso al catálogo real de WooCommerce de esta empresa vía consultar_productos_woocommerce. Úsala para cualquier pregunta sobre productos, precios o disponibilidad — no respondas de memoria.";
  },
  async execute(args, ctx): Promise<AgentToolResult> {
    if (!ctx.wooCommerceRules.canReadProducts) {
      return { ok: false, reason: "Este agente no tiene permiso para consultar productos de WooCommerce" };
    }
    const busqueda = String(args.busqueda ?? "").trim();
    if (!busqueda) return { ok: false, reason: "Falta el término de búsqueda" };

    const creds = await getWooCommerceCreds(ctx);
    if (!creds) return NO_CONNECTION_RESULT;

    try {
      const productos = await buscarProductos(creds, busqueda);
      return { ok: true, productos: productos.map(productToResult) };
    } catch (err) {
      return { ok: false, reason: err instanceof WooCommerceApiError ? err.message : "No pude consultar la tienda ahora mismo" };
    }
  }
};

export const consultarPedidosWoocommerceTool: AgentToolDefinition = {
  name: "consultar_pedidos_woocommerce",
  declaration: {
    name: "consultar_pedidos_woocommerce",
    description:
      "Busca pedidos reales en la tienda WooCommerce de la empresa (por número de pedido, nombre o teléfono del cliente) y devuelve su estado, total y productos actualizados en vivo.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        busqueda: { type: Type.STRING, description: "Número de pedido, nombre o teléfono del cliente" }
      },
      required: ["busqueda"]
    }
  },
  isEnabled: ctx => wooEnabled(ctx) && ctx.wooCommerceRules.canReadOrders,
  buildPromptBlock() {
    return "Tienes acceso a los pedidos reales de WooCommerce de esta empresa vía consultar_pedidos_woocommerce.";
  },
  async execute(args, ctx): Promise<AgentToolResult> {
    if (!ctx.wooCommerceRules.canReadOrders) {
      return { ok: false, reason: "Este agente no tiene permiso para consultar pedidos de WooCommerce" };
    }
    const busqueda = String(args.busqueda ?? "").trim();
    if (!busqueda) return { ok: false, reason: "Falta el número de pedido o dato del cliente" };

    const creds = await getWooCommerceCreds(ctx);
    if (!creds) return NO_CONNECTION_RESULT;

    try {
      const pedidos = await buscarPedidos(creds, { search: busqueda });
      return { ok: true, pedidos: pedidos.map(orderToResult) };
    } catch (err) {
      return { ok: false, reason: err instanceof WooCommerceApiError ? err.message : "No pude consultar la tienda ahora mismo" };
    }
  }
};

export const actualizarProductoWoocommerceTool: AgentToolDefinition = {
  name: "actualizar_producto_woocommerce",
  declaration: {
    name: "actualizar_producto_woocommerce",
    description:
      "Actualiza el stock y/o precio de un producto real en la tienda WooCommerce de la empresa. Esta acción es visible de inmediato en la tienda pública — solo úsala cuando el cliente/asesor lo haya pedido explícitamente.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        producto_id: { type: Type.NUMBER, description: "Id de WooCommerce del producto (obtenido antes con consultar_productos_woocommerce)" },
        stock: { type: Type.NUMBER, description: "Nueva cantidad en stock. Opcional." },
        precio: { type: Type.STRING, description: "Nuevo precio regular. Opcional." }
      },
      required: ["producto_id"]
    }
  },
  isEnabled: ctx => wooEnabled(ctx) && ctx.wooCommerceRules.canWriteProducts,
  buildPromptBlock() {
    return "Puedes actualizar stock/precio de productos reales en WooCommerce vía actualizar_producto_woocommerce — el cambio se refleja de inmediato en la tienda pública, así que solo hazlo si te lo pidieron explícitamente.";
  },
  async execute(args, ctx): Promise<AgentToolResult> {
    if (!ctx.wooCommerceRules.canWriteProducts) {
      return { ok: false, reason: "Este agente no tiene permiso para actualizar productos de WooCommerce" };
    }
    const productoId = Number(args.producto_id);
    if (!Number.isFinite(productoId)) return { ok: false, reason: "Falta el id del producto" };

    const cambios: { stock_quantity?: number; regular_price?: string } = {};
    if (args.stock !== undefined) cambios.stock_quantity = Number(args.stock);
    if (args.precio !== undefined) cambios.regular_price = String(args.precio);
    if (Object.keys(cambios).length === 0) return { ok: false, reason: "No hay ningún cambio para aplicar" };

    const creds = await getWooCommerceCreds(ctx);
    if (!creds) return NO_CONNECTION_RESULT;

    try {
      const producto = await actualizarProducto(creds, productoId, cambios);
      return { ok: true, producto: productToResult(producto) };
    } catch (err) {
      return { ok: false, reason: err instanceof WooCommerceApiError ? err.message : "No pude actualizar el producto ahora mismo" };
    }
  }
};

export const actualizarPedidoWoocommerceTool: AgentToolDefinition = {
  name: "actualizar_pedido_woocommerce",
  declaration: {
    name: "actualizar_pedido_woocommerce",
    description:
      "Actualiza el estado y/o agrega una nota a un pedido real en WooCommerce (ej. marcarlo como procesado tras confirmar el pago). Solo úsala cuando el cliente/asesor lo haya pedido explícitamente.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        pedido_id: { type: Type.NUMBER, description: "Id de WooCommerce del pedido (obtenido antes con consultar_pedidos_woocommerce)" },
        estado: {
          type: Type.STRING,
          description: "Nuevo estado del pedido (ej. processing, completed, on-hold, cancelled). Opcional."
        },
        nota: { type: Type.STRING, description: "Nota a agregar al pedido. Opcional." }
      },
      required: ["pedido_id"]
    }
  },
  isEnabled: ctx => wooEnabled(ctx) && ctx.wooCommerceRules.canWriteOrders,
  buildPromptBlock() {
    return "Puedes actualizar estado/notas de pedidos reales en WooCommerce vía actualizar_pedido_woocommerce.";
  },
  async execute(args, ctx): Promise<AgentToolResult> {
    if (!ctx.wooCommerceRules.canWriteOrders) {
      return { ok: false, reason: "Este agente no tiene permiso para actualizar pedidos de WooCommerce" };
    }
    const pedidoId = Number(args.pedido_id);
    if (!Number.isFinite(pedidoId)) return { ok: false, reason: "Falta el id del pedido" };

    const cambios: { status?: string; customer_note?: string } = {};
    if (args.estado) cambios.status = String(args.estado);
    if (args.nota) cambios.customer_note = String(args.nota);
    if (Object.keys(cambios).length === 0) return { ok: false, reason: "No hay ningún cambio para aplicar" };

    const creds = await getWooCommerceCreds(ctx);
    if (!creds) return NO_CONNECTION_RESULT;

    try {
      const pedido = await actualizarPedido(creds, pedidoId, cambios);
      return { ok: true, pedido: orderToResult(pedido) };
    } catch (err) {
      return { ok: false, reason: err instanceof WooCommerceApiError ? err.message : "No pude actualizar el pedido ahora mismo" };
    }
  }
};

export const WOOCOMMERCE_TOOLS: AgentToolDefinition[] = [
  consultarProductosWoocommerceTool,
  consultarPedidosWoocommerceTool,
  actualizarProductoWoocommerceTool,
  actualizarPedidoWoocommerceTool
];
