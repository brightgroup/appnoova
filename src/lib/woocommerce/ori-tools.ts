import { Type } from "@google/genai";
import type { OriToolDefinition, OriToolContext, OriToolResult } from "@/lib/agent-tools/ori-tools";
import { getActiveWooCommerceConnectionSecrets } from "@/lib/woocommerce/connections-db";
import { normalizeWooCommerceRules, type WooCommerceRules } from "@/lib/woocommerce/rules";
import {
  credentialsFromConnection,
  buscarProductos,
  buscarPedidos,
  actualizarProducto,
  actualizarPedido,
  WooCommerceApiError
} from "@/lib/woocommerce/client";

/**
 * Tools de WooCommerce para Ori (copiloto interno). A diferencia de
 * `AgentToolDefinition`, `OriToolDefinition` no tiene `isEnabled` — Ori no
 * tiene hoy una página de "reglas por agente" como los agentes de texto, así
 * que el permiso vive a nivel de organización (`organizations.woocommerce_ori_rules`,
 * editado desde /dashboard/conectores/woocommerce) y cada tool lo resuelve
 * ella misma dentro de `execute`, mismo criterio que las tools de inventario
 * resuelven `organizationId` directo en su query.
 */

async function getOriWooCommerceRules(ctx: OriToolContext): Promise<WooCommerceRules> {
  const { data } = await ctx.db.from("organizations").select("woocommerce_ori_rules").eq("id", ctx.organizationId).maybeSingle();
  return normalizeWooCommerceRules(data?.woocommerce_ori_rules);
}

async function getCredsOrFail(ctx: OriToolContext) {
  const secrets = await getActiveWooCommerceConnectionSecrets(ctx.db, ctx.organizationId);
  if (!secrets) return { ok: false as const, reason: "No hay una tienda WooCommerce conectada para esta empresa" };
  return { ok: true as const, creds: credentialsFromConnection(secrets) };
}

export const oriConsultarProductosWoocommerceTool: OriToolDefinition = {
  name: "consultar_productos_woocommerce",
  declaration: {
    name: "consultar_productos_woocommerce",
    description: "Busca productos reales en la tienda WooCommerce de la empresa (por nombre, palabra clave o SKU): precio, stock y disponibilidad en vivo.",
    parameters: {
      type: Type.OBJECT,
      properties: { busqueda: { type: Type.STRING, description: "Nombre, palabra clave o SKU del producto" } },
      required: ["busqueda"]
    }
  },
  promptBlock: "Tienes acceso al catálogo real de WooCommerce vía consultar_productos_woocommerce — úsala en vez de responder de memoria.",
  async execute(args, ctx): Promise<OriToolResult> {
    const rules = await getOriWooCommerceRules(ctx);
    if (!rules.enabled || !rules.canReadProducts) {
      return { ok: false, reason: "Ori no tiene permiso para consultar productos de WooCommerce en esta organización" };
    }
    const busqueda = String(args.busqueda ?? "").trim();
    if (!busqueda) return { ok: false, reason: "Falta el término de búsqueda" };

    const credsResult = await getCredsOrFail(ctx);
    if (!credsResult.ok) return credsResult;

    try {
      const productos = await buscarProductos(credsResult.creds, busqueda);
      return {
        ok: true,
        productos: productos.map(p => ({
          id: p.id,
          nombre: p.name,
          precio: p.price,
          stock: p.stock_quantity,
          disponible: p.stock_status === "instock",
          enlace: p.permalink
        }))
      };
    } catch (err) {
      return { ok: false, reason: err instanceof WooCommerceApiError ? err.message : "No pude consultar la tienda ahora mismo" };
    }
  }
};

export const oriConsultarPedidosWoocommerceTool: OriToolDefinition = {
  name: "consultar_pedidos_woocommerce",
  declaration: {
    name: "consultar_pedidos_woocommerce",
    description: "Busca pedidos reales en WooCommerce (por número, nombre o teléfono del cliente): estado, total y productos en vivo.",
    parameters: {
      type: Type.OBJECT,
      properties: { busqueda: { type: Type.STRING, description: "Número de pedido, nombre o teléfono del cliente" } },
      required: ["busqueda"]
    }
  },
  promptBlock: "Tienes acceso a los pedidos reales de WooCommerce vía consultar_pedidos_woocommerce.",
  async execute(args, ctx): Promise<OriToolResult> {
    const rules = await getOriWooCommerceRules(ctx);
    if (!rules.enabled || !rules.canReadOrders) {
      return { ok: false, reason: "Ori no tiene permiso para consultar pedidos de WooCommerce en esta organización" };
    }
    const busqueda = String(args.busqueda ?? "").trim();
    if (!busqueda) return { ok: false, reason: "Falta el número de pedido o dato del cliente" };

    const credsResult = await getCredsOrFail(ctx);
    if (!credsResult.ok) return credsResult;

    try {
      const pedidos = await buscarPedidos(credsResult.creds, { search: busqueda });
      return {
        ok: true,
        pedidos: pedidos.map(o => ({
          id: o.id,
          numero: o.number,
          estado: o.status,
          total: o.total,
          cliente: `${o.billing.first_name} ${o.billing.last_name}`.trim()
        }))
      };
    } catch (err) {
      return { ok: false, reason: err instanceof WooCommerceApiError ? err.message : "No pude consultar la tienda ahora mismo" };
    }
  }
};

