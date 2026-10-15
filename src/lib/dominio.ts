// Reglas de negocio compartidas entre áreas — puerto a TypeScript de
// maqueta/store.js. Vive acá (no en cada página) para que Bodega, Cobranzas
// y Vendedores deriven su vista del MISMO pedido sin duplicar lógica.

import type { Pedido, Producto } from "@prisma/client";

export type PedidoConProductos = Pedido & { productos: Producto[] };

// "Pendiente" y "Pendiente de pago" se quitaron del tablero de Luisana
// (ya no son columnas que ella gestione a la vista) — pero siguen
// existiendo como ESTADO del pedido: "Pendiente de pago" lo sigue poniendo
// solicitarAbono() (abono en 2 pasos) y lo gestiona Cobranzas/Vendedores
// igual que antes (calcColumnaCobranza/calcColumnaVendedor no cambiaron).
export const COLUMNAS_DESPACHO = [
  { id: "ingreso", nombre: "Ingreso" },
  { id: "por_pedir", nombre: "Por pedir" },
  { id: "salida_bodega", nombre: "Salida de bodega" },
  { id: "despacho", nombre: "Despacho" },
  // "Despachado" se partió en 3 (§5g.3 del documento): Listo para retiro
  // (compartida con Bodega — el pedido quedó preparado, esperando que lo
  // retire el transportista o el cliente), En tránsito (ya lo retiraron,
  // viaja al cliente) y Entregado (la API del transportista lo confirma,
  // o el cliente retira en persona). Partirla permite detectar cargas
  // paradas en tránsito sin pasar a entregado.
  { id: "listo_retiro", nombre: "Listo para retiro" },
  { id: "en_transito", nombre: "En tránsito" },
  { id: "entregado", nombre: "Entregado" },
] as const;

// Estados terminales del ciclo de despacho — reemplazan al viejo
// "despachado" único; Bodega los trata todos como "ya se fue" (ver
// calcColumnaBodega) y ya no se gestionan desde su tablero.
export const COLUMNAS_DESPACHO_TERMINALES = ["listo_retiro", "en_transito", "entregado"] as const;

export const COLUMNAS_BODEGA = [
  { id: "por_preparar", nombre: "Por preparar" },
  { id: "salida_bodega", nombre: "Salida de bodega" },
  { id: "retenido_pendiente", nombre: "Pendiente de pago" },
  { id: "listo_despacho", nombre: "Listo para despacho" },
  { id: "despachado", nombre: "Despachado" },
] as const;

// Líneas dentro de "Listo para despacho", agrupadas por transportista.
export const LINEAS_LISTO_DESPACHO = ["Starken", "Chilexpress", "Transportistas", "Cliente retira"] as const;

export function lineaTransportista(modoDespacho: string): (typeof LINEAS_LISTO_DESPACHO)[number] {
  const m = modoDespacho.toLowerCase();
  if (m.includes("starken")) return "Starken";
  if (m.includes("chilexpress")) return "Chilexpress";
  if (m.includes("cliente retira")) return "Cliente retira";
  return "Transportistas"; // Robinson y otros couriers (Starken(Sendu) cae en "Starken" arriba)
}

export const COLUMNAS_COBRANZAS = [
  { id: "no_pagadas", nombre: "Facturas No Pagadas" },
  { id: "pagos_parciales", nombre: "Pagos Parciales" },
  { id: "pendientes_facturar", nombre: "Pendientes de Facturar" },
  { id: "facturas_anticipadas", nombre: "Facturas Anticipadas" },
  { id: "eliminados_nc", nombre: "Eliminados · Nota de Crédito" },
] as const;

export const LOTES_COMPRAS = [
  { nombre: "Gestión", columnas: ["por_pedir", "oc_construccion", "oc_pendientes"] },
  { nombre: "Miami · EE.UU.", columnas: ["transito_miami", "arribado_miami"] },
  { nombre: "Ruta a Chile", columnas: ["transito_chile", "arribado_chile"] },
  { nombre: "Cierre", columnas: ["cargas_recibidas"] },
] as const;

export const COLUMNAS_COMPRAS = [
  { id: "por_pedir", nombre: "Por pedir" },
  { id: "oc_construccion", nombre: "OC (Pablo arma)" },
  { id: "oc_pendientes", nombre: "OC Pendientes" },
  { id: "transito_miami", nombre: "En tránsito a Miami" },
  { id: "arribado_miami", nombre: "Arribado a Miami" },
  { id: "transito_chile", nombre: "En tránsito a Chile" },
  { id: "arribado_chile", nombre: "Arribado a Chile" },
  { id: "cargas_recibidas", nombre: "Cargas recibidas" },
] as const;

// Tipos de documento de despacho (§3 Despacho) — Guía de despacho, Factura
// o Boleta. Es el documento tributario/de traslado que acompaña al
// pedido; lo define Luisana al clasificar el ingreso y se imprime en
// bodega junto con la salida.
export const TIPOS_DOCUMENTO = ["Guía de despacho", "Factura", "Boleta"] as const;

// Modos de despacho — compartido con el Maestro de Clientes (preferencia
// de despacho por cliente) para que ambos usen exactamente las mismas
// opciones.
export const MODOS_DESPACHO = ["Cliente retira", "Starken", "Starken(Sendu)", "Chilexpress", "Robinson", "Otro"] as const;

// §5g.1 — cuando Bodega despacha menos de lo pedido habiendo stock para
// completarlo, exige uno de estos motivos antes de dejar avanzar.
export const MOTIVOS_DESPACHO_INCOMPLETO = [
  "Cliente pidió parcial",
  "Dañado / no apto",
  "Se completa después",
  "Otro",
];

// §3 Compras — modalidad de pago del proveedor, decide en qué fila de "OC
// Pendientes" cae la orden.
export const MODALIDADES_PAGO_PROVEEDOR = ["Crédito", "Pago contra despacho", "Pago contra OC"];

export const TIPOS_TRANSPORTISTA = ["Courier internacional", "Consolidador Miami", "Nacional"];

// Reglas de ruta por proveedor (§5 pendiente #10, "por diseñar" en el
// documento fuente) — simplificación adoptada: cada proveedor tiene UNA
// ruta física, que determina qué columnas de Compras le aplican. Un
// proveedor nacional nunca pasa por Miami; un courier directo (ej. UPS/DHL
// puerta a puerta) salta Miami y llega directo a "En tránsito a Chile"; el
// consolidado de Miami pasa por las 8 columnas.
export const RUTAS_PROVEEDOR = ["Nacional", "Directo internacional", "Consolidado Miami"] as const;

export const COLUMNAS_POR_RUTA: Record<(typeof RUTAS_PROVEEDOR)[number], string[]> = {
  "Nacional": ["por_pedir", "oc_construccion", "oc_pendientes", "cargas_recibidas"],
  "Directo internacional": ["por_pedir", "oc_construccion", "oc_pendientes", "transito_chile", "arribado_chile", "cargas_recibidas"],
  "Consolidado Miami": ["por_pedir", "oc_construccion", "oc_pendientes", "transito_miami", "arribado_miami", "transito_chile", "arribado_chile", "cargas_recibidas"],
};

export const MOTIVOS_MOVER_PRODUCTO = [
  "Emergencia del pedido destino",
  "Cambio de lo que pidió el cliente",
  "Error de asignación",
  "Otro",
];

// Gerencia Finanzas (§7 "EN CURSO") — urgencia de una cuenta por pagar
// para el chip de color de la agenda de pagos.
export type Urgencia = "vencida" | "esta_semana" | "por_pagar" | "pagada";

export function calcUrgencia(estado: string, fechaVencimiento: Date | null): Urgencia {
  if (estado === "pagada") return "pagada";
  if (!fechaVencimiento) return "por_pagar";
  const dias = Math.floor((fechaVencimiento.getTime() - Date.now()) / 86400000);
  if (dias < 0) return "vencida";
  if (dias <= 7) return "esta_semana";
  return "por_pagar";
}

export const MOTIVOS_CANCELACION = [
  "Precio / presupuesto",
  "Cambió de proveedor",
  "Plazo de entrega largo",
  "Ya no lo necesita",
  "Error interno del pedido",
  "Sin stock / no disponible",
  "Duplicado",
  "Otro",
];