export const oriActualizarProductoWoocommerceTool: OriToolDefinition = {
  name: "actualizar_producto_woocommerce",
  declaration: {
    name: "actualizar_producto_woocommerce",
    description: "Actualiza stock y/o precio de un producto real en WooCommerce. Se refleja de inmediato en la tienda pública.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        producto_id: { type: Type.NUMBER, description: "Id de WooCommerce del producto" },
        stock: { type: Type.NUMBER, description: "Nueva cantidad en stock. Opcional." },
        precio: { type: Type.STRING, description: "Nuevo precio regular. Opcional." }
      },
      required: ["producto_id"]
    }
  },
  promptBlock: "Puedes actualizar stock/precio de productos reales en WooCommerce vía actualizar_producto_woocommerce — el cambio es visible de inmediato en la tienda pública.",
  async execute(args, ctx): Promise<OriToolResult> {
    const rules = await getOriWooCommerceRules(ctx);
    if (!rules.enabled || !rules.canWriteProducts) {
      return { ok: false, reason: "Ori no tiene permiso para actualizar productos de WooCommerce en esta organización" };
    }
    const productoId = Number(args.producto_id);
    if (!Number.isFinite(productoId)) return { ok: false, reason: "Falta el id del producto" };

    const cambios: { stock_quantity?: number; regular_price?: string } = {};
    if (args.stock !== undefined) cambios.stock_quantity = Number(args.stock);
    if (args.precio !== undefined) cambios.regular_price = String(args.precio);
    if (Object.keys(cambios).length === 0) return { ok: false, reason: "No hay ningún cambio para aplicar" };

    const credsResult = await getCredsOrFail(ctx);
    if (!credsResult.ok) return credsResult;

    try {
      const producto = await actualizarProducto(credsResult.creds, productoId, cambios);
      return { ok: true, producto_id: producto.id, stock: producto.stock_quantity, precio: producto.price };
    } catch (err) {
      return { ok: false, reason: err instanceof WooCommerceApiError ? err.message : "No pude actualizar el producto ahora mismo" };
    }
  }
};

export const oriActualizarPedidoWoocommerceTool: OriToolDefinition = {
  name: "actualizar_pedido_woocommerce",
  declaration: {
    name: "actualizar_pedido_woocommerce",
    description: "Actualiza el estado y/o agrega una nota a un pedido real en WooCommerce.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        pedido_id: { type: Type.NUMBER, description: "Id de WooCommerce del pedido" },
        estado: { type: Type.STRING, description: "Nuevo estado del pedido (ej. processing, completed, on-hold, cancelled). Opcional." },
        nota: { type: Type.STRING, description: "Nota a agregar al pedido. Opcional." }
      },
      required: ["pedido_id"]
    }
  },
  promptBlock: "Puedes actualizar estado/notas de pedidos reales en WooCommerce vía actualizar_pedido_woocommerce.",
  async execute(args, ctx): Promise<OriToolResult> {
    const rules = await getOriWooCommerceRules(ctx);
    if (!rules.enabled || !rules.canWriteOrders) {
      return { ok: false, reason: "Ori no tiene permiso para actualizar pedidos de WooCommerce en esta organización" };
    }
    const pedidoId = Number(args.pedido_id);
    if (!Number.isFinite(pedidoId)) return { ok: false, reason: "Falta el id del pedido" };

    const cambios: { status?: string; customer_note?: string } = {};
    if (args.estado) cambios.status = String(args.estado);
    if (args.nota) cambios.customer_note = String(args.nota);
    if (Object.keys(cambios).length === 0) return { ok: false, reason: "No hay ningún cambio para aplicar" };

    const credsResult = await getCredsOrFail(ctx);
    if (!credsResult.ok) return credsResult;

    try {
      const pedido = await actualizarPedido(credsResult.creds, pedidoId, cambios);
      return { ok: true, pedido_id: pedido.id, estado: pedido.status };
    } catch (err) {
      return { ok: false, reason: err instanceof WooCommerceApiError ? err.message : "No pude actualizar el pedido ahora mismo" };
    }
  }
};

export const ORI_WOOCOMMERCE_TOOLS: OriToolDefinition[] = [
  oriConsultarProductosWoocommerceTool,
  oriConsultarPedidosWoocommerceTool,
  oriActualizarProductoWoocommerceTool,
  oriActualizarPedidoWoocommerceTool
];