// §7 "NUEVO — Compras_Posponer_OC" — por qué Pablo todavía no emite la OC
// de un proveedor que ya tiene líneas acumuladas en "Por pedir".
export const MOTIVOS_POSPONER_COMPRA = [
  "Aún son pocos productos",
  "Este proveedor se pide cada 2 semanas",
  "Consolidar con otra compra",
  "Falta confirmación de pago",
  "Otro",
];

export function calcColumnaBodega(p: PedidoConProductos): string | null {
  // "Listo para retiro" es columna REAL y compartida — Bodega la llama
  // "Listo para despacho" (su nombre de siempre); en_transito/entregado ya
  // no los gestiona Bodega, solo quedan como "Despachado" (historial).
  if (p.columnaDespacho === "listo_retiro") return "listo_despacho";
  if (p.columnaDespacho === "en_transito" || p.columnaDespacho === "entregado") return "despachado";
  if (!["salida_bodega", "despacho"].includes(p.columnaDespacho)) return null;
  if (p.situacionCobro === "Pendiente de pago" || p.facturaAnticipada) return "retenido_pendiente";
  // Salida de bodega: Luisana dejó el pedido marcado así en Despacho porque
  // viene incompleto (parte llega de importación más adelante) — lo
  // disponible se separa del inventario general mientras se espera el
  // resto. Bodega solo la monitorea acá, no la marca ni la cierra a mano.
  if (p.columnaDespacho === "salida_bodega") return "salida_bodega";
  return "por_preparar";
}

export function calcColumnaCobranza(p: PedidoConProductos): string | null {
  if (p.columnaDespacho === "eliminado") {
    return p.facturaNumero ? "eliminados_nc" : null;
  }
  // Abono en 2 pasos (§5f.5) — sin documento tributario todavía, siempre
  // vive en "Pagos Parciales" mientras se resuelve (fila 1) o como
  // registro ya liberado (fila 2). Se chequea antes que el resto porque
  // no depende de facturaNumero.
  if (p.abonoMonto != null) return "pagos_parciales";
  if (p.facturaAnticipada) return "facturas_anticipadas";
  if (p.situacionCobro === "Pendiente de pago") {
    if (!p.facturaNumero) return "pendientes_facturar";
    if ((p.facturaPagado ?? 0) > 0) return "pagos_parciales";
    return "no_pagadas";
  }
  return null;
}

// Fila dentro de "Pagos Parciales" para el flujo de abono-sin-documento
// (§5f.5) — null si la tarjeta es del flujo clásico (abono contra factura).
export function filaAbono(p: PedidoConProductos): "no_revisado" | "revisado" | null {
  if (p.abonoMonto == null) return null;
  return p.abonoRevisado ? "revisado" : "no_revisado";
}

// Fila dentro de "Pendiente de pago" de Bodega — "pagados" cuando ya hay
// algo abonado (Cobranzas registró un pago parcial) aunque el pedido siga
// retenido hasta saldar el total; "pendientes" cuando no hay nada pagado
// todavía. Al saldarse del todo, el pedido se libera solo (sale de este
// bucket y pasa a "Por preparar" — eso no cambia).
export function filaRetenidoPago(p: PedidoConProductos): "pendientes" | "pagados" {
  return (p.facturaPagado ?? 0) > 0 ? "pagados" : "pendientes";
}

export function calcColumnaVendedor(p: PedidoConProductos): string | null {
  if (p.columnaDespacho === "eliminado") return null;
  if (p.situacionCobro === "Pendiente de pago" && !(COLUMNAS_DESPACHO_TERMINALES as readonly string[]).includes(p.columnaDespacho)) {
    return "pendiente_pago";
  }
  const mapa: Record<string, string> = {
    ingreso: "nuevo",
    por_pedir: "en_compras",
    pendiente_pago: "pendiente_pago",
    pendiente: "en_compras",
    salida_bodega: "en_bodega",
    despacho: "en_bodega",
    listo_retiro: "en_transito",
    en_transito: "en_transito",
    entregado: "entregado",
    // Parqueado en "🗯 Cachos" de Despacho (SKU genérico sin corregir,
    // problema de entrega reportado por Robinson, etc.) — antes
    // desaparecía del todo del panel del vendedor justo cuando algo salió
    // mal con su pedido.
    cachos: "con_problema",
  };
  return mapa[p.columnaDespacho] ?? null;
}
